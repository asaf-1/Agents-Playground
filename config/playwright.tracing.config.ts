import { defineConfig } from "@playwright/test";
// Builds the paths below from the repository root.
import path from "node:path";

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

// The repository root, one folder up from config/. Every path below starts
// here.
const ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: path.join(ROOT, "tests/tracing"),
  tsconfig: path.join(ROOT, "tsconfig.json"),
  outputDir: path.join(ROOT, ".artifacts/tracing-test-results"),
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
