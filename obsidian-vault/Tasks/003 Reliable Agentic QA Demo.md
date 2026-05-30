---
type: task
status: done
tags:
  - task
  - qa-demo
  - playwright
  - local-api
  - obsidian
---

# Reliable Agentic QA Demo

## Outcome

Run a purpose-built local QA demo that uses real pages, real API calls, deterministic recovery and diagnosis agents, and category-based Playwright coverage.

## Context

The repository uses a compact, local-first QA demo with deterministic failure modes, runtime recovery, explicit artifact generation, and an Obsidian vault that documents how to operate and explain the project.

## Target Files

- `server.js`
- `public/index.html`
- `public/dashboard.html`
- `public/product.html`
- `public/app.js`
- `public/dashboard.js`
- `public/product.js`
- `public/styles.css`
- `framework/fixtures/baseTest.ts`
- `framework/agents/**/*.ts`
- `framework/reporting/*.ts`
- `framework/data/*.ts`
- `tests/e2e/**/*.spec.ts`
- `README.md`
- `Jenkinsfile`
- `obsidian-vault/00 Home.md`
- `obsidian-vault/01 Project Map.md`
- `obsidian-vault/02 Test Map.md`
- `obsidian-vault/03 Agent and Obsidian Workflow.md`
- `obsidian-vault/04 Daily Regression Automation.md`
- `obsidian-vault/06 Agents Playground Guide.md`
- `obsidian-vault/Templates/Daily Regression Report.md`
- `obsidian-vault/Templates/Task Note.md`

## Acceptance Criteria

- The app serves `/`, `/dashboard`, and `/product/:id` from the local Node server.
- The API exposes deterministic `health`, `orders`, `create-user`, and `product` routes.
- The home page exposes a real `Join Now` button with class `.btn-rounded` and real navigation.
- The dashboard shows a real spinner, loads orders from the live local API, and supports retry via `Refresh data`.
- The product page loads dynamic content from the local API and can render both valid and broken states.
- Playwright covers UI selector healing, network recovery, API diagnosis, and dynamic content validation.
- The suite is organized into clear category folders under `tests/e2e/`.
- Each scenario writes `report.json`, a screenshot, and a trace under `.artifacts/scenarios/<scenario>/`.
- The repo keeps `npm run test:e2e` as the full-suite validation gate and exposes clear category and scenario aliases.
- The Obsidian vault explains the current project, the exact commands, and the agent-to-Obsidian workflow in plain language.

## Validation

- `npx playwright test tests/e2e/scenarios/ui-change-healing.spec.ts`
- `npx playwright test tests/e2e/functional/negative/functional-negative.spec.ts`
- `npx playwright test tests/e2e/contracts/api-contract-governance.spec.ts`
- `npm run test:e2e`
- `docker build -t ai-agentic-project-prepush .`

## Notes For The Agent

- Keep the demo local-only and in-memory.
- Keep port `4173` and preserve `npm run test:e2e` as the main regression command.
- Explicitly write scenario artifacts instead of relying on retry-only Playwright traces.
- Update the `Result` section before finishing.

## Result

Implemented and fully validated the Reliable Agentic QA Demo on April 15, 2026.

Code and test changes:

- serves three routed pages: `/`, `/dashboard`, and `/product/:id`
- exposes deterministic `health`, `orders`, `create-user`, and `product` endpoints in `server.js`
- added the dashboard and product frontend scripts and the shared styling for valid and broken runtime states
- uses deterministic agent modules under `framework/agents/`
- added explicit scenario artifact writing under `.artifacts/scenarios/<scenario>/`
- added category-based suites for sanity, functional positive, functional negative, non-functional quality, and API contract governance
- reorganized `framework/agents/` into `recovery/`, `diagnosis/`, and `validation/`
- renamed `framework/test-data/` to `framework/data/`
- simplified the framework and task layout so only current QA-demo files remain
- reorganized the suite into:
  - `tests/e2e/sanity/`
  - `tests/e2e/functional/positive/`
  - `tests/e2e/functional/negative/`
  - `tests/e2e/non-functional/`
  - `tests/e2e/contracts/`
  - `tests/e2e/scenarios/`
- removed the empty legacy `tests/e2e/negative/` folder
- updated npm scripts so the old suite aliases still work against the new layout

Documentation and workflow changes:

- treated `obsidian-vault/` as the shared documentation system for the project
- updated the vault home, project map, test map, automation note, workflow note, and operator guide to match the current QA demo
- expanded the Markdown guidance so it clearly explains:
  - what each suite does
  - what each scenario does
  - exact commands for demos and interviews
  - how the agent uses Obsidian step by step
  - what is necessary shared documentation versus optional local helper notes
- retired the stale shared file `md/Infestracture-Reasoning.md`
- removed shared references to the retired Markdown file and aligned Jenkins doc-only handling with the current vault model

Validation:

- `npx playwright test tests/e2e/scenarios/ui-change-healing.spec.ts`
  - Passed on April 15, 2026
- `npx playwright test tests/e2e/functional/negative/functional-negative.spec.ts`
  - Passed on April 15, 2026
- `npx playwright test tests/e2e/contracts/api-contract-governance.spec.ts`
  - Passed on April 15, 2026
- `npm run test:e2e`
  - Passed on April 15, 2026 with 11/11 tests green after the category-based reorganization
- `docker build -t ai-agentic-project-prepush .`
  - Passed on April 15, 2026 after Docker was made available locally

Final state:

- local Playwright validation passed
- local Docker validation passed
- the vault now reflects the current project structure and operator workflow
