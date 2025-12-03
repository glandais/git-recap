import { RecapData } from "../types/recap-data.js";

/**
 * Format recap data as a blog-ready Markdown document
 */
export function formatMarkdown(data: RecapData): string {
  const { meta, metrics, repositories, highlights } = data;

  const lines: string[] = [];

  // Title
  lines.push(`# My ${meta.year} Git Year in Review`);
  lines.push("");

  // The Numbers section
  lines.push("## The Numbers");
  lines.push("");
  lines.push(
    `- **${metrics.totalCommits} commits** across **${metrics.reposContributed} repositories**`
  );

  // Commit type breakdown (if using conventional commits)
  if (metrics.commitTypes) {
    const { feat, fix, refactor, docs, chore, test, perf } = metrics.commitTypes;
    const breakdown: string[] = [];
    if (feat > 0) breakdown.push(`**${feat} features** shipped`);
    if (fix > 0) breakdown.push(`**${fix} bugs** fixed`);
    if (refactor > 0) breakdown.push(`**${refactor} refactors**`);

    if (breakdown.length > 0) {
      lines.push(`- ${breakdown.join(" | ")}`);
    }

    // Additional stats
    const other: string[] = [];
    if (docs > 0) other.push(`${docs} docs`);
    if (test > 0) other.push(`${test} tests`);
    if (chore > 0) other.push(`${chore} chores`);
    if (perf > 0) other.push(`${perf} perf improvements`);

    if (other.length > 0) {
      lines.push(`- Also: ${other.join(", ")}`);
    }
  }

  // Languages
  if (metrics.topLanguages.length > 0) {
    const langStr = metrics.topLanguages
      .slice(0, 5)
      .map((l) => l.name)
      .join(", ");
    lines.push(`- Top languages: ${langStr}`);
  }

  // Streak
  if (metrics.longestStreak > 0) {
    lines.push(`- Longest streak: **${metrics.longestStreak} days**`);
  }

  if (metrics.activeDays > 0) {
    lines.push(`- Active coding days: ${metrics.activeDays}`);
  }

  lines.push("");

  // Highlights section
  const hasAIHighlights =
    highlights.aiGenerated?.topAchievements &&
    highlights.aiGenerated.topAchievements.length > 0;

  const hasBasicHighlights =
    highlights.majorFeatures.length > 0 ||
    highlights.significantRefactors.length > 0 ||
    highlights.externalContributions.length > 0;

  if (hasAIHighlights || hasBasicHighlights) {
    lines.push("## Highlights");
    lines.push("");

    if (hasAIHighlights) {
      // Use AI-generated highlights (preferred)
      for (const achievement of highlights.aiGenerated!.topAchievements) {
        lines.push(`- ${achievement}`);
      }
    } else {
      // Fallback to basic highlights
      for (const feature of highlights.majorFeatures) {
        lines.push(`- ${capitalizeFirst(feature)}`);
      }

      for (const refactor of highlights.significantRefactors) {
        lines.push(`- Major refactor: ${refactor}`);
      }
    }

    if (highlights.externalContributions.length > 0) {
      const count = highlights.externalContributions.length;
      lines.push(`- Contributed to **${count} external projects**`);
    }

    lines.push("");
  }

  // Repositories section
  lines.push("## Repositories I Contributed To");
  lines.push("");

  // Sort repos by commits
  const sortedRepos = [...repositories].sort((a, b) => b.commits - a.commits);

  // Show owned repos first
  const ownedRepos = sortedRepos.filter((r) => r.isOwner);
  const contributedRepos = sortedRepos.filter((r) => !r.isOwner);

  if (ownedRepos.length > 0) {
    lines.push("### My Projects");
    lines.push("");
    for (const repo of ownedRepos.slice(0, 10)) {
      const lang = repo.primaryLanguage ? ` (${repo.primaryLanguage})` : "";
      lines.push(
        `- [**${repo.name}**](${repo.url})${lang} - ${repo.commits} commits`
      );
    }
    lines.push("");
  }

  if (contributedRepos.length > 0) {
    lines.push("### Open Source & Collaborations");
    lines.push("");
    for (const repo of contributedRepos.slice(0, 10)) {
      const lang = repo.primaryLanguage ? ` (${repo.primaryLanguage})` : "";
      lines.push(
        `- [**${repo.owner}/${repo.name}**](${repo.url})${lang} - ${repo.commits} commits`
      );
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push(
    `*Generated with [git-recap](https://github.com/glandais/git-recap) on ${new Date().toLocaleDateString()}*`
  );

  return lines.join("\n");
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
