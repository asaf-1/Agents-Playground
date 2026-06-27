import { promises as fs } from "fs";
import path from "path";
import type { PatchApplyResult, PatchPlan } from "./types";

const defaultSandboxRoot = path.join(process.cwd(), ".artifacts", "patches");

export class PatchApplier {
  constructor(private readonly sandboxRoot = defaultSandboxRoot) {}

  async apply(plan: PatchPlan): Promise<PatchApplyResult> {
    const sandboxPath = path.join(this.sandboxRoot, plan.incidentId);

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
