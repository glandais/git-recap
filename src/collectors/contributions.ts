import {
  RecapData,
  RecapMetrics,
  CommitTypes,
  LanguageStat,
} from "../types/recap-data.js";

/**
 * Compute metrics from collected recap data
 */
export function computeMetrics(data: RecapData): RecapMetrics {
  const commits = data.commits;
  const repos = data.repositories;

  // Total commits
  const totalCommits = commits.length;

  // Repos contributed to
  const reposContributed = repos.length;

  // Compute commit type breakdown
  const commitTypes: CommitTypes = {
    feat: 0,
    fix: 0,
    refactor: 0,
    docs: 0,
    chore: 0,
    test: 0,
    style: 0,
    perf: 0,
    other: 0,
  };

  for (const commit of commits) {
    const type = commit.type as keyof CommitTypes | undefined;
    if (type && type in commitTypes) {
      commitTypes[type]++;
    } else {
      commitTypes.other++;
    }
  }

  // Top languages by commit count
  const languageCommits = new Map<string, number>();
  for (const repo of repos) {
    if (repo.primaryLanguage) {
      const current = languageCommits.get(repo.primaryLanguage) || 0;
      languageCommits.set(repo.primaryLanguage, current + repo.commits);
    }
  }

  const topLanguages: LanguageStat[] = Array.from(languageCommits.entries())
    .map(([name, commits]) => ({ name, commits }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 5);

  // Calculate active days and longest streak
  const { activeDays, longestStreak } = calculateStreaks(commits);

  return {
    totalCommits,
    reposContributed,
    longestStreak,
    activeDays,
    topLanguages,
    commitTypes,
  };
}

/**
 * Calculate active days and longest streak from commits
 */
function calculateStreaks(
  commits: RecapData["commits"]
): { activeDays: number; longestStreak: number } {
  if (commits.length === 0) {
    return { activeDays: 0, longestStreak: 0 };
  }

  // Get unique dates (YYYY-MM-DD format)
  const uniqueDates = new Set<string>();
  for (const commit of commits) {
    const date = commit.date.split("T")[0];
    uniqueDates.add(date);
  }

  const activeDays = uniqueDates.size;

  // Sort dates to calculate streak
  const sortedDates = Array.from(uniqueDates).sort();

  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1]);
    const currDate = new Date(sortedDates[i]);

    // Check if dates are consecutive
    const diffDays = Math.floor(
      (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return { activeDays, longestStreak };
}
