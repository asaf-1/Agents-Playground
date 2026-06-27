# Project Map

> Project renamed to **Agents-Playground** (package name `agents-playground`; GitHub repo `asaf-1/Agents-Playground`, still PRIVATE). The Obsidian vault MOVED to the repo-root `obsidian-vault/` — open the REPO ROOT as the vault to catch everything.

> **Deeper maps:** [[07 Architecture Overview]] (big picture) · [[08 Vault Dependency Map]] (what breaks without the vault) · [[09 Infrastructure and CI Map]] (CI / merge policy) · [[10 Agent Roster]] (agents). This note is the canonical **code layout**.

## Stack

- Runtime: Node.js 20+ (`engines: >=20`); the app **Docker image runs `node:24`**, and the post-merge-canary _runner_ is pinned to Node 20 — see [[09 Infrastructure and CI Map]]
- App style: static frontend served by a custom Node HTTP server with explicit page routing
- Testing: Playwright E2E with deterministic self-healing, diagnosis, validation, real-agent proof coverage, cookie-based auth + RBAC, and artifact output

## Important Paths

- `server.js`
  - page routing plus local JSON API; binds `HOST` (default `127.0.0.1`; canary sets `0.0.0.0`) and `PORT` (default `4173`)
- `public/index.html`
  - landing page with the `Join Now` CTA, health check, and quick-triage input
- `public/app.js`
  - landing-page navigation, health check logic, and quick-triage echo behavior
- `public/dashboard.html`
  - live orders recovery page
- `public/dashboard.js`
  - orders fetch, spinner, retry, and flaky-run isolation behavior
- `public/product.html`
  - dynamic product validation page
- `public/product.js`
  - runtime product rendering for valid and broken states
- `public/login.html`
  - public login page (Phase 1 auth)
- `public/login.js`
  - login form submit against `POST /api/login` and session handling
- `public/auth-guard.js`
  - shared client guard on protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`); redirects to `/login` only when the `authRequired` flag is armed (default OFF so existing tests stay green)
- `public/admin.js`
  - fetch-driven admin audit view hitting `GET /api/admin/audit` (the `/admin` page was rewritten from inline-static to fetch-driven, preserving testids + `clearLog`->0 + contract)
- `public/styles.css`
  - shared visual system and broken-layout styling; the `.product-layout--broken` price/buy-button overlap geometry and `[hidden]` `display:none` are **load-bearing** (tests assert them — see [[02 Test Map]])
- `.claude/agents/`
  - 5-agent roster, addressable from a Claude Code / VS Code / OpenCode harness via the `playwright-test` MCP server in `.mcp.json`
- `.mcp.json`
  - `playwright-test` MCP server config that exposes the agent roster to the harness
- `framework/agents/recovery/`
  - generic locator healing, recovery routing, selector compatibility wrapper, network recovery wrapper, and page profiles
- `framework/agents/diagnosis/`
  - deterministic failure classification, patch proposals, API diagnosis, and optional narrative enrichment
- `framework/agents/llm/`
  - bounded `SelfHealingLlmAgent` plus the opt-in `OpenAiSelfHealingProvider`
- `framework/agents/obsidian/`
  - `ObsidianMemoryAgent` for healing-run vault logs, workspace-state handoff logs, and task-result updates; `ObsidianCloseoutAgent` for changed-file documentation gating and closeout reports
- `framework/agents/validation/`
  - reusable page contracts plus generic page validation
- `framework/pom/`
  - page objects for home, dashboard, and product pages plus the shared `SelfHealingPage` base layer
- `framework/fixtures/baseTest.ts`
  - Playwright fixture layer that injects the current self-healing page objects into tests
- `framework/data/scenarioPayloads.ts`
  - reusable API payloads
- `framework/reporting/scenarioArtifacts.ts`
  - report, screenshot, and trace writing
- `tests/e2e/sanity/`
  - fast smoke coverage
- `tests/e2e/functional/`
  - positive and negative business behavior coverage
- `tests/e2e/non-functional/`
  - local latency, responsive, and render-quality checks
- `tests/e2e/contracts/`
  - API contract governance checks
- `tests/e2e/scenarios/`
  - healing, recovery, diagnosis, contract validation, real-agent proof, and patch-proposal demonstrations
  - `auth-session.spec.ts` — cookie session / login flow coverage (4 tests)
  - `rbac.spec.ts` — role gating coverage incl. the intentional editor-delete over-permission defect (5 tests, serial)
- `tests/e2e/auth.setup.ts`
  - mints a real Admin session and saves storageState to `.artifacts/auth/admin.json`
- `specs/`
  - planner output (test plans), e.g. `user-manager.plan.md`

## Backend Routes In `server.js`

- `GET /api/health`
- `GET /api/orders?mode=stable|slow|flaky&delayMs=<n>`
- `POST /api/create-user`
- `GET /api/product/:id?state=valid|broken`
- auth / session (Phase 1):
  - `POST /api/login`
  - `POST /api/logout`
  - `GET /api/session`
  - `POST /api/test/set-session`
- users / RBAC (Phase 3):
  - `GET /api/users` (applies `editsByUserId` + `deletedManagedUserIds` overlays)
  - `POST /api/users` (role-gated)
  - `PATCH /api/users/:id` (role-gated)
  - `DELETE /api/users/:id` (role-gated; carries the INTENTIONAL editor-delete over-permission DEFECT under `rbacBug=editor-delete`)
  - `GET /api/admin/audit` (401/403/200)
- flag store + reset:
  - `GET /api/test/flags`, `POST /api/test/flags`, `DELETE /api/test/flags` (per-runKey flag store)
  - `POST /api/test/reset-users` (runs `resetData()` — user data only, PARALLEL-SAFE)
  - `POST /api/test/reset` (runs `resetAll()` — also flaky markers, order counter, sessions, flags; seed/setup ONLY)

## Agent Roster

Five agents live in `.claude/agents/`, addressable from a Claude Code / VS Code / OpenCode harness via the `playwright-test` MCP server in `.mcp.json`.

- `playwright-test-planner` (official) — explores the app, writes a plan to `specs/`
- `playwright-test-generator` (official) — turns a plan item into a spec under `tests/e2e/generated/`
- `playwright-test-healer` (official) — runs tests, root-causes failures, rewrites the broken TEST
- `playwright-test-diagnostician` (NEW, custom) — read-only RCA: gathers evidence + classifies (14-category `FailureClassifier` taxonomy) -> verdict HEAL vs REPORT
- `playwright-test-reporter` (NEW, custom) — persists a local bug record + Obsidian incident/healing note

Pipeline: planner -> generator -> run -> diagnostician -> (heal | report). Drift heals; by-design defects get reported. Agents fix TESTS, never the app.

## Playwright Projects

`playwright.config.ts` splits execution into three projects so the auth suite runs logged-in while the existing no-auth suite is preserved:

- `setup` — runs `auth.setup.ts` to mint an Admin session
- `authenticated` — runs `auth-session` + `rbac` specs via the saved `storageState` (`.artifacts/auth/admin.json`); depends on `setup`
- `default` — everything else, storageState-free (preserves the existing no-auth suite)

## Current Product Flows

- Navigate from the landing page into the dashboard through the `Join Now` CTA
- Use a real quick-triage input on the landing page and see the captured summary echoed live
- Load orders through a real local API with stable, slow, and retryable failure modes
- Recover the dashboard through the visible `Refresh data` control or extended wait behavior
- Diagnose a real API type mismatch on `POST /api/create-user`
- Validate runtime product content across valid and broken render states
- Check local API health from the landing page
- Log in through `/login` with a cookie-based opaque session (HttpOnly `sid`); protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) guard via `auth-guard.js` only when `authRequired` is armed
- Exercise role-gated user management (Admin/Editor/Viewer via `ROLE_PERMISSIONS`) over create/edit/delete, including the intentional editor-delete over-permission defect
- View a fetch-driven admin audit log with 401/403/200 access outcomes

## Current Framework Layers

- generic locator healing for buttons, links, and inputs
- deterministic failure classification for UI and API incidents (both previously-dark categories — `auth-or-session` and `permissions-or-rbac` — are now LIT)
- recovery routing across QA-safe strategies
- deterministic patch proposals
- reusable page contracts for home, dashboard, and product pages
- page-level self-healing through page profiles, page objects, and shared fixtures
- compatibility wrappers for the original selector-healing and network-recovery demos
- bounded real LLM self-healing proof with fake-provider default coverage and opt-in live OpenAI smoke
- Obsidian memory and closeout agent proof for vault healing logs, workspace-state handoff logs, changed-file documentation gating, and task-note result updates

## Documentation Model

- `obsidian-vault/` is the shared documentation system (the **second brain**); [[00 Home]] is the index and [[AGENT_MEMORY]] the live state
- `AGENTS.md` holds stable repository rules
- **Canonical maps:** [[07 Architecture Overview]], [[08 Vault Dependency Map]], [[09 Infrastructure and CI Map]], [[10 Agent Roster]]
- **Latest task notes:** [[Tasks/010 CSS Polish]] (CSS-only visual polish) and [[Tasks/009 GitHub Pre-Merge Review and Canary]] (GitHub-first CI) are the most recent; [[Tasks/008 Agents Playground Auth RBAC and Agent Roster]] is the latest product expansion; 003–007 are prior milestones
- top-level `md/` files are not the primary project source of truth; the portable guides (`md/PORTABLE_AGENT_ADOPTION_GUIDE.md`, `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md`, `md/PLAYGROUND_EXPANSION_DESIGN.md`) cover adoption/expansion work — Phase 2 (a `/lab` control-panel GUI) and Phase 4 (richer flows) are DESIGNED but DEFERRED
- ⚠️ `md/WORKSPACE_OVERVIEW.md` and `md/PLAN.md` are **historical / superseded** (old project name, port 3000, pre-auth/RBAC) — use [[07 Architecture Overview]] + this note instead

## Current Constraints

- data is in-memory only
- the demo is local-only
- scenario artifacts are written under `.artifacts/scenarios/`
- `OPENAI_API_KEY` is optional; default regression stays offline, while `RUN_LIVE_OPENAI_AGENT_TEST=true` enables the explicit live OpenAI self-healing smoke
- QA auto-mitigation is limited to locator healing, extend-wait, refresh-and-retry, and contract re-check
- patch proposals are proposal-only; this version does not auto-edit code during recovery
- the current real-agent proof is runtime self-healing only; any future source-editing patching agent must include reset/revert handling for intentional demo bugs

## Governance

- [[05 Enterprise Infrastructure Rules]] is the reusable baseline for enterprise-style infrastructure, QA, and automation work
- for multiple products or platforms, create separate task notes and keep shared rules centralized in [[05 Enterprise Infrastructure Rules]]
- local-only personal overrides should stay in ignored files outside GitHub
