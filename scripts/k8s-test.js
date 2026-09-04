#!/usr/bin/env node

"use strict";

// Runs the canary suites against the kind cluster, and only against the kind
// cluster. Two things make a wrapper necessary rather than a plain npm script.
//
// 1. playwright.config.ts declares its webServer with `port`, so Playwright's
//    "is something already there?" check is a bare TCP connect - it never asks
//    what is answering. Left alone, `playwright test` will happily build and
//    boot a host server and produce a fully green run in which Kubernetes was
//    never involved. PLAYWRIGHT_EXTERNAL_TARGET drops the webServer block
//    entirely (playwright.config.ts:66), so the run can only reach the cluster
//    and fails loudly when the cluster is not there.
//
// 2. npm runs scripts through cmd.exe on Windows, where `VAR=value command` is
//    not valid syntax, and this repo has no cross-env dependency. Setting the
//    variables on process.env here works identically on every platform.

const { spawnSync } = require("node:child_process");

// The host port kind publishes the NodePort on - see kind/kind-config.yaml. Not
// 4173: that port belongs to the ordinary dev server and test suites.
const PORT = process.env.K8S_CANARY_PORT || "4273";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DEPLOYMENT = "deployment/agents-playground";
const SUITES = ["test:sanity", "test:contract"];

// Commands are passed as one string with shell: true, not as an argv array.
// Two Node behaviours force this shape. npm is npm.cmd on Windows, and since
// the CVE-2024-27980 fix Node refuses to spawn a .cmd without a shell, failing
// with EINVAL rather than running. But supplying an args array *alongside*
// shell: true raises DEP0190. A single command string satisfies both. Every
// command here is built from constants in this file, so there is nothing
// interpolated that could need escaping.
function run(command, env) {
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env: env || process.env,
  });

  // A spawn that never starts leaves status null. Reporting it explicitly
  // matters: the alternative is an exit code with no output, which looks
  // exactly like a test failure and sends the reader to the wrong place.
  if (result.error) {
    console.error(`\nFailed to run: ${command}\n${result.error.message}\n`);
    process.exit(1);
  }

  return result;
}

// Preflight. Without it, a missing or unready deployment reaches the developer
// as a wall of Playwright connection errors rather than one line naming the
// actual problem.
const ready = run(
  `kubectl wait --for=condition=available ${DEPLOYMENT} --timeout=60s`,
);

if (ready.status !== 0) {
  console.error(
    `\n${DEPLOYMENT} is not available.\n` +
      `Start the cluster first:\n` +
      `  npm run k8s:up\n` +
      `  npm run k8s:deploy\n`,
  );
  process.exit(1);
}

const env = {
  ...process.env,
  PLAYWRIGHT_EXTERNAL_TARGET: "true",
  PLAYWRIGHT_BASE_URL: BASE_URL,
};

for (const suite of SUITES) {
  console.log(`\n> ${suite} against ${BASE_URL} (kind cluster)\n`);

  // --retries=0 mirrors post-merge-canary.yml, for the reason
  // docs/pre-merge-review-and-canary.md records: an intermittent failure must be
  // reported, not silently retried. playwright.config.ts sets retries to 2
  // whenever CI is set, so without this flag a pod failing one request in three
  // passes on a later attempt and the canary reports green - the precise fault a
  // canary exists to catch. It only bites on a runner, which is exactly where it
  // would never be noticed.
  const result = run(`npm run ${suite} -- --retries=0`, env);

  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}
