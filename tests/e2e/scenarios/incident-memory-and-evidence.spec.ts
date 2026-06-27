import { promises as fs } from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import { EvidenceCollectionAgent } from "../../../framework/agents/evidence/EvidenceCollectionAgent";
import { homePageContract } from "../../../framework/agents/validation/contracts";
import { IncidentMemoryStore } from "../../../framework/memory/IncidentMemoryStore";

test("records incident memory entries in a deterministic local file", async () => {
  const memoryPath = path.join(
    process.cwd(),
    ".artifacts",
    "test-results",
    `incident-memory-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`,
  );
  const store = new IncidentMemoryStore(memoryPath);

  await store.record({
    classification: {
      category: "ui-missing-locator",
      confidence: 0.94,
      explanation: "Stale selector pattern matched the deterministic UI rules.",
      signals: ['stale-selector:button:has-text("Add Member")'],
    },
    executionPlan: {
      escalationReason: null,
      strategyOrder: ["locator-heal", "contract-recheck"],
      workerOrder: [
        "classify",
        "evidence-collect",
        "locator-heal",
        "validate",
        "memory-record",
      ],
    },
    finalStatus: "mitigated",
    incidentId: "incident-memory-test",
    pageLabel: "User Manager",
    recordedAt: new Date().toISOString(),
    recovered: true,
    scenario: "incident-memory-and-evidence",
    strategyUsed: "locator-heal",
    validationPassed: true,
  });

  const entries = await store.readAll();
  const successfulStrategies =
    await store.getSuccessfulStrategies("ui-missing-locator");

  expect(entries).toHaveLength(1);
  expect(entries[0].incidentId).toBe("incident-memory-test");
  expect(successfulStrategies).toEqual(["locator-heal"]);

  await fs.rm(memoryPath, { force: true });
});

test("collects page evidence and writes local incident artifacts", async ({
  page,
}) => {
  const incidentId = `incident-evidence-${Date.now()}`;
  const collector = new EvidenceCollectionAgent();

  await page.goto("/");

  const result = await collector.collect({
    contract: homePageContract,
    failureEvidence: {
      errorMessage: "Landing page button selector failed to resolve.",
      staleSelector: 'button:has-text("Launch Console")',
      targetType: "button",
    },
    incidentId,
    page,
    pageLabel: "Landing Page",
    scenario: "incident-memory-and-evidence",
  });

  expect(result.engine).toBe("deterministic");
  expect(result.evidence.contractName).toBe("home-page");
  expect(result.artifactPaths).toHaveLength(3);

  for (const artifactPath of result.artifactPaths) {
    await fs.access(path.join(process.cwd(), artifactPath));
  }
});
