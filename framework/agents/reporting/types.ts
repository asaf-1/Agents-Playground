// The shapes the bug-reporting agent shares: how a bug is confirmed again, a
// local bug record and its history, and the store that keeps the records. Bugs
// stay local; nothing here opens an outside ticket.

// The scenario report and the diagnosis shapes.
import type { ScenarioReport } from "../../reporting/types";
import type {
  FailureClassification,
  FailureSignalInput,
  PatchProposal,
} from "../diagnosis/types";

// How bad a bug is (S1 worst) and how soon to fix it (P1 first).
export type SeverityLevel = "S1" | "S2" | "S3" | "S4";
export type PriorityLevel = "P1" | "P2" | "P3" | "P4";

// What a page should show: a test id, some text, or a role with a name.
export type ManualExpectation =
  | { kind: "testid"; value: string }
  | { kind: "text"; value: string }
  | { kind: "role"; role: string; name: string };

// A check that opens a page and looks for what it should show.
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

// A check that calls the API and expects a failure status (and, optionally,
// certain fields in the answer).
export type ApiResponseCheck = {
  actualResult: string;
  body?: Record<string, unknown>;
  expectedFailureStatus: number;
  expectedJsonFields?: Array<{
    path: string;
    value: boolean | number | string;
  }>;
  expectedResult: string;
  kind: "api-response";
  method: "GET" | "POST";
  pageLabel: string;
  path: string;
  signatureKey: string;
  steps: string[];
};

// A check that the product page still fails its contract for the expected
// reasons.
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

// Any of the three checks.
export type ConfirmationCheck =
  ApiResponseCheck | ContractFailureCheck | PageExpectationCheck;

// One known scenario bug: its title, how to confirm it, and its default
// severity and priority.
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

// A bug a person reports by hand: the page, what it should show, and notes.
export type ManualBugRequest = {
  component?: string;
  expectation: ManualExpectation;
  notes?: string;
  rerunCount?: number;
  url: string;
};

// One time the bug was seen, with its confirmation runs and evidence.
export type BugOccurrence = {
  actualResult: string;
  artifactPaths: string[];
  confirmationRuns: BugConfirmationRun[];
  detectedAt: string;
  expectedResult: string;
  notes?: string;
  source: BugSource;
};

// Where a bug came from: a scenario's report, or a manual check of a page.
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

// A bug record before it is saved.
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

// A saved bug record: its id, files, history, how often it was seen, the
// proposed fix, and whether it is open.
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

// The store the agent saves bugs in (a local folder in this repo).
export type BugTrackerAdapter = {
  close(record: LocalBugRecord): Promise<LocalBugRecord>;
  create(
    record: LocalBugRecordDraft & { patchProposal: PatchProposal },
  ): Promise<LocalBugRecord>;
  findDuplicate(signature: string): Promise<LocalBugRecord | null>;
  mode: "local" | string;
  update(record: LocalBugRecord): Promise<LocalBugRecord>;
};

// One run of a confirmation check.
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

// What a reporting run did: created, updated, skipped, unconfirmed, or found no
// issue, and where the record is.
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
  outcome:
    "created" | "no-issue-detected" | "skipped" | "unconfirmed" | "updated";
  source: BugSource["kind"];
  trackerMode: string;
};

// Options: the app's address, the known bugs, where artifacts go, how many
// times to confirm, and the store.
export type BugReportingAgentOptions = {
  baseUrl?: string;
  catalogEntries?: ScenarioBugDefinition[];
  confirmationArtifactsRoot?: string;
  rerunCount?: number;
  scenarioArtifactsRoot?: string;
  trackerAdapter?: BugTrackerAdapter;
};
