/** Node's file tools (async) and path tools. */
import { promises as fs } from "fs";
import path from "path";
/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
/** The evidence collector, the home page's contract, and the incident memory store. */
import { EvidenceCollectionAgent } from "../../../framework/agents/evidence/EvidenceCollectionAgent";
import { homePageContract } from "../../../framework/agents/validation/contracts";
import { IncidentMemoryStore } from "../../../framework/memory/IncidentMemoryStore";

/**
 * The memory store writes one incident to its own file, reads it back, and
 * reports which strategy worked for that kind of failure.
 */
test("records incident memory entries in a deterministic local file", async () => {
  expected(
    "1 entry, id incident-memory-test; successful strategies for ui-missing-locator = [locator-heal]",
  );
  // A memory file of this test's own, under .artifacts.
  const memoryPath = path.join(
    process.cwd(),
    ".artifacts",
    "test-results",
    `incident-memory-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`,
  );
  fact("memory file", memoryPath);
  const store = new IncidentMemoryStore(memoryPath);

  // Record one mitigated incident.
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

  // Read it back.
  const entries = await store.readAll();
  const successfulStrategies =
    await store.getSuccessfulStrategies("ui-missing-locator");

  expect(entries).toHaveLength(1);
  expect(entries[0].incidentId).toBe("incident-memory-test");
  expect(successfulStrategies).toEqual(["locator-heal"]);

  // Remove the file again.
  await fs.rm(memoryPath, { force: true });
});

/**
 * The evidence collector reads the live landing page and writes its three
 * artifact files.
 */
test("collects page evidence and writes local incident artifacts", async ({
  page,
}) => {
  expected(
    "engine deterministic; contract home-page; 3 artifact files, each on disk",
  );
  // A new incident id, and the collector.
  const incidentId = `incident-evidence-${Date.now()}`;
  fact("incidentId", incidentId);
  const collector = new EvidenceCollectionAgent();

  await page.goto("/classic");

  // Collect evidence for a made-up stale selector on the landing page.
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
  fact("artifacts", result.artifactPaths);

  expect(result.engine).toBe("deterministic");
  expect(result.evidence.contractName).toBe("home-page");
  expect(result.artifactPaths).toHaveLength(3);

  // Each file it names is really there.
  for (const artifactPath of result.artifactPaths) {
    await fs.access(path.join(process.cwd(), artifactPath));
  }
});
