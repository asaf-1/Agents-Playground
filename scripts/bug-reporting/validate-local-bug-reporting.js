#!/usr/bin/env node
// Lets require() load the TypeScript agents below.
require("./register-ts-runtime");

// Checks, files, paths, the local server starter, and the bug-reporting agent
// with its local store.
const assert = require("assert");
const fs = require("fs/promises");
const path = require("path");
const { ensureLocalServer } = require("./ensure-local-server");
const {
  BugReportingAgent,
} = require("../../framework/agents/reporting/BugReportingAgent");
const {
  LocalBugStoreAdapter,
} = require("../../framework/agents/reporting/LocalBugStoreAdapter");

// Copy the scenario reports the check needs into a temp folder, and add one
// made-up report the site cannot reproduce.
async function ensureScenarioArtifacts(tempScenarioRoot) {
  // The four real scenarios.
  const requiredScenarios = [
    "api-error-diagnosis",
    "dynamic-content-validation",
    "flaky-network-recovery",
    "ui-change-healing",
  ];

  // Copy each one's report.json from .artifacts/scenarios/.
  for (const scenario of requiredScenarios) {
    const sourcePath = path.join(
      process.cwd(),
      ".artifacts",
      "scenarios",
      scenario,
      "report.json",
    );
    const targetDir = path.join(tempScenarioRoot, scenario);

    // Into a folder of its own.
    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDir, "report.json"));
  }

  // A made-up report of a defect the site does not have: confirming it must
  // fail, so no bug is filed.
  const syntheticDir = path.join(
    tempScenarioRoot,
    "synthetic-non-reproducible-valid-product-summary",
  );
  await fs.mkdir(syntheticDir, { recursive: true });
  await fs.writeFile(
    path.join(syntheticDir, "report.json"),
    `${JSON.stringify(
      {
        scenario: "synthetic-non-reproducible-valid-product-summary",
        initialFailure:
          "Synthetic missing summary text detection from an unstable external report.",
        evidence: {},
        agentDecision:
          "Synthetic validation artifact used to prove confirmation prevents false reports.",
        finalStatus: "failed",
        suggestedPermanentFix:
          "Do not create a bug when the website does not reproduce the defect.",
        engine: "deterministic",
      },
      null,
      2,
    )}\n`,
  );
}

// Run the bug-reporting agent on those reports and check every outcome.
async function main() {
  // A fresh folder for this run's reports, confirmations and bug records.
  const timestamp = `${Date.now()}`;
  const tempRoot = path.join(
    process.cwd(),
    ".artifacts",
    "test-results",
    `bug-reporting-validation-${timestamp}`,
  );
  const scenarioArtifactsRoot = path.join(tempRoot, "scenario-artifacts");
  const confirmationArtifactsRoot = path.join(tempRoot, "bug-report-artifacts");
  const reportRoot = path.join(tempRoot, "bug-report-records");

  // Copy the reports in.
  await ensureScenarioArtifacts(scenarioArtifactsRoot);

  // Start the app locally when it is not running.
  const server = await ensureLocalServer({
    baseUrl: "http://127.0.0.1:4173",
    cwd: process.cwd(),
  });

  // The server is stopped at the end, even after a failed check.
  try {
    // The agent, filing bugs in the local store only; each defect is tried
    // three times.
    const agent = new BugReportingAgent({
      confirmationArtifactsRoot,
      rerunCount: 3,
      scenarioArtifactsRoot,
      trackerAdapter: new LocalBugStoreAdapter({
        rootDir: reportRoot,
      }),
    });

    // A real API defect: a new bug.
    const apiResult = await agent.reportScenario("api-error-diagnosis");
    assert.equal(apiResult.outcome, "created");
    assert.ok(apiResult.bugId);

    // The same defect again: the same bug, updated.
    const duplicateApiResult = await agent.reportScenario(
      "api-error-diagnosis",
    );
    assert.equal(duplicateApiResult.outcome, "updated");
    assert.equal(duplicateApiResult.bugId, apiResult.bugId);

    // A content defect: a new bug.
    const dynamicResult = await agent.reportScenario(
      "dynamic-content-validation",
    );
    assert.equal(dynamicResult.outcome, "created");

    // A flaky network defect: a new bug.
    const flakyResult = await agent.reportScenario("flaky-network-recovery");
    assert.equal(flakyResult.outcome, "created");

    // A manual page check: a new bug, filed locally.
    const manualResult = await agent.reportManualCheck({
      expectation: {
        kind: "text",
        value: "Dynamic product output backed by the local validation API.",
      },
      url: "/product/sku-123?state=broken",
    });
    assert.equal(manualResult.outcome, "created");
    assert.equal(manualResult.trackerMode, "local");

    // The made-up report: not reproduced, so no bug.
    const unconfirmedResult = await agent.reportScenario(
      "synthetic-non-reproducible-valid-product-summary",
    );
    assert.equal(unconfirmedResult.outcome, "unconfirmed");

    // A test that only needed healing: no bug.
    const automationOnlyResult =
      await agent.reportScenario("ui-change-healing");
    assert.equal(automationOnlyResult.outcome, "skipped");

    // All passed: say where the records are and which bugs were filed.
    console.log(
      [
        "Local bug reporting validation passed.",
        `Validation root: ${path.relative(process.cwd(), tempRoot).replace(/\\/g, "/")}`,
        `Created bug IDs: ${[apiResult.bugId, dynamicResult.bugId, flakyResult.bugId, manualResult.bugId].join(", ")}`,
      ].join("\n"),
    );
  } finally {
    await server.stop();
  }
}

// Run it; an error prints its stack and fails.
main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
