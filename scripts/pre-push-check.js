const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const dockerTag = "ai-agentic-project-prepush";
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const dockerCommand = isWindows ? "docker.exe" : "docker";
const pipelinePolicy = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "pipeline.config.json"), "utf8"),
);
const dockerEnabled = pipelinePolicy.preMerge?.dockerEnabled === true;

function runCommand(command, args, label) {
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

  if (result.error) {
    console.error(
      `[pre-push] Failed to start ${command}: ${result.error.message}`,
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

runCommand(
  npmCommand,
  ["run", "test:e2e"],
  "Running local Playwright suite...",
);

const skipDocker =
  !dockerEnabled ||
  process.env.PREPUSH_SKIP_DOCKER === "1" ||
  process.env.PREPUSH_SKIP_DOCKER === "true";
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

console.log("[pre-push] Local validation passed. Push may continue.");
console.log(
  "[pre-push] Next: open or update the PR, complete Codex/Claude review for the current head, and merge only after both GitHub gates pass.",
);
