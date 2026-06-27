import { promises as fs } from "fs";
import { PatchPlanner } from "../../../framework/agents/repair/PatchPlanner";
import { PatchApplier } from "../../../framework/agents/repair/PatchApplier";
import { RepairVerifier } from "../../../framework/agents/repair/RepairVerifier";
import { IncidentRouter } from "../../../framework/orchestrator/IncidentRouter";
import { userManagerPageContract } from "../../../framework/agents/validation/contracts";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("PatchPlanner blocks production environments and approves QA repairs", async () => {
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

  const productionPlan = planner.plan({
    classification,
    environment: "production",
    incidentId: "incident-prod",
    patchProposal: baseProposal,
  });

  expect(productionPlan.permitted).toBe(false);
  expect(productionPlan.blockedReason).toContain("QA");

  const qaPlan = planner.plan({
    classification,
    environment: "qa",
    incidentId: "incident-qa",
    patchProposal: baseProposal,
  });

  expect(qaPlan.permitted).toBe(true);
  expect(qaPlan.steps.some((step) => step.action === "rerun-suite")).toBe(true);
  expect(qaPlan.estimatedRiskLevel).toBe("low");
});

test("PatchApplier writes patch artifact only when plan is permitted", async () => {
  const applier = new PatchApplier();

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

  expect(allowed.applied).toBe(true);
  expect(allowed.artifactPath).not.toBeNull();
  const raw = await fs.readFile(allowed.artifactPath!, "utf-8");
  expect(JSON.parse(raw).incidentId).toBe(allowed.incidentId);
});

test("RepairVerifier reports skip when no page context is provided", async () => {
  const verifier = new RepairVerifier();
  const result = await verifier.verify({ incidentId: "incident-no-page" });

  expect(result.passed).toBe(false);
  expect(result.reason).toContain("Verification skipped");
});

test("IncidentRouter runs end-to-end repair flow on User Manager", async ({
  userManagerPage,
  page,
}) => {
  await page.request.post("/api/test/reset-users");
  page.on("dialog", (dialog) => dialog.dismiss());
  await userManagerPage.goto();
  await userManagerPage.waitForUsersLoaded();

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

  expect(result.repairPlan).not.toBeNull();
  expect(result.repairPlan!.environment).toBe("qa");
  expect(result.repairPlan!.permitted).toBe(true);
  expect(result.repairApply).not.toBeNull();
  expect(result.repairApply!.applied).toBe(true);
  expect(result.repairVerification).not.toBeNull();
  expect(result.repairVerification!.passed).toBe(true);
});

test("IncidentRouter skips repair flow on production", async ({
  userManagerPage,
  page,
}) => {
  await page.request.post("/api/test/reset-users");
  page.on("dialog", (dialog) => dialog.dismiss());
  await userManagerPage.goto();
  await userManagerPage.waitForUsersLoaded();

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

  expect(result.repairPlan).toBeNull();
  expect(result.repairApply).toBeNull();
  expect(result.repairVerification).toBeNull();
});
