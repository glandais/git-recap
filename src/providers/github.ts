import { execSync } from "child_process";
import {
  RecapData,
  Repository,
  Commit,
  CommitFile,
  createEmptyRecapData,
  parseCommitType,
} from "../types/recap-data.js";

/**
 * Execute a gh CLI command and return parsed JSON
 */
function ghApi<T>(endpoint: string): T {
  // Quote the endpoint to prevent shell interpretation of & characters
  const command = `gh api '${endpoint}'`;
  const result = execSync(command, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large responses
  });
  return JSON.parse(result) as T;
}

/**
 * Execute a gh CLI command and return raw text (for diffs)
 */
function ghApiRaw(endpoint: string, headers: Record<string, string> = {}): string {
  const headerArgs = Object.entries(headers)
    .map(([key, value]) => `-H "${key}: ${value}"`)
    .join(" ");
  // Quote the endpoint to prevent shell interpretation of & characters
  const command = `gh api ${headerArgs} '${endpoint}'`;
  return execSync(command, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

/**
 * Execute a gh GraphQL query
 */
function ghGraphQL<T>(query: string, variables: Record<string, unknown> = {}): T {
  const variablesArg = Object.entries(variables)
    .map(([key, value]) => `-F ${key}=${JSON.stringify(value)}`)
    .join(" ");

  const command = `gh api graphql -f query='${query.replace(/'/g, "'\\''")}' ${variablesArg}`;
  const result = execSync(command, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(result) as T;
}

/**
 * Get the authenticated GitHub username
 */
function getUsername(): string {
  const command = "gh api user --jq .login";
  return execSync(command, { encoding: "utf-8" }).trim();
}

interface GitHubRepo {
  name: string;
  owner: { login: string };
  html_url: string;
  language: string | null;
}

interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
  stats?: {
    additions: number;
    deletions: number;
  };
  files?: GitHubFile[];
}

interface GitHubSearchResult {
  total_count: number;
  items: Array<{
    repository: GitHubRepo;
  }>;
}

/**
 * Fetch all contribution data from GitHub for a given year
 */
export async function fetchGitHub(year: number): Promise<RecapData> {
  const username = getUsername();
  console.log(`  GitHub user: ${username}`);

  const recapData = createEmptyRecapData(year, username);

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // Step 1: Find all repos the user has committed to this year
  console.log("  Finding repositories with commits...");
  const reposWithCommits = await findReposWithCommits(username, startDate, endDate);
  console.log(`  Found ${reposWithCommits.size} repositories`);

  // Step 2: Fetch commits from each repository
  console.log("  Fetching commits from repositories...");
  const repoDataMap = new Map<string, Repository>();

  for (const repoFullName of reposWithCommits) {
    const [owner, name] = repoFullName.split("/");
    console.log(`    ${repoFullName}...`);

    try {
      // Get repo details
      const repoDetails = ghApi<GitHubRepo>(`repos/${repoFullName}`);

      // Get commits by user in this repo for the year
      const commits = await fetchCommitsForRepo(
        repoFullName,
        username,
        startDate,
        endDate
      );

      if (commits.length === 0) continue;

      // Store repo data
      const repoData: Repository = {
        name,
        owner,
        source: "github",
        url: repoDetails.html_url,
        isOwner: owner.toLowerCase() === username.toLowerCase(),
        commits: commits.length,
        primaryLanguage: repoDetails.language,
      };
      repoDataMap.set(repoFullName, repoData);

      // Store commits
      for (const commit of commits) {
        const commitType = parseCommitType(commit.commit.message);
        recapData.commits.push({
          sha: commit.sha,
          message: commit.commit.message.split("\n")[0], // First line only
          repo: repoFullName,
          source: "github",
          date: commit.commit.author.date,
          additions: commit.stats?.additions || 0,
          deletions: commit.stats?.deletions || 0,
          type: commitType,
        });
      }
    } catch (error) {
      console.log(`    Skipping ${repoFullName}: ${error}`);
    }
  }

  recapData.repositories = Array.from(repoDataMap.values());

  return recapData;
}

/**
 * Find all repositories where the user has commits in the given date range
 */
async function findReposWithCommits(
  username: string,
  startDate: string,
  endDate: string
): Promise<Set<string>> {
  const repos = new Set<string>();

  // Use search API to find commits by user in date range
  // GitHub search API returns max 1000 results (10 pages of 100)
  let page = 1;
  const perPage = 100;
  const maxPages = 10; // GitHub limit: 1000 results max

  while (page <= maxPages) {
    const searchQuery = `author:${username} committer-date:${startDate}..${endDate}`;
    const endpoint = `search/commits?q=${encodeURIComponent(searchQuery)}&per_page=${perPage}&page=${page}`;

    try {
      const result = ghApi<GitHubSearchResult>(endpoint);

      if (result.items.length === 0) break;

      for (const item of result.items) {
        const fullName = `${item.repository.owner.login}/${item.repository.name}`;
        repos.add(fullName);
      }

      console.log(`    Page ${page}: found ${result.items.length} commits, ${repos.size} unique repos so far`);

      // Stop if we got less than a full page (no more results)
      if (result.items.length < perPage) break;
      page++;
    } catch (error) {
      console.log(`    Error on page ${page}: ${error}`);
      break;
    }
  }

  return repos;
}

/**
 * Fetch all commits by a user in a specific repository
 */
async function fetchCommitsForRepo(
  repoFullName: string,
  username: string,
  startDate: string,
  endDate: string
): Promise<GitHubCommit[]> {
  const commits: GitHubCommit[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const endpoint = `repos/${repoFullName}/commits?author=${username}&since=${startDate}T00:00:00Z&until=${endDate}T23:59:59Z&per_page=${perPage}&page=${page}`;

    try {
      const pageCommits = ghApi<GitHubCommit[]>(endpoint);
      if (pageCommits.length === 0) break;

      // Fetch stats for each commit (needed for additions/deletions)
      for (const commit of pageCommits) {
        try {
          const commitDetails = ghApi<GitHubCommit>(
            `repos/${repoFullName}/commits/${commit.sha}`
          );
          commits.push(commitDetails);
        } catch {
          // If we can't get details, use basic info
          commits.push(commit);
        }
      }

      if (pageCommits.length < perPage) break;
      page++;
    } catch {
      break;
    }
  }

  return commits;
}

/**
 * Fetch the diff for a specific commit
 */
export function fetchCommitDiff(repoFullName: string, sha: string): string {
  try {
    // Request diff format using Accept header
    return ghApiRaw(`repos/${repoFullName}/commits/${sha}`, {
      Accept: "application/vnd.github.v3.diff",
    });
  } catch {
    return "";
  }
}

/**
 * Get detailed commit info for storage in separate file
 */
export function getCommitFileData(commit: GitHubCommit, repoFullName: string): CommitFile {
  const commitType = parseCommitType(commit.commit.message);
  return {
    sha: commit.sha,
    message: commit.commit.message,
    repo: repoFullName,
    date: commit.commit.author.date,
    additions: commit.stats?.additions || 0,
    deletions: commit.stats?.deletions || 0,
    type: commitType,
    files: commit.files?.map((f) => f.filename) || [],
  };
}

/**
 * Export GitHubCommit type for use in fetch command
 */
export type { GitHubCommit };
