import { execFile } from "child_process";
import { promisify } from "util";
import {
  ObsidianMemoryAgent,
  type ObsidianWorkspaceFileChange,
  type ObsidianWorkspaceValidation,
  type ObsidianWriteResult
} from "./ObsidianMemoryAgent";

const execFileAsync = promisify(execFile);

export type ObsidianCloseoutStatus = "blocked" | "passed";

export type ObsidianCloseoutResult = {
  changedFiles: ObsidianWorkspaceFileChange[];
  documentation: {
    agentMemoryUpdated: boolean;
    readmeUpdated: boolean;
    taskNoteUpdated: boolean;
    vaultNotesUpdated: string[];
  };
  missingRequiredDocumentation: string[];
  nextActions: string[];
  report: ObsidianWriteResult | null;
  requiredDocumentation: string[];
  status: ObsidianCloseoutStatus;
};

export type ObsidianCloseoutRunOptions = {
  activeTaskPath?: string;
  summary?: string;
  title: string;
  validations?: ObsidianWorkspaceValidation[];
  writeReport?: boolean;
};

type ObsidianCloseoutAgentOptions = {
  activeTaskPath?: string;
  gitStatusProvider?: () => Promise<string>;
  memoryAgent?: ObsidianMemoryAgent;
  repoRoot?: string;
};

const defaultTaskPath = "docs/obsidian-vault/Tasks/007 Real Agent Proof.md";

function normalizePath(filePath: string) {
  return filePath.replace(/^"|"$/g, "").replace(/\\/g, "/");
}

function statusToChangeStatus(statusCode: string): ObsidianWorkspaceFileChange["status"] {
  if (statusCode.includes("D")) {
    return "deleted";
  }

  if (statusCode === "??" || statusCode.includes("A")) {
    return "added";
  }

  return "modified";
}

function describeChange(filePath: string) {
  if (filePath === "README.md") {
    return "Public project entry point changed.";
  }

  if (filePath === "docs/obsidian-vault/AGENT_MEMORY.md") {
    return "Shared agent memory changed.";
  }

  if (filePath.startsWith("docs/obsidian-vault/Tasks/")) {
    return "Scoped task note changed.";
  }

  if (filePath === "docs/obsidian-vault/02 Test Map.md") {
    return "Test map changed.";
  }

  if (filePath.startsWith("tests/")) {
    return "Test coverage changed.";
  }

  if (filePath.startsWith("framework/agents/obsidian/")) {
    return "Obsidian agent implementation changed.";
  }

  if (filePath.startsWith("framework/agents/llm/")) {
    return "LLM agent implementation changed.";
  }

  if (filePath.startsWith("framework/")) {
    return "Framework implementation changed.";
  }

  if (filePath.startsWith("public/") || filePath === "server.js") {
    return "Local app runtime changed.";
  }

  if (filePath === "package.json" || filePath === "package-lock.json") {
    return "Project command or dependency metadata changed.";
  }

  if (filePath.startsWith("docs/obsidian-vault/")) {
    return "Vault documentation changed.";
  }

  return "Workspace file changed.";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function parseGitStatus(rawStatus: string): ObsidianWorkspaceFileChange[] {
  return rawStatus
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const filePath = normalizePath(rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() || rawPath : rawPath);

      return {
        description: describeChange(filePath),
        path: filePath,
        status: statusToChangeStatus(statusCode)
      };
    });
}

function hasCodeOrProductChange(paths: string[]) {
  return paths.some((filePath) => {
    return (
      filePath.startsWith("framework/") ||
      filePath.startsWith("public/") ||
      filePath.startsWith("scripts/") ||
      filePath === "server.js" ||
      filePath === "package.json" ||
      filePath === "package-lock.json" ||
      filePath === "playwright.config.ts"
    );
  });
}

function hasTestChange(paths: string[]) {
  return paths.some((filePath) => filePath.startsWith("tests/"));
}

function inferRequiredDocumentation(paths: string[], activeTaskPath: string) {
  const required: string[] = [];

  if (hasCodeOrProductChange(paths) || hasTestChange(paths)) {
    required.push("README.md", "docs/obsidian-vault/AGENT_MEMORY.md", activeTaskPath);
  }

  if (hasTestChange(paths)) {
    required.push("docs/obsidian-vault/02 Test Map.md");
  }

  if (paths.some((filePath) => filePath.startsWith("framework/agents/obsidian/"))) {
    required.push("docs/obsidian-vault/03 Agent and Obsidian Workflow.md");
  }

  return unique(required);
}

function buildDocumentationState(paths: string[]) {
  return {
    agentMemoryUpdated: paths.includes("docs/obsidian-vault/AGENT_MEMORY.md"),
    readmeUpdated: paths.includes("README.md"),
    taskNoteUpdated: paths.some((filePath) => filePath.startsWith("docs/obsidian-vault/Tasks/")),
    vaultNotesUpdated: paths.filter((filePath) => {
      return filePath.startsWith("docs/obsidian-vault/") && filePath !== "docs/obsidian-vault/AGENT_MEMORY.md";
    })
  };
}

export class ObsidianCloseoutAgent {
  private readonly activeTaskPath: string;
  private readonly gitStatusProvider: () => Promise<string>;
  private readonly memoryAgent: ObsidianMemoryAgent;

  constructor(options: ObsidianCloseoutAgentOptions = {}) {
    const repoRoot = options.repoRoot || process.cwd();

    this.activeTaskPath = options.activeTaskPath || defaultTaskPath;
    this.gitStatusProvider = options.gitStatusProvider || (async () => {
      const { stdout } = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], {
        cwd: repoRoot
      });

      return stdout;
    });
    this.memoryAgent = options.memoryAgent || new ObsidianMemoryAgent();
  }

  async closeout(options: ObsidianCloseoutRunOptions): Promise<ObsidianCloseoutResult> {
    const activeTaskPath = options.activeTaskPath || this.activeTaskPath;
    const changedFiles = parseGitStatus(await this.gitStatusProvider());
    const changedPaths = changedFiles.map((change) => change.path);
    const requiredDocumentation = inferRequiredDocumentation(changedPaths, activeTaskPath);
    const missingRequiredDocumentation = requiredDocumentation.filter((requiredPath) => {
      return !changedPaths.includes(requiredPath);
    });
    const status: ObsidianCloseoutStatus = missingRequiredDocumentation.length > 0 ? "blocked" : "passed";
    const documentation = buildDocumentationState(changedPaths);
    const currentState = [
      `Closeout status: ${status}`,
      `Detected changed files: ${changedFiles.length}`,
      ...(requiredDocumentation.length > 0
        ? [`Required documentation checks: ${requiredDocumentation.join(", ")}`]
        : ["Required documentation checks: none"]),
      ...(missingRequiredDocumentation.length > 0
        ? [`Missing required documentation: ${missingRequiredDocumentation.join(", ")}`]
        : ["Missing required documentation: none"])
    ];
    const decisions = [
      "Use git status as the closeout input for changed-file detection.",
      "Block closeout when code or test changes are missing required README, memory, test-map, or task-note updates.",
      "Write an Obsidian workspace-state report as the closeout evidence."
    ];
    const nextActions = missingRequiredDocumentation.length > 0
      ? missingRequiredDocumentation.map((requiredPath) => `Update required documentation: ${requiredPath}`)
      : ["Review the workspace-state report and proceed with the next validation or handoff."];
    const report = options.writeReport === false
      ? null
      : await this.memoryAgent.writeWorkspaceStateLog({
          changedFiles,
          currentState,
          decisions,
          documentation,
          nextActions,
          summary: options.summary || `Closeout ${status} for ${options.title}.`,
          title: options.title,
          validations: options.validations || []
        });

    return {
      changedFiles,
      documentation,
      missingRequiredDocumentation,
      nextActions,
      report,
      requiredDocumentation,
      status
    };
  }
}
