#!/usr/bin/env node
require("./register-ts-runtime");

const fs = require("fs");
const path = require("path");
const { ensureLocalServer } = require("./ensure-local-server");
const {
  BugReportingAgent
} = require("../../framework/agents/reporting/BugReportingAgent");

function parseArgs(argv) {
  const parsed = {
    positionals: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      parsed.positionals.push(token);
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

function buildExpectation(args) {
  if (args["expect-testid"]) {
    return {
      kind: "testid",
      value: args["expect-testid"]
    };
  }

  if (args["expect-text"]) {
    return {
      kind: "text",
      value: args["expect-text"]
    };
  }

  if (args["expect-role"] && args["expect-name"]) {
    return {
      kind: "role",
      role: args["expect-role"],
      name: args["expect-name"]
    };
  }

  return null;
}

function printUsage() {
  console.log([
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
    "  --base-url <url>"
  ].join("\n"));
}

function printResult(result) {
  console.log([
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
    `Message: ${result.message}`
  ].filter(Boolean).join("\n"));
}

function getScenarioNames(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const expectation = buildExpectation(args);
  const baseUrl = args["base-url"] || "http://127.0.0.1:4173";
  const reruns = args.reruns ? Number(args.reruns) : undefined;

  if (!args.scenario && !args["scan-artifacts"] && !args["manual-url"]) {
    printUsage();
    throw new Error("Choose --scenario, --scan-artifacts, or --manual-url.");
  }

  if (args["manual-url"] && !expectation) {
    printUsage();
    throw new Error("Manual mode requires one expectation flag.");
  }

  const server = await ensureLocalServer({
    baseUrl,
    cwd: process.cwd()
  });

  try {
    const agent = new BugReportingAgent({
      baseUrl,
      rerunCount: reruns
    });

    if (args.scenario) {
      const result = await agent.reportScenario(args.scenario);
      printResult(result);
      return;
    }

    if (args["manual-url"]) {
      const result = await agent.reportManualCheck({
        component: args.component,
        expectation,
        notes: args.notes,
        rerunCount: reruns,
        url: args["manual-url"]
      });
      printResult(result);
      return;
    }

    const scenarioRoot = path.join(process.cwd(), ".artifacts", "scenarios");
    const scenarioNames = getScenarioNames(scenarioRoot);
    const results = [];

    for (const scenarioName of scenarioNames) {
      results.push(await agent.reportScenario(scenarioName));
    }

    console.log("Scenario summary:");
    for (const result of results) {
      console.log(
        `- ${result.source}:${result.outcome}${result.bugId ? ` -> ${result.bugId}` : ""}`
      );
    }
  } finally {
    await server.stop();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
