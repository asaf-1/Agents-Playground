// Node's child processes, a socket (to find a free port), the server's address
// type, waiting for an event, and paths.
import { spawn } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { once } from "node:events";
import path from "node:path";
// Adds a line to the running test's [RESULT] block.
import { fact } from "../fixtures/resultBlock";

// A short-lived Playground Bank server with its own settings, for a test that
// needs a setting the suite's server (port 4173) doesn't have: the trusted
// proxy, the sign-up limit, a small hashing gate (feedback-fixes plan, Part 2).
// It always runs on PGlite in memory: DATABASE_URL is removed, so Neon is never
// touched. The test stops it when done.

// The repository, where server.js is.
const ROOT = path.resolve(__dirname, "..", "..");

// How long the server may take to start (PGlite, the migrations, the demo data).
const START_TIMEOUT_MS = 60_000;

// A port the system says is free. Never a fixed one: Node's fetch refuses some
// ports outright (4190 among them, found 2026-11-16), and a fixed port could be
// taken by another test.
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

// Starts server.js with these settings and waits until the bank answers.
export async function startBankServer(
  settings: Record<string, string>,
): Promise<{ baseURL: string; stop: () => Promise<void> }> {
  const port = await freePort();
  const baseURL = `http://127.0.0.1:${port}`;
  // The test process's settings, minus the database and tracing, plus these.
  const env: NodeJS.ProcessEnv = { ...process.env, HOST: "127.0.0.1" };
  delete env.DATABASE_URL;
  delete env.OTEL_EXPORTER_OTLP_ENDPOINT;
  Object.assign(env, settings);
  // The block shows which server the test talks to, and how it was set.
  fact("own server", `${baseURL} ${JSON.stringify(settings)}`);

  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Its output, kept for the error if it never starts.
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  // Stops it and waits for it to be gone.
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await once(child, "exit");
  };

  // Ask the bank until it answers, or give up with what it printed.
  const deadline = Date.now() + START_TIMEOUT_MS;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`the bank server exited while starting:\n${output}`);
    }
    try {
      const response = await fetch(`${baseURL}/api/bank/status`);
      if (response.ok) return { baseURL, stop };
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(
        `the bank server did not start in ${START_TIMEOUT_MS / 1000} s:\n${output.slice(-800)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
