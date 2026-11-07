// The shapes the diagnosis agents share: the kinds of failure, the signals a
// failure comes with, how a failure is classed, and the permanent fix proposed
// for it.

// Every kind of failure the classifier can name. The test runner's Triage tab
// uses the same names.
export type FailureCategory =
  | "api-timeout"
  | "ui-missing-locator"
  | "ui-modal-not-opened"
  | "ui-route-or-navigation"
  | "ui-empty-state"
  | "ui-delayed-data"
  | "ui-loading-or-network"
  | "ui-contract-or-render"
  | "auth-or-session"
  | "permissions-or-rbac"
  | "api-client-error"
  | "api-server-error"
  | "api-contract-drift"
  | "unknown";

// What is known about a failure: the error, the page and network state, what
// was missing on the page, and the API's answer. Every field is optional.
export type FailureSignalInput = {
  activeRequests?: number;
  actualUrl?: string;
  authRequired?: boolean;
  currentUrl?: string;
  delayedDataVisible?: boolean;
  errorMessage?: string;
  expectedUrl?: string;
  emptyStateDetected?: boolean;
  emptyStateText?: string;
  failedRequests?: number;
  forbiddenTextMatches?: string[];
  invalidNumericFields?: string[];
  missingElements?: string[];
  missingHeadings?: string[];
  missingRoles?: string[];
  missingTextTokens?: string[];
  modalExpected?: boolean;
  modalVisible?: boolean;
  overlapPairs?: string[];
  permissionDenied?: boolean;
  requestUrl?: string;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseStatus?: number;
  spinnerVisible?: boolean;
  staleSelector?: string;
  targetType?: string;
  timedOut?: boolean;
};

// The class of a failure: its kind, how sure the classifier is (0 to 1), why,
// and the signals that led there.
export type FailureClassification = {
  category: FailureCategory;
  confidence: number;
  explanation: string;
  signals: string[];
};

// A proposed permanent fix: where it probably lives, what to change, how to
// check it, and whether a QA run may apply a temporary mitigation itself.
export type PatchProposal = {
  classification: FailureCategory;
  likelyFileTargets: string[];
  likelyFixArea: string;
  qaAutoMitigationEligible: boolean;
  recommendedPermanentFixDirection: string;
  validationPlan: string[];
};

// What the fix proposer is given: the signals, plus the route, page, scenario
// and the root cause when one is known.
export type PatchProposalRequest = FailureSignalInput & {
  apiRoute?: string;
  pageLabel?: string;
  rootCause?: {
    expectedType?: string;
    field?: string;
    receivedType?: string;
  };
  scenario?: string;
};
