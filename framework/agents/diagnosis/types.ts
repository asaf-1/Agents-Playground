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

export type FailureClassification = {
  category: FailureCategory;
  confidence: number;
  explanation: string;
  signals: string[];
};

export type PatchProposal = {
  classification: FailureCategory;
  likelyFileTargets: string[];
  likelyFixArea: string;
  qaAutoMitigationEligible: boolean;
  recommendedPermanentFixDirection: string;
  validationPlan: string[];
};

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
