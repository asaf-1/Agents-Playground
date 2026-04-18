# Reliable Agentic QA Demo

Reliable Agentic QA Demo is a local-first demo app built for agentic QA interviews and walkthroughs. It uses a real Node server, live browser flows, deterministic failure modes, and Playwright-based recovery and diagnosis agents instead of mocked UI theater.

## What Is In The Repo

- A zero-framework Node server that serves real pages: `/`, `/dashboard`, `/product/:id`, `/user-manager`, `/orders`, `/admin`, `/profile`, and `/settings`
- Deterministic local API routes for health, orders loading, user creation, dynamic product data, and user management (with a test reset endpoint)
- A full Playwright suite of `33` tests covering sanity, functional positive/negative, non-functional quality, API contracts, self-healing, diagnosis, orchestration, policy/planning, and QA/staging repair flows
- Agent modules under `framework/agents/` grouped by `recovery/`, `diagnosis/`, `validation/`, and `repair/`, with explicit scenario artifact output under `.artifacts/scenarios/` and patch-plan output under `.artifacts/patches/`
- Page-level self-healing through shared page objects, page profiles, page contracts, and fixture-backed UI actions under `framework/pom/`, `framework/agents/recovery/pageProfiles/`, `framework/agents/validation/contracts.ts`, and `framework/fixtures/baseTest.ts`
- Multi-agent orchestration layer under `framework/orchestrator/` (`IncidentRouter`, `AgentRegistry`, `PolicyEngine`, `ExecutionPlanner`) with a local `framework/memory/IncidentMemoryStore`
- Repair flow (`PatchPlanner`, `PatchApplier`, `RepairVerifier`) gated to QA/staging only — production is hard-skipped
- Obsidian vault notes for scoped task tracking, test mapping, daily regression reports, and handoffs between agents
- GitHub Actions workflows for PR validation, main-branch regression, and scheduled daily regression artifacts

## Runtime Surface

- Home page: `Join Now` CTA with class `.btn-rounded` and real navigation into the dashboard flow
- Dashboard: live orders fetch with stable, slow, and flaky modes plus a real spinner and `Refresh data` button
- Product page: dynamic runtime rendering with both valid and intentionally broken states
- User Manager: dropdown, bulk actions menu, invite modal, row actions, and section-scoped form fields for advanced locator healing
- Orders, Admin, Profile, and Settings: each wired to its own page contract, page profile, and fixture for self-healing coverage
- Optional OpenAI narrative enrichment through `OPENAI_API_KEY`; pass/fail logic stays deterministic without it
- UI-facing tests use a page-level self-healing pattern so one page-level improvement benefits multiple tests

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
4. Start the regression suite:

   ```powershell
   npm.cmd run test
   ```
5. Open:

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
- `public/user-manager.html`: advanced locator-healing surface (dropdown, modal, bulk actions, row actions)
- `public/orders.html`, `admin.html`, `profile.html`, `settings.html`: page-level self-healing coverage
- `framework/agents/`: deterministic recovery, diagnosis, validation, and repair agents grouped by responsibility
- `framework/agents/recovery/pageProfiles/`: page-level action intents for shared healing behavior
- `framework/agents/validation/contracts.ts`: reusable page contracts used by `PageValidationAgent`
- `framework/agents/repair/`: `PatchPlanner`, `PatchApplier`, `RepairVerifier` — QA/staging-only repair flow
- `framework/orchestrator/`: `IncidentRouter`, `AgentRegistry`, `PolicyEngine`, `ExecutionPlanner`
- `framework/memory/IncidentMemoryStore.ts`: local deterministic incident history
- `framework/pom/`: self-healing page objects for every user-facing page
- `framework/fixtures/baseTest.ts`: fixture-backed page object access used by the UI-facing tests
- `framework/data/scenarioPayloads.ts`: reusable API payloads for positive and negative coverage
- `framework/reporting/scenarioArtifacts.ts`: explicit scenario report, screenshot, and ownership-tracked trace writing
- `tests/e2e/`: category folders plus scenario specs (`33` tests total)
