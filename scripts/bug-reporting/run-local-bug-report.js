#!/usr/bin/env node
// Lets require() load the TypeScript agent below.
require("./register-ts-runtime");

// Files, paths, the local server starter, and the bug-reporting agent.
const fs = require("fs");
const path = require("path");
const { ensureLocalServer } = require("./ensure-local-server");
const {
  BugReportingAgent,
} = require("../../framework/agents/reporting/BugReportingAgent");

// Reads the command line: --name value pairs, a flag with no value as true, and
// other words as positionals.
function parseArgs(argv) {
  // What was found so far.
  const parsed = {
    positionals: [],
  };

  // Go through each word.
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    // A word that is not a --flag is a positional.
    if (!token.startsWith("--")) {
      parsed.positionals.push(token);
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

  // Everything found.
  return parsed;
}

// What the manual check should see on the page: a test id, a text, or a role
// with a name.
function buildExpectation(args) {
  // --expect-testid: an element with that test id.
  if (args["expect-testid"]) {
    return {
      kind: "testid",
      value: args["expect-testid"],
    };
  }

  // --expect-text: that text.
  if (args["expect-text"]) {
    return {
      kind: "text",
      value: args["expect-text"],
    };
  }

  // --expect-role with --expect-name: an element with that role and name.
  if (args["expect-role"] && args["expect-name"]) {
    return {
      kind: "role",
      role: args["expect-role"],
      name: args["expect-name"],
    };
  }

  // None given.
  return null;
}

// Shows how to run this script.
function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/bug-reporting/run-local-bug-report.js --scenario <name>",
      "  node scripts/bug-reporting/run-local-bug-report.js --scan-artifacts",
      "  node scripts/bug-reporting/run-local-bug-report.js --manual-url <url> --expect-testid <id>",
      "  node scripts/bug-reporting/run-local-bug-report.js --manual-url <url> --expect-text <text>",
      "  node scripts/bug-reporting/run-local-bug-report.js --manual-url <url> --expect-role <role> --expect-name <name>",
      "",
      "Optional flags:",
      "  --reruns <count>",
      "  --component <label>",
      "  --notes <text>",
      "  --base-url <url>",
    ].join("\n"),
  );
}

// Print one outcome: what happened, the bug's id and files, and the message.
function printResult(result) {
  console.log(
    [
      `Outcome: ${result.outcome}`,
      `Source: ${result.source}`,
      `Tracker: ${result.trackerMode}`,
      result.bugId ? `Bug ID: ${result.bugId}` : null,
      result.classification
        ? `Classification: ${result.classification.category} (${result.classification.confidence})`
        : null,
      result.bugPaths ? `Markdown: ${result.bugPaths.markdownPath}` : null,
      result.bugPaths ? `JSON: ${result.bugPaths.jsonPath}` : null,
      result.bugPaths ? `Index: ${result.bugPaths.indexPath}` : null,
      `Message: ${result.message}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

// The scenario folders under a root, sorted; none when the root is missing.
function getScenarioNames(rootDir) {
  // No folder: no scenarios.
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  // Each sub-folder is one scenario.
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// File or update local bug records for a scenario, a manual check, or every
// scenario run so far.
async function main() {
  // Read the flags.
  const args = parseArgs(process.argv.slice(2));

  // --help: show how to run it and stop.
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // What to expect, which server, and how many times to try the defect.
  const expectation = buildExpectation(args);
  const baseUrl = args["base-url"] || "http://127.0.0.1:4173";
  const reruns = args.reruns ? Number(args.reruns) : undefined;

  // One of the three modes is needed.
  if (!args.scenario && !args["scan-artifacts"] && !args["manual-url"]) {
    printUsage();
    throw new Error("Choose --scenario, --scan-artifacts, or --manual-url.");
  }

  // A manual check needs something to expect.
  if (args["manual-url"] && !expectation) {
    printUsage();
    throw new Error("Manual mode requires one expectation flag.");
  }

  // Start the app locally when it is not running.
  const server = await ensureLocalServer({
    baseUrl,
    cwd: process.cwd(),
  });

  // The server is stopped at the end, even after an error.
  try {
    // The agent, against that server.
    const agent = new BugReportingAgent({
      baseUrl,
      rerunCount: reruns,
    });

    // --scenario: report that one scenario.
    if (args.scenario) {
      const result = await agent.reportScenario(args.scenario);
      printResult(result);
      return;
    }

    // --manual-url: check that page for the expected thing.
    if (args["manual-url"]) {
      // Report what it finds.
      const result = await agent.reportManualCheck({
        component: args.component,
        expectation,
        notes: args.notes,
        rerunCount: reruns,
        url: args["manual-url"],
      });
      printResult(result);
      return;
    }

    // --scan-artifacts: every scenario under .artifacts/scenarios.
    const scenarioRoot = path.join(process.cwd(), ".artifacts", "scenarios");
    const scenarioNames = getScenarioNames(scenarioRoot);
    const results = [];

    // Report each one in turn.
    for (const scenarioName of scenarioNames) {
      results.push(await agent.reportScenario(scenarioName));
    }

    // Then one summary line per scenario.
    console.log("Scenario summary:");
    for (const result of results) {
      console.log(
        `- ${result.source}:${result.outcome}${result.bugId ? ` -> ${result.bugId}` : ""}`,
      );
    }
  } finally {
    await server.stop();
  }
}

// Run it; an error prints its message and fails.
main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
