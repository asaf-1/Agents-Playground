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

// Files, and running a program.
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

// The plan's paths and command builder, and the plan resolver.
const { PLAN_PATH, REPO_ROOT, toSpawn } = require("./catalog.js");
const { buildPlan } = require("./resolve-flow.js");

// Shows how to run this script.
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

// Reads the command-line options.
function parseArgs(argv) {
  // One shard unless told otherwise.
  const options = { shard: 1 };

  // Go through each word.
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    // --help: show how to run it.
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    // --dry-run: print the command instead of running it.
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    // --shard, --plan and --flow each take the next word as their value.
    if (["--shard", "--plan", "--flow"].includes(argument)) {
      const value = argv[index + 1];

      // A missing value is an error.
      if (value === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }

      // Keep it, and skip past it.
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }

    // Anything else is an error.
    throw new Error(`Unknown argument: ${argument}`);
  }

  // The options.
  return options;
}

// The plan to run: resolved now from --flow, or read from a plan file.
function loadPlan(options) {
  // --flow: resolve it now, with the settings from the environment.
  if (options.flow) {
    return buildPlan(options.flow, {
      targetUrl: process.env.TR_TARGET_URL,
      shards: process.env.TR_SHARDS ? Number(process.env.TR_SHARDS) : undefined,
      browser: process.env.TR_BROWSER,
      reporter: process.env.TR_REPORTER || "list",
    });
  }

  // Otherwise the plan file, from --plan or the usual place.
  const planPath = options.plan || PLAN_PATH;

  // No file there: fail with what to do.
  if (!fs.existsSync(planPath)) {
    throw new Error(
      `No plan at ${planPath}. Run resolve-flow.js first, or pass --flow <id>.`,
    );
  }

  // Read it.
  return JSON.parse(fs.readFileSync(planPath, "utf8"));
}

// Run one shard of the plan, with the plan's own command and settings.
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

  // The plan, and the shard asked for.
  const plan = loadPlan(options);
  const shard = String(options.shard);
  const step = plan.steps.find((candidate) => candidate.shard === shard);

  // No such shard: fail with the ones there are.
  if (!step) {
    throw new Error(
      `Plan has no shard ${shard}. Available: ${plan.steps.map((s) => s.shard).join(", ")}.`,
    );
  }

  // The command to start, and the environment with the plan's settings added.
  const { command, args } = toSpawn(step.argv);
  const env = { ...process.env, ...step.env };

  // Say what runs.
  console.log(
    `[runner] ${plan.flow.name} shard ${shard}/${plan.steps.length}: ${step.command}`,
  );

  // --dry-run: print it and stop.
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

  // It could not start: fail with the reason.
  if (result.error) {
    throw new Error(`Failed to start the test runner: ${result.error.message}`);
  }

  // Stop with the test runner's own exit code.
  process.exit(result.status === null ? 1 : result.status);
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
