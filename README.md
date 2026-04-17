# Reliable Agentic QA Demo

Reliable Agentic QA Demo is a local-first demo app built for agentic QA interviews and walkthroughs. It uses a real Node server, live browser flows, deterministic failure modes, and Playwright-based recovery and diagnosis agents instead of mocked UI theater.

## What Is In The Repo

- A zero-framework Node server that serves three real pages: `/`, `/dashboard`, and `/product/:id`
- Deterministic local API routes for health, orders loading, user creation, and dynamic product data
- Playwright scenario coverage for selector healing, network recovery, API diagnosis, and dynamic content validation
- Agent modules under `framework/agents/` grouped by recovery, diagnosis, and validation, plus explicit scenario artifact output under `.artifacts/scenarios/`
- Page-level self-healing through shared page objects, page profiles, and fixture-backed UI actions under `framework/pom/`, `framework/agents/recovery/pageProfiles/`, and `framework/fixtures/baseTest.ts`
- Obsidian vault notes for scoped task tracking, test mapping, and workflow documentation
- GitHub Actions workflows for PR validation, main-branch regression, and scheduled daily regression artifacts

## Runtime Surface

- Home page: `Join Now` CTA with class `.btn-rounded` and real navigation into the dashboard flow
- Dashboard: live orders fetch with stable, slow, and flaky modes plus a real spinner and `Refresh data` button
- Product page: dynamic runtime rendering with both valid and intentionally broken states
- Optional OpenAI narrative enrichment through `OPENAI_API_KEY`; pass/fail logic stays deterministic without it
- Current UI-facing tests use a page-level self-healing pattern so one page-level improvement can benefit multiple tests

## Run It Locally

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Install a Playwright browser if needed:

   ```powershell
   npx.cmd playwright install chromium
   ```

3. Start the app:

   ```powershell
   npm.cmd run start
   ```

4. Open:

   ```text
   http://127.0.0.1:4173
   ```

## Test Commands

- Full regression: `npm run test:e2e`
- NPM alias: `npm test`
- Sanity smoke: `npm run test:sanity`
- Functional positive: `npm run test:functional:positive`
- Functional negative: `npm run test:functional:negative`
- Non-functional quality: `npm run test:nonfunctional`
- API contract governance: `npm run test:contract`
- UI healing only: `npm run test:ui-heal`
- Flaky network recovery only: `npm run test:flaky`
- API diagnosis only: `npm run test:api`
- Dynamic content validation only: `npm run test:dynamic`
- Generic self-healing only: `npm run test:generic-healing`
- Page-contract validation only: `npm run test:page-contracts`
- Classification and patch proposal only: `npm run test:classification`
- Headed run: `npm run test:e2e:headed`
- Playwright UI: `npm run test:e2e:ui`

Each scenario writes a `report.json`, screenshot, and trace to `.artifacts/scenarios/<scenario>/`.

## Test Layout

- `tests/e2e/sanity/`
- `tests/e2e/functional/positive/`
- `tests/e2e/functional/negative/`
- `tests/e2e/non-functional/`
- `tests/e2e/contracts/`
- `tests/e2e/scenarios/`

## Workflow For Codex And Obsidian

- Keep repo-wide rules in `AGENTS.md`
- Keep shared project knowledge in `docs/obsidian-vault/`
- Keep scoped implementation notes in `docs/obsidian-vault/Tasks/`
- The current source-of-truth task note is `docs/obsidian-vault/Tasks/005 Page-Level Self-Healing Adoption.md`
- The main operator guide is `docs/obsidian-vault/06 Reliable Agentic QA Demo Guide.md`
- The reusable md-folder handoff for expanding page-level self-healing is `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md`
- Use the prompt pattern:

  `Read docs/obsidian-vault/Tasks/<task-file>.md, implement it, run the listed validation, and update the note with the result.`

- Use `docs/obsidian-vault/04 Daily Regression Automation.md` for unattended suite execution
- Treat top-level `md/` helper files as local/private notes, not shared project truth

## Merge And CI Rules

- Before a local push, run:
  - `npm run test:e2e`
  - `docker build -t ai-agentic-project-prepush .`
- Before merge, require Jenkins validation on the pushed revision
- In Jenkins, run Docker validation first on merge candidates, then run the matching Playwright validation
- Keep the daily Jenkins schedule as a full regression run
- GitHub Actions includes:
  - `pr-validation.yml` for pull requests
  - `main-validation.yml` for pushes to `main`
  - `daily-regression.yml` for scheduled daily regression at `05:00 UTC`
- The scheduled GitHub Actions daily regression uploads artifact reports only and does not commit generated report files back into the repo

## Important Paths

- `server.js`: route mapping and local API
- `public/index.html`: landing page
- `public/dashboard.html`: orders recovery page
- `public/product.html`: dynamic product validation page
- `framework/agents/`: deterministic recovery, diagnosis, and validation agents grouped by responsibility
- `framework/agents/recovery/pageProfiles/`: page-level action intents for shared healing behavior
- `framework/pom/`: self-healing page objects for the current pages
- `framework/fixtures/baseTest.ts`: fixture-backed page object access used by the current UI-facing tests
- `framework/data/scenarioPayloads.ts`: reusable API payloads for positive and negative coverage
- `framework/reporting/scenarioArtifacts.ts`: explicit scenario report, screenshot, and trace writing
- `tests/e2e/`: category folders plus scenario specs
