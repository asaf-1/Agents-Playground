import { promises as fs } from "fs";
import path from "path";

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

export type ObsidianWriteResult = {
  absolutePath: string;
  relativePath: string;
};

export type ObsidianTaskResultUpdate = {
  resultMarkdown: string;
  taskPath: string;
};

export type ObsidianWorkspaceFileChange = {
  description: string;
  path: string;
  status: "added" | "deleted" | "generated" | "modified";
};

export type ObsidianWorkspaceValidation = {
  command: string;
  outcome: string;
  passed: boolean;
};

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

type ObsidianMemoryAgentOptions = {
  vaultRoot?: string;
};

function sanitizeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "run";
}

function toRepoRelative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function formatJsonBlock(value: unknown) {
  return [
    "```json",
    JSON.stringify(value, null, 2),
    "```"
  ].join("\n");
}

export class ObsidianMemoryAgent {
  private readonly vaultRoot: string;

  constructor(options: ObsidianMemoryAgentOptions = {}) {
    this.vaultRoot = options.vaultRoot || path.join(process.cwd(), "docs", "obsidian-vault");
  }

  async writeHealingRunLog(log: ObsidianHealingRunLog): Promise<ObsidianWriteResult> {
    const dir = path.join(this.vaultRoot, "Reports", "Healing");
    const timestamp = new Date().toISOString();
    const fileName = `${timestamp.slice(0, 10)}-${sanitizeSegment(log.scenario)}-${Date.now()}.md`;
    const absolutePath = path.join(dir, fileName);
    const content = this.renderHealingRunLog(log, timestamp);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, content);

    return {
      absolutePath,
      relativePath: toRepoRelative(absolutePath)
    };
  }

  async updateTaskResult(update: ObsidianTaskResultUpdate): Promise<ObsidianWriteResult> {
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
      relativePath: toRepoRelative(absolutePath)
    };
  }

  async writeWorkspaceStateLog(log: ObsidianWorkspaceStateLog): Promise<ObsidianWriteResult> {
    const dir = path.join(this.vaultRoot, "Reports", "Workspace");
    const timestamp = new Date().toISOString();
    const fileName = `${timestamp.slice(0, 10)}-${sanitizeSegment(log.title)}-${Date.now()}.md`;
    const absolutePath = path.join(dir, fileName);
    const content = this.renderWorkspaceStateLog(log, timestamp);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, content);

    return {
      absolutePath,
      relativePath: toRepoRelative(absolutePath)
    };
  }

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
      ...(log.validation.command ? [`- Validation command: \`${log.validation.command}\``] : []),
      "",
      "## Evidence",
      "",
      ...(log.evidencePaths?.length
        ? log.evidencePaths.map((artifactPath) => `- ${artifactPath}`)
        : ["- No external evidence paths were supplied."]),
      "",
      "## Decision",
      "",
      formatJsonBlock(log.decision || {})
    ];

    return `${lines.join("\n")}\n`;
  }

  private renderWorkspaceStateLog(log: ObsidianWorkspaceStateLog, timestamp: string) {
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
      ...log.documentation.vaultNotesUpdated.map((notePath) => `- Vault note: ${notePath}`),
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
      ...this.renderBulletList(log.nextActions)
    ];

    return `${lines.join("\n")}\n`;
  }

  private renderBulletList(items: string[]) {
    return items.length > 0
      ? items.map((item) => `- ${item}`)
      : ["- None recorded."];
  }

  private renderFileChanges(changes: ObsidianWorkspaceFileChange[]) {
    return changes.length > 0
      ? changes.map((change) => `- ${change.status}: \`${change.path}\` - ${change.description}`)
      : ["- No file changes recorded."];
  }

  private renderValidations(validations: ObsidianWorkspaceValidation[]) {
    return validations.length > 0
      ? validations.map((validation) => {
          return `- ${validation.passed ? "passed" : "failed"}: \`${validation.command}\` - ${validation.outcome}`;
        })
      : ["- No validation recorded."];
  }
}
