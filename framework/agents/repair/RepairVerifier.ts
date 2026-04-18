import { PageValidationAgent } from "../validation/PageValidationAgent";
import type { RepairVerificationRequest, RepairVerificationResult } from "./types";

export class RepairVerifier {
  async verify(request: RepairVerificationRequest): Promise<RepairVerificationResult> {
    if (!request.page || !request.contract) {
      return {
        contractResult: null,
        incidentId: request.incidentId,
        passed: false,
        reason: "Verification skipped: missing page or contract context."
      };
    }

    const validator = new PageValidationAgent(request.page);
    const result = await validator.validateContract(request.contract);

    return {
      contractResult: result,
      incidentId: request.incidentId,
      passed: result.valid,
      reason: result.valid
        ? "Contract validation passed after repair."
        : `Contract validation failed: ${result.explanation}`
    };
  }
}
