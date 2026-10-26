import { defineConfig } from "@playwright/test";

// The test runner's own browser tests: `npm run test:runner`.
//
// A separate config, not a folder inside tests/e2e, because the thing under
// test is a different server. The main suite boots server.js (the site); this
// one boots test-runner/server.js with GitHub replaced by the stub in
// test-runner/src/github-stub.js, so a test can press Run as often as it
// likes without a single real pipeline run. Nothing here touches the network.
//
// Kept out of the pre-merge gate on purpose: it runs on a laptop, with
// `npm run test:runner`. Running it in CI is a separate decision, and goes the
// way every new job here goes: workflow_dispatch first, timed on a runner,
// and only then a question about the every-PR path.

const port = 4301;
const baseURL = `http://127.0.0.1:${port}`;
// The main config runs the installed Chrome on Windows; so does this one.
const channel = process.platform === "win32" ? "chrome" : undefined;

export default defineConfig({
  testDir: "./tests/runner",
  tsconfig: "./tsconfig.json",
  outputDir: "./.artifacts/runner-test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: ".artifacts/runner-report" }],
  ],
  // A stub run takes five seconds end to end; an assertion that waits for its
  // verdict needs more than the default five.
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    channel,
    viewport: { width: 1440, height: 900 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    // Signs in once per role and saves the cookies for the specs.
    { name: "setup", testMatch: /runner\.setup\.ts$/ },
    {
      name: "runner",
      testIgnore: [/runner\.setup\.ts$/],
      dependencies: ["setup"],
      use: { storageState: ".artifacts/runner-auth/admin.json" },
    },
  ],
  webServer: {
    command: "node test-runner/server.js",
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      ...process.env,
      // The stub, a second and a half per step: a run shows as running for a
      // few seconds, long enough to watch and to cancel, short enough to wait
      // for. The dispatch itself takes a second and a half to find its run.
      TR_GITHUB_STUB: "1",
      TR_STUB_STEP_MS: "1500",
      TR_GITHUB_TOKEN: "",
      TR_REPO: "asaf-1/Agents-Playground",
      TR_PORT: String(port),
      TR_HOST: "127.0.0.1",
      // Accounts are created by the setup project: the first one is the
      // administrator, as on any fresh runner.
      TR_SIGNUP_MODE: "open",
      TR_USERS_FILE: ".artifacts/runner-auth/users.json",
    },
  },
});
