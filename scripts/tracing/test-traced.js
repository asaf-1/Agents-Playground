// Runs Playwright tests with tracing on: `npm run test:traced -- <spec or
// flags>`, the same arguments as `npx playwright test`. Each test then sends its
// own trace id with every request (framework/fixtures/resultBlock.ts), its
// steps go to Jaeger (framework/reporting/otelReporter.ts), and the site the
// suite starts runs with tracing on too, so the bank's spans join each test's
// trace. Every [RESULT] block prints the link to its test's trace.
//
// Start Jaeger first with `npm run trace:up`. Run any other way, the tests run
// with tracing off, as in CI.

// Node's process, network and path tools.
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

// The repository root, Jaeger's viewer, and the port the suite's site uses.
const ROOT = path.resolve(__dirname, "..", "..");
const JAEGER = "http://127.0.0.1:16686";
const SITE_PORT = 4173;

// Whether something already listens on the port.
function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function main() {
  // Jaeger must be up, or every span would go nowhere.
  const jaegerUp = await fetch(`${JAEGER}/api/v3/services`)
    .then((answer) => answer.ok)
    .catch(() => false);
  if (!jaegerUp) {
    console.error(
      `[tracing] Jaeger is not answering on ${JAEGER}. Start Docker Desktop, then npm run trace:up`,
    );
    process.exit(1);
  }

  // Port 4173 must be free: Playwright would reuse a site already running
  // there, and that one may have tracing off (or serve old code).
  if (await portBusy(SITE_PORT)) {
    console.error(
      `[tracing] Port ${SITE_PORT} is in use. Stop that server first; this run starts its own, with tracing on.`,
    );
    process.exit(1);
  }

  // Tracing on: Jaeger's way in, the bank's service name, and spans sent every
  // 200 ms so the last test's are out before the suite stops its site.
  const env = {
    ...process.env,
    OTEL_EXPORTER_OTLP_ENDPOINT:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://127.0.0.1:4318",
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || "playground-bank",
    OTEL_BSP_SCHEDULE_DELAY: process.env.OTEL_BSP_SCHEDULE_DELAY || "200",
  };

  // Playwright's own command line, with the caller's arguments, no shell.
  console.log(
    `[tracing] Tracing on. Each test's [RESULT] block links to its trace in Jaeger (${JAEGER}).`,
  );
  const cli = path.join(ROOT, "node_modules", "@playwright", "test", "cli.js");
  const child = spawn(
    process.execPath,
    [cli, "test", ...process.argv.slice(2)],
    {
      cwd: ROOT,
      env,
      stdio: "inherit",
    },
  );
  child.on("exit", (code) => process.exit(code ?? 1));
}

main();
