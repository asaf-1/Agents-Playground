// The Obsidian closeout agent: at the end of a piece of work it reads git
// status, works out which docs should have changed with it (README, the
// Obsidian memory, the task note, the test map), and blocks the closeout when
// one is missing. It writes a workspace state note as the record.

// Node's tools for running git.
import { execFile } from "child_process";
import { promisify } from "util";
// The memory agent that writes the note, and its shapes.
import {
  ObsidianMemoryAgent,
  type ObsidianWorkspaceFileChange,
  type ObsidianWorkspaceValidation,
  type ObsidianWriteResult,
} from "./ObsidianMemoryAgent";

// Runs a command and waits for it.
const execFileAsync = promisify(execFile);

// Passed, or blocked by missing docs.
export type ObsidianCloseoutStatus = "blocked" | "passed";

// What a closeout reports.
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

// What a closeout is given: a title, the checks that ran, and the task note.
export type ObsidianCloseoutRunOptions = {
  activeTaskPath?: string;
  summary?: string;
  title: string;
  validations?: ObsidianWorkspaceValidation[];
  writeReport?: boolean;
};

// Options: the task note, the repository, a fake git status for tests, and a
// memory agent.
type ObsidianCloseoutAgentOptions = {
  activeTaskPath?: string;
  gitStatusProvider?: () => Promise<string>;
  memoryAgent?: ObsidianMemoryAgent;
  repoRoot?: string;
};

// The task note used when none is given.
const defaultTaskPath = "obsidian-vault/Tasks/007 Real Agent Proof.md";

// A path without quotes, with forward slashes.
function normalizePath(filePath: string) {
  return filePath.replace(/^"|"$/g, "").replace(/\\/g, "/");
}

// A git status code as added, deleted or modified.
function statusToChangeStatus(
  statusCode: string,
): ObsidianWorkspaceFileChange["status"] {
  if (statusCode.includes("D")) {
    return "deleted";
  }

  if (statusCode === "??" || statusCode.includes("A")) {
    return "added";
  }

  return "modified";
}

// A short description of what a change to a file means.
function describeChange(filePath: string) {
  if (filePath === "README.md") {
    return "Public project entry point changed.";
  }

  if (filePath === "obsidian-vault/AGENT_MEMORY.md") {
    return "Shared agent memory changed.";
  }

  if (filePath.startsWith("obsidian-vault/Tasks/")) {
    return "Scoped task note changed.";
  }

  if (filePath === "obsidian-vault/02 Test Map.md") {
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

  if (filePath.startsWith("obsidian-vault/")) {
    return "Vault documentation changed.";
  }

  return "Workspace file changed.";
}

// Each value once.
function unique(values: string[]) {
  return [...new Set(values)];
}

// Turns `git status --short` into a list of changed files (a rename counts as
// its new path).
export function parseGitStatus(
  rawStatus: string,
): ObsidianWorkspaceFileChange[] {
  return rawStatus
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const filePath = normalizePath(
        rawPath.includes(" -> ")
          ? rawPath.split(" -> ").pop() || rawPath
          : rawPath,
      );

      return {
        description: describeChange(filePath),
        path: filePath,
        status: statusToChangeStatus(statusCode),
      };
    });
}

// True when code, the site, scripts or the project's settings changed.
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

// True when tests changed.
function hasTestChange(paths: string[]) {
  return paths.some((filePath) => filePath.startsWith("tests/"));
}

// Which docs must change with the work: the README, the Obsidian memory and the
// task note for any code or test change; the test map for test changes; the
// workflow note for Obsidian agent changes.
function inferRequiredDocumentation(paths: string[], activeTaskPath: string) {
  const required: string[] = [];

  if (hasCodeOrProductChange(paths) || hasTestChange(paths)) {
    required.push(
      "README.md",
      "obsidian-vault/AGENT_MEMORY.md",
      activeTaskPath,
    );
  }

  if (hasTestChange(paths)) {
    required.push("obsidian-vault/02 Test Map.md");
  }

  if (
    paths.some((filePath) => filePath.startsWith("framework/agents/obsidian/"))
  ) {
    required.push("obsidian-vault/03 Agent and Obsidian Workflow.md");
  }

  return unique(required);
}

// Which docs did change.
function buildDocumentationState(paths: string[]) {
  return {
    agentMemoryUpdated: paths.includes("obsidian-vault/AGENT_MEMORY.md"),
    readmeUpdated: paths.includes("README.md"),
    taskNoteUpdated: paths.some((filePath) =>
      filePath.startsWith("obsidian-vault/Tasks/"),
    ),
    vaultNotesUpdated: paths.filter((filePath) => {
      return (
        filePath.startsWith("obsidian-vault/") &&
        filePath !== "obsidian-vault/AGENT_MEMORY.md"
      );
    }),
  };
}

// One agent per repository.
export class ObsidianCloseoutAgent {
  private readonly activeTaskPath: string;
  private readonly gitStatusProvider: () => Promise<string>;
  private readonly memoryAgent: ObsidianMemoryAgent;

  // Settings, or their defaults; the default git status runs `git status`.
  constructor(options: ObsidianCloseoutAgentOptions = {}) {
    const repoRoot = options.repoRoot || process.cwd();

    this.activeTaskPath = options.activeTaskPath || defaultTaskPath;
    this.gitStatusProvider =
      options.gitStatusProvider ||
      (async () => {
        const { stdout } = await execFileAsync(
          "git",
          ["status", "--short", "--untracked-files=all"],
          {
            cwd: repoRoot,
          },
        );

        return stdout;
      });
    this.memoryAgent = options.memoryAgent || new ObsidianMemoryAgent();
  }

  // Closes out one piece of work.
  async closeout(
    options: ObsidianCloseoutRunOptions,
  ): Promise<ObsidianCloseoutResult> {
    // What changed, which docs had to change, and which of those did not.
    const activeTaskPath = options.activeTaskPath || this.activeTaskPath;
    const changedFiles = parseGitStatus(await this.gitStatusProvider());
    const changedPaths = changedFiles.map((change) => change.path);
    const requiredDocumentation = inferRequiredDocumentation(
      changedPaths,
      activeTaskPath,
    );
    const missingRequiredDocumentation = requiredDocumentation.filter(
      (requiredPath) => {
        return !changedPaths.includes(requiredPath);
      },
    );
    // Blocked when a required doc is missing.
    const status: ObsidianCloseoutStatus =
      missingRequiredDocumentation.length > 0 ? "blocked" : "passed";
    const documentation = buildDocumentationState(changedPaths);
    // The note's sections.
    const currentState = [
      `Closeout status: ${status}`,
      `Detected changed files: ${changedFiles.length}`,
      ...(requiredDocumentation.length > 0
        ? [`Required documentation checks: ${requiredDocumentation.join(", ")}`]
        : ["Required documentation checks: none"]),
      ...(missingRequiredDocumentation.length > 0
        ? [
            `Missing required documentation: ${missingRequiredDocumentation.join(", ")}`,
          ]
        : ["Missing required documentation: none"]),
    ];
    const decisions = [
      "Use git status as the closeout input for changed-file detection.",
      "Block closeout when code or test changes are missing required README, memory, test-map, or task-note updates.",
      "Write an Obsidian workspace-state report as the closeout evidence.",
    ];
    const nextActions =
      missingRequiredDocumentation.length > 0
        ? missingRequiredDocumentation.map(
            (requiredPath) => `Update required documentation: ${requiredPath}`,
          )
        : [
            "Review the workspace-state report and proceed with the next validation or handoff.",
          ];
    // Write the note, unless asked not to, and report.
    const report =
      options.writeReport === false
        ? null
        : await this.memoryAgent.writeWorkspaceStateLog({
            changedFiles,
            currentState,
            decisions,
            documentation,
            nextActions,
            summary:
              options.summary || `Closeout ${status} for ${options.title}.`,
            title: options.title,
            validations: options.validations || [],
          });

    return {
      changedFiles,
      documentation,
      missingRequiredDocumentation,
      nextActions,
      report,
      requiredDocumentation,
      status,
    };
  }
}
