import { Command } from "commander";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import {
  RecapData,
  CommitFile,
  DiffExtraction,
} from "../types/recap-data.js";
import { extractDiffInfo } from "../collectors/diff-extractor.js";
import {
  isClaudeAvailable,
  generateAIHighlights,
} from "../collectors/ai-highlights.js";

export interface ProcessOptions {
  input: string;
}

export const processCommand = new Command("process")
  .description("Process commits with AI to generate enhanced highlights")
  .requiredOption("--input <folder>", "Input folder containing fetched data")
  .action(async (options: ProcessOptions) => {
    const inputFolder = options.input;

    // Validate input folder
    if (!existsSync(inputFolder)) {
      console.error(`Error: Input folder not found: ${inputFolder}`);
      process.exit(1);
    }

    const recapPath = join(inputFolder, "recap.json");
    if (!existsSync(recapPath)) {
      console.error(`Error: recap.json not found in ${inputFolder}`);
      process.exit(1);
    }

    // Check Claude availability
    if (!isClaudeAvailable()) {
      console.error(
        "Error: Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code"
      );
      process.exit(1);
    }

    console.log(`Processing commits from ${inputFolder}...`);

    // Load recap.json
    const recapData: RecapData = JSON.parse(
      readFileSync(recapPath, "utf-8")
    );

    // Load and process commits
    const commitsFolder = join(inputFolder, "commits");
    if (!existsSync(commitsFolder)) {
      console.error(`Error: commits folder not found in ${inputFolder}`);
      process.exit(1);
    }

    console.log("\nStep 1: Loading commits and extracting diff info...");

    // Group commits by repo
    const commitsByRepo = new Map<string, CommitFile[]>();
    const commitFiles = readdirSync(commitsFolder).filter((f) =>
      f.endsWith(".json")
    );

    let processed = 0;
    for (const filename of commitFiles) {
      const sha = filename.replace(".json", "");
      const commitPath = join(commitsFolder, filename);
      const diffPath = join(commitsFolder, `${sha}.diff`);

      // Load commit metadata
      const commit: CommitFile = JSON.parse(
        readFileSync(commitPath, "utf-8")
      );

      // Extract diff info if diff exists
      if (existsSync(diffPath)) {
        const diff = readFileSync(diffPath, "utf-8");
        commit.diffExtraction = extractDiffInfo(diff);
      }

      // Group by repo
      const repo = commit.repo;
      if (!commitsByRepo.has(repo)) {
        commitsByRepo.set(repo, []);
      }
      commitsByRepo.get(repo)!.push(commit);

      processed++;
      if (processed % 50 === 0) {
        process.stdout.write(`\r  Loaded ${processed}/${commitFiles.length} commits`);
      }
    }
    console.log(`\r  Loaded ${processed} commits from ${commitsByRepo.size} repos`);

    // Generate AI highlights
    console.log("\nStep 2: Generating AI-enhanced descriptions...");
    const aiHighlights = await generateAIHighlights(commitsByRepo);

    // Update recap.json with AI highlights
    recapData.highlights.aiGenerated = aiHighlights;

    // Save updated recap.json
    writeFileSync(recapPath, JSON.stringify(recapData, null, 2));
    console.log(`\nUpdated ${recapPath} with AI highlights`);

    // Save updated commit files with AI descriptions
    console.log("\nStep 3: Saving enhanced commit metadata...");
    let savedCount = 0;
    for (const [_, commits] of commitsByRepo) {
      for (const commit of commits) {
        if (commit.aiDescription || commit.diffExtraction) {
          const commitPath = join(commitsFolder, `${commit.sha}.json`);
          writeFileSync(commitPath, JSON.stringify(commit, null, 2));
          savedCount++;
        }
      }
    }
    console.log(`  Saved ${savedCount} enhanced commit files`);

    // Print summary
    console.log("\n" + "=".repeat(50));
    console.log("Processing complete!");
    console.log("=".repeat(50));
    console.log(`\nTop Achievements:`);
    for (const achievement of aiHighlights.topAchievements) {
      console.log(`  • ${achievement}`);
    }
    console.log(
      `\nNext step: git-recap generate --input ${inputFolder}`
    );
  });
