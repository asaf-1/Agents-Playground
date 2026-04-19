import type { ScenarioReport } from "../../reporting/types";
import type {
  FailureClassification,
  FailureSignalInput,
  PatchProposal
} from "../diagnosis/types";

export type SeverityLevel = "S1" | "S2" | "S3" | "S4";
export type PriorityLevel = "P1" | "P2" | "P3" | "P4";

export type ManualExpectation =
  | { kind: "testid"; value: string }
  | { kind: "text"; value: string }
  | { kind: "role"; role: string; name: string };

export type PageExpectationCheck = {
  actualResult: string;
  errorHintTestId?: string;
  expectedResult: string;
  expectation: ManualExpectation;
  kind: "page-expectation";
  pageLabel: string;
  path: string;
  settleMs?: number;
  signatureKey: string;
  steps: string[];
};

export type ApiResponseCheck = {
  actualResult: string;
  body?: Record<string, unknown>;
  expectedFailureStatus: number;
  expectedJsonFields?: Array<{ path: string; value: boolean | number | string }>;
  expectedResult: string;
  kind: "api-response";
  method: "GET" | "POST";
  pageLabel: string;
  path: string;
  signatureKey: string;
  steps: string[];
};

export type ContractFailureCheck = {
  actualResult: string;
  contractName: "product-page";
  expectedIssueTokens: string[];
  expectedResult: string;
  kind: "contract-failure";
  pageLabel: string;
  path: string;
  signatureKey: string;
  steps: string[];
};

export type ConfirmationCheck =
  | ApiResponseCheck
  | ContractFailureCheck
  | PageExpectationCheck;

export type ScenarioBugDefinition = {
  allowedFinalStatuses: string[];
  buildFailureInput?: (report: ScenarioReport) => FailureSignalInput;
  confirmation: ConfirmationCheck;
  defaultPriority?: PriorityLevel;
  defaultSeverity?: SeverityLevel;
  notes?: string;
  productBugCandidate: boolean;
  scenario: string;
  title: string;
};

export type ManualBugRequest = {
  component?: string;
  expectation: ManualExpectation;
  notes?: string;
  rerunCount?: number;
  url: string;
};

export type BugOccurrence = {
  actualResult: string;
  artifactPaths: string[];
  confirmationRuns: BugConfirmationRun[];
  detectedAt: string;
  expectedResult: string;
  notes?: string;
  source: BugSource;
};

export type BugSource =
  | {
      initialArtifactPaths: string[];
      kind: "scenario";
      scenario: string;
      finalStatus: string;
      initialFailure: string;
    }
  | {
      initialArtifactPaths: string[];
      kind: "manual";
      url: string;
      expectation: ManualExpectation;
      initialFailure: string;
    };

export type LocalBugRecordDraft = {
  actualResult: string;
  classification: FailureClassification;
  component: string;
  dedupeSignature: string;
  expectedResult: string;
  occurrence: BugOccurrence;
  priority: PriorityLevel;
  rootCause: string;
  severity: SeverityLevel;
  source: BugSource;
  stepsToReproduce: string[];
  suggestedPermanentFix: string;
  summary: string;
  title: string;
  trackerMode: "local";
};

export type LocalBugRecord = LocalBugRecordDraft & {
  createdAt: string;
  history: BugOccurrence[];
  id: string;
  jsonPath: string;
  lastSeenAt: string;
  markdownPath: string;
  occurrenceCount: number;
  patchProposal: PatchProposal;
  status: "closed" | "open";
};

export type BugTrackerAdapter = {
  close(record: LocalBugRecord): Promise<LocalBugRecord>;
  create(
    record: LocalBugRecordDraft & { patchProposal: PatchProposal }
  ): Promise<LocalBugRecord>;
  findDuplicate(signature: string): Promise<LocalBugRecord | null>;
  mode: "local" | string;
  update(record: LocalBugRecord): Promise<LocalBugRecord>;
};

export type BugConfirmationRun = {
  actualResult: string;
  artifactPaths: string[];
  classification: FailureClassification;
  confirmed: boolean;
  patchProposal: PatchProposal;
  rootCause: string;
  runLabel: string;
  startedAt: string;
};

export type BugReportingResult = {
  bugId?: string;
  bugPaths?: {
    artifactDir: string | null;
    indexPath: string;
    jsonPath: string;
    markdownPath: string;
  };
  classification?: FailureClassification;
  confirmationRuns: BugConfirmationRun[];
  message: string;
  outcome: "created" | "no-issue-detected" | "skipped" | "unconfirmed" | "updated";
  source: BugSource["kind"];
  trackerMode: string;
};

export type BugReportingAgentOptions = {
  baseUrl?: string;
  catalogEntries?: ScenarioBugDefinition[];
  confirmationArtifactsRoot?: string;
  rerunCount?: number;
  scenarioArtifactsRoot?: string;
  trackerAdapter?: BugTrackerAdapter;
};
