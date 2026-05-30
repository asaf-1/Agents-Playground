# Dev Team Agent Setup Playbook

This file is a repo-specific handoff guide for another team's agent. If this workspace is passed to a different dev team, their agent should be able to read this file and recreate the same working setup in the developers' own environment.

## Purpose

Use this file when:

- a new dev team receives this repository
- another agent needs to prepare the local environment for developers
- the team wants the same repo rules, documentation flow, validation flow, and automation setup
- someone needs one place that explains how to maintain the setup after it is created

## What This Repo Setup Includes

- `AGENTS.md`
  - stable repository rules for any agent working in this repo
- `README.md`
  - project overview and main commands
- `obsidian-vault/`
  - shared project memory, operator docs, task notes, automation notes, and templates
- `tests/e2e/`
  - category-based Playwright structure:
  - `sanity/`
  - `functional/positive/`
  - `functional/negative/`
  - `non-functional/`
  - `contracts/`
  - `scenarios/`
- `scripts/pre-push-check.ps1`
  - local gate for Playwright plus Docker
- `Jenkinsfile`
  - CI behavior for scheduled regression and Docker-first merge validation
- `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md`
  - the practical pattern for making all tests on a page benefit from shared self-healing

## Required Local Tools

Each developer machine should have:

- Node.js 20+
- npm
- Git
- Playwright Chromium installed locally
- Docker Desktop or an equivalent local Docker runtime
- optional: Obsidian, if the team wants to browse the vault as a note system

## Files The Agent Must Read First

Before making any setup changes, the new team's agent should read these files in this order:

1. `AGENTS.md`
2. `README.md`
3. `obsidian-vault/00 Home.md`
4. `obsidian-vault/01 Project Map.md`
5. `obsidian-vault/02 Test Map.md`
6. `obsidian-vault/03 Agent and Obsidian Workflow.md`
7. `obsidian-vault/04 Daily Regression Automation.md`
8. `obsidian-vault/06 Reliable Agentic QA Demo Guide.md`
9. `obsidian-vault/Tasks/005 Page-Level Self-Healing Adoption.md`
10. `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md`

## Setup Outcome

When the setup is complete, every developer should be able to:

- start the local app
- run the full Playwright suite
- run category suites and scenario demos
- build the repo locally in Docker
- understand where project knowledge lives
- understand how tasks should be written and handed to agents

## Local Setup Steps

### 1. Open the repo in the developer's environment

- clone or copy the repository
- open it in the IDE, terminal, or Codex app

### 2. Install dependencies

```powershell
npm.cmd install
```

### 3. Install Playwright Chromium

```powershell
npx.cmd playwright install chromium
```

### 4. Confirm Docker is available

```powershell
docker version
```

### 5. Start the app once

```powershell
npm.cmd run start
```

Expected URL:

- `http://127.0.0.1:4173`

### 6. Run the main validation commands

```powershell
npm.cmd run test:e2e
docker build -t ai-agentic-project-prepush .
```

### 7. Confirm the fast category commands work

```powershell
npm.cmd run test:sanity
npm.cmd run test:functional:positive
npm.cmd run test:functional:negative
npm.cmd run test:nonfunctional
npm.cmd run test:contract
```

### 8. Confirm the live demo commands work

```powershell
$env:PLAYWRIGHT_SLOW_MO='1000'
npx.cmd playwright test tests/e2e/scenarios/ui-change-healing.spec.ts --headed --workers=1
npx.cmd playwright test tests/e2e/scenarios/flaky-network-recovery.spec.ts --headed --workers=1
Remove-Item Env:PLAYWRIGHT_SLOW_MO -ErrorAction SilentlyContinue
```

## What The Agent Should Configure For The Team

### Shared project understanding

- treat `obsidian-vault/` as the shared project memory
- treat `AGENTS.md` as the stable rule file
- treat code and executed validation as runtime truth
- treat `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md` as the page-expansion guide when the team wants more pages to self-heal

### Page-level self-healing rule

When the team adds a new page such as `UserManagerPage`, the agent should not spread raw interactive locators across multiple tests.

Instead, the agent should add:

- one page object under `framework/pom/`
- one page profile under `framework/agents/recovery/pageProfiles/`
- one page contract under `framework/agents/validation/`
- one fixture entry in `framework/fixtures/baseTest.ts`

Then the UI-facing tests should call page methods instead of owning the page's interactive locators directly.

### Local merge gate

Developers should use:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/pre-push-check.ps1
```

That gate runs:

- `npm run test:e2e`
- `docker build -t ai-agentic-project-prepush .`

### Daily automation

If the team uses Codex app automations:

- follow `obsidian-vault/04 Daily Regression Automation.md`
- create a daily regression automation per developer or per shared machine

### Jenkins behavior

The repo expects:

- daily scheduled full regression
- Docker-first validation for merge-oriented runs
- Playwright validation after Docker on merge-oriented runs

## Maintenance Rules For The New Team Agent

If the team changes product behavior, tests, or workflow, the agent should keep these files aligned:

- `README.md`
- `AGENTS.md` when stable rules change
- `obsidian-vault/01 Project Map.md`
- `obsidian-vault/02 Test Map.md`
- `obsidian-vault/03 Agent and Obsidian Workflow.md`
- `obsidian-vault/04 Daily Regression Automation.md`
- `obsidian-vault/06 Reliable Agentic QA Demo Guide.md`
- the active task note under `obsidian-vault/Tasks/`
- `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md` when the page model or self-healing adoption changes

The agent should not treat top-level local helper notes as shared truth unless the team intentionally chooses to promote them.

## Ready-To-Paste Agent Prompts

### Bootstrap the repo for a new dev machine

```text
Read AGENTS.md, README.md, obsidian-vault/00 Home.md, obsidian-vault/01 Project Map.md, obsidian-vault/02 Test Map.md, obsidian-vault/03 Agent and Obsidian Workflow.md, obsidian-vault/04 Daily Regression Automation.md, obsidian-vault/06 Reliable Agentic QA Demo Guide.md, and md/DEV_TEAM_AGENT_SETUP_PLAYBOOK.md. Then set up this repository for a new developer environment, verify the required commands, and summarize what the developer still needs to do manually.
```

### Recreate the full workflow for a new team

```text
Use md/DEV_TEAM_AGENT_SETUP_PLAYBOOK.md as the source of truth. Recreate the local setup, validation flow, Obsidian workflow, and automation guidance for this repository in the current environment. Follow AGENTS.md and report any missing prerequisites.
```

### Add page-level self-healing for a new product area

```text
Read md/PAGE_LEVEL_SELF_HEALING_PATTERN.md and use it as the source of truth for page-level self-healing. Add a page object, page profile, page contract, and baseTest fixture for the new page, then refactor UI-facing tests to use page methods instead of raw interactive locators.
```

### Maintain the setup after future changes

```text
Read AGENTS.md, obsidian-vault/01 Project Map.md, obsidian-vault/02 Test Map.md, obsidian-vault/03 Agent and Obsidian Workflow.md, obsidian-vault/06 Reliable Agentic QA Demo Guide.md, and md/DEV_TEAM_AGENT_SETUP_PLAYBOOK.md. Update the shared setup docs so they match the current codebase, test structure, and validation flow.
```

## Human Handoff Checklist

- the new team knows `AGENTS.md` is the stable rules file
- the new team knows `obsidian-vault/` is the shared project memory
- the new team knows `scripts/pre-push-check.ps1` is the local pre-push gate
- the new team knows `npm run test:e2e` is the default full regression command
- the new team knows Docker validation is required before a push intended for merge
- the new team knows where the live demo commands live

## Final Principle

The goal is not just to make the code run. The goal is to hand over:

- the runtime
- the validation model
- the documentation model
- the automation model
- the maintenance model

If another team's agent can recreate all five, the setup has been passed on correctly.
