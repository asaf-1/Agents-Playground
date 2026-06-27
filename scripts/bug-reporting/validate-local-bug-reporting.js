#!/usr/bin/env node
require("./register-ts-runtime");

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

async function ensureScenarioArtifacts(tempScenarioRoot) {
  const requiredScenarios = [
    "api-error-diagnosis",
    "dynamic-content-validation",
    "flaky-network-recovery",
    "ui-change-healing",
  ];

  for (const scenario of requiredScenarios) {
    const sourcePath = path.join(
      process.cwd(),
      ".artifacts",
      "scenarios",
      scenario,
      "report.json",
    );
    const targetDir = path.join(tempScenarioRoot, scenario);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDir, "report.json"));
  }

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

async function main() {
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

  await ensureScenarioArtifacts(scenarioArtifactsRoot);

  const server = await ensureLocalServer({
    baseUrl: "http://127.0.0.1:4173",
    cwd: process.cwd(),
  });

  try {
    const agent = new BugReportingAgent({
      confirmationArtifactsRoot,
      rerunCount: 3,
      scenarioArtifactsRoot,
      trackerAdapter: new LocalBugStoreAdapter({
        rootDir: reportRoot,
      }),
    });

    const apiResult = await agent.reportScenario("api-error-diagnosis");
    assert.equal(apiResult.outcome, "created");
    assert.ok(apiResult.bugId);

    const duplicateApiResult = await agent.reportScenario(
      "api-error-diagnosis",
    );
    assert.equal(duplicateApiResult.outcome, "updated");
    assert.equal(duplicateApiResult.bugId, apiResult.bugId);

    const dynamicResult = await agent.reportScenario(
      "dynamic-content-validation",
    );
    assert.equal(dynamicResult.outcome, "created");

    const flakyResult = await agent.reportScenario("flaky-network-recovery");
    assert.equal(flakyResult.outcome, "created");

    const manualResult = await agent.reportManualCheck({
      expectation: {
        kind: "text",
        value: "Dynamic product output backed by the local validation API.",
      },
      url: "/product/sku-123?state=broken",
    });
    assert.equal(manualResult.outcome, "created");
    assert.equal(manualResult.trackerMode, "local");

    const unconfirmedResult = await agent.reportScenario(
      "synthetic-non-reproducible-valid-product-summary",
    );
    assert.equal(unconfirmedResult.outcome, "unconfirmed");

    const automationOnlyResult =
      await agent.reportScenario("ui-change-healing");
    assert.equal(automationOnlyResult.outcome, "skipped");

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

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
