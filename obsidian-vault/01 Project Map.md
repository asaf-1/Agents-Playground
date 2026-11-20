# Project Map

> Project renamed to **Agents-Playground** (package name `agents-playground`; GitHub repo `asaf-1/Agents-Playground`, still PRIVATE). The Obsidian vault MOVED to the repo-root `obsidian-vault/` — open the REPO ROOT as the vault to catch everything.

> **Deeper maps:** [[07 Architecture Overview]] (big picture) · [[08 Vault Dependency Map]] (what breaks without the vault) · [[09 Infrastructure and CI Map]] (CI / merge policy) · [[10 Agent Roster]] (agents). This note is the canonical **code layout**.

## Stack

- Runtime: Node.js 20+ (`engines: >=20`); the app **Docker image runs `node:26`** and the GitHub host runners run on **Node 26** since 2026-11-06, PR validation included (kept by hand) — see [[09 Infrastructure and CI Map]]
- App style: **one frontend on one Node server** — Playground Bank, a **Vite 8 + React 19 + TypeScript SPA at `/app`** (React Router 7, TanStack Query 5, React Hook Form 7 + Zod 4, Radix UI), built to `public/app`; `/` redirects there. The legacy static surface (vanilla HTML/JS in `public/`) was removed on 2026-11-20 and everything it showed moved into the bank
- API docs: **OpenAPI 3.1** (`bank/openapi.json`) served at `/api/openapi.json`, Swagger UI at `/api/docs`
- Testing: Playwright E2E (self-healing, diagnosis, validation, real-agent, cookie auth + RBAC) + **axe** accessibility + **ajv** OpenAPI contract checks; **Vitest + Testing Library + MSW** component/unit tests under `web/src/`

## Important Paths

- `server.js`
  - the root redirect, the bank's pages at `/app`, the back office's JSON API (orders, users, products, the back-office sign-in) and the test hooks; hands `/api/bank/*` to `bank/`; binds `HOST` (default `127.0.0.1`; canary sets `0.0.0.0`) and `PORT` (default `4173`)
- `web/src/pages/`
  - the bank's pages; Orders, Users, ProductDetail and Account carry the AI agents' demo surfaces (the HEAL fault `ordersRefreshLabel`, Delete for an Admin, the test flag `productRenderBroken`, the back-office sign-in)
- `web/src/app.css`
  - the bank's styles; `.detail-overlap` is **load-bearing**: it draws the broken product state's price over the buy area, which the page checker must catch (see [[02 Test Map]])
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
  - planner output (test plans)

## Backend Routes In `server.js`

The bank's own routes are under `/api/bank` (`bank/routes.js`), with its health checks at `/api/bank/health/live` and `/ready`. `server.js` itself answers the back office's routes:

- `GET /api/orders?mode=stable|slow|flaky&delayMs=<n>` (slow is 7 s when no `delayMs` is sent; fixed 2026-11-20, it was 0)
- back-office sign-in (the form on `/app/account`):
  - `POST /api/login`
  - `POST /api/logout`
  - `GET /api/session`
  - `POST /api/test/set-session`
- users / RBAC:
  - `GET /api/users` (applies `editsByUserId` + `deletedManagedUserIds` overlays)
  - `POST /api/users` (role-gated when `rbacEnforce` is armed)
  - `PATCH /api/users/:id` (role-gated when `rbacEnforce` is armed)
  - `DELETE /api/users/:id` (Admin only, always; carries the INTENTIONAL editor-delete over-permission DEFECT under `rbacBug=editor-delete`)
- products + API docs:
  - `GET /api/products` (the planted `productSchemaDrift`), `GET /api/products/:id` (the AI agents' test flag `productRenderBroken`)
  - `GET /api/openapi.json` (OpenAPI 3.1 spec), `GET /api/docs` (Swagger UI), `GET /api/docs-assets/*`
- flag store:
  - `GET /api/test/flags`, `POST /api/test/flags`, `DELETE /api/test/flags` (per-runKey flag store; with no runKey, `DELETE` runs `resetAll()`)

Removed with the original demo site on 2026-11-20: `/api/health`, `/api/create-user`, `/api/product/:id`, `/api/admin/audit`, `/api/test/reset-users`, `/api/test/reset`, and the flags `loginSubmitLabel` and `adminGate`.

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

All on Playground Bank's pages since 2026-11-20:

- Load orders on `/app/orders` with stable, slow, and flaky modes; recover through Retry or the page's own retry
- Heal the planted HEAL fault `ordersRefreshLabel` (Refresh renamed Reload)
- Diagnose `GET /api/products` sending a price as text against its schema (the planted `productSchemaDrift`)
- Validate a product page as it is and in the AI agents' broken state (`productRenderBroken`)
- Sign in to the back office on `/app/account` with a cookie-based opaque session (HttpOnly `sid`); the expired-session state shows when `authRequired` and `sessionExpired` are armed
- Exercise role-gated user management (Admin/Editor/Viewer via `ROLE_PERMISSIONS`) on `/app/users`, Delete for an Admin only, including the intentional editor-delete over-permission defect

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
- **Latest task notes:** [[Tasks/011 React Surface and OpenAPI Expansion]] (Vite + React `/app` + OpenAPI) is the most recent, then [[Tasks/010 CSS Polish]] (CSS-only visual polish) and [[Tasks/009 GitHub Pre-Merge Review and Canary]] (GitHub-first CI); [[Tasks/008 Agents Playground Auth RBAC and Agent Roster]] is the latest product expansion; 003–007 are prior milestones
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
