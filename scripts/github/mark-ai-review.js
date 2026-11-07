// Runs the GitHub CLI.
const { spawnSync } = require("node:child_process");

// Shows how to run this script.
function printHelp() {
  console.log(`Usage:
  npm.cmd run review:ai:mark -- --pr <number> --reviewer <codex|claude>

Options:
  --pr <number>         Pull request number.
  --reviewer <name>     codex or claude.
  --head-sha <sha>      Expected PR head SHA. Required only for offline dry runs.
  --dry-run             Print the attestation without changing GitHub.
  --help                Show this help.

Run this only after the named AI reviewer has reviewed the current PR head and
actionable findings have been resolved or explicitly accepted.`);
}

// Reads the command-line options.
function parseArgs(argv) {
  // Changes GitHub unless --dry-run says otherwise.
  const options = { dryRun: false };

  // Go through each word.
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    // --dry-run: print the comment instead of posting it.
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    // --help: show how to run it.
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    // --pr, --reviewer and --head-sha each take the next word as their value; a
    // missing one is an error.
    if (["--pr", "--reviewer", "--head-sha"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${argument}`);
      }

      // Keep it (head-sha as headsha), and skip past it.
      options[argument.slice(2).replace("-", "")] = value;
      index += 1;
      continue;
    }

    // Anything else is an error.
    throw new Error(`Unknown argument: ${argument}`);
  }

  // The options.
  return options;
}

// Run gh with these words and return what it prints; a failure throws, unless
// allowed.
function runGh(args, { allowFailure = false } = {}) {
  // gh.exe on Windows, gh elsewhere, run without a shell.
  const command = process.platform === "win32" ? "gh.exe" : "gh";
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  // It could not start: fail with the reason.
  if (result.error) {
    throw new Error(`Failed to start GitHub CLI: ${result.error.message}`);
  }

  // It failed: fail with what it printed.
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      result.stderr.trim() || `GitHub CLI exited with status ${result.status}`,
    );
  }

  // What it printed.
  return result.stdout.trim();
}

// The PR comment the AI Review Gate reads: the reviewed head SHA and who
// reviewed it.
function buildAttestation(headSha, reviewer) {
  return [
    "<!-- ai-review-gate -->",
    `AI-REVIEWED-SHA: ${headSha}`,
    `AI-REVIEWER: ${reviewer}`,
    "",
    `Current-head review attested after ${reviewer} review and human resolution of actionable findings.`,
  ].join("\n");
}

// Post the review comment and the ai-reviewed label on a PR.
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

  // The reviewer's name in lower case.
  const reviewer = options.reviewer?.toLowerCase();
  // Both a PR and a known reviewer are needed.
  if (!options.pr || !["codex", "claude"].includes(reviewer)) {
    console.error("--pr and --reviewer <codex|claude> are required.");
    printHelp();
    process.exit(1);
  }

  // An offline dry run with a given SHA: check it is a full SHA, print the
  // comment, and stop.
  if (options.dryRun && options.headsha) {
    if (!/^[0-9a-f]{40}$/i.test(options.headsha)) {
      throw new Error("--head-sha must be a full 40-character commit SHA.");
    }

    // Print it.
    console.log(buildAttestation(options.headsha, reviewer));
    return;
  }

  // The PR's number, head SHA, base branch and address.
  const pullRequest = JSON.parse(
    runGh([
      "pr",
      "view",
      options.pr,
      "--json",
      "number,headRefOid,baseRefName,url",
    ]),
  );

  // Only PRs into main.
  if (pullRequest.baseRefName !== "main") {
    throw new Error(
      `PR #${pullRequest.number} targets ${pullRequest.baseRefName}, not main.`,
    );
  }

  // A given SHA must be the PR's current head.
  if (options.headsha && options.headsha !== pullRequest.headRefOid) {
    throw new Error(
      `Expected ${options.headsha}, but PR #${pullRequest.number} is at ${pullRequest.headRefOid}.`,
    );
  }

  // The comment for the PR's current head.
  const body = buildAttestation(pullRequest.headRefOid, reviewer);
  // --dry-run: print it and stop.
  if (options.dryRun) {
    console.log(body);
    return;
  }

  // Make sure the label exists, post the comment, and put the label back on so
  // the gate runs again.
  runGh([
    "label",
    "create",
    "ai-reviewed",
    "--color",
    "0E8A16",
    "--description",
    "Current PR head has Codex or Claude review evidence",
    "--force",
  ]);
  runGh(["pr", "comment", options.pr, "--body", body]);
  runGh(["pr", "edit", options.pr, "--remove-label", "ai-reviewed"], {
    allowFailure: true,
  });
  runGh(["pr", "edit", options.pr, "--add-label", "ai-reviewed"]);

  // Say what it did, with the PR's address.
  console.log(
    `Marked PR #${pullRequest.number} as reviewed by ${reviewer} at ${pullRequest.headRefOid}.`,
  );
  console.log(pullRequest.url);
}

// Run it; an error prints its message and fails.
try {
  main();
} catch (error) {
  console.error(`[review:ai:mark] ${error.message}`);
  process.exit(1);
}
