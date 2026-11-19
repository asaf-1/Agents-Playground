import { defineConfig, type ReporterDescription } from "@playwright/test";
// Builds the paths below from this file's own folder.
import path from "node:path";
// Frees port 4173 before a local run, so a server left running is never reused.
import { freePort, isLocalTestRun } from "./framework/helpers/freeLocalPort";

// The repository root, where this file lives. Every path below starts here, and
// the server starts here, so config/playwright.visual.config.ts can reuse this
// config from its own folder and still find the same tests, outputs and server.
const ROOT = __dirname;
const port = 4173;
// Tracing (`npm run test:traced`): with OTEL_EXPORTER_OTLP_ENDPOINT set, each
// test's steps also go to Jaeger, under the test's own trace (see
// framework/reporting/otelReporter.ts). Not set, as in CI and every normal
// run: no extra reporter, nothing changes.
const tracingReporter: ReporterDescription[] = (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || ""
).trim()
  ? [[path.join(ROOT, "framework/reporting/otelReporter.ts")]]
  : [];
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true" || !process.env.CI;
const slowMo = Number(process.env.PLAYWRIGHT_SLOW_MO || 0);
// Set by the remote test runner when a run targets an already-deployed URL.
// Without this the webServer block would still build and boot a local app on
// 4173 that the tests never talk to.
const externalTarget = process.env.PLAYWRIGHT_EXTERNAL_TARGET === "true";
// A server left on 4173 serves old code or other settings, and the run below
// would reuse it (277 failures on 2026-11-17). So a local run stops it first
// and starts a fresh one. Not on CI, not for --list, not in a worker, and not
// when the target is elsewhere (framework/helpers/freeLocalPort.ts).
if (!externalTarget && isLocalTestRun()) {
  freePort(port);
}
// Cross-browser selection for the remote test runner. Playwright refuses the
// --browser CLI flag once a config defines projects, so the browser arrives as
// an env var instead. The installed Chrome channel only applies to chromium.
const browserName = (["chromium", "firefox", "webkit"] as const).includes(
  process.env.PLAYWRIGHT_BROWSER as "chromium" | "firefox" | "webkit",
)
  ? (process.env.PLAYWRIGHT_BROWSER as "chromium" | "firefox" | "webkit")
  : "chromium";
const channel =
  browserName === "chromium" && process.platform === "win32"
    ? "chrome"
    : undefined;

export default defineConfig({
  testDir: path.join(ROOT, "tests/e2e"),
  tsconfig: path.join(ROOT, "tsconfig.json"),
  outputDir: path.join(ROOT, ".artifacts/test-results"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A failed test runs again: twice on GitHub, once on the PC. Only that
  // second run is recorded (trace below), so a green run records nothing and
  // costs no time. Recording every test was measured on 2026-11-19: 95-106 s
  // instead of 44-46 s, and long tests ran out of time.
  retries: process.env.CI ? 2 : 1,
  // On the PC, a test that fails and then passes on its second run still fails
  // the run, so the retry that makes the recording can never hide a problem.
  // GitHub keeps its retries for the runner's own hiccups, as before.
  failOnFlakyTests: !process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: path.join(ROOT, ".artifacts/playwright-report"),
      },
    ],
    // Every test of the run in one file: its status, retries, the error with
    // its line, and what it printed (the [RESULT] block too). Replaced on each
    // run. CI passes --reporter=blob, which replaces this list, so CI is
    // unchanged.
    ["json", { outputFile: path.join(ROOT, ".artifacts/results.json") }],
    ...tracingReporter,
  ],
  use: {
    baseURL,
    browserName,
    viewport: { width: 1440, height: 900 },
    channel,
    launchOptions: {
      args: ["--start-maximized"],
      slowMo,
    },
    // A failed test keeps a recording (the second run, step by step: each
    // click, a picture of the page, what the server answered) and a
    // screenshot of the moment it failed, in .artifacts/test-results, which
    // each run wipes first. Open one with: npx playwright show-trace <trace.zip>.
    // The two canaries run each test once (--retries=0), so they pass
    // --trace=retain-on-failure themselves. No video.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    // Mints a real Admin session and saves storageState.
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    // Auth/RBAC specs run logged-in via the saved storageState.
    {
      name: "authenticated",
      testMatch: /(auth-session|rbac)\.spec\.ts$/,
      dependencies: ["setup"],
      use: { storageState: path.join(ROOT, ".artifacts/auth/admin.json") },
    },
    // Everything else runs storageState-free (preserves the existing no-auth suite).
    {
      name: "default",
      testIgnore: [/auth\.setup\.ts$/, /(auth-session|rbac)\.spec\.ts$/],
    },
  ],
  webServer: externalTarget
    ? undefined
    : {
        command: `npm run build && node server.js ${port}`,
        // Started from the root, as it always was, even when a config in
        // another folder reuses this one.
        cwd: ROOT,
        port,
        reuseExistingServer,
        timeout: 120000,
        // The hold on failed bank log-ins lasts 15 minutes by default. The
        // suite's server holds for 4 seconds instead, so one spec can watch a
        // hold start and then release itself. The limit on attempts stays at
        // its default; only the wait is shortened.
        env: {
          ...process.env,
          BANK_LOGIN_HOLD_SECONDS: process.env.BANK_LOGIN_HOLD_SECONDS ?? "4",
        },
      },
});
