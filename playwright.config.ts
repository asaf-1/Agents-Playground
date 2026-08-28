import { defineConfig } from "@playwright/test";

const port = 4173;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true" || !process.env.CI;
const slowMo = Number(process.env.PLAYWRIGHT_SLOW_MO || 0);
// Set by the remote test runner when a run targets an already-deployed URL.
// Without this the webServer block would still build and boot a local app on
// 4173 that the tests never talk to.
const externalTarget = process.env.PLAYWRIGHT_EXTERNAL_TARGET === "true";
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
  testDir: "./tests/e2e",
  tsconfig: "./tsconfig.json",
  outputDir: "./.artifacts/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: ".artifacts/playwright-report" }],
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
    trace: "off",
    screenshot: "off",
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
      use: { storageState: ".artifacts/auth/admin.json" },
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
        port,
        reuseExistingServer,
        timeout: 120000,
      },
});
