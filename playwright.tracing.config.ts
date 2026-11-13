import { defineConfig } from "@playwright/test";

// The tracing spec: `npm run test:tracing`.
//
// A separate config, outside tests/e2e, so the normal suite and CI never run
// it (2026-11-13). Tracing is a tool for the PC, off in CI and on Render, and
// the normal suite already proves "off changes nothing" on every pull request.
//
// The spec starts its own server.js with tracing on, on a free port, and points
// it at a pretend trace viewer inside the test
// (framework/helpers/otlpReceiver.ts). No Docker, no Jaeger, no browser: every
// test is an API call or a plain function check.

export default defineConfig({
  testDir: "./tests/tracing",
  tsconfig: "./tsconfig.json",
  outputDir: "./.artifacts/tracing-test-results",
  // One worker: every test shares the one traced server the spec starts.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
