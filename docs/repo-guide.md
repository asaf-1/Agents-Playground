# Repository guide

The detail that used to live in `README.md`. Nothing here is summarised or
rewritten - the sections are as they were, moved so the README can be read in
a minute while this stays the reference.

See also: [`docs/remote-test-runner.md`](remote-test-runner.md) for the runner,
[`docs/ai-infrastructure-runbook.md`](ai-infrastructure-runbook.md) for the
cold-start inventory, and [`docs/flow-naming.md`](flow-naming.md) for how test
flows are named.

---

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

Grouped by what you are trying to do. Every one of these is a script in
`package.json`; `npm run` with no arguments lists them all.

### Everyday

| Command                | What it does                        |
| ---------------------- | ----------------------------------- |
| `npm test`             | Alias for the full Playwright suite |
| `npm run test:e2e`     | Full Playwright regression          |
| `npm run test:unit`    | Vitest component and unit tests     |
| `npm run test:sanity`  | Fastest confidence check, one spec  |
| `npm run format`       | Prettier, write                     |
| `npm run format:check` | Prettier, check only — what CI runs |

### Build and serve

| Command           | What it does                            |
| ----------------- | --------------------------------------- |
| `npm run build`   | Build the React surface to `public/app` |
| `npm start`       | Serve the app on `127.0.0.1:4173`       |
| `npm run dev:web` | Vite dev server for the React surface   |

### By test category

| Command                            | Covers                                               |
| ---------------------------------- | ---------------------------------------------------- |
| `npm run test:functional:positive` | Healthy user journeys                                |
| `npm run test:functional:negative` | Error paths and bad input                            |
| `npm run test:nonfunctional`       | Latency budgets, mobile layout, broken-page detector |
| `npm run test:contract`            | API replies against `openapi.json`                   |
| `npm run test:visual`              | Screenshot comparison (opt-in; Windows baselines)    |
| `npm run test:generated`           | Specs written by the generator agent                 |

### One agent scenario at a time

| Command                        | Scenario                                  |
| ------------------------------ | ----------------------------------------- |
| `npm run test:ui-heal`         | A renamed control, healed                 |
| `npm run test:flaky`           | Flaky network, recovered                  |
| `npm run test:api`             | A 4xx/5xx, diagnosed                      |
| `npm run test:dynamic`         | Dynamic content validated                 |
| `npm run test:generic-healing` | Generic self-healing path                 |
| `npm run test:page-contracts`  | Page contracts validated                  |
| `npm run test:classification`  | Failure sorted, patch proposed            |
| `npm run test:real-agent`      | Live agent proof (needs `OPENAI_API_KEY`) |

Each scenario writes a `report.json`, a screenshot and a trace to
`.artifacts/scenarios/<scenario>/`.

### Remote test runner

| Command                                              | What it does                                          |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `npm run flows:list`                                 | Every flow the pipeline can run, with its id          |
| `npm run flows:discover`                             | Regenerate `flow-catalog.json`                        |
| `npm run flows:check`                                | Fail if the committed catalog is stale — what CI runs |
| `npm run test:flow -- --flow group-sanity`           | Run one catalog flow locally                          |
| `npm run test:remote -- --flow group-sanity --watch` | Start it on the GitHub-hosted runner                  |

Note the argument is the flow **id** (`group-sanity`), not the display name
(`sanity:smoke`). Ids are stable; names are not. `flows:list` prints both.

### Debugging a failure

| Command                   | What it does                       |
| ------------------------- | ---------------------------------- |
| `npm run test:e2e:headed` | Run with a visible browser         |
| `npm run test:e2e:ui`     | Playwright's UI mode               |
| `npm run test:e2e:debug`  | Playwright inspector, step through |

### Docker

| Command                         | What it does                            |
| ------------------------------- | --------------------------------------- |
| `npm run docker:prepare-runner` | Pull the GHCR runner image, or build it |
| `npm run test:docker:smoke`     | Sanity spec inside the container        |
| `npm run test:docker:e2e`       | Full regression inside the container    |
| `npm run docker:shell`          | A shell in the runner container         |

### Housekeeping

| Command                                                            | What it does                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `npm run obsidian:closeout -- --title <title> --summary <summary>` | Closeout guard: checks required docs changed, writes workspace evidence |
| `npm run review:claude:pull -- --pr <number>`                      | Pull a Claude PR review into the Obsidian inbox                         |
| `npm run review:ai:mark`                                           | Mark the AI review gate for the current head                            |

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
  - `pr-validation.yml` for pull requests — **4 shards × 4 workers** on the host, aggregated into one `Pre-Merge Gate` check
  - `main-validation.yml` for pushes to `main` — full regression **4 shards × 4 workers** in the shared Docker runner
  - `post-merge-canary.yml` for fast app health, sanity, and contract validation after a PR is merged into `main`
  - `daily-regression.yml` for scheduled daily regression at `05:00 UTC`
  - `publish-playwright-runner.yml` for publishing the shared Playwright runner image to GHCR
- **Parallelism + sharding gate:** `PR Validation` runs formatting plus the full Playwright suite split into **4 shards × 4 workers** on the host (`--shard=<n>/4 --workers=4`, blob reporter); a final `Pre-Merge Gate` job aggregates formatting and all 4 shards into the single required check. That job is deliberately one step with no network: it used to also merge the shard blobs into an HTML report, and went red twice on GitHub's artifact storage while every test had passed. `Main Branch Validation` runs the same suite **4 shards × 4 workers** in the shared Docker runner. Execution is both parallel (workers) and distributed (shards) — details in `obsidian-vault/09 Infrastructure and CI Map.md`.
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
- `scripts/test-runner/`: pipeline side of the runner — flow discovery, the committed flow catalog, plan resolution, the shard executor, and the `gh`-based dispatch CLI
- `test-runner/`: the standalone Test Runner web app (own server, own UI, own login/sign-up, own Dockerfile). Independent of `server.js`
- `.github/workflows/remote-test-runner.yml`: the GitHub-hosted runner (plan, sharded matrix, merged report)
- `.github/workflows/flow-catalog.yml`: refreshes and commits the flow catalog on every push to `main`
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
