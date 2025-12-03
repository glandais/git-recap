#!/usr/bin/env node

import { Command } from "commander";
import { fetchCommand } from "./commands/fetch.js";
import { processCommand } from "./commands/process.js";
import { generateCommand } from "./commands/generate.js";

const program = new Command();

program
  .name("git-recap")
  .description(
    "Generate marketing-ready year-in-review summaries of git contributions"
  )
  .version("0.1.0");

// Add subcommands
program.addCommand(fetchCommand);
program.addCommand(processCommand);
program.addCommand(generateCommand);

// Show help if no subcommand provided
program.action(() => {
  program.help();
});

program.parse();
