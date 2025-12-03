import { execSync } from "child_process";
import {
  CommitFile,
  DiffExtraction,
  AIGeneratedHighlights,
} from "../types/recap-data.js";
import { formatDiffExtraction } from "./diff-extractor.js";

const BATCH_SIZE = 15; // Commits per Claude call

/**
 * Check if Claude CLI is available
 */
export function isClaudeAvailable(): boolean {
  try {
    execSync("which claude", { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Invoke Claude CLI with a prompt
 */
function invokeClaudeCLI(prompt: string): string {
  try {
    // Use --print to get just the response, haiku model for speed/cost
    const result = execSync(`claude -p "${prompt.replace(/"/g, '\\"')}" --model haiku`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000, // 2 minute timeout
    });
    return result.trim();
  } catch (error) {
    console.error("Claude CLI error:", error);
    throw error;
  }
}

/**
 * Stage 1: Generate AI descriptions for a batch of commits
 */
export async function generateCommitDescriptions(
  commits: CommitFile[],
  repo: string,
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>();

  // Process in batches
  for (let i = 0; i < commits.length; i += BATCH_SIZE) {
    const batch = commits.slice(i, i + BATCH_SIZE);
    const batchDescriptions = await processCommitBatch(batch, repo);

    for (const [sha, desc] of batchDescriptions) {
      descriptions.set(sha, desc);
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, commits.length), commits.length);
    }
  }

  return descriptions;
}

/**
 * Process a single batch of commits with Claude
 */
async function processCommitBatch(
  commits: CommitFile[],
  repo: string
): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>();

  // Format commits for the prompt
  const commitList = commits
    .map((commit, idx) => {
      const parts = [
        `${idx + 1}. sha: ${commit.sha.slice(0, 7)}`,
        `   Message: ${commit.message.split("\n")[0]}`,
        `   Stats: +${commit.additions}/-${commit.deletions}`,
      ];

      if (commit.files && commit.files.length > 0) {
        parts.push(`   Files: ${commit.files.slice(0, 5).join(", ")}`);
      }

      if (commit.diffExtraction) {
        const extraction = formatDiffExtraction(commit.diffExtraction);
        if (extraction) {
          parts.push(`   ${extraction}`);
        }
      }

      return parts.join("\n");
    })
    .join("\n\n");

  const prompt = `For each commit below, write a concise, marketing-ready description (1 sentence max).
Focus on WHAT was achieved, not HOW. Use action verbs. Be specific.
Return ONLY a JSON array with {sha, aiDescription} for each commit. No other text.

Commits from repository "${repo}":

${commitList}

Return JSON array like: [{"sha": "abc1234", "aiDescription": "Implemented X feature"}]`;

  try {
    const response = invokeClaudeCLI(prompt);

    // Parse JSON response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]) as Array<{
        sha: string;
        aiDescription: string;
      }>;
      for (const result of results) {
        descriptions.set(result.sha.slice(0, 7), result.aiDescription);
      }
    }
  } catch (error) {
    console.error(`  Error processing batch: ${error}`);
    // Fallback: use commit messages as descriptions
    for (const commit of commits) {
      descriptions.set(
        commit.sha.slice(0, 7),
        commit.message.split("\n")[0]
      );
    }
  }

  return descriptions;
}

/**
 * Stage 2: Generate per-repo summary from AI-enhanced commits
 */
export async function generateRepoSummary(
  repo: string,
  commits: CommitFile[]
): Promise<string[]> {
  if (commits.length === 0) return [];

  // Group by type
  const byType = new Map<string, CommitFile[]>();
  for (const commit of commits) {
    const type = commit.type || "other";
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(commit);
  }

  // Format commits with their AI descriptions
  const commitList = commits
    .slice(0, 30) // Limit for prompt size
    .map((c) => {
      const desc = c.aiDescription || c.message.split("\n")[0];
      return `- [${c.type || "other"}] ${desc} (+${c.additions}/-${c.deletions})`;
    })
    .join("\n");

  const stats = `${commits.length} commits, ${commits.reduce((s, c) => s + c.additions, 0)} additions`;

  const prompt = `Summarize the key achievements from these commits in 2-3 bullet points.
Focus on: features shipped, improvements made, technical accomplishments.
Be specific and quantify impact where possible.
Return ONLY the bullet points, no other text.

Repository: ${repo} (${stats})

Commits:
${commitList}`;

  try {
    const response = invokeClaudeCLI(prompt);
    // Parse bullet points
    const bullets = response
      .split("\n")
      .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("•"))
      .map((line) => line.replace(/^[\s\-•]+/, "").trim())
      .filter((line) => line.length > 0);

    return bullets.length > 0 ? bullets : [commits[0]?.aiDescription || repo];
  } catch (error) {
    console.error(`  Error generating repo summary for ${repo}: ${error}`);
    // Fallback: return top commit descriptions
    return commits
      .slice(0, 3)
      .map((c) => c.aiDescription || c.message.split("\n")[0]);
  }
}

/**
 * Stage 3: Synthesize top achievements across all repos
 */
export async function synthesizeTopAchievements(
  repoSummaries: Map<string, string[]>
): Promise<string[]> {
  // Format repo summaries
  const summaryList = Array.from(repoSummaries.entries())
    .map(([repo, summaries]) => {
      return `Repository: ${repo}\n${summaries.map((s) => `  - ${s}`).join("\n")}`;
    })
    .join("\n\n");

  const prompt = `You are creating a "Year in Review" for a developer's portfolio.
From these repository summaries, identify the TOP 5 most impressive achievements.
Write them as compelling, specific accomplishments for LinkedIn/blog.

Format: Action verb + specific outcome + context
Example: "Built real-time notification system serving 10K daily users"

Return ONLY the 5 bullet points, one per line starting with "-". No other text.

Repository summaries:
${summaryList}`;

  try {
    const response = invokeClaudeCLI(prompt);
    const achievements = response
      .split("\n")
      .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("•"))
      .map((line) => line.replace(/^[\s\-•]+/, "").trim())
      .filter((line) => line.length > 0)
      .slice(0, 5);

    return achievements.length > 0
      ? achievements
      : Array.from(repoSummaries.values()).flat().slice(0, 5);
  } catch (error) {
    console.error(`  Error synthesizing achievements: ${error}`);
    // Fallback: collect from repo summaries
    return Array.from(repoSummaries.values()).flat().slice(0, 5);
  }
}

/**
 * Main orchestration: Generate all AI highlights
 */
export async function generateAIHighlights(
  commitsByRepo: Map<string, CommitFile[]>,
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<AIGeneratedHighlights> {
  const byRepo: Record<string, string[]> = {};
  const repoSummaries = new Map<string, string[]>();

  // Filter to significant repos (>= 5 commits or >= 200 lines)
  const significantRepos = Array.from(commitsByRepo.entries()).filter(
    ([_, commits]) => {
      const totalLines = commits.reduce(
        (sum, c) => sum + c.additions + c.deletions,
        0
      );
      return commits.length >= 5 || totalLines >= 200;
    }
  );

  console.log(
    `  Processing ${significantRepos.length} significant repositories...`
  );

  // Stage 1 & 2: Per-repo processing
  let repoIdx = 0;
  for (const [repo, commits] of significantRepos) {
    repoIdx++;
    console.log(`  [${repoIdx}/${significantRepos.length}] ${repo}...`);

    if (onProgress) {
      onProgress("repos", repoIdx, significantRepos.length);
    }

    // Stage 1: Generate commit descriptions
    const descriptions = await generateCommitDescriptions(
      commits,
      repo,
      (current, total) => {
        process.stdout.write(
          `\r    Commits: ${current}/${total}                    `
        );
      }
    );
    console.log(""); // New line after progress

    // Update commits with AI descriptions
    for (const commit of commits) {
      const desc = descriptions.get(commit.sha.slice(0, 7));
      if (desc) {
        commit.aiDescription = desc;
      }
    }

    // Stage 2: Generate repo summary
    const summary = await generateRepoSummary(repo, commits);
    byRepo[repo] = summary;
    repoSummaries.set(repo, summary);

    console.log(`    Summary: ${summary.length} achievements`);
  }

  // Stage 3: Synthesize top achievements
  console.log("\n  Synthesizing top achievements...");
  const topAchievements = await synthesizeTopAchievements(repoSummaries);

  return {
    topAchievements,
    byRepo,
  };
}
