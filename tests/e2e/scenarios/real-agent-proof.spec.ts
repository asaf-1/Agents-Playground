import { promises as fs } from "fs";
import path from "path";
import { expect, test } from "../../../framework/fixtures/baseTest";
import { OpenAiSelfHealingProvider } from "../../../framework/agents/llm/OpenAiSelfHealingProvider";
import {
  SelfHealingLlmAgent,
  type SelfHealingLlmDecision,
  type SelfHealingLlmProvider,
  type SelfHealingLlmProviderInput,
} from "../../../framework/agents/llm/SelfHealingLlmAgent";
import { ObsidianCloseoutAgent } from "../../../framework/agents/obsidian/ObsidianCloseoutAgent";
import { ObsidianMemoryAgent } from "../../../framework/agents/obsidian/ObsidianMemoryAgent";

class FakeSelfHealingProvider implements SelfHealingLlmProvider {
  readonly backendLabel = "fake:test-model";
  readonly calls: SelfHealingLlmProviderInput[] = [];

  constructor(
    private readonly decideWith: (
      input: SelfHealingLlmProviderInput,
    ) => SelfHealingLlmDecision,
  ) {}

  async decide(input: SelfHealingLlmProviderInput) {
    this.calls.push(input);

    return this.decideWith(input);
  }
}

function joinNowDecision(
  input: SelfHealingLlmProviderInput,
): SelfHealingLlmDecision {
  const candidate = input.allowedCandidates.find((item) =>
    item.text.includes("Join Now"),
  );

  return {
    allowedAction: "click",
    confidence: 0.96,
    rationale:
      "The Join Now CTA best matches the dashboard/start intent and is present in the bounded candidate list.",
    recommendation: "act",
    risk: "single-page navigation in local QA",
    selectedCandidateIndex: candidate?.index ?? -1,
  };
}

function hasUsableOpenAiKey() {
  const apiKey = process.env.OPENAI_API_KEY || "";

  return (
    Boolean(apiKey) &&
    !/your-openai-api-key|sk-your-key|<key>|placeholder|replace-me/i.test(
      apiKey,
    )
  );
}

test("real self-healing LLM agent recovers a stale CTA against the live app", async ({
  homePage,
  page,
}) => {
  await homePage.goto();

  let initialFailure = "";

  try {
    await page
      .locator('button:has-text("Start Free Trial")')
      .click({ timeout: 400 });
    initialFailure =
      "The stale Start Free Trial selector unexpectedly resolved.";
  } catch (error) {
    initialFailure = error instanceof Error ? error.message : String(error);
  }

  const provider = new FakeSelfHealingProvider(joinNowDecision);
  const agent = new SelfHealingLlmAgent(page, provider, {
    mode: "bounded-action",
  });
  const result = await agent.recover({
    action: "click",
    failureEvidence: {
      errorMessage: initialFailure,
      staleSelector: 'button:has-text("Start Free Trial")',
      targetType: "button",
    },
    intentTokens: ["join", "dashboard", "start"],
    pageLabel: "Landing Page",
    scenario: "real-agent-proof",
    staleSelector: 'button:has-text("Start Free Trial")',
    targetType: "button",
  });

  expect(provider.calls).toHaveLength(1);
  expect(
    provider.calls[0].allowedCandidates.some((candidate) =>
      candidate.text.includes("Join Now"),
    ),
  ).toBeTruthy();
  expect(result.finalStatus).toBe("recovered");
  expect(result.acted).toBe(true);
  expect(result.engine).toBe("llm:fake:test-model:bounded-action");
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
});

test("Obsidian memory agent writes a real healing run log into the vault", async () => {
  const agent = new ObsidianMemoryAgent();
  const writeResult = await agent.writeHealingRunLog({
    agentName: "SelfHealingLlmAgent",
    backendLabel: "fake:test-model",
    decision: {
      allowedAction: "click",
      recommendation: "act",
      selectedCandidateIndex: 0,
    },
    evidencePaths: [".artifacts/scenarios/real-agent-proof/report.json"],
    finalStatus: "recovered",
    pageLabel: "Landing Page",
    scenario: "real-agent-proof",
    validation: {
      command:
        "npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts",
      passed: true,
      summary: "The bounded self-healing action navigated to the dashboard.",
    },
  });
  const raw = await fs.readFile(writeResult.absolutePath, "utf-8");

  expect(writeResult.relativePath).toContain("obsidian-vault/Reports/Healing/");
  expect(raw).toContain("# Healing Run: real-agent-proof");
  expect(raw).toContain("SelfHealingLlmAgent");
  expect(raw).toContain("fake:test-model");
  expect(raw).toContain("selectedCandidateIndex");
});

test("Obsidian memory agent writes a workspace state log for session handoff", async () => {
  const agent = new ObsidianMemoryAgent();
  const writeResult = await agent.writeWorkspaceStateLog({
    changedFiles: [
      {
        description: "Runtime-only bounded self-healing agent implementation.",
        path: "framework/agents/llm/SelfHealingLlmAgent.ts",
        status: "added",
      },
      {
        description:
          "Public project entry point updated when the real-agent feature was added.",
        path: "README.md",
        status: "modified",
      },
    ],
    currentState: [
      "The real-agent proof uses runtime self-healing and does not edit source during recovery.",
      "The live OpenAI smoke remains opt-in so default regression stays deterministic.",
    ],
    decisions: [
      "Keep LM Studio excluded from this phase.",
      "Record workspace state in the vault whenever agent capabilities or docs change.",
    ],
    documentation: {
      agentMemoryUpdated: true,
      readmeUpdated: true,
      taskNoteUpdated: true,
      vaultNotesUpdated: [
        "obsidian-vault/AGENT_MEMORY.md",
        "obsidian-vault/Tasks/007 Real Agent Proof.md",
      ],
    },
    nextActions: [
      "Use Reports/Workspace notes as the handoff record for future agent sessions.",
    ],
    summary: "Session-level workspace state was captured for Obsidian handoff.",
    title: "real-agent-session",
    validations: [
      {
        command:
          "npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts",
        outcome: "Focused real-agent proof passed.",
        passed: true,
      },
    ],
  });
  const raw = await fs.readFile(writeResult.absolutePath, "utf-8");

  expect(writeResult.relativePath).toContain(
    "obsidian-vault/Reports/Workspace/",
  );
  expect(raw).toContain("# Workspace State: real-agent-session");
  expect(raw).toContain("SelfHealingLlmAgent.ts");
  expect(raw).toContain("README updated: yes");
  expect(raw).toContain("AGENT_MEMORY.md");
  expect(raw).toContain("Use Reports/Workspace notes");
});

test("Obsidian memory agent updates a task Result section", async () => {
  const taskPath = path.join(
    process.cwd(),
    "obsidian-vault",
    "Tasks",
    `real-agent-proof-temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.md`,
  );
  const relativeTaskPath = path.relative(process.cwd(), taskPath);
  const agent = new ObsidianMemoryAgent();

  await fs.writeFile(
    taskPath,
    [
      "# Temp Real Agent Proof",
      "",
      "## Outcome",
      "",
      "Temporary test note.",
      "",
      "## Result",
      "",
      "Leave this section for the result.",
    ].join("\n"),
  );

  try {
    const result = await agent.updateTaskResult({
      resultMarkdown: "- Real agent proof validation passed.",
      taskPath: relativeTaskPath,
    });
    const raw = await fs.readFile(result.absolutePath, "utf-8");

    expect(raw).toContain("## Result");
    expect(raw).toContain("- Real agent proof validation passed.");
    expect(raw).not.toContain("Leave this section for the result.");
  } finally {
    await fs.rm(taskPath, { force: true });
  }
});

test("Obsidian closeout agent writes a workspace report when required docs are updated", async () => {
  const agent = new ObsidianCloseoutAgent({
    gitStatusProvider: async () =>
      [
        " M framework/agents/obsidian/ObsidianCloseoutAgent.ts",
        " M tests/e2e/scenarios/real-agent-proof.spec.ts",
        " M README.md",
        " M obsidian-vault/AGENT_MEMORY.md",
        " M obsidian-vault/02 Test Map.md",
        " M obsidian-vault/03 Agent and Obsidian Workflow.md",
        " M obsidian-vault/Tasks/007 Real Agent Proof.md",
      ].join("\n"),
  });
  const result = await agent.closeout({
    summary:
      "Closeout agent proof captured code, test, README, and vault documentation changes.",
    title: "closeout-agent-proof",
    validations: [
      {
        command:
          "npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts",
        outcome: "Focused real-agent proof passed.",
        passed: true,
      },
    ],
  });

  expect(result.status).toBe("passed");
  expect(result.missingRequiredDocumentation).toEqual([]);
  expect(result.requiredDocumentation).toContain("README.md");
  expect(result.requiredDocumentation).toContain(
    "obsidian-vault/AGENT_MEMORY.md",
  );
  expect(result.requiredDocumentation).toContain(
    "obsidian-vault/02 Test Map.md",
  );
  expect(result.report?.relativePath).toContain(
    "obsidian-vault/Reports/Workspace/",
  );

  const raw = await fs.readFile(result.report!.absolutePath, "utf-8");

  expect(raw).toContain("Closeout status: passed");
  expect(raw).toContain("ObsidianCloseoutAgent.ts");
  expect(raw).toContain("README updated: yes");
});

test("Obsidian closeout agent blocks when code or tests lack required docs", async () => {
  const agent = new ObsidianCloseoutAgent({
    gitStatusProvider: async () =>
      [
        " M tests/e2e/scenarios/manual-new-test.spec.ts",
        " M framework/fixtures/baseTest.ts",
      ].join("\n"),
  });
  const result = await agent.closeout({
    title: "closeout-agent-blocked-proof",
    writeReport: false,
  });

  expect(result.status).toBe("blocked");
  expect(result.report).toBeNull();
  expect(result.missingRequiredDocumentation).toContain("README.md");
  expect(result.missingRequiredDocumentation).toContain(
    "obsidian-vault/AGENT_MEMORY.md",
  );
  expect(result.missingRequiredDocumentation).toContain(
    "obsidian-vault/02 Test Map.md",
  );
  expect(result.missingRequiredDocumentation).toContain(
    "obsidian-vault/Tasks/007 Real Agent Proof.md",
  );
  expect(
    result.nextActions.some((action) => action.includes("AGENT_MEMORY.md")),
  ).toBeTruthy();
});

test("self-healing LLM agent rejects unsafe provider output without acting", async ({
  homePage,
  page,
}) => {
  await homePage.goto();

  const provider = new FakeSelfHealingProvider(() => ({
    allowedAction: "click",
    confidence: 0.99,
    rationale: "This index is intentionally outside the bounded list.",
    recommendation: "act",
    risk: "invalid candidate",
    selectedCandidateIndex: 999,
  }));
  const agent = new SelfHealingLlmAgent(page, provider, {
    mode: "bounded-action",
  });
  const result = await agent.recover({
    action: "click",
    failureEvidence: {
      errorMessage: "stale selector failed",
      staleSelector: 'button:has-text("Start Free Trial")',
      targetType: "button",
    },
    intentTokens: ["join", "dashboard", "start"],
    pageLabel: "Landing Page",
    scenario: "real-agent-proof-unsafe",
    staleSelector: 'button:has-text("Start Free Trial")',
    targetType: "button",
  });

  expect(result.finalStatus).toBe("rejected");
  expect(result.acted).toBe(false);
  expect(result.rejectionReason).toBe("selected-candidate-out-of-range");
  await expect(page).toHaveURL(/\/$/);
});

test("disabled self-healing LLM mode makes no provider call", async ({
  page,
}) => {
  const provider = new FakeSelfHealingProvider(joinNowDecision);
  const agent = new SelfHealingLlmAgent(page, provider, { mode: "disabled" });
  const result = await agent.recover({
    action: "click",
    failureEvidence: {
      errorMessage: "stale selector failed",
      staleSelector: 'button:has-text("Start Free Trial")',
      targetType: "button",
    },
    intentTokens: ["join", "dashboard", "start"],
    pageLabel: "Landing Page",
    scenario: "real-agent-proof-disabled",
    staleSelector: 'button:has-text("Start Free Trial")',
    targetType: "button",
  });

  expect(result.finalStatus).toBe("disabled");
  expect(result.acted).toBe(false);
  expect(provider.calls).toHaveLength(0);
});

test("@live-openai live OpenAI provider returns a bounded structured self-healing decision", async ({
  homePage,
  page,
}) => {
  test.skip(
    process.env.RUN_LIVE_OPENAI_AGENT_TEST !== "true" || !hasUsableOpenAiKey(),
    "Set RUN_LIVE_OPENAI_AGENT_TEST=true and OPENAI_API_KEY to a real key, not the placeholder text.",
  );

  await homePage.goto();

  const provider = new OpenAiSelfHealingProvider();
  const agent = new SelfHealingLlmAgent(page, provider, {
    mode: "report-only",
    timeoutMs: 15000,
  });
  const result = await agent.recover({
    action: "click",
    failureEvidence: {
      errorMessage:
        "The stale Start Free Trial selector failed against the current landing page.",
      staleSelector: 'button:has-text("Start Free Trial")',
      targetType: "button",
    },
    intentTokens: ["join", "dashboard", "start"],
    pageLabel: "Landing Page",
    scenario: "real-agent-proof-live-openai",
    staleSelector: 'button:has-text("Start Free Trial")',
    targetType: "button",
  });

  expect(result.finalStatus, result.agentDecision).toBe("advisory");
  expect(result.acted).toBe(false);
  expect(result.engine).toMatch(/^llm:openai:/);
  expect(result.decision).not.toBeNull();
  expect(typeof result.decision?.selectedCandidateIndex).toBe("number");
  expect(["act", "reject"]).toContain(result.decision?.recommendation);

  const obsidian = new ObsidianMemoryAgent();
  const healingLog = await obsidian.writeHealingRunLog({
    agentName: "SelfHealingLlmAgent",
    backendLabel: provider.backendLabel,
    decision: result.decision ? { ...result.decision } : null,
    evidencePaths: [".artifacts/playwright-report/index.html"],
    finalStatus: result.finalStatus,
    pageLabel: "Landing Page",
    scenario: "real-agent-proof-live-openai",
    validation: {
      command:
        'npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts --grep "@live-openai"',
      passed: true,
      summary:
        "Live OpenAI provider returned a bounded structured decision in report-only mode.",
    },
  });
  const workspaceLog = await obsidian.writeWorkspaceStateLog({
    changedFiles: [
      {
        description:
          "Live OpenAI smoke generated real Obsidian evidence for this run.",
        path: healingLog.relativePath,
        status: "generated",
      },
    ],
    currentState: [
      "Live OpenAI provider path is working.",
      "The self-healing agent stayed in report-only mode and did not perform a browser action from live model output.",
      "Obsidian received both a healing log and a workspace-state log for the live run.",
    ],
    decisions: [
      "Keep the live OpenAI proof opt-in.",
      "Use the vault reports as the visible evidence after manual live-provider runs.",
    ],
    documentation: {
      agentMemoryUpdated: true,
      readmeUpdated: true,
      taskNoteUpdated: true,
      vaultNotesUpdated: [
        "obsidian-vault/AGENT_MEMORY.md",
        "obsidian-vault/Tasks/007 Real Agent Proof.md",
      ],
    },
    nextActions: [
      "Inspect the latest files under Reports/Healing and Reports/Workspace after the live command.",
    ],
    summary:
      "Live OpenAI real-agent smoke passed and wrote Obsidian vault evidence.",
    title: "real-agent-live-openai",
    validations: [
      {
        command:
          'npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts --grep "@live-openai"',
        outcome: "1 live OpenAI smoke passed.",
        passed: true,
      },
    ],
  });

  expect(healingLog.relativePath).toContain("obsidian-vault/Reports/Healing/");
  expect(workspaceLog.relativePath).toContain(
    "obsidian-vault/Reports/Workspace/",
  );
});
