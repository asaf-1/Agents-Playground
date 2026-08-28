// Turns a flow id plus caller options into a validated execution plan.
//
// This is the trust boundary of the remote runner. Everything a caller can
// influence (flow id, target URL, shard count, browser, retries, workers) is
// validated here against the committed catalog and the normalize* rules in
// catalog.js. Downstream, exec-flow.js only replays the plan, so an invalid or
// hostile input fails at this step rather than reaching a child process.
//
// Usage:
//   node scripts/test-runner/resolve-flow.js --flow group-sanity
//   node scripts/test-runner/resolve-flow.js --flow spec-app-react-orders --shards 2
//
// Inputs may also arrive as environment variables (TR_FLOW, TR_TARGET_URL,
// TR_SHARDS, TR_BROWSER, TR_RETRIES, TR_WORKERS, TR_REASON, TR_REPORTER), which
// is how the GitHub workflow passes them: env avoids interpolating caller data
// into a shell command line.

const fs = require("node:fs");
const path = require("node:path");

const {
  PLAN_PATH,
  buildArgv,
  buildEnv,
  describeCommand,
  findFlow,
  needsApp,
  normalizeOptions,
  requireCatalog,
} = require("./catalog.js");

const FLAGS = [
  "--flow",
  "--target-url",
  "--shards",
  "--browser",
  "--retries",
  "--workers",
  "--reason",
  "--reporter",
];

function printHelp() {
  console.log(`Usage:
  node scripts/test-runner/resolve-flow.js --flow <flow-id> [options]

Options:
  --flow <id>          Flow id from the catalog. Required.
  --target-url <url>   Run against an existing deployment instead of building the app.
  --shards <n>         Shard count (1-8). Defaults to the flow's maxShards.
  --browser <name>     chromium | firefox | webkit. Default chromium.
  --retries <n>        Playwright retries (0-3). Default 0.
  --workers <n>        Playwright workers (1-8). Default 2.
  --reason <text>      Free-text note recorded in the plan and job summary.
  --reporter <name>    blob (default, mergeable) or list.
  --print              Print the plan as JSON instead of writing it.
  --help               Show this help.

Writes .artifacts/test-runner/plan.json and, under GitHub Actions, appends the
resolved values to GITHUB_OUTPUT.`);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--print") {
      options.print = true;
      continue;
    }

    if (FLAGS.includes(argument)) {
      const value = argv[index + 1];

      if (value === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }

      const key = argument
        .slice(2)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

// CLI flags win over environment, so a local override beats a workflow default.
function readInputs(options) {
  const fromEnv = (name) => {
    const value = process.env[name];
    return value === undefined || value === "" ? undefined : value;
  };

  return {
    flow: options.flow ?? fromEnv("TR_FLOW"),
    targetUrl: options.targetUrl ?? fromEnv("TR_TARGET_URL"),
    shards: options.shards ?? fromEnv("TR_SHARDS"),
    browser: options.browser ?? fromEnv("TR_BROWSER"),
    retries: options.retries ?? fromEnv("TR_RETRIES"),
    workers: options.workers ?? fromEnv("TR_WORKERS"),
    reason: options.reason ?? fromEnv("TR_REASON"),
    reporter: options.reporter ?? fromEnv("TR_REPORTER"),
  };
}

// Numeric inputs arrive as strings from both the CLI and workflow_dispatch.
function coerce(inputs) {
  const toNumber = (value) => {
    if (value === undefined || value === null || value === "") return undefined;

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      throw new Error(`Expected a number, received ${JSON.stringify(value)}.`);
    }

    return parsed;
  };

  return {
    targetUrl: inputs.targetUrl,
    shards: toNumber(inputs.shards),
    browser: inputs.browser,
    retries: toNumber(inputs.retries),
    workers: toNumber(inputs.workers),
    reason: inputs.reason,
    reporter: inputs.reporter,
  };
}

function buildPlan(flowId, rawOptions) {
  const catalog = requireCatalog();
  const flow = findFlow(catalog, flowId);
  const resolved = normalizeOptions(flow, rawOptions);

  const shards = Array.from({ length: resolved.shards }, (_, index) =>
    String(index + 1),
  );

  return {
    flow: {
      id: flow.id,
      kind: flow.kind,
      name: flow.name,
      runner: flow.runner,
      specs: flow.specs || [],
      grep: flow.grep || null,
      path: flow.path || null,
      testCount: flow.testCount ?? null,
      warning: flow.warning || null,
    },
    options: resolved,
    shards,
    needsApp: needsApp(flow) && !resolved.targetUrl,
    needsBrowserInstall: flow.runner !== "vitest",
    // argv/env per shard, so the executor never re-derives anything.
    steps: shards.map((shard, index) => ({
      shard,
      argv: buildArgv(flow, resolved, index + 1),
      env: buildEnv(flow, resolved),
      command: describeCommand(flow, resolved, index + 1),
    })),
  };
}

function writeGithubOutput(plan) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) return;

  const values = {
    flow_id: plan.flow.id,
    flow_name: plan.flow.name,
    flow_kind: plan.flow.kind,
    runner: plan.flow.runner,
    test_count: plan.flow.testCount ?? "",
    shard_count: String(plan.options.shards),
    matrix: JSON.stringify(plan.shards),
    needs_app: String(plan.needsApp),
    needs_browser_install: String(plan.needsBrowserInstall),
    browser: plan.options.browser,
    target_url: plan.options.targetUrl,
    command: plan.steps[0].command,
  };

  // Delimiter form throughout: a flow name or command is free-form text and
  // key=value would break on any newline that slipped through.
  const lines = Object.entries(values).map(([key, value]) => {
    const delimiter = `__tr_${key}__`;
    return `${key}<<${delimiter}\n${value}\n${delimiter}`;
  });

  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

function writeSummary(plan) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryPath) return;

  const lines = [
    "## Remote test runner",
    "",
    `- **Flow**: ${plan.flow.name} (\`${plan.flow.id}\`)`,
    `- **Kind**: ${plan.flow.kind} · **Runner**: ${plan.flow.runner}`,
    `- **Tests**: ${plan.flow.testCount ?? "unknown"}`,
    `- **Shards**: ${plan.options.shards}`,
    `- **Browser**: ${plan.options.browser}`,
    `- **Target**: ${plan.options.targetUrl || "app built and served by this run"}`,
    `- **Retries**: ${plan.options.retries} · **Workers**: ${plan.options.workers}`,
  ];

  if (plan.options.reason) {
    lines.push(`- **Reason**: ${plan.options.reason}`);
  }

  if (plan.flow.warning) {
    lines.push("", `> [!WARNING]`, `> ${plan.flow.warning}`);
  }

  lines.push("", "```", plan.steps[0].command, "```", "");

  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    return;
  }

  const inputs = readInputs(options);

  if (!inputs.flow) {
    console.error("--flow is required (or set TR_FLOW).");
    printHelp();
    process.exit(1);
  }

  const plan = buildPlan(inputs.flow, coerce(inputs));

  if (options.print) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  fs.mkdirSync(path.dirname(PLAN_PATH), { recursive: true });
  fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);

  writeGithubOutput(plan);
  writeSummary(plan);

  console.log(
    `[runner] ${plan.flow.name} (${plan.flow.id}) -> ${plan.options.shards} shard(s), runner ${plan.flow.runner}`,
  );
  console.log(`[runner] ${plan.steps[0].command}`);

  if (plan.flow.warning) {
    console.warn(`[runner] warning: ${plan.flow.warning}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[runner] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { buildPlan };
