const { spawn } = require("child_process");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isHealthy(baseUrl) {
  try {
    const response = await fetch(new URL("/api/health", baseUrl));
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(baseUrl, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isHealthy(baseUrl)) {
      return true;
    }

    await sleep(500);
  }

  return false;
}

async function ensureLocalServer(options = {}) {
  const baseUrl = options.baseUrl || "http://127.0.0.1:4173";
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs || 30000;

  if (await isHealthy(baseUrl)) {
    return {
      started: false,
      stop: async () => undefined,
    };
  }

  const child = spawn(process.execPath, ["server.js", "4173"], {
    cwd,
    stdio: "ignore",
  });

  const ready = await waitForHealth(baseUrl, timeoutMs);

  if (!ready) {
    child.kill("SIGTERM");
    throw new Error(`Timed out waiting for the local server at ${baseUrl}.`);
  }

  const stop = async () => {
    if (!child.killed) {
      child.kill("SIGTERM");
      await sleep(300);
    }
  };

  return {
    started: true,
    stop,
  };
}

module.exports = {
  ensureLocalServer,
};
