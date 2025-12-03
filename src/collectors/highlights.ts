import { RecapData, Highlights, Commit } from "../types/recap-data.js";

// Thresholds for detecting significant commits
const LARGE_COMMIT_THRESHOLD = 500; // lines added/deleted
const HIGH_FEATURE_COUNT_THRESHOLD = 3; // commits to same feature

/**
 * Auto-detect notable achievements from recap data
 */
export function detectHighlights(data: RecapData): Highlights {
  const highlights: Highlights = {
    majorFeatures: [],
    significantRefactors: [],
    externalContributions: [],
    newRepos: [],
  };

  // Detect major features (feat: commits with significant changes)
  highlights.majorFeatures = detectMajorFeatures(data.commits);

  // Detect significant refactors
  highlights.significantRefactors = detectSignificantRefactors(data.commits);

  // Detect external contributions (repos not owned by user)
  highlights.externalContributions = data.repositories
    .filter((repo) => !repo.isOwner)
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 10)
    .map((repo) => `${repo.owner}/${repo.name}`);

  // Detect new repos (would need additional API calls, simplified here)
  // For now, mark repos where user is owner and has many commits
  highlights.newRepos = data.repositories
    .filter((repo) => repo.isOwner && repo.commits > 10)
    .map((repo) => repo.name);

  return highlights;
}

/**
 * Detect major features from feat: commits
 */
function detectMajorFeatures(commits: Commit[]): string[] {
  const features: string[] = [];

  // Find feat commits with significant changes
  const featCommits = commits.filter((c) => c.type === "feat");

  // Group by scope (if using conventional commits with scope)
  const scopeGroups = new Map<string, Commit[]>();

  for (const commit of featCommits) {
    // Extract scope from "feat(scope): message"
    const scopeMatch = commit.message.match(/^feat\(([^)]+)\):/i);
    const scope = scopeMatch ? scopeMatch[1] : "general";

    if (!scopeGroups.has(scope)) {
      scopeGroups.set(scope, []);
    }
    scopeGroups.get(scope)!.push(commit);
  }

  // Find significant feature groups
  for (const [_scope, scopeCommits] of scopeGroups) {
    const totalChanges = scopeCommits.reduce((sum, c) => sum + c.additions + c.deletions, 0);

    if (
      totalChanges >= LARGE_COMMIT_THRESHOLD ||
      scopeCommits.length >= HIGH_FEATURE_COUNT_THRESHOLD
    ) {
      // Use the first commit's message as the feature name
      const firstMessage = scopeCommits[0].message.replace(/^feat(\([^)]+\))?:\s*/i, "").trim();
      features.push(firstMessage);
    }
  }

  // Also add large individual feat commits
  for (const commit of featCommits) {
    const changes = commit.additions + commit.deletions;
    if (changes >= LARGE_COMMIT_THRESHOLD * 2) {
      const message = commit.message.replace(/^feat(\([^)]+\))?:\s*/i, "").trim();
      if (!features.includes(message)) {
        features.push(message);
      }
    }
  }

  return features.slice(0, 10); // Top 10 features
}

/**
 * Detect significant refactors
 */
function detectSignificantRefactors(commits: Commit[]): string[] {
  const refactors: string[] = [];

  const refactorCommits = commits.filter((c) => c.type === "refactor");

  for (const commit of refactorCommits) {
    const changes = commit.additions + commit.deletions;
    if (changes >= LARGE_COMMIT_THRESHOLD) {
      const message = commit.message.replace(/^refactor(\([^)]+\))?:\s*/i, "").trim();
      refactors.push(message);
    }
  }

  return refactors.slice(0, 5); // Top 5 refactors
}
