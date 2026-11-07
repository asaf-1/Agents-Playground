// The repair checker: after a repair, it tests the page against its contract
// again.

// The page checker.
import { PageValidationAgent } from "../validation/PageValidationAgent";
// The request and result shapes.
import type {
  RepairVerificationRequest,
  RepairVerificationResult,
} from "./types";

// One checker, no state.
export class RepairVerifier {
  // Checks one repair.
  async verify(
    request: RepairVerificationRequest,
  ): Promise<RepairVerificationResult> {
    // Without a page and a contract there is nothing to check.
    if (!request.page || !request.contract) {
      return {
        contractResult: null,
        incidentId: request.incidentId,
        passed: false,
        reason: "Verification skipped: missing page or contract context.",
      };
    }

    // Check the page against its contract and report the result.
    const validator = new PageValidationAgent(request.page);
    const result = await validator.validateContract(request.contract);

    return {
      contractResult: result,
      incidentId: request.incidentId,
      passed: result.valid,
      reason: result.valid
        ? "Contract validation passed after repair."
        : `Contract validation failed: ${result.explanation}`,
    };
  }
}
