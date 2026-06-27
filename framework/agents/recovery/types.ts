import type {
  FailureClassification,
  FailureSignalInput,
  PatchProposal,
} from "../diagnosis/types";
import type { PageContract } from "../validation/contracts";

export type LocatorTargetType =
  | "button"
  | "input"
  | "link"
  | "menuitem"
  | "select";
export type LocatorAction = "click" | "fill" | "select";
export type RecoveryStrategyKind =
  | "contract-recheck"
  | "extend-wait"
  | "locator-heal"
  | "refresh-and-retry";

export type HealedLocatorCandidate = {
  ariaLabel: string | null;
  className: string;
  id: string | null;
  href: string | null;
  index: number;
  labelText: string;
  left: number;
  name: string | null;
  placeholder: string | null;
  role: string | null;
  rowText: string;
  score: number;
  sectionText: string;
  tagName: string;
  testId: string | null;
  text: string;
  top: number;
  type: string | null;
};

export type LocatorHealRequest = {
  action?: LocatorAction;
  description?: string;
  fillValue?: string;
  intentTokens: string[];
  labelTokens?: string[];
  placeholderTokens?: string[];
  rowTokens?: string[];
  sectionTokens?: string[];
  selectValue?: string;
  staleSelector: string;
  targetType: LocatorTargetType;
};

export type LocatorHealResult = {
  agentDecision: string;
  engine: string;
  performedAction: LocatorAction;
  selectedCandidate: HealedLocatorCandidate;
  strategy: "locator-heal";
  topCandidates: HealedLocatorCandidate[];
};

export type RecoveryStrategyAttempt = {
  details?: Record<string, unknown>;
  durationMs: number;
  message: string;
  strategy: RecoveryStrategyKind;
  success: boolean;
};

export type RecoveryStrategy =
  | {
      contract: PageContract;
      description?: string;
      kind: "contract-recheck";
    }
  | {
      description?: string;
      kind: "extend-wait";
      selector: string;
      timeoutMs?: number;
    }
  | {
      description?: string;
      kind: "locator-heal";
      request: LocatorHealRequest;
    }
  | {
      description?: string;
      kind: "refresh-and-retry";
      successSelector: string;
      timeoutMs?: number;
      triggerSelector?: string;
      triggerTestId?: string;
    };

export type RecoveryRouterRequest = {
  apiRoute?: string;
  failureEvidence: FailureSignalInput;
  pageLabel?: string;
  scenario: string;
  strategies: RecoveryStrategy[];
};

export type RecoveryRouterResult = {
  agentDecision: string;
  attempts: RecoveryStrategyAttempt[];
  classification: FailureClassification;
  engine: string;
  finalStatus: "failed" | "recovered";
  patchProposal: PatchProposal;
  recoveryEvidence: Record<string, unknown>;
  strategyUsed: RecoveryStrategyKind | null;
};
