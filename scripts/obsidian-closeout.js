#!/usr/bin/env node
// Lets require() load the TypeScript agent below.
require("./bug-reporting/register-ts-runtime");

// The agent that writes the closeout note.
const {
  ObsidianCloseoutAgent,
} = require("../framework/agents/obsidian/ObsidianCloseoutAgent");

// Reads --name value pairs from the command line; a flag with no value is true.
function parseArgs(argv) {
  // The flags found so far.
  const parsed = {};

  // Go through each word.
  for (let index = 0; index < argv.length; index += 1) {
    // Skip anything that is not a --flag.
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    // The flag's name, and the word after it.
    const key = token.slice(2);
    const next = argv[index + 1];

    // No value after it: the flag is simply on.
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    // Otherwise the next word is its value, so skip past it.
    parsed[key] = next;
    index += 1;
  }

  // All the flags.
  return parsed;
}

// Shows how to run this script.
function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/obsidian-closeout.js --title <title> --summary <text>",
      "",
      "Optional flags:",
      "  --task <obsidian-vault/Tasks/file.md>",
      "  --validation-command <command>",
      "  --validation-outcome <summary>",
      "  --validation-passed <true|false>",
      "  --allow-missing-docs",
      "  --no-report",
      "",
      "Example:",
      '  npm.cmd run obsidian:closeout -- --title real-agent-closeout --summary "Implemented and validated closeout agent" --validation-command "npm.cmd run test:e2e" --validation-outcome "47 passed, 1 skipped"',
    ].join("\n"),
  );
}

// The test results for the note, when the command line gave any.
function buildValidations(args) {
  // None given: no results.
  if (!args["validation-command"] && !args["validation-outcome"]) {
    return [];
  }

  // One result; it counts as passed unless --validation-passed is false.
  return [
    {
      command: args["validation-command"] || "not supplied",
      outcome: args["validation-outcome"] || "not supplied",
      passed:
        String(args["validation-passed"] ?? "true").toLowerCase() !== "false",
    },
  ];
}

// Write the closeout note from the command-line flags.
async function main() {
  // Read the flags.
  const args = parseArgs(process.argv.slice(2));

  // No title, or --help: show how to run it.
  if (args.help || !args.title) {
    printUsage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  // Write the note through the agent.
  const agent = new ObsidianCloseoutAgent({
    activeTaskPath: args.task,
  });
  const result = await agent.closeout({
    activeTaskPath: args.task,
    summary: args.summary,
    title: args.title,
    validations: buildValidations(args),
    writeReport: !args["no-report"],
  });

  // Say what it did.
  console.log(`Closeout status: ${result.status}`);
  console.log(`Changed files: ${result.changedFiles.length}`);

  // Where the report went, when one was written.
  if (result.report) {
    console.log(`Workspace report: ${result.report.relativePath}`);
  }

  // List the documents the closeout needed but did not find.
  if (result.missingRequiredDocumentation.length > 0) {
    console.log("Missing required documentation:");
    for (const requiredPath of result.missingRequiredDocumentation) {
      console.log(`- ${requiredPath}`);
    }
  }

  // Blocked by missing documents fails, unless --allow-missing-docs.
  if (result.status === "blocked" && !args["allow-missing-docs"]) {
    process.exitCode = 1;
  }
}

// Run it; an error prints its message and fails.
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
