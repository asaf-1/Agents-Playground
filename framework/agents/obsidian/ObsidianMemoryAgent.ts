// The Obsidian memory agent: it writes notes into the Obsidian vault. A healing
// run goes to Reports/Healing/, a workspace state log to Reports/Workspace/,
// and a task note gets its "## Result" section filled in.

// Node's file and path tools.
import { promises as fs } from "fs";
import path from "path";

// One healing run: which agent and backend, the decision, the evidence, how it
// ended and how it was checked.
export type ObsidianHealingRunLog = {
  agentName: string;
  backendLabel: string;
  decision: Record<string, unknown> | null;
  evidencePaths?: string[];
  finalStatus: string;
  pageLabel?: string;
  scenario: string;
  validation: {
    command?: string;
    passed: boolean;
    summary: string;
  };
};

// Where a note was written, in full and from the repository root.
export type ObsidianWriteResult = {
  absolutePath: string;
  relativePath: string;
};

// A result to put into a task note.
export type ObsidianTaskResultUpdate = {
  resultMarkdown: string;
  taskPath: string;
};

// One changed file, for a workspace state log.
export type ObsidianWorkspaceFileChange = {
  description: string;
  path: string;
  status: "added" | "deleted" | "generated" | "modified";
};

// One check that was run, and its outcome.
export type ObsidianWorkspaceValidation = {
  command: string;
  outcome: string;
  passed: boolean;
};

// A workspace state log: what changed, the current state, decisions, docs
// updated, checks and next steps.
export type ObsidianWorkspaceStateLog = {
  changedFiles: ObsidianWorkspaceFileChange[];
  currentState: string[];
  decisions: string[];
  documentation: {
    agentMemoryUpdated: boolean;
    readmeUpdated: boolean;
    taskNoteUpdated: boolean;
    vaultNotesUpdated: string[];
  };
  nextActions: string[];
  summary: string;
  title: string;
  validations: ObsidianWorkspaceValidation[];
};

// Options: the vault folder (obsidian-vault/ by default).
type ObsidianMemoryAgentOptions = {
  vaultRoot?: string;
};

// Text made safe for a file name: lower case, dashes, at most 80 characters.
function sanitizeSegment(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "run"
  );
}

// A path from the repository root, with forward slashes.
function toRepoRelative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

// A value as a JSON code block for Markdown.
function formatJsonBlock(value: unknown) {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

// One agent per vault.
export class ObsidianMemoryAgent {
  private readonly vaultRoot: string;

  constructor(options: ObsidianMemoryAgentOptions = {}) {
    this.vaultRoot =
      options.vaultRoot || path.join(process.cwd(), "obsidian-vault");
  }

  // Writes one healing run as a new note.
  async writeHealingRunLog(
    log: ObsidianHealingRunLog,
  ): Promise<ObsidianWriteResult> {
    const dir = path.join(this.vaultRoot, "Reports", "Healing");
    const timestamp = new Date().toISOString();
    const fileName = `${timestamp.slice(0, 10)}-${sanitizeSegment(log.scenario)}-${Date.now()}.md`;
    const absolutePath = path.join(dir, fileName);
    const content = this.renderHealingRunLog(log, timestamp);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, content);

    return {
      absolutePath,
      relativePath: toRepoRelative(absolutePath),
    };
  }

  // Fills in a task note's "## Result" section, adding the section if missing.
  async updateTaskResult(
    update: ObsidianTaskResultUpdate,
  ): Promise<ObsidianWriteResult> {
    const absolutePath = path.isAbsolute(update.taskPath)
      ? update.taskPath
      : path.join(process.cwd(), update.taskPath);
    const raw = await fs.readFile(absolutePath, "utf-8");
    const marker = /^## Result\s*$/m;
    const match = marker.exec(raw);
    const resultMarkdown = update.resultMarkdown.trimEnd();
    const updated = match
      ? `${raw.slice(0, match.index + match[0].length)}\n\n${resultMarkdown}\n`
      : `${raw.trimEnd()}\n\n## Result\n\n${resultMarkdown}\n`;

    await fs.writeFile(absolutePath, updated);

    return {
      absolutePath,
      relativePath: toRepoRelative(absolutePath),
    };
  }

  // Writes one workspace state log as a new note.
  async writeWorkspaceStateLog(
    log: ObsidianWorkspaceStateLog,
  ): Promise<ObsidianWriteResult> {
    const dir = path.join(this.vaultRoot, "Reports", "Workspace");
    const timestamp = new Date().toISOString();
    const fileName = `${timestamp.slice(0, 10)}-${sanitizeSegment(log.title)}-${Date.now()}.md`;
    const absolutePath = path.join(dir, fileName);
    const content = this.renderWorkspaceStateLog(log, timestamp);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, content);

    return {
      absolutePath,
      relativePath: toRepoRelative(absolutePath),
    };
  }

  // The healing run note: front matter, summary, evidence and the decision.
  private renderHealingRunLog(log: ObsidianHealingRunLog, timestamp: string) {
    const lines = [
      "---",
      "type: healing-run",
      `scenario: ${log.scenario}`,
      `status: ${log.finalStatus}`,
      `created: ${timestamp}`,
      "---",
      "",
      `# Healing Run: ${log.scenario}`,
      "",
      "## Summary",
      "",
      `- Agent: ${log.agentName}`,
      `- Backend: ${log.backendLabel}`,
      `- Page: ${log.pageLabel || "unknown"}`,
      `- Final status: ${log.finalStatus}`,
      `- Validation: ${log.validation.passed ? "passed" : "failed"} - ${log.validation.summary}`,
      ...(log.validation.command
        ? [`- Validation command: \`${log.validation.command}\``]
        : []),
      "",
      "## Evidence",
      "",
      ...(log.evidencePaths?.length
        ? log.evidencePaths.map((artifactPath) => `- ${artifactPath}`)
        : ["- No external evidence paths were supplied."]),
      "",
      "## Decision",
      "",
      formatJsonBlock(log.decision || {}),
    ];

    return `${lines.join("\n")}\n`;
  }

  // The workspace state note, one section per part of the log.
  private renderWorkspaceStateLog(
    log: ObsidianWorkspaceStateLog,
    timestamp: string,
  ) {
    const lines = [
      "---",
      "type: workspace-state",
      `title: ${log.title}`,
      `created: ${timestamp}`,
      "---",
      "",
      `# Workspace State: ${log.title}`,
      "",
      "## Summary",
      "",
      log.summary,
      "",
      "## Current State",
      "",
      ...this.renderBulletList(log.currentState),
      "",
      "## Files Changed",
      "",
      ...this.renderFileChanges(log.changedFiles),
      "",
      "## Documentation Updated",
      "",
      `- README updated: ${log.documentation.readmeUpdated ? "yes" : "no"}`,
      `- Agent memory updated: ${log.documentation.agentMemoryUpdated ? "yes" : "no"}`,
      `- Task note updated: ${log.documentation.taskNoteUpdated ? "yes" : "no"}`,
      ...log.documentation.vaultNotesUpdated.map(
        (notePath) => `- Vault note: ${notePath}`,
      ),
      "",
      "## Decisions",
      "",
      ...this.renderBulletList(log.decisions),
      "",
      "## Validation",
      "",
      ...this.renderValidations(log.validations),
      "",
      "## Next Actions",
      "",
      ...this.renderBulletList(log.nextActions),
    ];

    return `${lines.join("\n")}\n`;
  }

  // A bullet list, or "None recorded."
  private renderBulletList(items: string[]) {
    return items.length > 0
      ? items.map((item) => `- ${item}`)
      : ["- None recorded."];
  }

  // One bullet per changed file, or "No file changes recorded."
  private renderFileChanges(changes: ObsidianWorkspaceFileChange[]) {
    return changes.length > 0
      ? changes.map(
          (change) =>
            `- ${change.status}: \`${change.path}\` - ${change.description}`,
        )
      : ["- No file changes recorded."];
  }

  // One bullet per check, or "No validation recorded."
  private renderValidations(validations: ObsidianWorkspaceValidation[]) {
    return validations.length > 0
      ? validations.map((validation) => {
          return `- ${validation.passed ? "passed" : "failed"}: \`${validation.command}\` - ${validation.outcome}`;
        })
      : ["- No validation recorded."];
  }
}
