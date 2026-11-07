// The repair applier. It never edits the code: an allowed plan is written to
// .artifacts/patches/<incident id>/patch-plan.json for a person to review.

// Node's file and path tools.
import { promises as fs } from "fs";
import path from "path";
// The plan and result shapes.
import type { PatchApplyResult, PatchPlan } from "./types";

// Where plans are written by default.
const defaultSandboxRoot = path.join(process.cwd(), ".artifacts", "patches");

// One applier per folder.
export class PatchApplier {
  constructor(private readonly sandboxRoot = defaultSandboxRoot) {}

  // Writes one plan, or refuses it.
  async apply(plan: PatchPlan): Promise<PatchApplyResult> {
    const sandboxPath = path.join(this.sandboxRoot, plan.incidentId);

    // A plan that is not allowed is refused with its reason.
    if (!plan.permitted) {
      return {
        applied: false,
        artifactPath: null,
        blockedReason:
          plan.blockedReason || "Plan is not permitted for auto-application.",
        incidentId: plan.incidentId,
        sandboxPath,
        steps: plan.steps,
      };
    }

    // An allowed plan: write it to its incident's folder.
    await fs.mkdir(sandboxPath, { recursive: true });
    const artifactPath = path.join(sandboxPath, "patch-plan.json");
    const artifact = {
      classification: plan.classification,
      environment: plan.environment,
      generatedAt: new Date().toISOString(),
      incidentId: plan.incidentId,
      steps: plan.steps,
      validationPlan: plan.validationPlan,
    };

    await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

    // Report where it went.
    return {
      applied: true,
      artifactPath,
      blockedReason: null,
      incidentId: plan.incidentId,
      sandboxPath,
      steps: plan.steps,
    };
  }
}
