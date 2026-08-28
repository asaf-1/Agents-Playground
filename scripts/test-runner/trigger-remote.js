// Starts a remote test run from a terminal, using the GitHub CLI.
//
// The Test Runner page is the primary surface, but a CLI matters for two cases
// the page cannot cover: driving the runner from a script, and starting a run
// on a machine that has gh but no working app checkout.
//
// Usage:
//   npm run test:remote -- --flow group-sanity
//   npm run test:remote -- --flow group-regression --shards 4 --watch
//   npm run test:remote -- --flow spec-app-react-orders --target-url https://staging.example.com --watch --download
//   npm run test:remote -- --list
//
// Requires the GitHub CLI, authenticated with actions:write on this repo.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  REPO_ROOT,
  findFlow,
  normalizeOptions,
  requireCatalog,
} = require("./catalog.js");
// The workflow this CLI dispatches. Declared here rather than imported: the
// standalone runner app owns its own copy, and these scripts must not depend on
// it (test-runner/ deploys separately and may not even be checked out).
const WORKFLOW_FILE = "remote-test-runner.yml";

const VALUE_FLAGS = [
  "--flow",
  "--target-url",
  "--shards",
  "--browser",
  "--retries",
  "--workers",
  "--reason",
  "--ref",
];

function printHelp() {
  console.log(`Usage:
  npm run test:remote -- --flow <flow-id> [options]

Options:
  --flow <id>          Flow to run. See --list.
  --target-url <url>   Test an existing deployment instead of building the app.
  --shards <n>         Parallel shards (1-8).
  --browser <name>     chromium | firefox | webkit.
  --retries <n>        Retries per test (0-3).
  --workers <n>        Workers per shard (1-8).
  --reason <text>      Recorded in the run's job summary.
  --ref <ref>          Branch, tag, or SHA to run. Default: current branch.
  --watch              Follow the run and exit with its status.
  --download           Download run artifacts into .artifacts/remote/<run-id>.
  --list               List available flows and exit.
  --dry-run            Print the gh command without starting a run.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (["--watch", "--download", "--list", "--dry-run"].includes(argument)) {
      const key = argument
        .slice(2)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = true;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (VALUE_FLAGS.includes(argument)) {
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

function runGh(args, { allowFailure = false, inherit = false } = {}) {
  const command = process.platform === "win32" ? "gh.exe" : "gh";
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    stdio: inherit ? "inherit" : "pipe",
  });

  if (result.error) {
    throw new Error(
      `Failed to start the GitHub CLI (${command}). Install it from https://cli.github.com and run "gh auth login". Original error: ${result.error.message}`,
    );
  }

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      (result.stderr || "").trim() ||
        `GitHub CLI exited with status ${result.status}`,
    );
  }

  return { status: result.status, stdout: (result.stdout || "").trim() };
}

function currentBranch() {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });

  const branch = (result.stdout || "").trim();
  return branch && branch !== "HEAD" ? branch : "main";
}

// main() is synchronous, so this blocks the thread rather than awaiting.
function sleepSync(ms) {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

function listFlows(catalog) {
  const widest = Math.max(...catalog.flows.map((flow) => flow.id.length));

  for (const flow of catalog.flows) {
    const count = flow.testCount === null ? "?" : flow.testCount;
    console.log(
      `${flow.id.padEnd(widest)}  ${String(count).padStart(4)} tests  ${flow.kind.padEnd(6)} ${flow.name}`,
    );
  }

  console.log(
    `\n${catalog.totals.flows} flows. Run one with: npm run test:remote -- --flow <id>`,
  );
}

// Finds the run this invocation started. workflow_dispatch gives back no id, so
// the newest run created at or after the dispatch is the best available match.
function findRun(since) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = runGh(
      [
        "run",
        "list",
        "--workflow",
        WORKFLOW_FILE,
        "--limit",
        "10",
        "--json",
        "databaseId,createdAt,status,displayTitle,url",
      ],
      { allowFailure: true },
    );

    if (result.status === 0 && result.stdout) {
      const runs = JSON.parse(result.stdout);
      const match = runs.find(
        (run) => new Date(run.createdAt).getTime() >= since - 10000,
      );

      if (match) return match;
    }

    // The run takes a moment to register after the dispatch is accepted.
    sleepSync(2000);
  }

  return null;
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

  const catalog = requireCatalog();

  if (options.list) {
    listFlows(catalog);
    return;
  }

  if (!options.flow) {
    console.error("--flow is required. Use --list to see the available flows.");
    printHelp();
    process.exit(1);
  }

  // Validated locally so a typo fails here instead of burning a runner minute.
  const flow = findFlow(catalog, options.flow);
  const resolved = normalizeOptions(flow, {
    shards: options.shards ? Number(options.shards) : undefined,
    browser: options.browser,
    retries: options.retries ? Number(options.retries) : undefined,
    workers: options.workers ? Number(options.workers) : undefined,
    targetUrl: options.targetUrl,
    reason: options.reason,
  });

  const ref = options.ref || currentBranch();
  const args = [
    "workflow",
    "run",
    WORKFLOW_FILE,
    "--ref",
    ref,
    "-f",
    `flow=${flow.id}`,
    "-f",
    `shards=${resolved.shards}`,
    "-f",
    `browser=${resolved.browser}`,
    "-f",
    `retries=${resolved.retries}`,
    "-f",
    `workers=${resolved.workers}`,
    "-f",
    `target_url=${resolved.targetUrl}`,
    "-f",
    `reason=${resolved.reason}`,
  ];

  if (options.dryRun) {
    console.log(`gh ${args.join(" ")}`);
    return;
  }

  const since = Date.now();
  runGh(args);

  console.log(
    `[remote] Started ${flow.name} (${flow.id}) on ${ref}: ${resolved.shards} shard(s), ${resolved.browser}.`,
  );

  if (!options.watch && !options.download) {
    console.log(
      `[remote] Follow it with: gh run list --workflow ${WORKFLOW_FILE}`,
    );
    return;
  }

  const run = findRun(since);

  if (!run) {
    console.log(
      `[remote] Run did not register in time. Check: gh run list --workflow ${WORKFLOW_FILE}`,
    );
    return;
  }

  console.log(`[remote] Run #${run.databaseId}: ${run.url}`);

  let watchStatus = 0;

  if (options.watch) {
    const result = runGh(
      ["run", "watch", String(run.databaseId), "--exit-status"],
      { allowFailure: true, inherit: true },
    );
    watchStatus = result.status ?? 0;
  }

  if (options.download) {
    const target = path.join(
      REPO_ROOT,
      ".artifacts",
      "remote",
      String(run.databaseId),
    );
    fs.mkdirSync(target, { recursive: true });
    runGh(["run", "download", String(run.databaseId), "-D", target], {
      allowFailure: true,
      inherit: true,
    });
    console.log(`[remote] Artifacts in ${path.relative(REPO_ROOT, target)}`);
  }

  if (watchStatus !== 0) {
    console.error("[remote] The remote run failed.");
    process.exit(watchStatus);
  }
}

try {
  main();
} catch (error) {
  console.error(`[remote] ${error.message}`);
  process.exit(1);
}
