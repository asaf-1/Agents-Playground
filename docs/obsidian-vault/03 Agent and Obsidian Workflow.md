# Agent and Obsidian Workflow

## Simple Explanation

Obsidian is the team memory and operating manual for this repo. Codex uses it to understand scope, commands, validation expectations, and reporting, but Obsidian does not replace the code or the tests.

## The Real Integration Model

- Obsidian and the agent work together through plain files inside the repository
- The agent reads and writes Markdown because the vault lives on disk in `docs/obsidian-vault/`
- There is no special Obsidian API bridge in this setup; the shared layer is the filesystem

## Step-By-Step Process

1. A user asks for work in this repository.
2. The agent checks `AGENTS.md` for stable repo rules.
3. If there is an active task note under `docs/obsidian-vault/Tasks/`, the agent reads that note as the scoped source of truth.
4. The agent reads the vault maps and guides to understand the current product, test structure, and operator workflow.
5. The agent changes code, tests, or docs inside the repo.
6. The agent runs the required validation commands.
7. The agent writes the outcome back into the task note or a report note.
8. Obsidian keeps the project memory; the codebase and executed validation remain the runtime truth.

## What Lives Where

- `AGENTS.md`
  - stable repository rules that should always apply
- `docs/obsidian-vault/`
  - shared project maps, task notes, automation notes, reports, and templates
- code under `server.js`, `public/`, `framework/`, and `tests/`
  - implementation and runtime behavior
- `.artifacts/`
  - generated evidence such as reports, screenshots, and traces
- top-level `md/`
  - reusable handoff blueprints and setup patterns
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
  - local automation output location
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
5. You review the task in Obsidian, use backlinks if useful, and keep the decision history.

## Why This Vault Lives Inside The Repo

- The agent can access it without extra setup
- Notes can be versioned with the project
- File paths stay stable and easy to reference in prompts
- The shared notes remain project-specific because personal local paths and private setup should not be committed here

## Best Prompt Pattern

Use a direct file-based prompt such as:

`Read docs/obsidian-vault/Tasks/<task-file>.md, implement it, run the listed validation, and update the note with the result.`

## Limits To Be Aware Of

- Obsidian does not automatically trigger the agent
- The agent does not automatically read every note unless you tell it to
- If you want a rule to apply on every task, put it in `AGENTS.md`, not only in a note
- The vault is the shared memory, but runtime truth still lives in the code and the executed validation commands
