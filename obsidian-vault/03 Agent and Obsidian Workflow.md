# Agent and Obsidian Workflow

## Simple Explanation

Obsidian is the team memory and operating manual for this repo. Codex uses it to understand scope, commands, validation expectations, and reporting, but Obsidian does not replace the code or the tests.

## The Real Integration Model

- Obsidian and the agent work together through plain files inside the repository
- The agent reads and writes Markdown because the vault lives on disk in `obsidian-vault/` at the **repo root** (it moved up from the old `docs/obsidian-vault/` location, so open the repo root itself as the Obsidian vault to catch everything)
- There is no special Obsidian API bridge in this setup; the shared layer is the filesystem
- `ObsidianMemoryAgent` is the current code-level proof of this model: it writes healing-run notes, writes workspace-state session notes, and updates task-note `Result` sections directly in the vault
- `ObsidianCloseoutAgent` is the closeout guard: it inspects `git status`, classifies changed files, checks whether required README/memory/task/test-map docs were touched, writes a workspace-state report, and blocks closeout when required docs are missing

## The Playwright Agent Roster

The project now ships five agents under `.claude/agents/`. They are addressable from any harness that speaks the Claude Code agent format (Claude Code, VS Code, or OpenCode) and reach the running app through the `playwright-test` MCP server declared in `.mcp.json`. The three official agents come from the Playwright project; the diagnostician and reporter are custom additions for this repo.

- **playwright-test-planner** (official) — explores the app and writes a test plan to `specs/`.
- **playwright-test-generator** (official) — turns a single plan item into a spec under `tests/e2e/generated/`.
- **playwright-test-healer** (official) — runs tests, root-causes failures, and rewrites the broken **test**.
- **playwright-test-diagnostician** (custom, new) — read-only root-cause analysis: gathers evidence and classifies the failure against the 14-category `FailureClassifier` taxonomy, then issues a verdict of **HEAL** vs **REPORT**. It changes nothing on disk.
- **playwright-test-reporter** (custom, new) — persists a local bug record plus an Obsidian incident/healing note when the verdict is REPORT.

### The Pipeline

`plan -> generate -> run -> diagnose -> (heal | report)`

1. The planner explores the app and drafts a plan in `specs/`.
2. The generator converts a plan item into a generated spec under `tests/e2e/generated/`.
3. The suite runs.
4. The diagnostician performs read-only RCA and classifies each failure into one of the 14 `FailureClassifier` categories, ending with a HEAL-or-REPORT verdict.
5. On **HEAL** (test drift), the healer rewrites the broken test until it is green again.
6. On **REPORT** (a by-design product defect), the reporter writes a local bug record and an Obsidian incident/healing note instead of touching the test.

### Guardrails

- These agents fix **tests, never the app**. Drift in a test is healed; a genuine product defect is reported, not papered over.
- The diagnostician is strictly read-only — it produces evidence and a verdict, and never edits a test or the app.
- Routing through the diagnostician keeps the HEAL/REPORT decision explicit and auditable instead of blindly re-greening every failure.

For a workspace-agnostic version of this roster — terminology, installation, seed/storageState, the flag store, RBAC, and the full agent definitions for adopting these agents in another repo — see `md/PORTABLE_AGENT_ADOPTION_GUIDE.md` at the repo root.

## Step-By-Step Process

1. A user asks for work in this repository.
2. The agent checks `AGENTS.md` for stable repo rules.
3. If there is an active task note under `obsidian-vault/Tasks/`, the agent reads that note as the scoped source of truth.
4. The agent reads the vault maps and guides to understand the current product, test structure, and operator workflow.
5. The agent changes code, tests, or docs inside the repo.
6. The agent runs the required validation commands.
7. The agent runs the Obsidian closeout guard.
8. The closeout guard writes a workspace-state report and reports any missing required docs.
9. The agent writes the outcome back into the task note or a report note.
10. Obsidian keeps the project memory; the codebase and executed validation remain the runtime truth.

## Current Real-Agent Vault Update Model

The current agent must record the full relevant session/workspace state when agent work changes code, tests, docs, or project behavior. It does this through source-of-truth note updates plus `Reports/Workspace/` handoff notes; it should not blindly rewrite unrelated historical notes.

- `AGENT_MEMORY.md` for shared long-term agent memory
- the active task note under `Tasks/`
- `02 Test Map.md` when commands or spec counts change
- `01 Project Map.md` and this workflow note when framework responsibilities change
- `Reports/Healing/` for local healing-run notes
- `Reports/Workspace/` for session state, changed files, README/memory/task-note status, decisions, validations, and next actions
- `ObsidianCloseoutAgent` for changed-file detection and missing-documentation enforcement before handoff

When a feature, agent, workflow, or test category changes, README and memory must be updated in the same change set. The workspace-state report records whether those updates happened.
When code or tests change and required docs are missing, closeout should be treated as blocked until the docs are updated.

## What Lives Where

- `AGENTS.md`
  - stable repository rules that should always apply
- `obsidian-vault/` (now at the repo root, not `docs/obsidian-vault/`)
  - shared project maps, task notes, automation notes, reports, and templates
- `.claude/agents/`
  - the five Playwright agent definitions (planner, generator, healer, diagnostician, reporter)
- `.mcp.json`
  - declares the `playwright-test` MCP server the agents use to drive the app
- code under `server.js`, `public/`, `framework/`, and `tests/`
  - implementation and runtime behavior
- `.artifacts/`
  - generated evidence such as reports, screenshots, and traces
- top-level `md/`
  - reusable handoff blueprints and setup patterns, including `md/PORTABLE_AGENT_ADOPTION_GUIDE.md` for adopting the agent roster in another workspace
  - not runtime truth; use these as practical guidance when expanding the setup

## What The Vault Stores Today

- `00 Home.md`
  - vault entry point and quick commands
- `01 Project Map.md`
  - current product and code structure
- `02 Test Map.md`
  - suite layout, categories, and exact commands
- `03 Agent and Obsidian Workflow.md`
  - the operating model you can explain in interviews
- `04 Daily Regression Automation.md`
  - unattended regression setup and reporting flow
- `05 Enterprise Infrastructure Rules.md`
  - shared governance baseline
- `06 Reliable Agentic QA Demo Guide.md`
  - operator-facing walkthrough of the QA demo
- `Tasks/`
  - scoped implementation tasks and results
- `Reports/`
  - local automation output location for daily, incident, healing, workspace-state, and bug-report records
- `Templates/`
  - reusable task and report formats

## What Is Necessary Vs Not Necessary

- Necessary shared docs are the vault notes that describe the current QA demo, automation flow, and project workflow
- Historical notes can stay if they are clearly marked historical
- Personal Codex prompts, machine-specific setup, secrets, and local-only experiments should stay outside the shared vault
- If a top-level Markdown file is not part of the current QA demo workflow, it should not be treated as shared project documentation
- The main intentional exception is the reusable md-folder handoff patterns, such as `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md`, which are future-facing build guides rather than current runtime truth

## Recommended Process

1. Create a task note from [[Templates/Task Note]].
2. Write the goal, acceptance criteria, target files, and validation command.
3. Ask the agent to read that note and execute the task.
4. The agent updates code, runs the requested checks, and updates the note with results.
5. For feature, agent, test, or documentation changes, the agent runs:

   `npm.cmd run obsidian:closeout -- --title <title> --summary <summary>`

6. If closeout is blocked, update the missing README, memory, task, test-map, or workflow docs and rerun the closeout guard.
7. You review the task in Obsidian, use backlinks if useful, and keep the decision history.

## Why This Vault Lives Inside The Repo

- The agent can access it without extra setup
- Notes can be versioned with the project
- File paths stay stable and easy to reference in prompts
- The shared notes remain project-specific because personal local paths and private setup should not be committed here

## Best Prompt Pattern

Use a direct file-based prompt such as:

`Read obsidian-vault/Tasks/<task-file>.md, implement it, run the listed validation, and update the note with the result.`

## Limits To Be Aware Of

- Obsidian does not automatically trigger the agent
- The agent does not automatically read every note unless you tell it to
- The closeout agent does not invent correct README or memory prose; it detects required documentation gaps and blocks closeout until the main agent updates them
- If you want a rule to apply on every task, put it in `AGENTS.md`, not only in a note
- The vault is the shared memory, but runtime truth still lives in the code and the executed validation commands
