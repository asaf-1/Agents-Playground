import type { Page } from "@playwright/test";
import type { FailureClassification, PatchProposal } from "../diagnosis/types";
import type {
  ContractValidationResult,
  PageContract,
} from "../validation/contracts";

export type RepairEnvironment = "qa" | "staging" | "production";

export type PatchPlanStep = {
  action: "edit-file" | "add-test-rule" | "rerun-suite";
  description: string;
  target: string;
};

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

export type PatchPlanRequest = {
  environment?: RepairEnvironment;
  incidentId: string;
  patchProposal: PatchProposal;
  classification: FailureClassification;
};

export type PatchApplyResult = {
  applied: boolean;
  artifactPath: string | null;
  blockedReason: string | null;
  incidentId: string;
  sandboxPath: string;
  steps: PatchPlanStep[];
};

export type RepairVerificationRequest = {
  contract?: PageContract;
  incidentId: string;
  page?: Page;
};

export type RepairVerificationResult = {
  contractResult: ContractValidationResult | null;
  incidentId: string;
  passed: boolean;
  reason: string;
};
