// Runs commands, reads files and builds paths.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// The repo's root folder.
const repoRoot = path.resolve(__dirname, "..");
// The tag for the local Docker build.
const dockerTag = "ai-agentic-project-prepush";
// Windows needs npm.cmd and docker.exe; other systems take the plain names.
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const dockerCommand = isWindows ? "docker.exe" : "docker";
// The pipeline settings, and whether they turn on the pre-merge Docker build.
const pipelinePolicy = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "pipeline.config.json"), "utf8"),
);
const dockerEnabled = pipelinePolicy.preMerge?.dockerEnabled === true;

// Run a command in the repo folder, and stop the push when it fails.
function runCommand(command, args, label) {
  // Say what runs, then run it (through cmd.exe on Windows).
  console.log(`[pre-push] ${label}`);
  const result = isWindows
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", command, ...args], {
        cwd: repoRoot,
        stdio: "inherit",
        shell: false,
      })
    : spawnSync(command, args, {
        cwd: repoRoot,
        stdio: "inherit",
        shell: false,
      });

  // It could not start at all: say why and stop.
  if (result.error) {
    console.error(
      `[pre-push] Failed to start ${command}: ${result.error.message}`,
    );
    process.exit(1);
  }

  // It failed: stop with its exit code.
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

// First, the full Playwright suite.
runCommand(
  npmCommand,
  ["run", "test:e2e"],
  "Running local Playwright suite...",
);

// The Docker build is skipped when it is turned off, or by PREPUSH_SKIP_DOCKER.
const skipDocker =
  !dockerEnabled ||
  process.env.PREPUSH_SKIP_DOCKER === "1" ||
  process.env.PREPUSH_SKIP_DOCKER === "true";
// Say why Docker was skipped, or run the build.
if (!dockerEnabled) {
  console.log(
    "[pre-push] pipeline.config.json disables the pre-merge Docker build; Playwright still ran.",
  );
} else if (skipDocker) {
  console.log(
    "[pre-push] PREPUSH_SKIP_DOCKER set - SKIPPING local Docker build (Playwright suite still ran).",
  );
} else {
  runCommand(
    dockerCommand,
    ["build", "-t", dockerTag, "."],
    "Running local Docker build...",
  );
}

// All passed: the push goes on.
console.log("[pre-push] Local validation passed. Push may continue.");
console.log(
  "[pre-push] Next: open or update the PR, complete Codex/Claude review for the current head, and merge only after both GitHub gates pass.",
);
