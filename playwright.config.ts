import { defineConfig } from "@playwright/test";

const port = 4173;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true" || !process.env.CI;
const slowMo = Number(process.env.PLAYWRIGHT_SLOW_MO || 0);
const channel = process.platform === "win32" ? "chrome" : undefined;

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
  webServer: {
    command: `npm run build && node server.js ${port}`,
    port,
    reuseExistingServer,
    timeout: 120000,
  },
});
