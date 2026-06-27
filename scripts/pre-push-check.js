const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const dockerTag = "ai-agentic-project-prepush";

function runCommand(command, args, label) {
  console.log(`[pre-push] ${label}`);
  const isWindows = process.platform === "win32";
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

runCommand("npm.cmd", ["run", "test:e2e"], "Running local Playwright suite...");

const skipDocker =
  process.env.PREPUSH_SKIP_DOCKER === "1" ||
  process.env.PREPUSH_SKIP_DOCKER === "true";
if (skipDocker) {
  console.log(
    "[pre-push] PREPUSH_SKIP_DOCKER set - SKIPPING local Docker build (Playwright suite still ran).",
  );
} else {
  runCommand(
    "docker.exe",
    ["build", "-t", dockerTag, "."],
    "Running local Docker build...",
  );
}

console.log("[pre-push] Local validation passed. Push may continue.");
console.log(
  "[pre-push] Reminder: confirm the advisory pre-push PR review is complete before this push reaches main. The post-merge canary runs after the push.",
);
