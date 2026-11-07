// Starts the app server as a child process.
const { spawn } = require("child_process");

// Wait the given number of milliseconds.
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Whether the server at this address answers its health check.
async function isHealthy(baseUrl) {
  // Ask /api/health; no answer or an error counts as not healthy.
  try {
    const response = await fetch(new URL("/api/health", baseUrl));
    return response.ok;
  } catch {
    return false;
  }
}

// Ask every half second until the server is healthy or the time runs out.
async function waitForHealth(baseUrl, timeoutMs) {
  // When the wait began.
  const startedAt = Date.now();

  // Ask until the time is up; a healthy answer ends the wait.
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHealthy(baseUrl)) {
      return true;
    }

    // Not yet: wait half a second.
    await sleep(500);
  }

  // Time ran out.
  return false;
}

// Make sure the app runs locally, starting it when it does not. Returns a
// stop() for whoever started it.
async function ensureLocalServer(options = {}) {
  // The address, folder and time limit, with defaults.
  const baseUrl = options.baseUrl || "http://127.0.0.1:4173";
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs || 30000;

  // Already running: use it, and leave it running afterwards.
  if (await isHealthy(baseUrl)) {
    return {
      started: false,
      stop: async () => undefined,
    };
  }

  // Start the server on port 4173, with its output hidden.
  const child = spawn(process.execPath, ["server.js", "4173"], {
    cwd,
    stdio: "ignore",
  });

  // Wait for it to answer.
  const ready = await waitForHealth(baseUrl, timeoutMs);

  // No answer in time: stop it and fail.
  if (!ready) {
    child.kill("SIGTERM");
    throw new Error(`Timed out waiting for the local server at ${baseUrl}.`);
  }

  // Stops the server this call started.
  const stop = async () => {
    // Only while it still runs; then give it a moment to exit.
    if (!child.killed) {
      child.kill("SIGTERM");
      await sleep(300);
    }
  };

  // Started here, so the caller stops it when done.
  return {
    started: true,
    stop,
  };
}

// What the bug-report scripts use.
module.exports = {
  ensureLocalServer,
};
