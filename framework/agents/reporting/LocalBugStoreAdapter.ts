import { promises as fs } from "fs";
import path from "path";
import type {
  BugOccurrence,
  BugTrackerAdapter,
  LocalBugRecord,
  LocalBugRecordDraft
} from "./types";

type LocalBugIndex = {
  nextSequenceByDate: Record<string, number>;
  signatures: Record<string, string>;
  updatedAt: string | null;
};

type LocalBugStoreOptions = {
  now?: () => Date;
  rootDir?: string;
};

const defaultRootDir = path.join(
  process.cwd(),
  "docs",
  "obsidian-vault",
  "Reports",
  "Bug Reports"
);

function toRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function expectationLabel(source: LocalBugRecord["source"]) {
  if (source.kind !== "manual") {
    return source.scenario;
  }

  if (source.expectation.kind === "role") {
    return `${source.expectation.role}:${source.expectation.name}`;
  }

  return source.expectation.value;
}

function formatOccurrenceSummary(occurrence: BugOccurrence) {
  return [
    `- Seen at: ${occurrence.detectedAt}`,
    `- Source: ${occurrence.source.kind === "scenario" ? occurrence.source.scenario : occurrence.source.url}`,
    `- Expected: ${occurrence.expectedResult}`,
    `- Actual: ${occurrence.actualResult}`,
    `- Evidence: ${occurrence.artifactPaths.join(", ") || "none"}`
  ].join("\n");
}

function buildMarkdown(record: LocalBugRecord) {
  const classification = record.classification;
  const latest = record.history[record.history.length - 1];

  return [
    "---",
    "type: bug-report",
    `bug_id: ${record.id}`,
    `status: ${record.status}`,
    `tracker_mode: ${record.trackerMode}`,
    `severity: ${record.severity}`,
    `priority: ${record.priority}`,
    `component: ${record.component}`,
    `classification: ${classification.category}`,
    `occurrence_count: ${record.occurrenceCount}`,
    `created_at: ${record.createdAt}`,
    `last_seen_at: ${record.lastSeenAt}`,
    "---",
    "",
    `# ${record.id} - ${record.title}`,
    "",
    "## Summary",
    "",
    record.summary,
    "",
    "## Source",
    "",
    `- Kind: ${record.source.kind}`,
    `- Trigger: ${record.source.kind === "scenario" ? record.source.scenario : record.source.url}`,
    `- Expectation: ${expectationLabel(record.source)}`,
    "",
    "## Steps To Reproduce",
    "",
    ...record.stepsToReproduce.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Expected Result",
    "",
    record.expectedResult,
    "",
    "## Actual Result",
    "",
    record.actualResult,
    "",
    "## Classification",
    "",
    `- Category: ${classification.category}`,
    `- Confidence: ${classification.confidence}`,
    `- Explanation: ${classification.explanation}`,
    `- Signals: ${classification.signals.join(", ") || "none"}`,
    "",
    "## Suggested Permanent Fix",
    "",
    record.suggestedPermanentFix,
    "",
    "## Root Cause Hypothesis",
    "",
    record.rootCause,
    "",
    "## Evidence",
    "",
    ...latest.artifactPaths.map((artifactPath) => `- ${artifactPath}`),
    "",
    "## Confirmation Runs",
    "",
    ...latest.confirmationRuns.map((run, index) => {
      return [
        `### Run ${index + 1} - ${run.runLabel}`,
        `- Confirmed: ${run.confirmed ? "yes" : "no"}`,
        `- Started At: ${run.startedAt}`,
        `- Actual Result: ${run.actualResult}`,
        `- Classification: ${run.classification.category} (${run.classification.confidence})`,
        `- Root Cause: ${run.rootCause}`,
        `- Artifacts: ${run.artifactPaths.join(", ") || "none"}`
      ].join("\n");
    }),
    "",
    "## History",
    "",
    ...record.history.map((occurrence) => formatOccurrenceSummary(occurrence)),
    ""
  ].join("\n");
}

export class LocalBugStoreAdapter implements BugTrackerAdapter {
  readonly mode = "local" as const;

  private readonly now: () => Date;
  private readonly rootDir: string;

  constructor(options: LocalBugStoreOptions = {}) {
    this.now = options.now || (() => new Date());
    this.rootDir = options.rootDir || defaultRootDir;
  }

  async close(record: LocalBugRecord) {
    const updatedRecord = {
      ...record,
      lastSeenAt: this.now().toISOString(),
      status: "closed" as const
    };

    await this.writeRecord(updatedRecord);
    return updatedRecord;
  }

  async create(record: LocalBugRecordDraft & { patchProposal: LocalBugRecord["patchProposal"] }) {
    const index = await this.readIndex();
    const now = this.now();
    const iso = now.toISOString();
    const dateKey = iso.slice(0, 10).replace(/-/g, "");
    const nextSequence = (index.nextSequenceByDate[dateKey] || 0) + 1;
    const bugId = `BUG-${dateKey}-${String(nextSequence).padStart(3, "0")}`;
    const jsonPath = path.join(this.rootDir, `${bugId}.json`);
    const markdownPath = path.join(this.rootDir, `${bugId}.md`);

    const createdRecord: LocalBugRecord = {
      ...record,
      createdAt: iso,
      history: [record.occurrence],
      id: bugId,
      jsonPath: toRelativePath(jsonPath),
      lastSeenAt: iso,
      markdownPath: toRelativePath(markdownPath),
      occurrenceCount: 1,
      patchProposal: record.patchProposal,
      status: "open"
    };

    index.nextSequenceByDate[dateKey] = nextSequence;
    index.signatures[record.dedupeSignature] = bugId;
    index.updatedAt = iso;

    await this.writeRecord(createdRecord);
    await this.writeIndex(index);

    return createdRecord;
  }

  async findDuplicate(signature: string) {
    const index = await this.readIndex();
    const bugId = index.signatures[signature];

    if (!bugId) {
      return null;
    }

    return this.readRecordById(bugId);
  }

  async update(record: LocalBugRecord) {
    const updatedRecord = {
      ...record,
      lastSeenAt: this.now().toISOString(),
      occurrenceCount: record.history.length
    };

    await this.writeRecord(updatedRecord);
    return updatedRecord;
  }

  getIndexPath() {
    return path.join(this.rootDir, "index.json");
  }

  private async readIndex(): Promise<LocalBugIndex> {
    try {
      const raw = await fs.readFile(this.getIndexPath(), "utf8");
      const parsed = JSON.parse(raw);

      return {
        nextSequenceByDate: parsed.nextSequenceByDate || {},
        signatures: parsed.signatures || {},
        updatedAt: parsed.updatedAt || null
      };
    } catch {
      return {
        nextSequenceByDate: {},
        signatures: {},
        updatedAt: null
      };
    }
  }

  private async readRecordById(bugId: string): Promise<LocalBugRecord | null> {
    try {
      const raw = await fs.readFile(path.join(this.rootDir, `${bugId}.json`), "utf8");
      return JSON.parse(raw) as LocalBugRecord;
    } catch {
      return null;
    }
  }

  private async writeIndex(index: LocalBugIndex) {
    await fs.mkdir(this.rootDir, { recursive: true });
    await fs.writeFile(this.getIndexPath(), `${JSON.stringify(index, null, 2)}\n`);
  }

  private async writeRecord(record: LocalBugRecord) {
    await fs.mkdir(this.rootDir, { recursive: true });
    await fs.writeFile(
      path.join(this.rootDir, `${record.id}.json`),
      `${JSON.stringify(record, null, 2)}\n`
    );
    await fs.writeFile(path.join(this.rootDir, `${record.id}.md`), `${buildMarkdown(record)}\n`);
  }
}
