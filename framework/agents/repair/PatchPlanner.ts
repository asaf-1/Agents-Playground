import type {
  PatchPlan,
  PatchPlanRequest,
  PatchPlanStep,
  RepairEnvironment,
} from "./types";

const HIGH_RISK_CATEGORIES = new Set([
  "auth-or-session",
  "permissions-or-rbac",
  "api-server-error",
  "api-contract-drift",
]);

export class PatchPlanner {
  plan(request: PatchPlanRequest): PatchPlan {
    const environment: RepairEnvironment = request.environment || "qa";
    const proposal = request.patchProposal;
    const classification = request.classification;
    const productionBlocked = environment === "production";
    const lowConfidence = classification.confidence < 0.5;
    const highRisk = HIGH_RISK_CATEGORIES.has(proposal.classification);

    const steps: PatchPlanStep[] = proposal.likelyFileTargets.map((target) => ({
      action: "edit-file",
      description: `Apply targeted change in ${target} for ${proposal.likelyFixArea}.`,
      target,
    }));

    steps.push({
      action: "rerun-suite",
      description:
        "Run targeted Playwright validation after the patch is staged.",
      target: "npm test",
    });

    const blockedReason = productionBlocked
      ? "Repair flow is restricted to QA and staging environments."
      : lowConfidence
        ? "Classification confidence below 0.5 — manual approval required."
        : null;

    return {
      approvalRequired: highRisk || lowConfidence,
      blockedReason,
      classification: proposal.classification,
      environment,
      estimatedRiskLevel: highRisk ? "high" : lowConfidence ? "medium" : "low",
      incidentId: request.incidentId,
      permitted: !blockedReason && proposal.qaAutoMitigationEligible,
      steps,
      validationPlan: proposal.validationPlan,
    };
  }
}
