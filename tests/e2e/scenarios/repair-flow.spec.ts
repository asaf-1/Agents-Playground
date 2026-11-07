/** Node's file tools (async). */
import { promises as fs } from "fs";
/** The repair agents under test: plan a patch, apply it, verify it. */
import { PatchPlanner } from "../../../framework/agents/repair/PatchPlanner";
import { PatchApplier } from "../../../framework/agents/repair/PatchApplier";
import { RepairVerifier } from "../../../framework/agents/repair/RepairVerifier";
/** The router that runs a failure through the whole agent chain. */
import { IncidentRouter } from "../../../framework/orchestrator/IncidentRouter";
/** The User Manager page's contract. */
import { userManagerPageContract } from "../../../framework/agents/validation/contracts";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

/** The planner refuses a repair in production and approves the same one in QA. */
test("PatchPlanner blocks production environments and approves QA repairs", async () => {
  expected(
    "production: not permitted, reason mentions QA; QA: permitted, includes a rerun-suite step, risk low",
  );
  // One proposal and one classification, planned for two environments.
  const planner = new PatchPlanner();
  const baseProposal = {
    classification: "ui-missing-locator" as const,
    likelyFileTargets: ["framework/pom/HomePage.ts"],
    likelyFixArea: "UI locator contract",
    qaAutoMitigationEligible: true,
    recommendedPermanentFixDirection: "Update locator.",
    validationPlan: ["Run the full Playwright suite."],
  };
  const classification = {
    category: "ui-missing-locator" as const,
    confidence: 0.9,
    explanation: "stale locator",
    signals: ["staleSelector"],
  };

  // Production: refused.
  const productionPlan = planner.plan({
    classification,
    environment: "production",
    incidentId: "incident-prod",
    patchProposal: baseProposal,
  });
  fact("production", productionPlan.blockedReason);

  expect(productionPlan.permitted).toBe(false);
  expect(productionPlan.blockedReason).toContain("QA");

  // QA: approved, with a re-run of the suite.
  const qaPlan = planner.plan({
    classification,
    environment: "qa",
    incidentId: "incident-qa",
    patchProposal: baseProposal,
  });
  fact("qa risk", qaPlan.estimatedRiskLevel);

  expect(qaPlan.permitted).toBe(true);
  expect(qaPlan.steps.some((step) => step.action === "rerun-suite")).toBe(true);
  expect(qaPlan.estimatedRiskLevel).toBe("low");
});

/** The applier writes nothing for a blocked plan, and writes a patch file for a permitted one. */
test("PatchApplier writes patch artifact only when plan is permitted", async () => {
  expected(
    "blocked: not applied, no file; permitted: applied, a file whose incidentId matches",
  );
  const applier = new PatchApplier();

  // A blocked plan.
  const blocked = await applier.apply({
    approvalRequired: true,
    blockedReason: "Manual approval required.",
    classification: "auth-or-session",
    environment: "qa",
    estimatedRiskLevel: "high",
    incidentId: `incident-blocked-${Date.now()}`,
    permitted: false,
    steps: [],
    validationPlan: [],
  });

  expect(blocked.applied).toBe(false);
  expect(blocked.artifactPath).toBeNull();

  // A permitted plan.
  const allowed = await applier.apply({
    approvalRequired: false,
    blockedReason: null,
    classification: "ui-missing-locator",
    environment: "qa",
    estimatedRiskLevel: "low",
    incidentId: `incident-allowed-${Date.now()}`,
    permitted: true,
    steps: [
      {
        action: "edit-file",
        description: "edit",
        target: "framework/pom/HomePage.ts",
      },
    ],
    validationPlan: ["Run the full Playwright suite."],
  });
  fact("patch file", allowed.artifactPath);

  // Its file exists and names the incident.
  expect(allowed.applied).toBe(true);
  expect(allowed.artifactPath).not.toBeNull();
  const raw = await fs.readFile(allowed.artifactPath!, "utf-8");
  expect(JSON.parse(raw).incidentId).toBe(allowed.incidentId);
});

/** With no page to check, the verifier says it skipped rather than passing. */
test("RepairVerifier reports skip when no page context is provided", async () => {
  expected("not passed, reason 'Verification skipped'");
  const verifier = new RepairVerifier();
  const result = await verifier.verify({ incidentId: "incident-no-page" });
  fact("reason", result.reason);

  expect(result.passed).toBe(false);
  expect(result.reason).toContain("Verification skipped");
});

/**
 * In QA, the router plans, applies and verifies a repair for the stale
 * "Add Member" selector on User Manager.
 */
test("IncidentRouter runs end-to-end repair flow on User Manager", async ({
  userManagerPage,
  page,
}) => {
  expected(
    "a QA repair plan that is permitted, applied, and verified as passed",
  );
  // A clean user list; dismiss any prompt; open User Manager.
  await page.request.post("/api/test/reset-users");
  page.on("dialog", (dialog) => dialog.dismiss());
  await userManagerPage.goto();
  await userManagerPage.waitForUsersLoaded();

  // Route the stale-selector failure in QA, with a locator heal on offer.
  const router = new IncidentRouter();
  const result = await router.route({
    page,
    scenario: "repair-flow",
    pageLabel: "User Manager",
    contract: userManagerPageContract,
    environment: "qa",
    failureEvidence: {
      errorMessage: "Stale add-member selector",
      staleSelector: 'button:has-text("Add Member")',
      targetType: "button",
    },
    strategies: [
      {
        kind: "locator-heal",
        request: {
          action: "click",
          intentTokens: ["add", "user", "create", "new"],
          staleSelector: 'button:has-text("Add Member")',
          targetType: "button",
        },
      },
    ],
  });
  fact("incidentId", result.incidentId);

  // Planned, applied and verified.
  expect(result.repairPlan).not.toBeNull();
  expect(result.repairPlan!.environment).toBe("qa");
  expect(result.repairPlan!.permitted).toBe(true);
  expect(result.repairApply).not.toBeNull();
  expect(result.repairApply!.applied).toBe(true);
  expect(result.repairVerification).not.toBeNull();
  expect(result.repairVerification!.passed).toBe(true);
});

/** In production, the router does no repair at all. */
test("IncidentRouter skips repair flow on production", async ({
  userManagerPage,
  page,
}) => {
  expected("no repair plan, no apply, no verification");
  // A clean user list; dismiss any prompt; open User Manager.
  await page.request.post("/api/test/reset-users");
  page.on("dialog", (dialog) => dialog.dismiss());
  await userManagerPage.goto();
  await userManagerPage.waitForUsersLoaded();

  // Route the same kind of failure in production, with no strategies.
  const router = new IncidentRouter();
  const result = await router.route({
    page,
    scenario: "repair-flow-prod",
    pageLabel: "User Manager",
    contract: userManagerPageContract,
    environment: "production",
    failureEvidence: {
      errorMessage: "Stale selector in production",
      staleSelector: 'button:has-text("Add Member")',
      targetType: "button",
    },
    strategies: [],
  });
  fact("incidentId", result.incidentId);

  expect(result.repairPlan).toBeNull();
  expect(result.repairApply).toBeNull();
  expect(result.repairVerification).toBeNull();
});
