// The shapes the repair agents share: where a repair may run, the plan and its
// steps, what applying it did, and what checking it found.

// Playwright's type for a page.
import type { Page } from "@playwright/test";
// The diagnosis and page contract shapes.
import type { FailureClassification, PatchProposal } from "../diagnosis/types";
import type {
  ContractValidationResult,
  PageContract,
} from "../validation/contracts";

// Where a repair is asked for. Production is never allowed.
export type RepairEnvironment = "qa" | "staging" | "production";

// One step of a plan: edit a file, add a test rule, or run the suite again.
export type PatchPlanStep = {
  action: "edit-file" | "add-test-rule" | "rerun-suite";
  description: string;
  target: string;
};

// A repair plan: its steps, its risk, whether it needs a person's approval, and
// whether it may run at all (and why not).
export type PatchPlan = {
  approvalRequired: boolean;
  blockedReason: string | null;
  classification: PatchProposal["classification"];
  environment: RepairEnvironment;
  estimatedRiskLevel: "low" | "medium" | "high";
  incidentId: string;
  permitted: boolean;
  steps: PatchPlanStep[];
  validationPlan: string[];
};

// What the planner is given.
export type PatchPlanRequest = {
  environment?: RepairEnvironment;
  incidentId: string;
  patchProposal: PatchProposal;
  classification: FailureClassification;
};

// What applying a plan did, and where it wrote it.
export type PatchApplyResult = {
  applied: boolean;
  artifactPath: string | null;
  blockedReason: string | null;
  incidentId: string;
  sandboxPath: string;
  steps: PatchPlanStep[];
};

// What the verifier is given: the page and the contract to check it with.
export type RepairVerificationRequest = {
  contract?: PageContract;
  incidentId: string;
  page?: Page;
};

// What the verifier found.
export type RepairVerificationResult = {
  contractResult: ContractValidationResult | null;
  incidentId: string;
  passed: boolean;
  reason: string;
};
