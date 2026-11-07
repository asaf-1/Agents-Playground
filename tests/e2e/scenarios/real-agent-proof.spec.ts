/** Node's file tools (async) and path tools. */
import { promises as fs } from "fs";
import path from "path";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";
/** The real OpenAI provider (used only by the opt-in live test). */
import { OpenAiSelfHealingProvider } from "../../../framework/agents/llm/OpenAiSelfHealingProvider";
/** The LLM self-healing agent, and the shapes of its provider's input and decision. */
import {
  SelfHealingLlmAgent,
  type SelfHealingLlmDecision,
  type SelfHealingLlmProvider,
  type SelfHealingLlmProviderInput,
} from "../../../framework/agents/llm/SelfHealingLlmAgent";
/** The Obsidian agents: one closes out a session, one writes notes into the vault. */
import { ObsidianCloseoutAgent } from "../../../framework/agents/obsidian/ObsidianCloseoutAgent";
import { ObsidianMemoryAgent } from "../../../framework/agents/obsidian/ObsidianMemoryAgent";

/** A stand-in for the LLM: it answers with `decideWith` and records each call. */
class FakeSelfHealingProvider implements SelfHealingLlmProvider {
  readonly backendLabel = "fake:test-model";
  readonly calls: SelfHealingLlmProviderInput[] = [];

  constructor(
    private readonly decideWith: (
      input: SelfHealingLlmProviderInput,
    ) => SelfHealingLlmDecision,
  ) {}

  /** Remember the input, then decide. */
  async decide(input: SelfHealingLlmProviderInput) {
    this.calls.push(input);

    return this.decideWith(input);
  }
}

/** A decision that picks the "Join Now" candidate and says to click it. */
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

/**
 * True only when OPENAI_API_KEY holds something that isn't a placeholder.
 * The key itself is never printed.
 */
function hasUsableOpenAiKey() {
  const apiKey = process.env.OPENAI_API_KEY || "";

  return (
    Boolean(apiKey) &&
    !/your-openai-api-key|sk-your-key|<key>|placeholder|replace-me/i.test(
      apiKey,
    )
  );
}

/**
 * With a fake LLM that picks "Join Now", the agent clicks it on the live
 * landing page and reaches the dashboard.
 */
test("real self-healing LLM agent recovers a stale CTA against the live app", async ({
  homePage,
  page,
}) => {
  expected(
    "one provider call offered 'Join Now'; recovered, acted, engine llm:fake:test-model:bounded-action; the page is /dashboard",
  );
  await homePage.goto();

  // The old "Start Free Trial" button is gone, so the click fails.
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

  // Ask the agent to recover, with the fake provider choosing.
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
  fact("outcome", result.finalStatus);
  fact("engine", result.engine);

  // The provider saw "Join Now" among its choices, and the agent acted.
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

/**
 * The memory agent writes a healing-run note into the vault, with the agent,
 * the backend and the decision in it.
 */
test("Obsidian memory agent writes a real healing run log into the vault", async () => {
  expected(
    "a note under obsidian-vault/Reports/Healing/ titled 'Healing Run: real-agent-proof', naming the agent, the backend and selectedCandidateIndex",
  );
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
  fact("note", writeResult.relativePath);
  // Read the note back.
  const raw = await fs.readFile(writeResult.absolutePath, "utf-8");

  expect(writeResult.relativePath).toContain("obsidian-vault/Reports/Healing/");
  expect(raw).toContain("# Healing Run: real-agent-proof");
  expect(raw).toContain("SelfHealingLlmAgent");
  expect(raw).toContain("fake:test-model");
  expect(raw).toContain("selectedCandidateIndex");
});

/** The memory agent writes a workspace-state note for handing a session over. */
test("Obsidian memory agent writes a workspace state log for session handoff", async () => {
  expected(
    "a note under obsidian-vault/Reports/Workspace/ titled 'Workspace State: real-agent-session', listing the changed file, 'README updated: yes', AGENT_MEMORY.md and the next action",
  );
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
  fact("note", writeResult.relativePath);
  // Read the note back.
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

/** The memory agent replaces a task note's Result section. */
test("Obsidian memory agent updates a task Result section", async () => {
  expected(
    "the Result section holds the new line, and the old placeholder text is gone",
  );
  // A temporary task note of this test's own.
  const taskPath = path.join(
    process.cwd(),
    "obsidian-vault",
    "Tasks",
    `real-agent-proof-temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.md`,
  );
  const relativeTaskPath = path.relative(process.cwd(), taskPath);
  fact("task note", relativeTaskPath);
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
    // Update the Result section and read the note back.
    const result = await agent.updateTaskResult({
      resultMarkdown: "- Real agent proof validation passed.",
      taskPath: relativeTaskPath,
    });
    const raw = await fs.readFile(result.absolutePath, "utf-8");

    expect(raw).toContain("## Result");
    expect(raw).toContain("- Real agent proof validation passed.");
    expect(raw).not.toContain("Leave this section for the result.");
  } finally {
    // Always delete the temporary note.
    await fs.rm(taskPath, { force: true });
  }
});

/**
 * With code, a test, the README and the vault notes all changed, the closeout
 * passes and writes its report.
 */
test("Obsidian closeout agent writes a workspace report when required docs are updated", async () => {
  expected(
    "status passed, nothing missing; README, AGENT_MEMORY and 02 Test Map required; a report under Reports/Workspace/ saying 'Closeout status: passed'",
  );
  // A made-up git status: code, test, README and vault notes all changed.
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
  fact("closeout", result.status);
  fact("report", result.report?.relativePath);

  // Passed, with the right documents required.
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

  // The report it wrote.
  const raw = await fs.readFile(result.report!.absolutePath, "utf-8");

  expect(raw).toContain("Closeout status: passed");
  expect(raw).toContain("ObsidianCloseoutAgent.ts");
  expect(raw).toContain("README updated: yes");
});

/**
 * With code and a test changed but no docs, the closeout blocks and lists
 * what is missing.
 */
test("Obsidian closeout agent blocks when code or tests lack required docs", async () => {
  expected(
    "status blocked, no report; missing README, AGENT_MEMORY, 02 Test Map and the task note; a next action naming AGENT_MEMORY.md",
  );
  // A made-up git status: a test and a fixture changed, nothing else.
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
  fact("closeout", result.status);
  fact("missing", result.missingRequiredDocumentation);

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

/**
 * A provider that picks a candidate outside the list is rejected, and the
 * agent does nothing.
 */
test("self-healing LLM agent rejects unsafe provider output without acting", async ({
  homePage,
  page,
}) => {
  expected(
    "rejected, not acted, reason selected-candidate-out-of-range; still on /classic",
  );
  await homePage.goto();

  // A fake provider that picks index 999, which isn't among the choices.
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
  fact("outcome", result.finalStatus);
  fact("reason", result.rejectionReason);

  expect(result.finalStatus).toBe("rejected");
  expect(result.acted).toBe(false);
  expect(result.rejectionReason).toBe("selected-candidate-out-of-range");
  // Still on the home page: the agent was rejected, so it never navigated.
  // The home page is /classic now that `/` opens Playground Bank.
  await expect(page).toHaveURL(/\/classic$/);
});

/** In disabled mode the agent never asks the provider. */
test("disabled self-healing LLM mode makes no provider call", async ({
  page,
}) => {
  expected("disabled, not acted, 0 provider calls");
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
  fact("outcome", result.finalStatus);

  expect(result.finalStatus).toBe("disabled");
  expect(result.acted).toBe(false);
  expect(provider.calls).toHaveLength(0);
});

/**
 * Opt-in only (skipped unless asked for, with a real key): the live OpenAI
 * provider gives a bounded decision in report-only mode, and both vault
 * notes are written.
 */
test("@live-openai live OpenAI provider returns a bounded structured self-healing decision", async ({
  homePage,
  page,
}) => {
  expected(
    "advisory, not acted, engine llm:openai:...; a numeric candidate index and act or reject; a healing note and a workspace note in the vault",
  );
  // Skipped unless RUN_LIVE_OPENAI_AGENT_TEST=true and a real key is set.
  test.skip(
    process.env.RUN_LIVE_OPENAI_AGENT_TEST !== "true" || !hasUsableOpenAiKey(),
    "Set RUN_LIVE_OPENAI_AGENT_TEST=true and OPENAI_API_KEY to a real key, not the placeholder text.",
  );

  await homePage.goto();

  // Ask the real provider, in report-only mode so nothing is clicked.
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
  fact("outcome", result.finalStatus);
  fact("engine", result.engine);

  // A bounded decision, and no action taken.
  expect(result.finalStatus, result.agentDecision).toBe("advisory");
  expect(result.acted).toBe(false);
  expect(result.engine).toMatch(/^llm:openai:/);
  expect(result.decision).not.toBeNull();
  expect(typeof result.decision?.selectedCandidateIndex).toBe("number");
  expect(["act", "reject"]).toContain(result.decision?.recommendation);

  // Write the healing note and the workspace note for this live run.
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
  fact("healing note", healingLog.relativePath);
  fact("workspace note", workspaceLog.relativePath);

  expect(healingLog.relativePath).toContain("obsidian-vault/Reports/Healing/");
  expect(workspaceLog.relativePath).toContain(
    "obsidian-vault/Reports/Workspace/",
  );
});
