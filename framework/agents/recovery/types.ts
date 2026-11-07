// The shapes the recovery agents share: what a heal request asks for, what a
// candidate control looks like, each recovery strategy, and what the router
// reports back.

// The diagnosis shapes: the failure's signals, its classification, and the
// proposed permanent fix.
import type {
  FailureClassification,
  FailureSignalInput,
  PatchProposal,
} from "../diagnosis/types";
// A page contract, for the "check the page again" strategy.
import type { PageContract } from "../validation/contracts";

// The kinds of control the healer can find, and what it can do with one.
export type LocatorTargetType =
  "button" | "input" | "link" | "menuitem" | "select";
export type LocatorAction = "click" | "fill" | "select";
// The four ways to recover: re-check the page's contract, wait longer, heal a
// locator, or press refresh and wait.
export type RecoveryStrategyKind =
  "contract-recheck" | "extend-wait" | "locator-heal" | "refresh-and-retry";

// A control on the page the healer considered, with everything it scored it on.
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

// What the healer is asked to find: the stale selector, the kind of control,
// the words for what it does (and, optionally, for its label, placeholder,
// table row or page section), and what to do once it is found.
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

// What a heal reports: the control it picked, the runners-up, and why.
export type LocatorHealResult = {
  agentDecision: string;
  engine: string;
  performedAction: LocatorAction;
  selectedCandidate: HealedLocatorCandidate;
  strategy: "locator-heal";
  topCandidates: HealedLocatorCandidate[];
};

// One strategy the router tried: whether it worked, how long it took, and why.
export type RecoveryStrategyAttempt = {
  details?: Record<string, unknown>;
  durationMs: number;
  message: string;
  strategy: RecoveryStrategyKind;
  success: boolean;
};

// A strategy and the details it needs.
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

// What the router is asked to do: the failure, where it happened, and the
// strategies to try in order.
export type RecoveryRouterRequest = {
  apiRoute?: string;
  failureEvidence: FailureSignalInput;
  pageLabel?: string;
  scenario: string;
  strategies: RecoveryStrategy[];
};

// What the router reports: recovered or failed, every attempt, the failure's
// class, the proposed permanent fix, and the evidence of the recovery.
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
