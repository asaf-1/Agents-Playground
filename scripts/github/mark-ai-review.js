const { spawnSync } = require("node:child_process");

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

function parseArgs(argv) {
  const options = { dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (["--pr", "--reviewer", "--head-sha"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${argument}`);
      }

      options[argument.slice(2).replace("-", "")] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function runGh(args, { allowFailure = false } = {}) {
  const command = process.platform === "win32" ? "gh.exe" : "gh";
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw new Error(`Failed to start GitHub CLI: ${result.error.message}`);
  }

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      result.stderr.trim() || `GitHub CLI exited with status ${result.status}`,
    );
  }

  return result.stdout.trim();
}

function buildAttestation(headSha, reviewer) {
  return [
    "<!-- ai-review-gate -->",
    `AI-REVIEWED-SHA: ${headSha}`,
    `AI-REVIEWER: ${reviewer}`,
    "",
    `Current-head review attested after ${reviewer} review and human resolution of actionable findings.`,
  ].join("\n");
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

  const reviewer = options.reviewer?.toLowerCase();
  if (!options.pr || !["codex", "claude"].includes(reviewer)) {
    console.error("--pr and --reviewer <codex|claude> are required.");
    printHelp();
    process.exit(1);
  }

  if (options.dryRun && options.headsha) {
    if (!/^[0-9a-f]{40}$/i.test(options.headsha)) {
      throw new Error("--head-sha must be a full 40-character commit SHA.");
    }

    console.log(buildAttestation(options.headsha, reviewer));
    return;
  }

  const pullRequest = JSON.parse(
    runGh([
      "pr",
      "view",
      options.pr,
      "--json",
      "number,headRefOid,baseRefName,url",
    ]),
  );

  if (pullRequest.baseRefName !== "main") {
    throw new Error(
      `PR #${pullRequest.number} targets ${pullRequest.baseRefName}, not main.`,
    );
  }

  if (options.headsha && options.headsha !== pullRequest.headRefOid) {
    throw new Error(
      `Expected ${options.headsha}, but PR #${pullRequest.number} is at ${pullRequest.headRefOid}.`,
    );
  }

  const body = buildAttestation(pullRequest.headRefOid, reviewer);
  if (options.dryRun) {
    console.log(body);
    return;
  }

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

  console.log(
    `Marked PR #${pullRequest.number} as reviewed by ${reviewer} at ${pullRequest.headRefOid}.`,
  );
  console.log(pullRequest.url);
}

try {
  main();
} catch (error) {
  console.error(`[review:ai:mark] ${error.message}`);
  process.exit(1);
}
