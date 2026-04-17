# Shared Agent Setup Blueprint

This file is a generic blueprint for future projects. Use it when you want to build the same kind of setup again: repo rules, shared documentation, task-driven agent workflow, validation gates, and automation handoff.

## Purpose

Use this as a reusable pattern when starting a new project and you want:

- a stable `AGENTS.md`
- a shared documentation layer inside the repo
- a clear task-note workflow for agents
- reproducible local validation
- CI and automation rules that can be handed to another team

## Core Pattern

Every project should define five layers:

1. repository rules
2. shared project memory
3. implementation and tests
4. validation gates
5. automation and handoff

For UI-heavy projects that want broad self-healing across many tests and pages, add a sixth working pattern:

6. page-level self-healing

## Recommended File Structure

```text
AGENTS.md
README.md
docs/
  obsidian-vault/
    00 Home.md
    01 Project Map.md
    02 Test Map.md
    03 Agent and Workflow.md
    04 Automation.md
    05 Rules.md
    06 Operator Guide.md
    Reports/
      README.md
    Tasks/
    Templates/
      Task Note.md
      Daily Regression Report.md
scripts/
  pre-push-check.ps1
tests/
```

You can rename the vault files, but keep the responsibilities clear and stable.

## What Each Layer Should Do

### 1. Repository rules

Create `AGENTS.md` for:

- permanent repo instructions
- validation rules
- editing constraints
- automation boundaries

### 2. Shared project memory

Create a repo-local documentation layer for:

- project map
- test map
- task notes
- operator guide
- automation guide
- reusable templates

This can be Obsidian-compatible, but the important part is that it is plain files inside the repo so agents can read it.

### 3. Implementation and tests

Define:

- runtime entrypoints
- main product flows
- test categories
- artifact locations

If the product has significant UI automation, also define:

- shared page objects
- page-level self-healing profiles
- page contracts
- shared test fixtures for those pages

Recommended test grouping:

- `sanity`
- `functional/positive`
- `functional/negative`
- `non-functional`
- `contracts`
- `scenarios`

### 4. Validation gates

Define three gates:

- local fast checks
- local full regression
- local or CI build gate

Recommended examples:

- `npm run test:e2e`
- `docker build -t <project>-prepush .`
- `scripts/pre-push-check.ps1`

### 5. Automation and handoff

Document:

- daily regression automation
- report output location
- CI order of operations
- handoff instructions for another team or another agent

### 6. Page-level self-healing

For UI automation that should heal across many tests, do not let each test own raw interactive locators for the same page.

Use this pattern:

- one page object per important page
- one page profile per page
- one page contract per page
- one shared fixture entry per page
- tests call page methods instead of raw interactive locators

That is how one healing improvement can benefit many tests at once.

## Questions To Answer In Every New Project

Before creating the setup, answer these:

- What is the runtime stack?
- What is the default full regression command?
- What build or packaging gate must pass locally?
- What files are the permanent agent rules?
- Where will shared project memory live?
- Where should daily automation reports be written?
- Which docs are shared truth and which docs are only local helpers?
- What test categories matter for this product?

## Setup Checklist For A New Project

1. Create `AGENTS.md`.
2. Create `README.md` with the main commands.
3. Create the shared docs folder inside the repo.
4. Create a task note template and a report template.
5. Decide on the default full regression command.
6. Decide on the local build gate.
7. Decide on the CI order of operations.
8. Decide on the daily automation model.
9. Write one operator guide for demos and one workflow guide for humans and agents.
10. Create one repo-specific handoff file for future teams.

## Generic Ready-To-Paste Prompts

### Create the setup in a new repo

```text
Create a shared agent-ready project setup for this repository. Add a stable AGENTS.md if missing, create a repo-local documentation layer for project maps, test maps, task notes, automation, and operator guidance, define the validation flow, and summarize the commands developers should use.
```

### Rebuild the setup from a blueprint

```text
Use md/SHARED_AGENT_SETUP_BLUEPRINT.md as the source of truth. Recreate this repository's agent workflow, shared documentation structure, validation gates, and automation handoff pattern.
```

### Maintain the setup after the product evolves

```text
Read AGENTS.md, README.md, the shared documentation layer, and md/SHARED_AGENT_SETUP_BLUEPRINT.md. Update the project setup docs so they match the current codebase, test structure, validation model, and automation model.
```

## What To Keep Project-Specific

Do not make these generic by accident:

- runtime commands
- Docker image names
- CI branch names
- environment variables
- exact test paths
- product flows
- artifact paths
- page profiles and page contracts

Those belong in the repo-specific handoff file.

## What Should Stay Reusable

Keep these reusable:

- the concept of `AGENTS.md`
- the concept of a repo-local shared documentation layer
- the concept of task notes with validation commands
- the concept of category-based tests
- the concept of a local pre-push gate
- the concept of automation plus report output
- the concept of a handoff guide for another team or agent

## Recommended Deliverables For Every Future Project

- one repo-specific handoff playbook
- one generic blueprint you can reuse again
- one prompt library with current examples
- one page-level self-healing pattern if the project has serious UI automation

If you keep those three current, you can hand a project to a person, a dev team, or another agent with much less explanation.
