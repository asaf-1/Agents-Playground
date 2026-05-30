# Agents-Playground

Agents-Playground is a local-first playground for AI QA agents. It uses a real Node server, live browser flows, deterministic failure modes, and Playwright-based planning, generation, recovery, diagnosis, and reporting agents instead of mocked UI theater.

## AI QA Agents

This repo is wired for the official Playwright agents plus two custom siblings, all addressable from a Claude Code / VS Code / OpenCode harness through the `playwright-test` MCP server (`.mcp.json`):

- **planner** — explores the app and writes a test plan to `specs/`
- **generator** — turns a plan item into a real spec under `tests/e2e/generated/`
- **healer** — runs tests, root-causes failures, and rewrites the broken test
- **diagnostician** (custom) — read-only RCA: evidence + classification → heal-vs-report verdict
- **reporter** (custom) — persists a local bug record + Obsidian incident/healing note

Pipeline: `planner → generator → run → diagnostician → (heal | report)`. Drift (a renamed control, slow/flaky data, a 4xx/5xx, a 401/403) is healed; by-design defects are reported. The agents fix the **tests**, never the app. Definitions live in `.claude/agents/`. For a complete, workspace-agnostic walkthrough (installation, terminology, seed, `storageState`, flag store, RBAC, and the full agent definitions) see **`md/PORTABLE_AGENT_ADOPTION_GUIDE.md`**; this repo's specifics are in `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md` and `md/PLAYGROUND_EXPANSION_DESIGN.md`.

## What Is In The Repo

- A zero-framework Node server that serves real pages: `/`, `/login`, `/dashboard`, `/product/:id`, `/user-manager`, `/orders`, `/admin`, `/profile`, and `/settings`
- Deterministic local API routes for health, orders loading, user creation, dynamic product data, and user management (with full/data reset endpoints), plus authentication (`/api/login`, `/api/logout`, `/api/session`), RBAC-gated user mutations and an admin audit log, and a per-runKey drift flag store (`/api/test/flags`)
- A full Playwright suite of `62` tests covering sanity, functional positive/negative, non-functional quality, API contracts, self-healing, diagnosis, orchestration, policy/planning, QA/staging repair flows, authentication/session and RBAC scenarios, OpenAI narrative-enrichment fallback paths, and a real-agent proof with an opt-in live OpenAI smoke
- Agent modules under `framework/agents/` grouped by `recovery/`, `diagnosis/`, `validation/`, `repair/`, `reporting/`, `llm/`, and `obsidian/`, with explicit scenario artifact output under `.artifacts/scenarios/`, patch-plan output under `.artifacts/patches/`, and local bug-report evidence under `.artifacts/bug-reports/`
- Page-level self-healing through shared page objects, page profiles, page contracts, and fixture-backed UI actions under `framework/pom/`, `framework/agents/recovery/pageProfiles/`, `framework/agents/validation/contracts.ts`, and `framework/fixtures/baseTest.ts`
- Multi-agent orchestration layer under `framework/orchestrator/` (`IncidentRouter`, `AgentRegistry`, `PolicyEngine`, `ExecutionPlanner`) with a local `framework/memory/IncidentMemoryStore`
- Repair flow (`PatchPlanner`, `PatchApplier`, `RepairVerifier`) gated to QA/staging only — production is hard-skipped
- Obsidian vault notes for scoped task tracking, test mapping, daily regression reports, and handoffs between agents
- Obsidian closeout guard that inspects changed files, checks required README/memory/task/test-map documentation, and writes workspace-state evidence
- GitHub Actions workflows for PR validation, main-branch regression, and scheduled daily regression artifacts

## Runtime Surface

- Home page: `Join Now` CTA with class `.btn-rounded` and real navigation into the dashboard flow
- Dashboard: live orders fetch with stable, slow, and flaky modes plus a real spinner and `Refresh data` button
- Product page: dynamic runtime rendering with both valid and intentionally broken states
- User Manager: dropdown, bulk actions menu, invite modal, row actions, and section-scoped form fields for advanced locator healing
- Orders, Admin, Profile, and Settings: each wired to its own page contract, page profile, and fixture for self-healing coverage
- Login + session: `/login` issues a real `sid` cookie; protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) carry a shared auth guard that redirects to `/login` when login is required; `storageState` is real via a `setup` Playwright project
- RBAC: Admin/Editor/Viewer gating on user create/edit/delete and the admin audit log, including an intentional over-permission defect for the reporter; all drift is armed deterministically per-runKey through the flag store
- Optional OpenAI narrative enrichment through `OPENAI_API_KEY`; pass/fail logic stays deterministic without it
- Optional real OpenAI self-healing smoke through `RUN_LIVE_OPENAI_AGENT_TEST=true` plus `OPENAI_API_KEY`; normal regression skips it, and passing live runs write Obsidian evidence under `Reports/Healing/` and `Reports/Workspace/`
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

## Containerized QA

The repo now has a shared Playwright runner image for local Docker runs, Jenkins, and GitHub Actions. The app `Dockerfile` is still the lightweight packaging gate; browser-based validation uses `Dockerfile.e2e` and the GHCR runner image `ghcr.io/asaf-1/genai-agenticai-demo-playwright`.

1. Log in to GHCR before the first pull:

   ```powershell
   docker login ghcr.io
   ```

   Use your GitHub username and a token with package read access.

2. Expect the first pull to download roughly `500MB-1GB`. Later runs are much faster because Docker reuses cached layers.

3. Pull or build the runner image:

   ```powershell
   npm.cmd run docker:pull-runner
   ```

4. Run a Linux-parity smoke check:

   ```powershell
   npm.cmd run test:docker:smoke
   ```

5. Run the full containerized regression:

   ```powershell
   npm.cmd run test:docker:e2e
   ```

6. Open an interactive shell inside the runner:

   ```powershell
   npm.cmd run docker:shell
   ```

Notes:

- The Docker path bind-mounts this repo into `/workspace` and keeps Linux `node_modules` in a Docker-managed volume so the Windows workspace stays clean.
- `.artifacts/` and `test-results/` remain on the host workspace for easy inspection.
- `.dockerignore` affects Docker build context only; the bind-mounted repo remains the visible runtime workspace inside the container.
- The first local run may build from `Dockerfile.e2e` if the GHCR image is not available yet.

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
- Real Obsidian/self-healing agent proof: `npm run test:real-agent`
- Obsidian closeout guard: `npm run obsidian:closeout -- --title <title> --summary <summary>`
- Headed run: `npm run test:e2e:headed`
- Playwright UI: `npm run test:e2e:ui`

Each scenario writes a `report.json`, screenshot, and trace to `.artifacts/scenarios/<scenario>/`.

## Local Bug Reporting

- Run the local bug tracker against a scenario artifact:

  ```powershell
  node scripts/bug-reporting/run-local-bug-report.js --scenario flaky-network-recovery
  ```

- Scan the current scenario artifacts:

  ```powershell
  node scripts/bug-reporting/run-local-bug-report.js --scan-artifacts
  ```

- Confirm a manual page defect:

  ```powershell
  node scripts/bug-reporting/run-local-bug-report.js --manual-url /product/sku-123?state=broken --expect-text "Dynamic product output backed by the local validation API."
  ```

- The `/bug-report` skill wraps the same runner through `.claude/skills/bug-report/SKILL.md`.
- Local bug records are written under `obsidian-vault/Reports/Bug Reports/` and evidence is written under `.artifacts/bug-reports/`.
- The tracker never opens external tickets in v1. It confirms the defect on the initial detection plus 3 reruns before creating or updating a local bug record.
- The storage boundary is additive and future-ready: a later Jira adapter can be added without rewriting the core confirmation or dedupe flow.

## Test Layout

- `tests/e2e/sanity/`
- `tests/e2e/functional/positive/`
- `tests/e2e/functional/negative/`
- `tests/e2e/non-functional/`
- `tests/e2e/contracts/`
- `tests/e2e/scenarios/`
- `tests/e2e/generated/` (official-agent output; run with `npm run test:generated`)

## Obsidian Vault

This repo doubles as an **Obsidian vault** for shared agent memory, planning, and cross-session handoffs. It lives at the **repo root** in `obsidian-vault/` (moved up from `docs/obsidian-vault/`) — in Obsidian, **open the repo root as the vault** so every note is in scope, then exclude `node_modules` and `test-results` under Settings → Files & links.

- `AGENT_MEMORY.md` — canonical phase / status / next, the known-issues table, and the append-only stop-point history
- `00 Home.md` — vault index; plus `01 Project Map.md`, `02 Test Map.md`, `03 Agent and Obsidian Workflow.md`
- `06 Agents Playground Guide.md` — the operator guide
- `Tasks/` — scoped task notes (latest: `008 Agents Playground Auth RBAC and Agent Roster.md`)
- `Reports/` — incident, healing, workspace, and local bug-report artifacts (gitignored except `README.md`)
- `Snapshots/` (cold-resume session state via the `/snapshot` skill), `Templates/`, and `Inbox/Agents/` (agent-to-agent handoffs)

The five Playwright agents write here: the **reporter** persists local bug records to `Reports/Bug Reports/` and incident/healing notes to `Reports/Incidents/` and `Reports/Healing/`. The **closeout guard** inspects changed files, checks that the matching docs were updated, and writes workspace-state evidence:

```powershell
npm run obsidian:closeout -- --title <title> --summary <summary>
```

## Workflow For Codex And Obsidian

- Keep repo-wide rules in `AGENTS.md`
- Keep shared project knowledge in `obsidian-vault/`
- Keep scoped implementation notes in `obsidian-vault/Tasks/`
- The current source-of-truth task note is `obsidian-vault/Tasks/008 Agents Playground Auth RBAC and Agent Roster.md`
- The main operator guide is `obsidian-vault/06 Agents Playground Guide.md`
- The local/private bug-reporting reference note is `md/BUG_REPORTING_GUIDE.md` for bug lifecycle, severity, escalation, and future bug-reporting-agent workflow ideas
- The reusable md-folder handoff for expanding page-level self-healing is `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md`
- Use the prompt pattern:

  `Read obsidian-vault/Tasks/<task-file>.md, implement it, run the listed validation, and update the note with the result.`

- Use `obsidian-vault/04 Daily Regression Automation.md` for unattended suite execution
- Treat top-level `md/` helper files as local/private notes, not shared project truth

## Merge And CI Rules

- Before a local push, run:
  - `npm run test:e2e`
  - `docker build -t ai-agentic-project-prepush .`
- Before merge, require Jenkins validation on the pushed revision
- In Jenkins, run Docker validation first on merge candidates, then run the matching Playwright validation inside the shared Playwright runner image
- Keep the daily Jenkins schedule as a full regression run
- GitHub Actions includes:
  - `pr-validation.yml` for pull requests
  - `main-validation.yml` for pushes to `main`
  - `daily-regression.yml` for scheduled daily regression at `05:00 UTC`
  - `publish-playwright-runner.yml` for publishing the shared Playwright runner image to GHCR
- GitHub Actions and Jenkins both execute browser-based validation inside the same shared Playwright runner contract instead of installing Playwright browsers directly on the host
- The scheduled GitHub Actions daily regression uploads artifact reports only and does not commit generated report files back into the repo

## Important Paths

- `server.js`: route mapping and local API
- `public/index.html`: landing page
- `public/dashboard.html`: orders recovery page
- `public/product.html`: dynamic product validation page
- `public/user-manager.html`: advanced locator-healing surface (dropdown, modal, bulk actions, row actions)
- `public/orders.html`, `admin.html`, `profile.html`, `settings.html`: page-level self-healing coverage (`admin.html` is fetch-driven from `/api/admin/audit`)
- `public/login.html`, `public/login.js`: sign-in page
- `public/auth-guard.js`: shared protected-page auth guard (default no-op; redirects to `/login` only when login is required)
- `framework/agents/`: deterministic recovery, diagnosis, validation, repair, local bug reporting, real LLM self-healing, and Obsidian memory agents grouped by responsibility
- `framework/agents/llm/`: bounded `SelfHealingLlmAgent` plus the opt-in `OpenAiSelfHealingProvider`
- `framework/agents/obsidian/`: `ObsidianMemoryAgent` for vault healing logs, workspace-state session logs, and task-result updates; `ObsidianCloseoutAgent` for changed-file documentation gating and closeout reports
- `framework/agents/reporting/`: local-only bug reporting agent, scenario catalog, and tracker adapter boundary
- `framework/agents/recovery/pageProfiles/`: page-level action intents for shared healing behavior
- `framework/agents/validation/contracts.ts`: reusable page contracts used by `PageValidationAgent`
- `framework/agents/repair/`: `PatchPlanner`, `PatchApplier`, `RepairVerifier` — QA/staging-only repair flow
- `framework/orchestrator/`: `IncidentRouter`, `AgentRegistry`, `PolicyEngine`, `ExecutionPlanner`
- `framework/memory/IncidentMemoryStore.ts`: local deterministic incident history
- `framework/pom/`: self-healing page objects for every user-facing page
- `framework/fixtures/baseTest.ts`: fixture-backed page object access used by the UI-facing tests
- `framework/data/scenarioPayloads.ts`: reusable API payloads for positive and negative coverage
- `framework/reporting/scenarioArtifacts.ts`: explicit scenario report, screenshot, and ownership-tracked trace writing
- `scripts/bug-reporting/`: standalone local bug-report runner and additive validation script
- `.claude/skills/bug-report/SKILL.md`: local-only `/bug-report` workflow for confirmed bug tracking
- `.claude/agents/`: the five QA agents — official `playwright-test-{planner,generator,healer}` + custom `playwright-test-{diagnostician,reporter}`
- `tests/e2e/auth.setup.ts`: mints the Admin session for real `storageState`, consumed by the `authenticated` Playwright project
- `tests/e2e/generated/`: home for official-agent (generator) output; run with `npm run test:generated`
- `specs/`: planner output (test plans)
- `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`: workspace-agnostic guide for adopting these agents anywhere
- `tests/e2e/`: category folders plus scenario specs (`62` tests total across the `default`/`authenticated`/`setup` projects, with the live OpenAI proof skipped unless explicitly enabled)
- `obsidian-vault/Snapshots/`: point-in-time session-state snapshots for cold resume across sessions or agent handoffs (write via the `/snapshot` skill)
