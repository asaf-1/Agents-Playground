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

// Files, paths, and running programs.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// The repo's root folder, the flow lookup, and the option rules.
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

// The options that take a value.
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

// Shows how to run this script.
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

// Reads the command-line options.
function parseArgs(argv) {
  // The options found so far.
  const options = {};

  // Go through each word.
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    // The on-or-off options, kept under their camelCase names.
    if (["--watch", "--download", "--list", "--dry-run"].includes(argument)) {
      const key = argument
        .slice(2)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = true;
      continue;
    }

    // --help: show how to run it.
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    // An option that takes the next word as its value.
    if (VALUE_FLAGS.includes(argument)) {
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

// Run gh in the repo and return its exit status and output; a failure throws,
// unless allowed.
function runGh(args, { allowFailure = false, inherit = false } = {}) {
  // gh.exe on Windows, gh elsewhere, run without a shell; its output shown or
  // captured.
  const command = process.platform === "win32" ? "gh.exe" : "gh";
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    stdio: inherit ? "inherit" : "pipe",
  });

  // It could not start: say how to install and sign in to it.
  if (result.error) {
    throw new Error(
      `Failed to start the GitHub CLI (${command}). Install it from https://cli.github.com and run "gh auth login". Original error: ${result.error.message}`,
    );
  }

  // It failed: fail with what it printed.
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      (result.stderr || "").trim() ||
        `GitHub CLI exited with status ${result.status}`,
    );
  }

  // The exit status and the output.
  return { status: result.status, stdout: (result.stdout || "").trim() };
}

// The ref a run executes against. The local branch is only a good default when
// it still exists on the remote: dispatching a ref GitHub does not have fails
// with a 422 that reads like a permissions problem rather than a stale branch.
// That happens routinely - a merged PR whose branch was deleted leaves the local
// checkout pointing at a ref that is gone - so verify before using it.
function currentBranch() {
  // The branch checked out here.
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });

  // Its name.
  const branch = (result.stdout || "").trim();

  // No branch (a detached checkout): main.
  if (!branch || branch === "HEAD") return "main";

  // Whether origin still has it.
  const onRemote = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", branch],
    { cwd: REPO_ROOT, encoding: "utf8", shell: false },
  );

  // It does: use it.
  if (onRemote.status === 0) return branch;

  // It does not: warn, and use main.
  console.warn(
    `[remote] branch "${branch}" does not exist on origin (deleted after a merge?). Dispatching against main instead; pass --ref to choose another.`,
  );

  // Main.
  return "main";
}

// main() is synchronous, so this blocks the thread rather than awaiting.
function sleepSync(ms) {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

// Print every flow: id, test count, kind and name, in lined-up columns.
function listFlows(catalog) {
  // The longest id, for the column width.
  const widest = Math.max(...catalog.flows.map((flow) => flow.id.length));

  // One line per flow.
  for (const flow of catalog.flows) {
    const count = flow.testCount === null ? "?" : flow.testCount;
    console.log(
      `${flow.id.padEnd(widest)}  ${String(count).padStart(4)} tests  ${flow.kind.padEnd(6)} ${flow.name}`,
    );
  }

  // Then the count, and how to run one.
  console.log(
    `\n${catalog.totals.flows} flows. Run one with: npm run test:remote -- --flow <id>`,
  );
}

// Finds the run this invocation started. workflow_dispatch gives back no id, so
// the newest run created at or after the dispatch is the best available match.
function findRun(since) {
  // Up to eight tries, two seconds apart.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // The workflow's ten newest runs.
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

    // The first one made since the dispatch (allowing ten seconds of clock
    // difference).
    if (result.status === 0 && result.stdout) {
      const runs = JSON.parse(result.stdout);
      const match = runs.find(
        (run) => new Date(run.createdAt).getTime() >= since - 10000,
      );

      // Found it.
      if (match) return match;
    }

    // The run takes a moment to register after the dispatch is accepted.
    sleepSync(2000);
  }

  // It did not show up in time.
  return null;
}

// Start a run of one flow on GitHub, and optionally follow it and fetch its
// files.
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

  // The flow catalog.
  const catalog = requireCatalog();

  // --list: print the flows and stop.
  if (options.list) {
    listFlows(catalog);
    return;
  }

  // No flow: say how to find one, and stop.
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

  // Which branch to run on, and the gh command that starts the workflow.
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

  // --dry-run: print the command and stop.
  if (options.dryRun) {
    console.log(`gh ${args.join(" ")}`);
    return;
  }

  // Start the run, noting the time first.
  const since = Date.now();
  runGh(args);

  // Say what started.
  console.log(
    `[remote] Started ${flow.name} (${flow.id}) on ${ref}: ${resolved.shards} shard(s), ${resolved.browser}.`,
  );

  // Neither --watch nor --download: say how to follow it, and stop.
  if (!options.watch && !options.download) {
    console.log(
      `[remote] Follow it with: gh run list --workflow ${WORKFLOW_FILE}`,
    );
    return;
  }

  // Find the run that was started.
  const run = findRun(since);

  // Not found in time: say where to look.
  if (!run) {
    console.log(
      `[remote] Run did not register in time. Check: gh run list --workflow ${WORKFLOW_FILE}`,
    );
    return;
  }

  // Its number and address.
  console.log(`[remote] Run #${run.databaseId}: ${run.url}`);

  // The run's result; a pass unless --watch says otherwise.
  let watchStatus = 0;

  // --watch: follow it until it ends, and keep its result.
  if (options.watch) {
    const result = runGh(
      ["run", "watch", String(run.databaseId), "--exit-status"],
      { allowFailure: true, inherit: true },
    );
    watchStatus = result.status ?? 0;
  }

  // --download: fetch its files into .artifacts/remote/<run id>.
  if (options.download) {
    // The folder, made first.
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

  // A failed run fails this script too.
  if (watchStatus !== 0) {
    console.error("[remote] The remote run failed.");
    process.exit(watchStatus);
  }
}

// Run it; an error prints its message and fails.
try {
  main();
} catch (error) {
  console.error(`[remote] ${error.message}`);
  process.exit(1);
}
