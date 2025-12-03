import { RecapData } from "../types/recap-data.js";

const MAX_LINKEDIN_LENGTH = 3000;

/**
 * Format recap data as LinkedIn-ready plain text
 * Optimized for engagement and readability on LinkedIn
 */
export function formatLinkedIn(data: RecapData): string {
  const { meta, metrics } = data;

  const lines: string[] = [];

  // Hook line
  lines.push(`My ${meta.year} developer year in review:`);
  lines.push("");

  // Key stats line (highly scannable)
  const statsLine = buildStatsLine(metrics);
  lines.push(statsLine);
  lines.push("");

  // Commit breakdown (if using conventional commits)
  if (metrics.commitTypes) {
    const { feat, fix, refactor } = metrics.commitTypes;
    const breakdown: string[] = [];
    if (feat > 0) breakdown.push(`${feat} features shipped`);
    if (fix > 0) breakdown.push(`${fix} bugs fixed`);
    if (refactor > 0) breakdown.push(`${refactor} refactors`);

    if (breakdown.length > 0) {
      lines.push(breakdown.join(" | "));
      lines.push("");
    }
  }

  // Top achievements
  const achievements = buildAchievements(data);
  if (achievements.length > 0) {
    lines.push("Top achievements:");
    for (const achievement of achievements.slice(0, 5)) {
      lines.push(`- ${achievement}`);
    }
    lines.push("");
  }

  // Languages
  if (metrics.topLanguages.length > 0) {
    const langs = metrics.topLanguages
      .slice(0, 3)
      .map((l) => l.name)
      .join(", ");
    lines.push(`Top languages: ${langs}`);
    lines.push("");
  }

  // Streak brag (if impressive)
  if (metrics.longestStreak >= 7) {
    lines.push(`Longest coding streak: ${metrics.longestStreak} days`);
    lines.push("");
  }

  // Call to action / reflection
  lines.push("What was your highlight this year?");
  lines.push("");

  // Hashtags
  lines.push("#YearInReview #Developer #OpenSource #Coding #Programming");

  // Join and truncate if needed
  let result = lines.join("\n");

  if (result.length > MAX_LINKEDIN_LENGTH) {
    result = truncateToLimit(result, MAX_LINKEDIN_LENGTH);
  }

  return result;
}

function buildStatsLine(metrics: RecapData["metrics"]): string {
  const parts: string[] = [];

  parts.push(`${metrics.totalCommits} commits`);
  parts.push(`${metrics.reposContributed} repos`);

  if (metrics.activeDays > 0) {
    parts.push(`${metrics.activeDays} active days`);
  }

  return parts.join(" | ");
}

function buildAchievements(data: RecapData): string[] {
  const achievements: string[] = [];
  const { highlights, repositories } = data;

  // Prefer AI-generated highlights if available
  if (
    highlights.aiGenerated?.topAchievements &&
    highlights.aiGenerated.topAchievements.length > 0
  ) {
    return highlights.aiGenerated.topAchievements.slice(0, 5);
  }

  // Fallback to basic highlights
  // Major features
  for (const feature of highlights.majorFeatures.slice(0, 3)) {
    achievements.push(capitalizeFirst(feature));
  }

  // Refactors
  for (const refactor of highlights.significantRefactors.slice(0, 2)) {
    achievements.push(`Major refactor: ${refactor}`);
  }

  // External contributions
  if (highlights.externalContributions.length > 0) {
    const topExternal = highlights.externalContributions.slice(0, 3);
    achievements.push(`Contributed to: ${topExternal.join(", ")}`);
  }

  // If not enough highlights, add repo stats
  if (achievements.length < 3) {
    const ownedRepos = repositories.filter((r) => r.isOwner);
    if (ownedRepos.length > 0) {
      achievements.push(`Maintained ${ownedRepos.length} personal projects`);
    }
  }

  return achievements;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncateToLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;

  // Find a good break point
  const truncated = text.substring(0, limit - 3);
  const lastNewline = truncated.lastIndexOf("\n");

  if (lastNewline > limit * 0.8) {
    return truncated.substring(0, lastNewline) + "...";
  }

  return truncated + "...";
}
