import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { RecapData, CommitFile, CommitRef } from "../types/recap-data.js";
import { formatMarkdown } from "../formatters/markdown.js";
import { formatLinkedIn } from "../formatters/linkedin.js";
import { polishContent } from "../formatters/ai-polish.js";

export interface GenerateOptions {
  input: string;
  format: "markdown" | "linkedin";
  output?: string;
  aiPolish?: boolean;
}

/**
 * Recap data as stored in folder structure
 */
interface RecapFolder {
  meta: RecapData["meta"];
  metrics: RecapData["metrics"];
  repositories: RecapData["repositories"];
  commits: CommitRef[];
  highlights: RecapData["highlights"];
}

export const generateCommand = new Command("generate")
  .description("Generate a recap report from fetched data folder")
  .requiredOption("--input <folder>", "Input folder from fetch command")
  .option("--format <format>", "Output format: markdown or linkedin", "markdown")
  .option("--output <file>", "Output file path (prints to stdout if not specified)")
  .option("--ai-polish", "Use Claude CLI to polish the output")
  .action(async (options: GenerateOptions) => {
    // Determine if input is a folder or file (backward compatibility)
    let recapData: RecapData;

    if (existsSync(join(options.input, "recap.json"))) {
      // New folder structure
      recapData = loadFromFolder(options.input);
    } else if (existsSync(options.input) && options.input.endsWith(".json")) {
      // Legacy single file
      const content = readFileSync(options.input, "utf-8");
      recapData = JSON.parse(content) as RecapData;
    } else {
      console.error(`Failed to read input: ${options.input}`);
      console.error("Expected a folder with recap.json or a .json file");
      process.exit(1);
    }

    // Generate output based on format
    let output: string;
    switch (options.format) {
      case "linkedin":
        output = formatLinkedIn(recapData);
        break;
      case "markdown":
      default:
        output = formatMarkdown(recapData);
        break;
    }

    // AI polish
    if (options.aiPolish) {
      output = polishContent(output, options.format as "markdown" | "linkedin");
    }

    // Output result
    if (options.output) {
      writeFileSync(options.output, output);
      console.log(`Report saved to: ${options.output}`);
    } else {
      console.log(output);
    }
  });

/**
 * Load recap data from folder structure
 */
function loadFromFolder(folderPath: string): RecapData {
  const recapPath = join(folderPath, "recap.json");
  const content = readFileSync(recapPath, "utf-8");
  const recapFolder = JSON.parse(content) as RecapFolder;

  // Load commit details from commits/ folder
  const commitsFolder = join(folderPath, "commits");
  const commits: RecapData["commits"] = [];

  if (existsSync(commitsFolder)) {
    for (const ref of recapFolder.commits) {
      const commitPath = join(commitsFolder, `${ref.sha}.json`);
      if (existsSync(commitPath)) {
        const commitContent = readFileSync(commitPath, "utf-8");
        const commitFile = JSON.parse(commitContent) as CommitFile;
        commits.push({
          sha: commitFile.sha,
          message: commitFile.message,
          repo: commitFile.repo,
          source: "github",
          date: commitFile.date,
          additions: commitFile.additions,
          deletions: commitFile.deletions,
          type: commitFile.type,
        });
      }
    }
  }

  return {
    meta: recapFolder.meta,
    metrics: recapFolder.metrics,
    repositories: recapFolder.repositories,
    commits,
    highlights: recapFolder.highlights,
  };
}
