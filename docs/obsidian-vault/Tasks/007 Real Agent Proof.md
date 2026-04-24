---
type: task
status: validated
tags:
  - task
  - real-agent
  - self-healing
  - obsidian
  - openai
---

# Real Agent Proof

## Outcome

Prove two real agents in the local workspace: a bounded self-healing LLM agent and an Obsidian memory agent. The default proof uses the real local app and real vault files while keeping normal regression deterministic; the live OpenAI provider path is opt-in.

## Context

The workspace already has deterministic self-healing, incident reports, and optional OpenAI narrative enrichment. This task adds a clearer real-agent proof: one agent can use a model-backed decision boundary for bounded self-healing, and one agent can write/update the Obsidian vault as project memory.

## Target Files

- `framework/agents/llm/*`
- `framework/agents/obsidian/*`
- `scripts/obsidian-closeout.js`
- `tests/e2e/scenarios/real-agent-proof.spec.ts`
- `README.md`
- `docs/obsidian-vault/AGENT_MEMORY.md`
- `docs/obsidian-vault/02 Test Map.md`
- `docs/obsidian-vault/03 Agent and Obsidian Workflow.md`
- `docs/obsidian-vault/Reports/README.md`

## Acceptance Criteria

- `SelfHealingLlmAgent` accepts only bounded candidate actions and rejects unsafe output.
- `OpenAiSelfHealingProvider` calls `https://api.openai.com/v1/responses` only when explicitly configured and provided an API key.
- The normal test path uses a fake provider against the real browser app and does not require network access.
- A live OpenAI smoke test exists and is skipped unless `RUN_LIVE_OPENAI_AGENT_TEST=true` and `OPENAI_API_KEY` are set.
- `ObsidianMemoryAgent` writes structured healing logs, workspace-state session logs, and task-note `Result` updates under the vault.
- `ObsidianCloseoutAgent` inspects changed files, checks required documentation updates, writes a workspace-state closeout report, and blocks closeout when required docs are missing.
- README, memory, and the test map describe the new agents and validation commands.

## Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts`
- `npm.cmd run test:e2e`
- Optional live proof: set `RUN_LIVE_OPENAI_AGENT_TEST=true`, set `OPENAI_API_KEY` to a real key, then run `npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts --grep @live-openai`

## Notes For The Agent

- Keep LM Studio out of this task.
- Keep default regression deterministic and offline.
- Do not let the LLM provider invent selectors or actions.
- Keep generated healing reports under the ignored `Reports/Healing/` local output area.
- Keep generated workspace-state handoff reports under the ignored `Reports/Workspace/` local output area.

## Result

- Added `framework/agents/llm/SelfHealingLlmAgent.ts` and `framework/agents/llm/OpenAiSelfHealingProvider.ts`.
- Added `framework/agents/obsidian/ObsidianMemoryAgent.ts`.
- Added `framework/agents/obsidian/ObsidianCloseoutAgent.ts` and `scripts/obsidian-closeout.js`.
- Added `tests/e2e/scenarios/real-agent-proof.spec.ts` with:
  - real browser recovery through a fake provider
  - real vault healing-log writing
  - real vault workspace-state log writing
  - task-note `Result` updates
  - closeout guard pass/block behavior based on changed files and required documentation
  - unsafe output rejection
  - disabled mode no-call behavior
  - opt-in `@live-openai` OpenAI provider smoke
- Kept LM Studio excluded and kept the default regression offline.
- Updated `README.md`, `docs/obsidian-vault/AGENT_MEMORY.md`, `docs/obsidian-vault/02 Test Map.md`, and `package.json`.
- Added a shared memory note for the next patching-agent phase: if a future real patching agent edits source files, it must include reset/revert handling for intentional demo bugs because this slice is runtime self-healing only.
- Tightened live OpenAI setup handling after a placeholder-key run:
  - common placeholder API-key values now skip the `@live-openai` smoke with a clearer message
  - real OpenAI provider failures include response status/body details in the agent decision
- Updated the broader vault context so the session is reflected outside only the healing report:
  - `00 Home.md`
  - `01 Project Map.md`
  - `03 Agent and Obsidian Workflow.md`
  - `06 Reliable Agentic QA Demo Guide.md`
  - `Reports/README.md`
  - `Reports/Healing/2026-04-24-real-agent-session-vault-update.md`
- Extended `ObsidianMemoryAgent.writeWorkspaceStateLog()` so the agent records session/workspace state under `Reports/Workspace/`, including changed files, README/memory/task-note status, decisions, validations, and next actions.
- Added local workspace-state report `Reports/Workspace/2026-04-24-real-agent-workspace-state-update.md` for the current session.
- Wired the opt-in `@live-openai` smoke to also write real Obsidian evidence under `Reports/Healing/` and `Reports/Workspace/` when the user runs the live OpenAI command.
- Added `npm.cmd run obsidian:closeout -- --title <title> --summary <summary>` as the closeout guard command.
- User-run live OpenAI smoke passed with a real token:
  - `npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts --grep "@live-openai"` passed with `1/1`
- Validation run and outcome:
  - `npx.cmd tsc --noEmit` passed
  - `npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts` passed with `8` passed and `1` skipped live OpenAI smoke
  - `npm.cmd run test:e2e` passed with `49` passed and `1` skipped live OpenAI smoke out of `50` specs
  - `npm.cmd run obsidian:closeout -- --title real-agent-closeout-agent --summary "Implemented Obsidian closeout guard for changed-file documentation gating." --validation-command "npm.cmd run test:e2e" --validation-outcome "49 passed, 1 skipped live OpenAI smoke out of 50 specs"` passed and wrote final report `Reports/Workspace/2026-04-24-real-agent-closeout-agent-1777019807654.md`
  - pre-push rerun on the current working tree passed:
    - `npm.cmd run test:e2e`
    - `docker build -t ai-agentic-project-prepush .`
