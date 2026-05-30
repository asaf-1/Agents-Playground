---
type: task
status: validated
tags:
  - task
  - agent-ready
  - playwright-agents
  - auth
  - rbac
  - obsidian
---

# Agents Playground Auth RBAC and Agent Roster

## Outcome

Turn the demo site into a richer agent playground, adopt the three official Playwright test agents, and add two custom agents (a read-only diagnostician and a vault reporter) so a planner -> generator -> run -> diagnose -> (heal | report) pipeline can be driven from a Claude Code / VS Code / OpenCode harness. Phase 1 (auth + session) and Phase 3 (RBAC) ship behind drift flags so existing regression stays deterministic.

## Context

The workspace already proved deterministic self-healing, local bug reporting, and a real-agent proof. To exercise more of the FailureClassifier taxonomy it needed real auth/session and permission/RBAC surfaces. The two previously-dark FailureClassifier categories (`auth-or-session`, `permissions-or-rbac`) are now lit. The project was also renamed to "Agents-Playground" and the Obsidian vault moved to the repo root so the whole repo can be opened as one vault.

## Target Files

- `package.json` (name `agents-playground`)
- `README.md` (title)
- `.claude/agents/*` (5 agent definitions)
- `.mcp.json` (playwright-test MCP server)
- `public/login.html`, `public/login.js`, `public/auth-guard.js`, `public/admin.js`
- `server.js` (sessions, login/logout/session endpoints, RBAC, flag store)
- `tests/e2e/auth.setup.ts`, `playwright.config.ts` (projects[] split)
- `tests/e2e/scenarios/auth-session.spec.ts`
- `tests/e2e/scenarios/rbac.spec.ts`
- `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`, `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md`, `md/PLAYGROUND_EXPANSION_DESIGN.md`

## Acceptance Criteria

- Cookie-based sessions (opaque `sid`, HttpOnly) with a real `/login` page and shared `auth-guard.js` on protected pages, redirecting to `/login` only when the `authRequired` flag is armed (default OFF so existing tests stay green).
- Real `storageState` via a setup/authenticated/default Playwright `projects[]` split; `auth.setup.ts` mints an Admin session to `.artifacts/auth/admin.json`.
- RBAC `ROLE_PERMISSIONS` (Admin/Editor/Viewer) gate user CRUD and the audit endpoint, including an intentional over-permission defect on DELETE (`rbacBug=editor-delete`) as the reporter's target.
- A per-runKey flag store (`GET/POST/DELETE /api/test/flags`) with split reset hooks: `resetData()` (parallel-safe, user data only) vs `resetAll()` (full reset, seed/setup only).
- Five agents live in `.claude/agents/` and are addressable from a harness via the playwright-test MCP server.
- Regression stays deterministic; the Result section records the validation outcome.

## Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd playwright test tests/e2e/scenarios/auth-session.spec.ts`
- `npx.cmd playwright test tests/e2e/scenarios/rbac.spec.ts`
- `npm.cmd run test:e2e`

## Notes For The Agent

- Agents fix TESTS, never the app.
- Keep `authRequired` default OFF and all new drift flags defaulting to safe values so existing specs stay green.
- The DELETE over-permission defect (`rbacBug=editor-delete`) is INTENTIONAL and is the reporter's target; do not "fix" it.
- The RBAC spec is serial; `resetAll()` is seed/setup-only, use `resetData()` for parallel-safe per-test cleanup.
- The vault root is now `obsidian-vault/` (NOT `docs/obsidian-vault/`).
- New adoption/design docs live at repo root under `md/`, NOT in the vault.
- Phase 2 (`/lab` control-panel GUI) and Phase 4 (richer flows: orders-explorer, create-order wizard) are DESIGNED but DEFERRED.

## Result

- Renamed the project to "Agents-Playground" (`package.json` name `agents-playground`, README title, GitHub repo `asaf-1/Agents-Playground`, still PRIVATE) and moved the vault from `docs/obsidian-vault/` to the repo-root `obsidian-vault/`.
- Added the 5-agent roster in `.claude/agents/`, addressable via the playwright-test MCP server in `.mcp.json`:
  - `playwright-test-planner` (official) — explores the app, writes a plan to `specs/`.
  - `playwright-test-generator` (official) — turns a plan item into a spec under `tests/e2e/generated/`.
  - `playwright-test-healer` (official) — runs tests, root-causes failures, rewrites the broken TEST.
  - `playwright-test-diagnostician` (NEW, custom) — read-only RCA: gathers evidence and classifies against the 14-category FailureClassifier taxonomy, returns a verdict HEAL vs REPORT.
  - `playwright-test-reporter` (NEW, custom) — persists a local bug record plus an Obsidian incident/healing note.
  - Pipeline: planner -> generator -> run -> diagnostician -> (heal | report). Drift heals; by-design defects get reported.
- Phase 1 (auth + session, shipped):
  - Cookie-based sessions (opaque `sid`, HttpOnly); new `/login` page (`public/login.html` + `login.js`); shared `public/auth-guard.js` on protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) redirecting to `/login` only when `authRequired` is armed (default OFF).
  - Real `storageState` via a setup/authenticated/default Playwright `projects[]` split; `tests/e2e/auth.setup.ts` mints an Admin session to `.artifacts/auth/admin.json`.
  - `LoginPage` POM + `loginPageProfile` + `loginPageContract` + `baseTest` `loginPage` fixture.
  - `tests/e2e/scenarios/auth-session.spec.ts` (4 tests).
  - New endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/session`, `POST /api/test/set-session`.
  - `seededUsers` gained `@demo.local` emails (password `demo1234`; Carol inactive).
- Phase 3 (RBAC, shipped):
  - `ROLE_PERMISSIONS` (Admin/Editor/Viewer); gated `POST /api/users` plus new `PATCH/DELETE /api/users/:id`.
  - DELETE carries an INTENTIONAL over-permission DEFECT (`rbacBug=editor-delete` -> wrong 200) as the reporter's target.
  - `GET /api/admin/audit` (401/403/200); `GET /api/users` applies `editsByUserId` + `deletedManagedUserIds` overlays.
  - `/admin` rewritten from inline-static to fetch-driven (`public/admin.js` hitting `/api/admin/audit`, preserving testids + `clearLog -> 0` + contract).
  - `tests/e2e/scenarios/rbac.spec.ts` (5 tests incl. the defect, serial).
- Drift control:
  - Per-runKey flag store (`GET/POST/DELETE /api/test/flags`; `FLAG_DEFAULTS` + `FLAG_CATALOG`: `ctaMode`/`ordersMode`/`productState`/`createUserPhoneType` already existed conceptually, plus new `authRequired`/`sessionExpired`/`loginSubmitLabel`/`rbacEnforce`/`adminGate`/`rbacBug`).
  - Split reset hooks: `resetData()` (user data only, PARALLEL-SAFE, used by `POST /api/test/reset-users`) vs `resetAll()` (+ flaky markers + order counter + sessions + flags; `POST /api/test/reset`, seed/setup only).
- Both previously-dark FailureClassifier categories (`auth-or-session`, `permissions-or-rbac`) are now LIT.
- New docs at repo root (NOT in the vault):
  - `md/PORTABLE_AGENT_ADOPTION_GUIDE.md` (workspace-agnostic adoption guide: terminology, installation, seed, storageState, flag store, RBAC, full agent defs).
  - `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md` (this-repo plan).
  - `md/PLAYGROUND_EXPANSION_DESIGN.md` (the auth/RBAC/drift/flows design + guardrails).
- Validation run and outcome (SHIPPED + verified):
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd playwright test tests/e2e/scenarios/auth-session.spec.ts` passed (4 tests).
  - `npx.cmd playwright test tests/e2e/scenarios/rbac.spec.ts` passed (5 tests, serial).
  - `npm.cmd run test:e2e` passed with 60 passed / 2 skipped out of 62 tests total.
- Follow-ups (DESIGNED but DEFERRED):
  - Phase 2: a `/lab` control-panel GUI for driving the flag store.
  - Phase 4: richer flows (orders-explorer, create-order wizard).
