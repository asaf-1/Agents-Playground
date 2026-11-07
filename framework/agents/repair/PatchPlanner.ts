// The repair planner: it turns a proposed fix into a plan of steps and decides
// whether the plan may run. Production is always refused; an unsure
// classification or a risky kind of failure needs a person's approval.

// The plan shapes.
import type {
  PatchPlan,
  PatchPlanRequest,
  PatchPlanStep,
  RepairEnvironment,
} from "./types";

// Kinds of failure whose fix is always high risk.
const HIGH_RISK_CATEGORIES = new Set([
  "auth-or-session",
  "permissions-or-rbac",
  "api-server-error",
  "api-contract-drift",
]);

// One planner, no state.
export class PatchPlanner {
  // Plans the repair for one incident.
  plan(request: PatchPlanRequest): PatchPlan {
    // Where it would run, and how risky and how sure it is.
    const environment: RepairEnvironment = request.environment || "qa";
    const proposal = request.patchProposal;
    const classification = request.classification;
    const productionBlocked = environment === "production";
    const lowConfidence = classification.confidence < 0.5;
    const highRisk = HIGH_RISK_CATEGORIES.has(proposal.classification);

    // One "edit" step per file the fix probably touches, then a test run.
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

    // Production is refused; a classification under 0.5 needs approval.
    const blockedReason = productionBlocked
      ? "Repair flow is restricted to QA and staging environments."
      : lowConfidence
        ? "Classification confidence below 0.5 — manual approval required."
        : null;

    // It may run only when nothing blocks it and the fix allows QA to act.
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
