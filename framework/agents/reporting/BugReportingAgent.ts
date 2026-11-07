// The bug-reporting agent. It turns a scenario's finding, or a manual check of
// a page, into a local bug record, but only after the bug shows up again on
// every confirmation run (3 by default). A bug seen before is updated, not
// filed twice. Records stay local, in the Obsidian vault; no outside ticket is
// opened.

// Node's file and path tools, and Playwright's browser (each confirmation run
// opens its own).
import { promises as fs } from "fs";
import path from "path";
import { chromium } from "playwright";
// The scenario report, the classifier and fix proposer, and the page checker.
import type { ScenarioReport } from "../../reporting/types";
import { FailureClassifier } from "../diagnosis/FailureClassifier";
import { PatchProposalAgent } from "../diagnosis/PatchProposalAgent";
import type {
  FailureClassification,
  FailureSignalInput,
  PatchProposal,
} from "../diagnosis/types";
import { PageValidationAgent } from "../validation/PageValidationAgent";
import { productPageContract } from "../validation/contracts";
// The known scenario bugs, the local store, and the shapes.
import { getScenarioBugDefinition } from "./catalog";
import { LocalBugStoreAdapter } from "./LocalBugStoreAdapter";
import type {
  ApiResponseCheck,
  BugConfirmationRun,
  BugReportingAgentOptions,
  BugReportingResult,
  BugSource,
  ContractFailureCheck,
  LocalBugRecord,
  ManualBugRequest,
  ManualExpectation,
  PageExpectationCheck,
  PriorityLevel,
  ScenarioBugDefinition,
  SeverityLevel,
} from "./types";

// Where scenario artifacts are read from, and where confirmation runs write.
const defaultScenarioArtifactsRoot = path.join(
  process.cwd(),
  ".artifacts",
  "scenarios",
);
const defaultConfirmationArtifactsRoot = path.join(
  process.cwd(),
  ".artifacts",
  "bug-reports",
);

// True for a real object (not null).
function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

// A path from the repository root, with forward slashes.
function toRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

// Text made safe for a folder name.
function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// What a manual check expects, as one string.
function stringifyExpectation(expectation: ManualExpectation) {
  if (expectation.kind === "role") {
    return `${expectation.role}:${expectation.name}`;
  }

  return expectation.value;
}

// The classification the scenario already wrote in its report, if any.
function readExistingClassification(
  report: ScenarioReport,
): FailureClassification | null {
  const evidence = isObject(report.evidence) ? report.evidence : {};
  const direct = evidence.classification;

  if (isObject(direct) && typeof direct.category === "string") {
    return direct as FailureClassification;
  }

  return null;
}

// A timestamp safe for a folder name.
function nowStamp(now: Date) {
  return now.toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
}

// A value from an object by a dotted path, such as "problem.field".
function getJsonPathValue(payload: Record<string, any>, fieldPath: string) {
  return fieldPath.split(".").reduce<unknown>((current, segment) => {
    if (!isObject(current)) {
      return undefined;
    }

    return current[segment];
  }, payload);
}

// A confirmation run, with the folder its evidence waits in.
type ConfirmationRunInternal = BugConfirmationRun & {
  pendingDir: string;
};

// A run's evidence after it moved to its final folder.
type FinalizedRunArtifacts = {
  artifactPaths: string[];
  pendingDir: string;
};

// One agent per app address and store.
export class BugReportingAgent {
  private readonly baseUrl: string;
  private readonly catalogEntries: ScenarioBugDefinition[];
  private readonly classifier = new FailureClassifier();
  private readonly confirmationArtifactsRoot: string;
  private readonly patchAgent = new PatchProposalAgent();
  private readonly rerunCount: number;
  private readonly scenarioArtifactsRoot: string;
  private readonly trackerAdapter;

  // Settings, or their defaults: the local app, 3 confirmation runs, the local
  // store.
  constructor(options: BugReportingAgentOptions = {}) {
    this.baseUrl = options.baseUrl || "http://127.0.0.1:4173";
    this.catalogEntries = options.catalogEntries || [];
    this.confirmationArtifactsRoot =
      options.confirmationArtifactsRoot || defaultConfirmationArtifactsRoot;
    this.rerunCount = options.rerunCount || 3;
    this.scenarioArtifactsRoot =
      options.scenarioArtifactsRoot || defaultScenarioArtifactsRoot;
    this.trackerAdapter = options.trackerAdapter || new LocalBugStoreAdapter();
  }

  // Reports a manual check: open a page and see whether it shows what it
  // should.
  async reportManualCheck(
    request: ManualBugRequest,
  ): Promise<BugReportingResult> {
    // The first look.
    const check = this.buildManualCheck(request);
    const initialRun = await this.runPageExpectationCheck(
      check,
      0,
      `${slugify(check.pageLabel)}-manual-initial`,
    );

    // It looked fine: no bug, and a summary says so.
    if (!initialRun.confirmed) {
      const summaryPath = await this.writeUnconfirmedSummary(
        {
          classification: initialRun.classification,
          confirmationRuns: [],
          message:
            "No product defect was detected on the initial manual check.",
          outcome: "no-issue-detected",
          source: "manual",
          trackerMode: this.trackerAdapter.mode,
        },
        "manual-no-issue-detected",
      );

      return {
        confirmationRuns: [],
        message: `No bug recorded. Manual check passed on the initial run. Summary: ${summaryPath}`,
        outcome: "no-issue-detected",
        source: "manual",
        trackerMode: this.trackerAdapter.mode,
      };
    }

    // It looked wrong: confirm it again, several times.
    const confirmationRuns = await this.runPageExpectationReruns(
      check,
      this.resolveRerunCount(request.rerunCount),
      slugify(check.pageLabel),
    );

    const allConfirmed = confirmationRuns.every((run) => run.confirmed);
    const classification = initialRun.classification;
    const patchProposal = initialRun.patchProposal;
    const rootCause = initialRun.rootCause;
    const pendingDirs = [
      initialRun.pendingDir,
      ...confirmationRuns.map((run) => run.pendingDir),
    ];

    // Not wrong every time: no bug; the runs are kept as "unconfirmed".
    if (!allConfirmed) {
      const summaryPath = await this.finalizeUnconfirmedSession(
        pendingDirs,
        {
          classification,
          confirmationRuns,
          message:
            "No local bug record was created because the manual defect did not reproduce on every confirmation rerun.",
          outcome: "unconfirmed",
          source: "manual",
          trackerMode: this.trackerAdapter.mode,
        },
        `manual-${slugify(check.pageLabel)}`,
      );

      return {
        classification,
        confirmationRuns,
        message: `No bug recorded. Confirmation diverged. Summary: ${summaryPath}`,
        outcome: "unconfirmed",
        source: "manual",
        trackerMode: this.trackerAdapter.mode,
      };
    }

    // Wrong every time: file it (or update the bug already filed).
    const source: BugSource = {
      expectation: request.expectation,
      initialArtifactPaths: initialRun.artifactPaths,
      initialFailure: initialRun.actualResult,
      kind: "manual",
      url: request.url,
    };
    const titleBase = `Missing expected ${request.expectation.kind} on ${request.url}`;
    const title = this.composeTitle(titleBase, classification, "S3");
    const dedupeSignature = [
      "manual",
      check.signatureKey,
      classification.category,
      stringifyExpectation(request.expectation),
    ].join("|");

    return this.persistTrackedBug({
      actualResult: initialRun.actualResult,
      classification,
      component: request.component || check.pageLabel,
      confirmationRuns,
      dedupeSignature,
      expectedResult: check.expectedResult,
      initialRun,
      notes: request.notes,
      patchProposal,
      pendingDirs,
      priority: "P2",
      rootCause,
      severity: "S3",
      source,
      stepsToReproduce: check.steps,
      suggestedPermanentFix: patchProposal.recommendedPermanentFixDirection,
      summary:
        "The manual website check repeatedly failed across the initial detection and all confirmation reruns, so the product defect was promoted into a local tracked bug record.",
      title,
    });
  }

  // Reports what a scenario found.
  async reportScenario(scenario: string): Promise<BugReportingResult> {
    const report = await this.readScenarioReport(scenario);
    const definition = getScenarioBugDefinition(scenario, this.catalogEntries);

    // Skip a scenario with no catalog entry, one marked not a product bug, or
    // one that ended in a status the entry does not cover.
    if (!definition) {
      return {
        confirmationRuns: [],
        message: `Skipped ${scenario}. No bug-candidate catalog entry exists for this scenario.`,
        outcome: "skipped",
        source: "scenario",
        trackerMode: this.trackerAdapter.mode,
      };
    }

    if (!definition.productBugCandidate) {
      return {
        confirmationRuns: [],
        message: `Skipped ${scenario}. The catalog marks it as automation-only rather than a product bug.`,
        outcome: "skipped",
        source: "scenario",
        trackerMode: this.trackerAdapter.mode,
      };
    }

    if (!definition.allowedFinalStatuses.includes(report.finalStatus)) {
      return {
        confirmationRuns: [],
        message: `Skipped ${scenario}. Final status "${report.finalStatus}" is not eligible for bug tracking.`,
        outcome: "skipped",
        source: "scenario",
        trackerMode: this.trackerAdapter.mode,
      };
    }

    // The failure's class (the report's own, if it has one) and the proposed
    // fix.
    const failureInput = this.buildScenarioFailureInput(report, definition);
    const classification =
      readExistingClassification(report) ||
      this.classifier.classify(failureInput);
    const patchProposal = this.patchAgent.propose({
      ...failureInput,
      classification,
      pageLabel: definition.confirmation.pageLabel,
      scenario,
    });
    // The scenario's evidence, then the confirmation runs.
    const initialArtifactPaths = await this.getScenarioArtifactPaths(scenario);
    const rerunCount = this.resolveRerunCount();
    const sessionSlug = `${slugify(scenario)}-${nowStamp(new Date())}`;

    const confirmationRuns = await this.runScenarioConfirmationReruns(
      definition.confirmation,
      rerunCount,
      sessionSlug,
    );
    const pendingDirs = confirmationRuns.map((run) => run.pendingDir);
    const allConfirmed = confirmationRuns.every((run) => run.confirmed);

    // Not confirmed every time: no bug; the runs are kept as "unconfirmed".
    if (!allConfirmed) {
      const summaryPath = await this.finalizeUnconfirmedSession(
        pendingDirs,
        {
          classification,
          confirmationRuns,
          message:
            "No local bug record was created because the scenario defect did not reproduce on every confirmation rerun.",
          outcome: "unconfirmed",
          source: "scenario",
          trackerMode: this.trackerAdapter.mode,
        },
        scenario,
      );

      return {
        classification,
        confirmationRuns,
        message: `No bug recorded for ${scenario}. Confirmation diverged. Summary: ${summaryPath}`,
        outcome: "unconfirmed",
        source: "scenario",
        trackerMode: this.trackerAdapter.mode,
      };
    }

    // Confirmed every time: file it with its severity, priority, title, cause,
    // and a signature to find it again next time.
    const severity =
      definition.defaultSeverity || this.mapSeverity(classification);
    const priority =
      definition.defaultPriority || this.mapPriority(classification);
    const source: BugSource = {
      finalStatus: report.finalStatus,
      initialArtifactPaths,
      initialFailure: report.initialFailure,
      kind: "scenario",
      scenario,
    };
    const title = this.composeTitle(definition.title, classification, severity);
    const rootCause =
      report.agentDecision ||
      report.initialFailure ||
      classification.explanation;
    const dedupeSignature = [
      "scenario",
      scenario,
      definition.confirmation.signatureKey,
      classification.category,
    ].join("|");

    return this.persistTrackedBug({
      actualResult: definition.confirmation.actualResult,
      classification,
      component: definition.confirmation.pageLabel,
      confirmationRuns,
      dedupeSignature,
      expectedResult: definition.confirmation.expectedResult,
      initialRun: null,
      notes: definition.notes,
      patchProposal,
      pendingDirs,
      priority,
      rootCause,
      severity,
      source,
      stepsToReproduce: definition.confirmation.steps,
      suggestedPermanentFix:
        report.suggestedPermanentFix ||
        patchProposal.recommendedPermanentFixDirection,
      summary:
        "The scenario artifact represented a real product-bug candidate and the underlying defect reproduced on every confirmation rerun, so the issue was promoted into a local tracked bug record.",
      title,
    });
  }

  // The page check a manual report runs.
  private buildManualCheck(request: ManualBugRequest): PageExpectationCheck {
    const expectationDescription =
      request.expectation.kind === "role"
        ? `${request.expectation.role} "${request.expectation.name}"`
        : `${request.expectation.kind} "${request.expectation.value}"`;
    const pageLabel =
      request.component || this.safePageLabelFromUrl(request.url);

    return {
      actualResult: `The page did not show the expected ${expectationDescription}.`,
      expectedResult: `The page should show the expected ${expectationDescription}.`,
      expectation: request.expectation,
      kind: "page-expectation",
      pageLabel,
      path: request.url,
      settleMs: 1200,
      signatureKey: `manual-${slugify(request.url)}-${slugify(expectationDescription)}`,
      steps: [
        `Open ${request.url}.`,
        `Wait for the page to finish rendering.`,
        `Check whether ${expectationDescription} is visible.`,
      ],
    };
  }

  // The failure's signals: the catalog's own reader, or the report's first
  // failure.
  private buildScenarioFailureInput(
    report: ScenarioReport,
    definition: ScenarioBugDefinition,
  ): FailureSignalInput {
    if (definition.buildFailureInput) {
      return definition.buildFailureInput(report);
    }

    return {
      errorMessage: report.initialFailure,
    };
  }

  // A title that starts with the class and the severity.
  private composeTitle(
    titleBase: string,
    classification: FailureClassification,
    severity: SeverityLevel,
  ) {
    return `[${classification.category} | ${severity}] ${titleBase}`;
  }

  // A folder for one run's evidence while the bug is not confirmed yet.
  private async createPendingRunDir(sessionKey: string, runLabel: string) {
    const pendingDir = path.join(
      this.confirmationArtifactsRoot,
      "pending",
      sessionKey,
      slugify(runLabel),
    );
    await fs.mkdir(pendingDir, { recursive: true });
    return pendingDir;
  }

  // Moves every run's evidence into the bug's folder for this sighting.
  private async finalizePendingDirs(pendingDirs: string[], bugId: string) {
    const occurrenceDir = path.join(
      this.confirmationArtifactsRoot,
      bugId,
      nowStamp(new Date()),
    );
    await fs.mkdir(path.dirname(occurrenceDir), { recursive: true });

    const finalizedRuns: FinalizedRunArtifacts[] = [];

    for (const pendingDir of pendingDirs) {
      const targetDir = path.join(occurrenceDir, path.basename(pendingDir));
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      await fs.cp(pendingDir, targetDir, { recursive: true });
      await fs.rm(pendingDir, { force: true, recursive: true });
      finalizedRuns.push({
        artifactPaths: await this.listArtifacts(targetDir),
        pendingDir,
      });
    }

    return {
      artifactDir: toRelativePath(occurrenceDir),
      finalizedRuns,
    };
  }

  // Moves the runs of an unconfirmed bug to "unconfirmed/" with a summary.
  private async finalizeUnconfirmedSession(
    pendingDirs: string[],
    result: Omit<BugReportingResult, "message"> & { message: string },
    slugSeed: string,
  ) {
    const targetRoot = path.join(
      this.confirmationArtifactsRoot,
      "unconfirmed",
      `${slugify(slugSeed)}-${nowStamp(new Date())}`,
    );

    await fs.mkdir(targetRoot, { recursive: true });

    for (const pendingDir of pendingDirs) {
      const targetDir = path.join(targetRoot, path.basename(pendingDir));
      await fs.cp(pendingDir, targetDir, { recursive: true });
      await fs.rm(pendingDir, { force: true, recursive: true });
    }

    const summaryPath = path.join(targetRoot, "summary.json");
    await fs.writeFile(summaryPath, `${JSON.stringify(result, null, 2)}\n`);
    return toRelativePath(summaryPath);
  }

  // The scenario's own files that exist: report, screenshot, trace.
  private async getScenarioArtifactPaths(scenario: string) {
    const scenarioDir = path.join(this.scenarioArtifactsRoot, scenario);
    const fileNames = ["report.json", "final.png", "trace.zip"];
    const paths: string[] = [];

    for (const fileName of fileNames) {
      const filePath = path.join(scenarioDir, fileName);
      try {
        await fs.access(filePath);
        paths.push(toRelativePath(filePath));
      } catch {
        // ignore missing artifact files
      }
    }

    return paths;
  }

  // The default priority for a kind of failure: P2 for API, render and loading
  // failures, P3 otherwise.
  private mapPriority(classification: FailureClassification): PriorityLevel {
    switch (classification.category) {
      case "api-contract-drift":
      case "api-server-error":
      case "api-timeout":
      case "ui-contract-or-render":
      case "ui-loading-or-network":
        return "P2";
      default:
        return "P3";
    }
  }

  // The default severity, by the same rule: S2 or S3.
  private mapSeverity(classification: FailureClassification): SeverityLevel {
    switch (classification.category) {
      case "api-contract-drift":
      case "api-server-error":
      case "api-timeout":
      case "ui-contract-or-render":
      case "ui-loading-or-network":
        return "S2";
      default:
        return "S3";
    }
  }

  // Moves the evidence and saves the bug again with the final paths.
  private async moveAndUpdateRecord(
    record: LocalBugRecord,
    pendingDirs: string[],
    initialRun: ConfirmationRunInternal | null,
  ) {
    const finalized = await this.finalizePendingDirs(pendingDirs, record.id);
    const latest = record.history[record.history.length - 1];
    const finalizedRuns = finalized.finalizedRuns;
    const initialArtifacts = initialRun
      ? finalizedRuns[0]?.artifactPaths || []
      : [];
    const confirmationRuns = latest.confirmationRuns.map((run, index) => {
      const finalizedRun = finalizedRuns[initialRun ? index + 1 : index];

      return {
        ...run,
        artifactPaths: finalizedRun?.artifactPaths || run.artifactPaths,
      };
    });
    const movedArtifacts = [
      ...initialArtifacts,
      ...confirmationRuns.flatMap((run) => run.artifactPaths),
    ];
    const updatedHistory = [
      ...record.history.slice(0, -1),
      {
        ...latest,
        artifactPaths: movedArtifacts,
        confirmationRuns,
      },
    ];
    const updatedSource =
      initialRun && record.source.kind === "manual"
        ? {
            ...record.source,
            initialArtifactPaths: initialArtifacts,
          }
        : record.source;

    const updatedRecord = await this.trackerAdapter.update({
      ...record,
      actualResult: latest.actualResult,
      history: updatedHistory,
      lastSeenAt: new Date().toISOString(),
      source: updatedSource,
    });

    return {
      artifactDir: finalized.artifactDir,
      confirmationRuns,
      record: updatedRecord,
    };
  }

  // Every file in a folder, from the repository root.
  private async listArtifacts(absoluteDir: string) {
    const entries = await fs.readdir(absoluteDir);
    return entries
      .map((entry) => toRelativePath(path.join(absoluteDir, entry)))
      .sort();
  }

  // A full address from a path, using the app's address.
  private normalizeTargetUrl(urlOrPath: string) {
    if (/^https?:\/\//i.test(urlOrPath)) {
      return urlOrPath;
    }

    return new URL(urlOrPath, this.baseUrl).toString();
  }

  // Saves a confirmed bug: updates the one already filed under its signature,
  // or files a new one.
  private async persistTrackedBug(input: {
    actualResult: string;
    classification: FailureClassification;
    component: string;
    confirmationRuns: ConfirmationRunInternal[];
    dedupeSignature: string;
    expectedResult: string;
    initialRun: ConfirmationRunInternal | null;
    notes?: string;
    patchProposal: PatchProposal;
    pendingDirs: string[];
    priority: PriorityLevel;
    rootCause: string;
    severity: SeverityLevel;
    source: BugSource;
    stepsToReproduce: string[];
    suggestedPermanentFix: string;
    summary: string;
    title: string;
  }): Promise<BugReportingResult> {
    // This sighting.
    const draftOccurrence = {
      actualResult: input.actualResult,
      artifactPaths: [],
      confirmationRuns: input.confirmationRuns.map((run) => ({
        ...run,
        artifactPaths: [],
      })),
      detectedAt: new Date().toISOString(),
      expectedResult: input.expectedResult,
      notes: input.notes,
      source: input.source,
    };
    const existing = await this.trackerAdapter.findDuplicate(
      input.dedupeSignature,
    );

    // Seen before: add the sighting to that bug.
    if (existing) {
      const updated = await this.moveAndUpdateRecord(
        {
          ...existing,
          actualResult: input.actualResult,
          history: [...existing.history, draftOccurrence],
          lastSeenAt: new Date().toISOString(),
          occurrenceCount: existing.history.length + 1,
        },
        input.pendingDirs,
        input.initialRun,
      );

      return {
        bugId: updated.record.id,
        bugPaths: {
          artifactDir: updated.artifactDir,
          indexPath: toRelativePath(this.trackerAdapter.getIndexPath()),
          jsonPath: updated.record.jsonPath,
          markdownPath: updated.record.markdownPath,
        },
        classification: input.classification,
        confirmationRuns: updated.confirmationRuns,
        message: `Updated local bug ${updated.record.id} with a new confirmed occurrence.`,
        outcome: "updated",
        source: input.source.kind,
        trackerMode: this.trackerAdapter.mode,
      };
    }

    // New: file it, then move its evidence.
    const created = await this.trackerAdapter.create({
      actualResult: input.actualResult,
      classification: input.classification,
      component: input.component,
      dedupeSignature: input.dedupeSignature,
      expectedResult: input.expectedResult,
      occurrence: draftOccurrence,
      patchProposal: input.patchProposal,
      priority: input.priority,
      rootCause: input.rootCause,
      severity: input.severity,
      source: input.source,
      stepsToReproduce: input.stepsToReproduce,
      suggestedPermanentFix: input.suggestedPermanentFix,
      summary: input.summary,
      title: input.title,
      trackerMode: "local",
    });
    const finalizedCreated = await this.moveAndUpdateRecord(
      created,
      input.pendingDirs,
      input.initialRun,
    );

    return {
      bugId: finalizedCreated.record.id,
      bugPaths: {
        artifactDir: finalizedCreated.artifactDir,
        indexPath: toRelativePath(this.trackerAdapter.getIndexPath()),
        jsonPath: finalizedCreated.record.jsonPath,
        markdownPath: finalizedCreated.record.markdownPath,
      },
      classification: input.classification,
      confirmationRuns: finalizedCreated.confirmationRuns,
      message: `Created local bug ${finalizedCreated.record.id}.`,
      outcome: "created",
      source: input.source.kind,
      trackerMode: this.trackerAdapter.mode,
    };
  }

  // The scenario's report.json.
  private async readScenarioReport(scenario: string) {
    const raw = await fs.readFile(
      path.join(this.scenarioArtifactsRoot, scenario, "report.json"),
      "utf8",
    );
    return JSON.parse(raw) as ScenarioReport;
  }

  // The number of confirmation runs: as asked, or the default.
  private resolveRerunCount(override?: number) {
    return typeof override === "number" && override > 0
      ? override
      : this.rerunCount;
  }

  // One API confirmation: call the API again and check its status and fields.
  private async runApiResponseCheck(
    check: ApiResponseCheck,
    runIndex: number,
    sessionKey: string,
  ): Promise<ConfirmationRunInternal> {
    const startedAt = new Date().toISOString();
    const pendingDir = await this.createPendingRunDir(
      sessionKey,
      `run-${runIndex}`,
    );
    const response = await fetch(this.normalizeTargetUrl(check.path), {
      body: check.body ? JSON.stringify(check.body) : undefined,
      headers: check.body ? { "Content-Type": "application/json" } : undefined,
      method: check.method,
    });
    const rawBody = await response.text();
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const matchesFields = (check.expectedJsonFields || []).every((field) => {
      return getJsonPathValue(parsedBody, field.path) === field.value;
    });
    // Confirmed when the status and every expected field match.
    const confirmed =
      response.status === check.expectedFailureStatus && matchesFields;
    const failureInput: FailureSignalInput = {
      errorMessage: check.actualResult,
      requestUrl: check.path,
      responseBody: parsedBody,
      responseStatus: response.status,
    };
    const classification = this.classifier.classify(failureInput);
    const patchProposal = this.patchAgent.propose({
      ...failureInput,
      classification,
      apiRoute: check.path,
      pageLabel: check.pageLabel,
    });
    // Save the answer and a summary as the run's evidence.
    const responsePath = path.join(pendingDir, "response.json");
    const summaryPath = path.join(pendingDir, "summary.json");
    await fs.writeFile(
      responsePath,
      `${JSON.stringify(parsedBody, null, 2)}\n`,
    );
    await fs.writeFile(
      summaryPath,
      `${JSON.stringify(
        {
          confirmed,
          responseStatus: response.status,
          startedAt,
        },
        null,
        2,
      )}\n`,
    );

    // What the run found.
    return {
      actualResult: confirmed
        ? check.actualResult
        : `API confirmation diverged on run ${runIndex}: received ${response.status} instead of ${check.expectedFailureStatus}.`,
      artifactPaths: [responsePath, summaryPath].map(toRelativePath),
      classification,
      confirmed,
      patchProposal,
      pendingDir,
      rootCause: classification.explanation,
      runLabel: `confirmation-${runIndex}`,
      startedAt,
    };
  }

  // One contract confirmation: open the page in a fresh browser and check it
  // against the product contract.
  private async runContractFailureCheck(
    check: ContractFailureCheck,
    runIndex: number,
    sessionKey: string,
  ): Promise<ConfirmationRunInternal> {
    const startedAt = new Date().toISOString();
    const pendingDir = await this.createPendingRunDir(
      sessionKey,
      `run-${runIndex}`,
    );
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.goto(this.normalizeTargetUrl(check.path), {
        waitUntil: "networkidle",
      });
      const validationAgent = new PageValidationAgent(page as any);
      const contractResult =
        await validationAgent.validateContract(productPageContract);
      // Confirmed when the page fails for every expected reason.
      const confirmed =
        !contractResult.valid &&
        check.expectedIssueTokens.every((token) => {
          return contractResult.issues.some((issue) => issue.includes(token));
        });
      const screenshotPath = path.join(pendingDir, "page.png");
      const domPath = path.join(pendingDir, "dom.html");
      const validationPath = path.join(pendingDir, "validation.json");
      // The failure's signals, class and proposed fix.
      const failureInput: FailureSignalInput = {
        errorMessage: contractResult.explanation,
        forbiddenTextMatches: Array.isArray(
          contractResult.evidence.forbiddenTextMatches,
        )
          ? (contractResult.evidence.forbiddenTextMatches as string[])
          : [],
        invalidNumericFields: Array.isArray(
          contractResult.evidence.invalidNumericFields,
        )
          ? (contractResult.evidence.invalidNumericFields as string[])
          : [],
        overlapPairs: Array.isArray(contractResult.evidence.overlapPairs)
          ? (contractResult.evidence.overlapPairs as string[])
          : [],
      };
      const classification = this.classifier.classify(failureInput);
      const patchProposal = this.patchAgent.propose({
        ...failureInput,
        classification,
        pageLabel: check.pageLabel,
      });

      // Save a screenshot, the page's HTML and the check's result.
      await page.screenshot({ fullPage: true, path: screenshotPath });
      await fs.writeFile(domPath, await page.content());
      await fs.writeFile(
        validationPath,
        `${JSON.stringify(contractResult, null, 2)}\n`,
      );

      // What the run found.
      return {
        actualResult: confirmed
          ? check.actualResult
          : `Contract confirmation diverged on run ${runIndex}: the expected broken product signals were not all present.`,
        artifactPaths: [screenshotPath, domPath, validationPath].map(
          toRelativePath,
        ),
        classification,
        confirmed,
        patchProposal,
        pendingDir,
        rootCause: contractResult.explanation,
        runLabel: `confirmation-${runIndex}`,
        startedAt,
      };
      // Always close the browser.
    } finally {
      await browser.close();
    }
  }

  // One page confirmation: open the page in a fresh browser and look for what
  // it should show.
  private async runPageExpectationCheck(
    check: PageExpectationCheck,
    runIndex: number,
    sessionKey: string,
  ): Promise<ConfirmationRunInternal> {
    const startedAt = new Date().toISOString();
    const pendingDir = await this.createPendingRunDir(
      sessionKey,
      `run-${runIndex}`,
    );
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.goto(this.normalizeTargetUrl(check.path), {
        waitUntil: "domcontentloaded",
      });
      // Let the page settle.
      if (check.settleMs) {
        await page.waitForTimeout(check.settleMs);
      } else {
        await page.waitForLoadState("networkidle").catch(() => undefined);
      }

      // Is the expected thing there? Is an error hint showing?
      const locator = this.buildExpectationLocator(
        page as any,
        check.expectation,
      );
      const isVisible = await locator
        .first()
        .isVisible()
        .catch(() => false);
      const errorHintVisible = check.errorHintTestId
        ? await page
            .getByTestId(check.errorHintTestId)
            .isVisible()
            .catch(() => false)
        : false;
      // The failure's signals, class and proposed fix.
      const failureInput = this.buildPageExpectationFailureInput(
        check.expectation,
        errorHintVisible,
      );
      const classification = this.classifier.classify(failureInput);
      const patchProposal = this.patchAgent.propose({
        ...failureInput,
        classification,
        pageLabel: check.pageLabel,
      });
      // Save a screenshot, the HTML and a summary.
      const screenshotPath = path.join(pendingDir, "page.png");
      const domPath = path.join(pendingDir, "dom.html");
      const summaryPath = path.join(pendingDir, "summary.json");

      await page.screenshot({ fullPage: true, path: screenshotPath });
      await fs.writeFile(domPath, await page.content());
      await fs.writeFile(
        summaryPath,
        `${JSON.stringify(
          {
            confirmed: !isVisible,
            errorHintVisible,
            expectation: check.expectation,
            startedAt,
          },
          null,
          2,
        )}\n`,
      );

      // Confirmed when the expected thing is missing.
      return {
        actualResult: !isVisible
          ? errorHintVisible
            ? `${check.actualResult} Error hint "${check.errorHintTestId}" was also visible.`
            : check.actualResult
          : `Page confirmation diverged on run ${runIndex}: the expected UI signal was visible.`,
        artifactPaths: [screenshotPath, domPath, summaryPath].map(
          toRelativePath,
        ),
        classification,
        confirmed: !isVisible,
        patchProposal,
        pendingDir,
        rootCause: classification.explanation,
        runLabel: runIndex === 0 ? "initial-check" : `confirmation-${runIndex}`,
        startedAt,
      };
      // Always close the browser.
    } finally {
      await browser.close();
    }
  }

  // The manual check's confirmation runs, one after another.
  private async runPageExpectationReruns(
    check: PageExpectationCheck,
    rerunCount: number,
    sessionKey: string,
  ) {
    const runs: ConfirmationRunInternal[] = [];

    for (let index = 1; index <= rerunCount; index += 1) {
      runs.push(await this.runPageExpectationCheck(check, index, sessionKey));
    }

    return runs;
  }

  // The scenario's confirmation runs, by the kind of check.
  private async runScenarioConfirmationReruns(
    check: ScenarioBugDefinition["confirmation"],
    rerunCount: number,
    sessionKey: string,
  ) {
    const runs: ConfirmationRunInternal[] = [];

    for (let index = 1; index <= rerunCount; index += 1) {
      if (check.kind === "api-response") {
        runs.push(await this.runApiResponseCheck(check, index, sessionKey));
      } else if (check.kind === "contract-failure") {
        runs.push(await this.runContractFailureCheck(check, index, sessionKey));
      } else {
        runs.push(await this.runPageExpectationCheck(check, index, sessionKey));
      }
    }

    return runs;
  }

  // A readable page name from its address.
  private safePageLabelFromUrl(urlOrPath: string) {
    try {
      const url = new URL(urlOrPath, this.baseUrl);
      return url.pathname === "/" ? "Home Page" : url.pathname;
    } catch {
      return urlOrPath;
    }
  }

  // A locator for what the page should show.
  private buildExpectationLocator(page: any, expectation: ManualExpectation) {
    switch (expectation.kind) {
      case "testid":
        return page.getByTestId(expectation.value);
      case "text":
        return page.getByText(expectation.value, { exact: false });
      case "role":
        return page.getByRole(expectation.role as any, {
          name: expectation.name,
        });
      default:
        return page.locator("never-matches");
    }
  }

  // The failure's signals for a missing test id, text or role.
  private buildPageExpectationFailureInput(
    expectation: ManualExpectation,
    errorHintVisible: boolean,
  ): FailureSignalInput {
    switch (expectation.kind) {
      case "testid":
        return {
          errorMessage: `Expected data-testid "${expectation.value}" was not visible.`,
          failedRequests: errorHintVisible ? 1 : 0,
          missingElements: [expectation.value],
        };
      case "text":
        return {
          errorMessage: `Expected text "${expectation.value}" was not visible.`,
          missingTextTokens: [expectation.value],
        };
      case "role":
        return {
          errorMessage: `Expected role "${expectation.role}" named "${expectation.name}" was not visible.`,
          missingRoles: [`${expectation.role}:${expectation.name}`],
        };
      default:
        return {
          errorMessage: "Expected UI signal was not visible.",
        };
    }
  }

  // Writes the summary for a manual check that found nothing.
  private async writeUnconfirmedSummary(
    result: Omit<BugReportingResult, "message"> & { message: string },
    slugSeed: string,
  ) {
    const targetDir = path.join(
      this.confirmationArtifactsRoot,
      "unconfirmed",
      `${slugify(slugSeed)}-${nowStamp(new Date())}`,
    );
    await fs.mkdir(targetDir, { recursive: true });
    const summaryPath = path.join(targetDir, "summary.json");
    await fs.writeFile(summaryPath, `${JSON.stringify(result, null, 2)}\n`);
    return toRelativePath(summaryPath);
  }
}
