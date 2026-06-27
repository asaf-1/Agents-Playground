#!/usr/bin/env node
require("./bug-reporting/register-ts-runtime");

const {
  ObsidianCloseoutAgent,
} = require("../framework/agents/obsidian/ObsidianCloseoutAgent");

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

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

function buildValidations(args) {
  if (!args["validation-command"] && !args["validation-outcome"]) {
    return [];
  }

  return [
    {
      command: args["validation-command"] || "not supplied",
      outcome: args["validation-outcome"] || "not supplied",
      passed:
        String(args["validation-passed"] ?? "true").toLowerCase() !== "false",
    },
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.title) {
    printUsage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

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

  console.log(`Closeout status: ${result.status}`);
  console.log(`Changed files: ${result.changedFiles.length}`);

  if (result.report) {
    console.log(`Workspace report: ${result.report.relativePath}`);
  }

  if (result.missingRequiredDocumentation.length > 0) {
    console.log("Missing required documentation:");
    for (const requiredPath of result.missingRequiredDocumentation) {
      console.log(`- ${requiredPath}`);
    }
  }

  if (result.status === "blocked" && !args["allow-missing-docs"]) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
