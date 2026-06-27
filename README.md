# Agents-Playground

Agents-Playground is a local-first playground for AI agents. It uses a real Node server, live browser flows, deterministic failure modes, and Playwright-based planning, generation, recovery, diagnosis, and reporting agents instead of mocked UI theater.

## Features

- **Two frontends, one server:** a legacy static surface (`/`, 8 vanilla pages) and a modern React SPA (`/app`), both served by the same Node API.
- **React surface (`/app`):** Orders (TanStack Query — loading/error/retry, stable/slow/flaky modes), Users (live list, debounced search, Radix dropdown row actions, RHF + Zod create dialog with optimistic update + rollback), Products (48-item catalog with search / category filter / sort + detail pages), Account (session state).
- **JSON API:** health, orders, products (+detail), users (CRUD), auth/session, RBAC-gated mutations, admin audit log, and a per-`runKey` drift flag store (`/api/test/flags`).
- **OpenAPI 3.1 contract:** spec at `/api/openapi.json`, Swagger UI at `/api/docs`, and ajv contract tests validating live responses against the schema.
- **Deterministic flag-armed defects** (per `runKey`, off by default) spanning DOM/selector, async/state, i18n, accessibility, auth/session, and API-contract categories — catalogued in `docs/react-surface-defects.md`.
- **Self-healing QA framework:** six Playwright agents (planner, generator, healer, senior-leader, diagnostician, reporter), page objects/profiles/contracts, multi-agent orchestration, and local incident memory.
- **Test coverage:** Playwright E2E (incl. axe accessibility and OpenAPI contract checks) plus Vitest/MSW component tests; parallel-safe and shardable.
- **CI/release:** branch-first PR flow with pre-push hook, AI review gate, post-merge canary, and scheduled regression.
- **Obsidian vault** for agent memory, planning, handoffs, and closeout gating.

## AI Agents

This repo is wired for the official Playwright agents plus three custom siblings, addressable from a Claude Code / VS Code / OpenCode harness through the `playwright-test` MCP server (`.mcp.json`). The senior-leader workflow is also exposed to Codex through `.agents/skills/senior-leader/SKILL.md` and mirrored for Claude skills in `.claude/skills/senior-leader/SKILL.md`:

- **senior leader** (custom) — flattens work into AI-native pods, writes specialist handoff briefs, and sets validation/closeout gates
- **planner** — explores the app and writes a test plan to `specs/`
- **generator** — turns a plan item into a real spec under `tests/e2e/generated/`
- **healer** — runs tests, root-causes failures, and rewrites the broken test
- **diagnostician** (custom) — read-only RCA: evidence + classification → heal-vs-report verdict
- **reporter** (custom) — persists a local bug record + Obsidian incident/healing note

Pipeline: `senior leader → pod plan → planner/generator or diagnostician → (healer | reporter)`. Drift (a renamed control, slow/flaky data, a 4xx/5xx, a 401/403) is healed; by-design defects are reported. The agents fix the **tests**, never the app. Claude agent definitions live in `.claude/agents/`; Codex-facing reusable workflows live in `.agents/skills/`. For a complete, workspace-agnostic walkthrough (installation, terminology, seed, `storageState`, flag store, RBAC, and the full agent definitions) see **`md/PORTABLE_AGENT_ADOPTION_GUIDE.md`**; this repo's specifics are in `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md` and `md/PLAYGROUND_EXPANSION_DESIGN.md`.

## What Is In The Repo

- A zero-framework Node server that serves real pages: `/`, `/login`, `/dashboard`, `/product/:id`, `/user-manager`, `/orders`, `/admin`, `/profile`, and `/settings`
- A Vite + React + TypeScript SPA at `/app` (Orders, Users, Products + detail, Account) using React Router, TanStack Query, React Hook Form + Zod, and Radix UI — built to `public/app` and served by the same Node server with a client-side routing fallback
- An OpenAPI 3.1 spec (`openapi.json`) served at `/api/openapi.json` with Swagger UI at `/api/docs`
- Deterministic local API routes for health, orders loading, user creation, dynamic product data, and user management (with full/data reset endpoints), plus authentication (`/api/login`, `/api/logout`, `/api/session`), RBAC-gated user mutations and an admin audit log, and a per-runKey drift flag store (`/api/test/flags`)
- A Playwright suite of `143` tests (141 run + 2 opt-in skips) covering sanity, functional positive/negative, non-functional quality, API contracts, OpenAPI schema contracts, self-healing, diagnosis, orchestration, policy/planning, QA/staging repair flows, authentication/session and RBAC scenarios, the React `/app` surface and its injected defects, OpenAI narrative-enrichment fallback paths, and a real-agent proof with an opt-in live OpenAI smoke — plus `4` Vitest component/unit tests (Testing Library + MSW)
- Agent modules under `framework/agents/` grouped by `recovery/`, `diagnosis/`, `validation/`, `repair/`, `reporting/`, `llm/`, and `obsidian/`, with explicit scenario artifact output under `.artifacts/scenarios/`, patch-plan output under `.artifacts/patches/`, and local bug-report evidence under `.artifacts/bug-reports/`
- Page-level self-healing through shared page objects, page profiles, page contracts, and fixture-backed UI actions under `framework/pom/`, `framework/agents/recovery/pageProfiles/`, `framework/agents/validation/contracts.ts`, and `framework/fixtures/baseTest.ts`
- Multi-agent orchestration layer under `framework/orchestrator/` (`IncidentRouter`, `AgentRegistry`, `PolicyEngine`, `ExecutionPlanner`) with a local `framework/memory/IncidentMemoryStore`
- Repair flow (`PatchPlanner`, `PatchApplier`, `RepairVerifier`) gated to QA/staging only — production is hard-skipped
- Obsidian vault notes for scoped task tracking, test mapping, daily regression reports, and handoffs between agents
- Obsidian closeout guard that inspects changed files, checks required README/memory/task/test-map documentation, and writes workspace-state evidence
- GitHub Actions workflows for PR validation, main-branch regression, post-merge canary validation, and scheduled daily regression artifacts
- CSS-only visual polish layer in `public/styles.css` that keeps the static DOM/test target intact while unifying page shells, forms, buttons, tables, focus rings, and reduced-motion behavior

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

## Tech stack

- **App server:** Node.js (zero-framework `http` server in `server.js`) serving static pages + a JSON API + the built SPA.
- **React surface (`/app`):** Vite 8, React 19, TypeScript, React Router 7, TanStack Query 5 (server state), React Hook Form 7 + Zod 4 (forms/validation), Radix UI (dialog, dropdown).
- **Legacy surface (`/`):** static HTML + vanilla JS (8 pages).
- **API contract:** OpenAPI 3.1 (`openapi.json`) served at `/api/openapi.json`, with Swagger UI at `/api/docs` (`swagger-ui-dist`).
- **E2E tests:** Playwright 1.61 (Chromium); `@axe-core/playwright` (accessibility); `ajv` + `ajv-formats` (OpenAPI schema contract validation).
- **Component/unit tests:** Vitest 4 + Testing Library (React) + jsdom; MSW 2 (network mocking).
- **Formatting:** Prettier 3.
- **CI/runtime:** GitHub Actions (PR validation, AI review gate, post-merge canary, main + daily regression, GHCR runner publish); Node 24 hosts; Docker runner image `Dockerfile.e2e` (Playwright 1.61.1) for containerized regression.

## Run It Locally

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Install a Playwright browser if needed:

   ```powershell
   npx.cmd playwright install chromium
   ```

3. Build the React surface (`/app`):

   ```powershell
   npm.cmd run build
   ```

4. Start the app:

   ```powershell
   npm.cmd run start
   ```

5. Run the suites:

   ```powershell
   npm.cmd run test:e2e
   npm.cmd run test:unit
   ```

6. Open:

   ```text
   http://127.0.0.1:4173            # legacy pages + JSON API
   http://127.0.0.1:4173/app        # React surface (Vite + React)
   http://127.0.0.1:4173/api/docs   # Swagger UI (OpenAPI 3.1)
   ```

## Containerized with Docker

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

- Format check: `npm run format:check`
- Format write: `npm run format`
- Full regression: `npm run test:e2e`
- NPM alias: `npm test`
- Component/unit (Vitest): `npm run test:unit`
- Visual regression (opt-in): `npm run test:visual`
- Build the React surface: `npm run build`
- Vite dev server: `npm run dev:web`
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

The six Playwright agents write here: the **senior leader** coordinates pod handoffs and closeout gates, the **reporter** persists local bug records to `Reports/Bug Reports/` and incident/healing notes to `Reports/Incidents/` and `Reports/Healing/`. The **closeout guard** inspects changed files, checks that the matching docs were updated, and writes workspace-state evidence:

```powershell
npm run obsidian:closeout -- --title <title> --summary <summary>
```

## Workflow For Codex And Obsidian

- Keep repo-wide rules in `AGENTS.md`
- Keep shared project knowledge in `obsidian-vault/`
- Keep scoped implementation notes in `obsidian-vault/Tasks/`
- Use `.agents/skills/senior-leader/SKILL.md` for Codex-side pod orchestration; use `.claude/agents/playwright-test-senior-leader.md` for Claude custom-agent orchestration
- The current source-of-truth task note is `obsidian-vault/Tasks/010 CSS Polish.md` for the CSS-only visual polish slice; the GitHub automation note remains `obsidian-vault/Tasks/009 GitHub Pre-Merge Review and Canary.md`, and the latest product expansion note remains `obsidian-vault/Tasks/008 Agents Playground Auth RBAC and Agent Roster.md`
- The main operator guide is `obsidian-vault/06 Agents Playground Guide.md`
- The local/private bug-reporting reference note is `md/BUG_REPORTING_GUIDE.md` for bug lifecycle, severity, escalation, and future bug-reporting-agent workflow ideas
- The reusable md-folder handoff for expanding page-level self-healing is `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md`
- Use the prompt pattern:

  `Read obsidian-vault/Tasks/<task-file>.md, implement it, run the listed validation, and update the note with the result.`

- Use `obsidian-vault/04 Daily Regression Automation.md` for unattended suite execution
- Treat top-level `md/` helper files as local/private notes, not shared project truth

## Merge And CI Rules

- End-to-end runbook for the pre-push hook → exact-head AI review → user-approved merge → post-merge canary: `docs/pre-merge-review-and-canary.md`
- AI-operable infrastructure catalog and execution contract: `docs/ai-infrastructure-runbook.md`
- Work on a feature branch; ordinary direct pushes to `main` are blocked by `.githooks/pre-push`.
- The hook uses PowerShell on Windows and platform-native `npm`/`docker` commands through the Node fallback on other operating systems.
- Before pushing the feature branch, run:
  - `npm run test:e2e`
  - Docker build only when `pipeline.config.json -> preMerge.dockerEnabled` is `true` (currently `false`)
- Open a PR into `main`; do not merge until `PR Validation / Pre-Merge Gate` and `AI Review Gate / Current Head Review` are green.
- Use Codex or Claude for current-head review, resolve findings by human judgment, then record the reviewed SHA with `npm run review:ai:mark -- --pr <number> --reviewer <codex|claude>`.
- Claude review remains free-first/manual through `@claude review once`; no Anthropic API workflow or secret is required.
- Human judgment remains the merge authority.
- Pull Claude PR comments dynamically with `npm run review:claude:pull -- --pr <number>` instead of copy/pasting review text into chat
- This private repository cannot enable GitHub server-side branch protection on the current plan. The tracked hook and visible checks enforce the process locally; GitHub Pro or a public repository is required for a hard remote merge lock.
- Jenkins remains present for existing/local validation, but it is out of scope for the current GitHub-first merge gate
- GitHub Actions includes:
  - `ai-review-gate.yml` for current-head Codex/Claude review evidence
  - `pr-validation.yml` for pull requests
  - `main-validation.yml` for pushes to `main`
  - `post-merge-canary.yml` for fast app health, sanity, and contract validation after a PR is merged into `main`
  - `daily-regression.yml` for scheduled daily regression at `05:00 UTC`
  - `publish-playwright-runner.yml` for publishing the shared Playwright runner image to GHCR
- GitHub `PR Validation` runs formatting and full Playwright; when the root pipeline policy enables Docker, it also builds the app and uses the shared container runner
- Host PR validation and post-merge canary jobs run on Node 24, matching the app image (briefly pinned to Node 20 while Playwright 1.59's browser installer stalled on Node 24; Playwright 1.61.1 resolved it)
- GitHub post-merge canary checks out the merged revision, starts the app on the runner, probes `/api/health`, and runs `npm run test:sanity -- --retries=0` plus `npm run test:contract -- --retries=0`; setting `postMerge.dockerEnabled` to `true` restores its Docker runtime
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
- `.agents/skills/senior-leader/SKILL.md`: Codex-side senior-leader pod orchestration workflow
- `.claude/skills/senior-leader/SKILL.md`: Claude skill mirror for the senior-leader workflow
- `.claude/skills/bug-report/SKILL.md`: local-only `/bug-report` workflow for confirmed bug tracking
- `pipeline.config.json`: root pipeline policy; `preMerge.dockerEnabled` and `postMerge.dockerEnabled` independently restore Docker for each stage (both currently `false`)
- `.claude/agents/`: the six QA agents — official `playwright-test-{planner,generator,healer}` + custom `playwright-test-{senior-leader,diagnostician,reporter}`
- `tests/e2e/auth.setup.ts`: mints the Admin session for real `storageState`, consumed by the `authenticated` Playwright project
- `tests/e2e/generated/`: home for official-agent (generator) output; run with `npm run test:generated`
- `specs/`: planner output (test plans)
- `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`: workspace-agnostic guide for adopting these agents anywhere
- `tests/e2e/`: category folders plus scenario and `app/` specs (`143` Playwright tests across the `default`/`authenticated`/`setup` projects, plus `4` Vitest component/unit tests under `web/src/`; the live OpenAI proof and the healer-demo fixme are skipped unless explicitly enabled)
- `obsidian-vault/Snapshots/`: point-in-time session-state snapshots for cold resume across sessions or agent handoffs (write via the `/snapshot` skill)
