import { Command } from "commander";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchGitHub, fetchCommitDiff } from "../providers/github.js";
import { RecapData, CommitFile, CommitRef, parseCommitType } from "../types/recap-data.js";
import { computeMetrics } from "../collectors/contributions.js";
import { detectHighlights } from "../collectors/highlights.js";

export interface FetchOptions {
  year: string;
  github?: boolean;
  output?: string;
}

export const fetchCommand = new Command("fetch")
  .description("Fetch contribution data from GitHub and save to folder")
  .option("--year <year>", "Year to fetch data for", String(new Date().getFullYear()))
  .option("--github", "Fetch from GitHub")
  .option("--output <folder>", "Output folder path")
  .action(async (options: FetchOptions) => {
    const year = parseInt(options.year, 10);

    if (!options.github) {
      console.error("Error: Specify --github to fetch data");
      process.exit(1);
    }

    console.log(`Fetching contribution data for ${year}...`);

    // Fetch from GitHub
    console.log("\nFetching from GitHub...");
    let recapData: RecapData;
    try {
      recapData = await fetchGitHub(year);
      recapData.meta.sources.push("github");
    } catch (error) {
      console.error("Failed to fetch from GitHub:", error);
      process.exit(1);
    }

    // Determine output folder
    const outputFolder = options.output || `recap-${year}`;

    // Create folder structure
    if (!existsSync(outputFolder)) {
      mkdirSync(outputFolder, { recursive: true });
    }
    const commitsFolder = join(outputFolder, "commits");
    if (!existsSync(commitsFolder)) {
      mkdirSync(commitsFolder, { recursive: true });
    }

    // Process commits: save each to separate file with diff
    console.log("\nFetching commit diffs...");
    const commitRefs: CommitRef[] = [];
    const commitFiles: CommitFile[] = [];

    for (let i = 0; i < recapData.commits.length; i++) {
      const commit = recapData.commits[i];
      const shortSha = commit.sha.substring(0, 7);
      process.stdout.write(`  [${i + 1}/${recapData.commits.length}] ${shortSha}...`);

      // Create CommitFile from existing data
      const commitFile: CommitFile = {
        sha: commit.sha,
        message: commit.message,
        repo: commit.repo,
        date: commit.date,
        additions: commit.additions,
        deletions: commit.deletions,
        type: parseCommitType(commit.message),
        files: [], // Will be populated from diff if available
      };
      commitFiles.push(commitFile);

      // Fetch and save diff
      const diff = fetchCommitDiff(commit.repo, commit.sha);
      if (diff) {
        // Extract file names from diff
        const fileMatches = diff.matchAll(/^diff --git a\/(.+?) b\//gm);
        commitFile.files = Array.from(fileMatches, (m) => m[1]);

        // Save diff file
        writeFileSync(join(commitsFolder, `${commit.sha}.diff`), diff);
      }

      // Save commit metadata
      writeFileSync(join(commitsFolder, `${commit.sha}.json`), JSON.stringify(commitFile, null, 2));

      // Add to refs
      commitRefs.push({
        sha: commit.sha,
        repo: commit.repo,
      });

      console.log(" done");
    }

    // Compute metrics from commit files
    recapData.metrics = computeMetricsFromFiles(commitFiles, recapData.repositories);

    // Detect highlights
    recapData.highlights = detectHighlights(recapData);

    // Create recap.json with refs instead of full commits
    const recapJson = {
      meta: recapData.meta,
      metrics: recapData.metrics,
      repositories: recapData.repositories,
      commits: commitRefs,
      highlights: recapData.highlights,
    };

    // Write main recap file
    const recapPath = join(outputFolder, "recap.json");
    writeFileSync(recapPath, JSON.stringify(recapJson, null, 2));

    console.log(`\nData saved to: ${outputFolder}/`);
    console.log(`  - recap.json (main metadata)`);
    console.log(`  - commits/ (${commitRefs.length} commits with diffs)`);
    console.log(`\nSummary:`);
    console.log(`  - Total commits: ${recapData.metrics.totalCommits}`);
    console.log(`  - Repos contributed to: ${recapData.metrics.reposContributed}`);
    console.log(`  - Active days: ${recapData.metrics.activeDays}`);
    console.log(`  - Longest streak: ${recapData.metrics.longestStreak} days`);

    console.log(`\nNext step: git-recap generate --input ${outputFolder}`);
  });

/**
 * Compute metrics from commit files
 */
function computeMetricsFromFiles(commits: CommitFile[], repositories: RecapData["repositories"]) {
  // Reuse the existing metrics computation but with CommitFile data
  const fakeRecapData: RecapData = {
    meta: { year: 0, fetchedAt: "", sources: [], username: "" },
    metrics: {
      totalCommits: 0,
      reposContributed: 0,
      longestStreak: 0,
      activeDays: 0,
      topLanguages: [],
    },
    repositories,
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      repo: c.repo,
      source: "github" as const,
      date: c.date,
      additions: c.additions,
      deletions: c.deletions,
      type: c.type,
    })),
    highlights: {
      majorFeatures: [],
      significantRefactors: [],
      externalContributions: [],
      newRepos: [],
    },
  };

  return computeMetrics(fakeRecapData);
}
