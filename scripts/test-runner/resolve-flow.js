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
// Inputs may also arrive as environment variables (TR_FLOW, TR_ENVIRONMENT,
// TR_TARGET_URL, TR_SHARDS, TR_BROWSER, TR_RETRIES, TR_WORKERS, TR_REASON,
// TR_REPORTER), which
// is how the GitHub workflow passes them: env avoids interpolating caller data
// into a shell command line.

// Files and paths.
const fs = require("node:fs");
const path = require("node:path");

// The catalog's readers and the rules every option is checked against.
const {
  PLAN_PATH,
  buildArgv,
  buildEnv,
  describeCommand,
  findEnvironment,
  findFlow,
  needsApp,
  normalizeOptions,
  readEnvironments,
  requireCatalog,
} = require("./catalog.js");

// The options that take a value.
const FLAGS = [
  "--flow",
  "--environment",
  "--target-url",
  "--shards",
  "--browser",
  "--retries",
  "--workers",
  "--reason",
  "--reporter",
];

// Shows how to run this script.
function printHelp() {
  console.log(`Usage:
  node scripts/test-runner/resolve-flow.js --flow <flow-id> [options]

Options:
  --flow <id>          Flow id from the catalog. Required.
  --environment <name> Environment from pipeline.config.json (blank = its default).
  --target-url <url>   Run against an existing deployment instead of building the app.
                       Only for a host with no environment entry.
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

// Reads the command-line options.
function parseArgs(argv) {
  // The options found so far.
  const options = {};

  // Go through each word.
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    // --help: show how to run it.
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    // --print: print the plan instead of writing it.
    if (argument === "--print") {
      options.print = true;
      continue;
    }

    // An option that takes the next word as its value.
    if (FLAGS.includes(argument)) {
      // The value; a missing one is an error.
      const value = argv[index + 1];

      if (value === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }

      // Keep it under its camelCase name (--target-url as targetUrl), and skip
      // past it.
      const key = argument
        .slice(2)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
      continue;
    }

    // Anything else is an error.
    throw new Error(`Unknown argument: ${argument}`);
  }

  // The options.
  return options;
}

// CLI flags win over environment, so a local override beats a workflow default.
function readInputs(options) {
  // An environment variable's value; unset or empty counts as not given.
  const fromEnv = (name) => {
    const value = process.env[name];
    return value === undefined || value === "" ? undefined : value;
  };

  // Each input from its flag, else from its TR_ variable.
  return {
    flow: options.flow ?? fromEnv("TR_FLOW"),
    environment: options.environment ?? fromEnv("TR_ENVIRONMENT"),
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
  // A number from a string; empty is not given, and anything else is an error.
  const toNumber = (value) => {
    // Not given.
    if (value === undefined || value === null || value === "") return undefined;

    // Read it as a number.
    const parsed = Number(value);

    // Not a number: fail with what came in.
    if (!Number.isFinite(parsed)) {
      throw new Error(`Expected a number, received ${JSON.stringify(value)}.`);
    }

    // The number.
    return parsed;
  };

  // The inputs, with the numbers turned into numbers.
  return {
    environment: inputs.environment,
    targetUrl: inputs.targetUrl,
    shards: toNumber(inputs.shards),
    browser: inputs.browser,
    retries: toNumber(inputs.retries),
    workers: toNumber(inputs.workers),
    reason: inputs.reason,
    reporter: inputs.reporter,
  };
}

// The plan for one flow: the flow, the checked options, the environment, and
// the exact command for each shard.
function buildPlan(flowId, rawOptions) {
  // The catalog and the flow asked for.
  const catalog = requireCatalog();
  const flow = findFlow(catalog, flowId);
  // Read once here and handed in, so normalizeOptions stays pure and every
  // environment failure lands in this step — the plan job, before the shard
  // matrix exists and before any runner spends a minute on npm ci.
  const environments = readEnvironments();
  const resolved = normalizeOptions(flow, { ...rawOptions, environments });
  const environment = findEnvironment(environments, resolved.environment);
  const stepOptions = { ...resolved, environments };

  // The shard numbers, "1" up to the shard count.
  const shards = Array.from({ length: resolved.shards }, (_, index) =>
    String(index + 1),
  );

  // The plan itself.
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
    // Name and description together, so the summary can state provenance as a
    // pair: which environment was claimed, and which URL was actually used.
    environment: {
      name: environment.name,
      label: environment.label || environment.name,
      description: environment.description || "",
      baseURL: environment.baseURL ?? null,
    },
    shards,
    needsApp: needsApp(flow) && !resolved.targetUrl,
    needsBrowserInstall: flow.runner !== "vitest",
    // argv/env per shard, so the executor never re-derives anything.
    steps: shards.map((shard, index) => ({
      shard,
      argv: buildArgv(flow, stepOptions, index + 1),
      env: buildEnv(flow, stepOptions),
      command: describeCommand(flow, stepOptions, index + 1),
    })),
  };
}

// Hand the plan's main values to the next workflow steps, under GitHub Actions.
function writeGithubOutput(plan) {
  // Where GitHub reads step outputs.
  const outputPath = process.env.GITHUB_OUTPUT;

  // Not under Actions: nothing to do.
  if (!outputPath) return;

  // The values the next steps read.
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
    environment: plan.options.environment,
    target_url: plan.options.targetUrl,
    command: plan.steps[0].command,
  };

  // Delimiter form throughout: a flow name or command is free-form text and
  // key=value would break on any newline that slipped through.
  const lines = Object.entries(values).map(([key, value]) => {
    const delimiter = `__tr_${key}__`;
    return `${key}<<${delimiter}\n${value}\n${delimiter}`;
  });

  // Add them to the outputs file.
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

// Add a short description of the run to the job summary, under GitHub Actions.
function writeSummary(plan) {
  // Where GitHub reads the job summary.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  // Not under Actions: nothing to do.
  if (!summaryPath) return;

  // The flow, its kind, tests, shards, browser, environment, target and
  // settings.
  const lines = [
    "## Remote test runner",
    "",
    `- **Flow**: ${plan.flow.name} (\`${plan.flow.id}\`)`,
    `- **Kind**: ${plan.flow.kind} · **Runner**: ${plan.flow.runner}`,
    `- **Tests**: ${plan.flow.testCount ?? "unknown"}`,
    `- **Shards**: ${plan.options.shards}`,
    `- **Browser**: ${plan.options.browser}`,
    `- **Environment**: ${plan.environment.name}${plan.environment.description ? ` — ${plan.environment.description}` : ""}`,
    `- **Target**: ${plan.options.targetUrl || "app built and served by this run"}`,
    `- **Retries**: ${plan.options.retries} · **Workers**: ${plan.options.workers}`,
  ];

  // The reason, when one was given.
  if (plan.options.reason) {
    lines.push(`- **Reason**: ${plan.options.reason}`);
  }

  // The flow's warning, as a warning box.
  if (plan.flow.warning) {
    lines.push("", `> [!WARNING]`, `> ${plan.flow.warning}`);
  }

  // The command the first shard runs.
  lines.push("", "```", plan.steps[0].command, "```", "");

  // Add it all to the job summary.
  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

// Read the inputs, build the plan, and write it for exec-flow.js and the
// workflow.
function main() {
  // The options.
  let options;

  // Bad options: say why, show the help, and stop.
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exit(1);
  }

  // --help: show it and stop.
  if (options.help) {
    printHelp();
    return;
  }

  // Each input from its flag or its TR_ variable.
  const inputs = readInputs(options);

  // No flow: say how to name one, and stop.
  if (!inputs.flow) {
    console.error("--flow is required (or set TR_FLOW).");
    printHelp();
    process.exit(1);
  }

  // Build the plan; a bad input stops here.
  const plan = buildPlan(inputs.flow, coerce(inputs));

  // --print: print it and stop.
  if (options.print) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  // Write the plan file.
  fs.mkdirSync(path.dirname(PLAN_PATH), { recursive: true });
  fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);

  // Hand it to the workflow.
  writeGithubOutput(plan);
  writeSummary(plan);

  // Say what will run.
  console.log(
    `[runner] ${plan.flow.name} (${plan.flow.id}) -> ${plan.options.shards} shard(s), runner ${plan.flow.runner}`,
  );
  console.log(`[runner] ${plan.steps[0].command}`);

  // And the flow's warning, when it has one.
  if (plan.flow.warning) {
    console.warn(`[runner] warning: ${plan.flow.warning}`);
  }
}

// Run only when started directly; an error prints its message and fails.
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[runner] ${error.message}`);
    process.exit(1);
  }
}

// What exec-flow.js uses.
module.exports = { buildPlan };
