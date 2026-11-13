import { defineConfig } from "@playwright/test";
import path from "node:path";

// The bug hunt with no AI: `npm run bug-hunt`. Runs only when asked: no
// workflow, no hook and no other command starts it, and it lives outside
// tests/e2e, so the normal suite never runs it.
//
// Three projects, in order. "logic" checks the hunt's own rules (pure
// functions, milliseconds) and probes the watcher with failures made on
// purpose in a real page. "walk" sends five walkers through Playground Bank
// side by side: a fresh customer with practice mode off, another with it on
// for their own session only, the demo Admin and Support looking only, and a
// signed-out visitor. "score" runs once every walk is done: only then does it
// read the planted-fault list, and it writes the report.
//
// Everything a run writes goes to one folder, .artifacts/bug-hunt/<time>/
// (gitignored): one JSON file per walk, the screenshots, findings.json and
// report.md. The folder is set here, in BUG_HUNT_DIR, so the test workers,
// which load this file too, all write to the same one.

const port = 4173;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
process.env.BUG_HUNT_DIR ||= path.resolve(".artifacts", "bug-hunt", stamp);
// The installed Chrome on Windows, as the main config.
const channel = process.platform === "win32" ? "chrome" : undefined;

export default defineConfig({
  testDir: "./tests/bug-hunt",
  tsconfig: "./tsconfig.json",
  outputDir: "./.artifacts/bug-hunt-results",
  fullyParallel: true,
  // One worker per walk.
  workers: 5,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // A walk opens up to 60 pages and presses buttons on many of them.
  timeout: 10 * 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel,
    viewport: { width: 1440, height: 900 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    // The rules, and the probe that proves the watcher sees a real failure.
    { name: "logic", testMatch: /hunt-(logic|probe)\.spec\.ts$/ },
    { name: "walk", testMatch: /walk\.spec\.ts$/, dependencies: ["logic"] },
    { name: "score", testMatch: /score\.spec\.ts$/, dependencies: ["walk"] },
  ],
  // The local site: the one already running on 4173, or a fresh one that is
  // stopped at the end (Playwright stops only a server it started). Never the
  // live site on Render.
  webServer: {
    command: `npm run build && node server.js ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
