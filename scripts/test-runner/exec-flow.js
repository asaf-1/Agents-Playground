// Executes one shard of a plan produced by resolve-flow.js.
//
// This script deliberately does no resolution of its own: it replays the argv
// and env the plan already validated. That keeps a single trust boundary
// (resolve-flow.js) and means the command CI runs is byte-for-byte the command
// recorded in the plan artifact.
//
// Usage:
//   node scripts/test-runner/exec-flow.js --shard 1
//   node scripts/test-runner/exec-flow.js --flow group-sanity   # resolve then run
//
// Exits with the test runner's own exit code.

const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const { PLAN_PATH, REPO_ROOT, toSpawn } = require("./catalog.js");
const { buildPlan } = require("./resolve-flow.js");

function printHelp() {
  console.log(`Usage:
  node scripts/test-runner/exec-flow.js [options]

Options:
  --shard <n>       Which shard of the plan to run. Default 1.
  --plan <path>     Plan file to replay. Default .artifacts/test-runner/plan.json.
  --flow <id>       Resolve this flow on the fly instead of reading a plan file.
  --dry-run         Print the command and environment without running it.
  --help            Show this help.`);
}

function parseArgs(argv) {
  const options = { shard: 1 };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (["--shard", "--plan", "--flow"].includes(argument)) {
      const value = argv[index + 1];

      if (value === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }

      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function loadPlan(options) {
  if (options.flow) {
    return buildPlan(options.flow, {
      targetUrl: process.env.TR_TARGET_URL,
      shards: process.env.TR_SHARDS ? Number(process.env.TR_SHARDS) : undefined,
      browser: process.env.TR_BROWSER,
      reporter: process.env.TR_REPORTER || "list",
    });
  }

  const planPath = options.plan || PLAN_PATH;

  if (!fs.existsSync(planPath)) {
    throw new Error(
      `No plan at ${planPath}. Run resolve-flow.js first, or pass --flow <id>.`,
    );
  }

  return JSON.parse(fs.readFileSync(planPath, "utf8"));
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

  const plan = loadPlan(options);
  const shard = String(options.shard);
  const step = plan.steps.find((candidate) => candidate.shard === shard);

  if (!step) {
    throw new Error(
      `Plan has no shard ${shard}. Available: ${plan.steps.map((s) => s.shard).join(", ")}.`,
    );
  }

  const { command, args } = toSpawn(step.argv);
  const env = { ...process.env, ...step.env };

  console.log(
    `[runner] ${plan.flow.name} shard ${shard}/${plan.steps.length}: ${step.command}`,
  );

  if (options.dryRun) {
    console.log(`[runner] would spawn: ${command} ${args.join(" ")}`);
    console.log(`[runner] extra env: ${JSON.stringify(step.env)}`);
    return;
  }

  // shell:false is load-bearing. Spec paths and grep patterns come from the
  // catalog and could contain characters a shell would interpret.
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(`Failed to start the test runner: ${result.error.message}`);
  }

  process.exit(result.status === null ? 1 : result.status);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[runner] ${error.message}`);
    process.exit(1);
  }
}
