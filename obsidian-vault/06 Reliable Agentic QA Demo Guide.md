# Reliable Agentic QA Demo Guide

This is the operator guide for the current project, now named **Agents-Playground** (`package.json` name `agents-playground`; GitHub repo `asaf-1/Agents-Playground`, still PRIVATE). It explains the live app, the generic self-healing layer, the auth + RBAC playground, the addressable agent roster, the real-agent proof, the test coverage, and the exact commands to use in a demo or handoff.

> Vault location moved: the Obsidian vault now lives at the **repo root** under `obsidian-vault/` (no longer `docs/obsidian-vault/`). Open the **repo root** as the Obsidian vault so every note is in scope.

## Current Product Shape

### Pages

- `/`
  - landing page for the demo
  - contains the real `Join Now` CTA with class `.btn-rounded`
  - includes a local API health check button
  - includes a real quick-triage input and live result echo
- `/dashboard`
  - loads live orders from `GET /api/orders`
  - supports `stable`, `slow`, and `flaky` modes
  - shows a real spinner and a real `Refresh data` button
- `/product/:id`
  - loads dynamic product data from `GET /api/product/:id`
  - supports `valid` and `broken` render states
- `/user-manager`
  - manages a seeded + runtime user list with search, role filter, bulk-actions menu, invite modal, and row-level view action
- `/orders`
  - list of live orders pulled from `GET /api/orders` with status filter and refresh
- `/admin`
  - seeded audit log with refresh and clear actions
- `/profile`
  - profile card with edit/save flow and status echo
- `/settings`
  - theme and notifications controls with save status echo
- `/login`
  - public login page (`public/login.html` + `login.js`); signs a seeded user in against `POST /api/login`
  - protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) load `public/auth-guard.js`, which redirects to `/login` only when the `authRequired` flag is armed (default OFF, so existing tests stay green)

### API Surface

- `GET /api/health`
- `GET /api/orders?mode=stable|slow|flaky&delayMs=<n>`
- `POST /api/create-user`
- `GET /api/product/:id?state=valid|broken`
- Auth + session: `POST /api/login`, `POST /api/logout`, `GET /api/session`, and the test-only `POST /api/test/set-session` (mints a real session for a chosen seeded user without typing a password)
- RBAC: gated `POST /api/users`, plus new `PATCH /api/users/:id` and `DELETE /api/users/:id`; `GET /api/users` applies `editsByUserId` + `deletedManagedUserIds` overlays at read time; `GET /api/admin/audit` returns `401/403/200` by role
- Drift flag store: `GET/POST/DELETE /api/test/flags` (per-`runKey`)
- Reset hooks: `POST /api/test/reset-users` (user data only, parallel-safe) vs `POST /api/test/reset` (full `resetAll`: data + flaky markers + order counter + sessions + flags; seed/setup only)

## Generic Self-Healing Layer

### Recovery

- `GenericLocatorHealer`
  - heals stale buttons, links, and inputs from live DOM evidence
- `RecoveryRouter`
  - classifies the failure first
  - tries QA-safe recovery strategies in order
  - records each strategy attempt
- `SelectorHealer`
  - compatibility wrapper for the original stale CTA demo
- `NetworkRecoveryAgent`
  - compatibility wrapper for the original flaky dashboard demo

### Page-Level Adoption

- `SelfHealingPage`
  - base page layer that tries the primary locator first and heals through the router when needed
- `framework/agents/recovery/pageProfiles/`
  - page action intents for home, dashboard, product, user-manager, orders, admin, profile, and settings pages
- `framework/fixtures/baseTest.ts`
  - injects `homePage`, `dashboardPage`, `productPage`, `userManagerPage`, `ordersPage`, `adminPage`, `profilePage`, and `settingsPage` into the tests

This means the current UI-facing tests no longer need to own each page's interactive locators directly.

### Diagnosis

- `FailureClassifier`
  - classifies failures into:
    - `ui-missing-locator`
    - `ui-loading-or-network`
    - `ui-contract-or-render`
    - `api-client-error`
    - `api-server-error`
    - `api-contract-drift`
    - `unknown`
  - the two previously-dark categories (`auth-or-session` and `permissions-or-rbac`) are now LIT by the auth + RBAC playground (see below)
- `PatchProposalAgent`
  - returns likely fix area
  - returns likely file targets
  - returns deterministic validation steps
  - marks whether QA-safe auto-mitigation is eligible
- `ApiDiagnosisAgent`
  - still diagnoses the real `create-user` failure
  - now also returns classification and patch proposal output

### Validation

- `PageValidationAgent`
  - validates reusable page contracts
  - the current contracts cover:
    - home page
    - dashboard page
    - product page
- product validation still works through `validateProductPage()`
  - this keeps the current demo behavior backward compatible

### Repair (QA/Staging Only)

- `framework/agents/repair/PatchPlanner.ts`
  - turns a `PatchProposal` into a concrete plan (edit targets + rerun step), marks high-risk categories for approval, and blocks production environments
- `framework/agents/repair/PatchApplier.ts`
  - writes the plan artifact to `.artifacts/patches/<incidentId>/patch-plan.json` only when the plan is permitted
- `framework/agents/repair/RepairVerifier.ts`
  - re-runs the page contract validation after a repair to confirm the fix still holds
- `IncidentRouter` orchestrates plan → apply → verify for any non-production environment and skips the whole flow when `environment === "production"`

### Real Agent Proof

- `framework/agents/llm/SelfHealingLlmAgent.ts`
  - accepts bounded candidate actions from the live page and rejects unsafe provider output
  - default deterministic proof uses a fake provider against the real browser app
  - live OpenAI proof is opt-in through `RUN_LIVE_OPENAI_AGENT_TEST=true` and `OPENAI_API_KEY`
- `framework/agents/llm/OpenAiSelfHealingProvider.ts`
  - calls `POST https://api.openai.com/v1/responses`
  - requests a structured self-healing decision
  - stays report-only in the live smoke test
- `framework/agents/obsidian/ObsidianMemoryAgent.ts`
  - writes structured healing-run notes under `Reports/Healing/`
  - updates task-note `Result` sections

The current real-agent proof is runtime self-healing only. It does not edit source files. If a future patching agent edits source, that phase must include reset/revert handling for intentional demo bugs.

### Guardrails

- deterministic by default
- `OPENAI_API_KEY` can only enrich narrative text
- live OpenAI self-healing smoke is opt-in and skipped by default
- no runtime code editing during recovery
- QA auto-mitigation is limited to:
  - locator healing
  - extend-wait
  - refresh-and-retry
  - contract re-check

## Auth + RBAC Playground

The site now has a real auth + RBAC surface so the agents can exercise the `auth-or-session` and `permissions-or-rbac` failure categories. Everything is deterministic and off by default, so the existing suite stays green.

### Logging in

- Browse to `/login` and sign in as a seeded user. Seeded users now carry `@demo.local` emails; the password is `demo1234` (Carol is seeded inactive).
- Login mints a cookie-based session: an opaque `sid` cookie, `HttpOnly`. `GET /api/session` reports the current identity; `POST /api/logout` clears it.
- Protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) load `public/auth-guard.js`. The guard redirects to `/login` **only when the `authRequired` flag is armed** — it is OFF by default.
- In tests, the fastest identity path is the test-only `POST /api/test/set-session { role }`, which mints a real session without typing a password. Real `storageState` is produced by `tests/e2e/auth.setup.ts` (mints an Admin session into `.artifacts/auth/admin.json`) via a `setup` / `authenticated` / `default` `projects[]` split in `playwright.config.ts`.

### Roles and the intentional defect

- `ROLE_PERMISSIONS` defines Admin / Editor / Viewer. The user APIs (`POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id`) are gated by role; `GET /api/admin/audit` returns `401/403/200` by role.
- `DELETE /api/users/:id` carries an **intentional over-permission DEFECT**: when the `rbacBug=editor-delete` flag is armed, an Editor wrongly receives `200` instead of `403`. This is the reporter's target — a by-design defect that should be REPORTED, not healed.
- `/admin` was rewritten from inline-static to fetch-driven (`public/admin.js` hits `GET /api/admin/audit`) while preserving its testids, `clearLog -> 0` behavior, and contract.

### Drift control (flags + reset)

- Every intentional drift is a named flag in a per-`runKey` store: `GET/POST/DELETE /api/test/flags`. `FLAG_DEFAULTS` + `FLAG_CATALOG` cover the existing `ctaMode` / `ordersMode` / `productState` / `createUserPhoneType` plus the new `authRequired` / `sessionExpired` / `loginSubmitLabel` / `rbacEnforce` / `adminGate` / `rbacBug`.
- Resolution order per request: explicit query param > per-`runKey` flag > `global` flag > default. Defaults equal today's non-drifted behavior, so no existing spec breaks and new auth/RBAC drift is never on by accident.
- Reset is split: `resetData()` clears user data only and is **parallel-safe** (`POST /api/test/reset-users`); `resetAll()` also clears flaky markers, the order counter, sessions, and flags (`POST /api/test/reset`, seed/setup only).

### Auth + RBAC specs

- `tests/e2e/scenarios/auth-session.spec.ts` — 4 tests covering login, session, and the logged-out redirect.
- `tests/e2e/scenarios/rbac.spec.ts` — 5 tests (serial) covering the role-gated actions and the intentional over-permission defect.

## The Agent Roster

Five agents live under `.claude/agents/` and are addressable from a Claude Code / VS Code / OpenCode harness through the `playwright-test` MCP server wired in `.mcp.json`. They all run on the live app and **fix tests, never the app**: intentional drift gets healed, by-design defects get reported.

| Agent | File | Role | Edits |
|---|---|---|---|
| **planner** (official) | `playwright-test-planner.md` | Explore the app, write a plan to `specs/` | plan files |
| **generator** (official) | `playwright-test-generator.md` | Turn a plan item into a spec under `tests/e2e/generated/` | test files |
| **healer** (official) | `playwright-test-healer.md` | Run tests, root-cause failures, rewrite the broken **test** | test files |
| **diagnostician** (NEW, custom) | `playwright-test-diagnostician.md` | Read-only RCA: evidence + classify (14-category `FailureClassifier` taxonomy) -> verdict HEAL vs REPORT | nothing |
| **reporter** (NEW, custom) | `playwright-test-reporter.md` | Persist a local bug record + Obsidian incident/healing note | docs/vault only |

**Pipeline:** `planner -> generator -> run -> diagnostician -> (heal | report)`. Selector/timing drift heals; by-design defects (the `phone_number` 500, the broken-product `NaN`/overlap, the RBAC over-permission defect) get reported.

### How to run the agents

The agents run inside a harness, not via `npm`. Open the repo in your chosen harness and invoke them:

- **Claude Code** (CLI): run `claude` in the repo root and address an agent (e.g. "use the playwright-test-planner to explore the app and write a plan").
- **VS Code**: use the Playwright extension's agent mode.
- **OpenCode**: per its docs.

The harness brings the app up itself through `playwright.config.ts`'s `webServer` — **do not pre-start the server manually** when driving the agents. The seed spec (`tests/e2e/seed.spec.ts`) is the linchpin that puts the app in a known state before the planner/generator explore.

For the full, copy-paste-ready agent definitions, installation, seed spec, `storageState`, flag store, and RBAC wiring, see the `md/` guides below.

## Reference Guides (repo root `md/`, not in the vault)

- `md/PORTABLE_AGENT_ADOPTION_GUIDE.md` — workspace-agnostic adoption guide: terminology, installation, the seed spec, real `storageState`, the flag store, RBAC, and the full agent definitions.
- `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md` — the this-repo plan for putting the official planner/generator/healer (plus the custom diagnostician/reporter) to work here.
- `md/PLAYGROUND_EXPANSION_DESIGN.md` — the auth / RBAC / drift / flows design and guardrails. Phase 2 (a `/lab` control-panel GUI) and Phase 4 (richer flows: orders-explorer, create-order wizard) are DESIGNED but DEFERRED.

## Scenario Artifacts

Every scenario still writes these files under `.artifacts/scenarios/<scenario>/`:

- `report.json`
- `final.png`
- `trace.zip`

The top-level report schema did not change:

- `scenario`
- `initialFailure`
- `evidence`
- `agentDecision`
- `finalStatus`
- `suggestedPermanentFix`
- `engine`

## Test Layout

- `tests/e2e/sanity/`
- `tests/e2e/functional/positive/`
- `tests/e2e/functional/negative/`
- `tests/e2e/non-functional/`
- `tests/e2e/contracts/`
- `tests/e2e/scenarios/`

The full suite currently contains `62` tests. Default local regression passes `60` and skips `2` (the live OpenAI smoke plus one more) unless explicitly enabled. The auth + RBAC scenarios live under `tests/e2e/scenarios/` (`auth-session.spec.ts`, `rbac.spec.ts`).

## What Each Scenario Does

### `ui-change-healing.spec.ts`

- opens `/`
- intentionally fails on `button:has-text("Sign Up")`
- uses the shared recovery router
- heals to the real `Join Now` button
- proves the original selector-healing demo still works

### `flaky-network-recovery.spec.ts`

- opens `/dashboard?mode=flaky`
- lets the first request fail on purpose
- uses the shared recovery router through `NetworkRecoveryAgent`
- chooses extend-wait or refresh based on page state
- proves the original retry demo still works

### `api-error-diagnosis.spec.ts`

- sends `POST /api/create-user`
- uses `{ phone_number: "0541234567" }`
- captures the real `500`
- returns deterministic RCA, classification, and patch proposal data

### `dynamic-content-validation.spec.ts`

- validates `/product/sku-123?state=valid`
- validates `/product/sku-123?state=broken`
- proves contract-based validation catches malformed numeric content, `NaN`, `undefined`, and overlap

### `generic-self-healing.spec.ts`

- fails a stale button selector on the landing page
- fails a stale link selector on the landing page
- fails a stale input selector on the landing page
- heals all three through the generic router
- proves the new layer works on non-prebaked locator classes

### `page-contract-validation.spec.ts`

- validates the home-page contract
- validates the dashboard-page contract
- validates the product-page contract in valid and broken states
- proves the validator now works beyond the original product-only check

### `failure-classification-and-patch-proposal.spec.ts`

- classifies a UI render-contract failure
- classifies an API contract drift failure
- verifies deterministic patch proposals for both

### `repair-flow.spec.ts`

- verifies `PatchPlanner` blocks production environments and approves QA repairs
- verifies `PatchApplier` only writes a patch artifact when the plan is permitted
- verifies `RepairVerifier` gracefully skips when no page or contract is provided
- runs the end-to-end plan → apply → verify flow on the User Manager page in a QA environment
- verifies the router skips the repair flow entirely on production

### `real-agent-proof.spec.ts`

- proves `SelfHealingLlmAgent` can recover a stale CTA against the live app through a bounded fake-provider decision
- proves `ObsidianMemoryAgent` writes a real vault healing note
- proves `ObsidianMemoryAgent` writes a workspace-state handoff note with changed files, README/memory/task-note status, decisions, validations, and next actions
- proves `ObsidianCloseoutAgent` can pass closeout when required docs are updated and block closeout when code/test changes lack required docs
- proves task-note `Result` updates work
- rejects unsafe provider output without acting
- includes a skipped-by-default `@live-openai` smoke that validates a real OpenAI structured decision when a key is provided

### `new-pages.spec.ts`

- smoke-covers the Orders, Admin, Profile, and Settings pages
- asserts each page passes its page contract
- exercises one action per page (refresh, clear log, edit/save, save settings)

## Exact Commands

### Fresh machine setup

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

### Start the app manually

```powershell
npm.cmd run start
```

Browse to `http://127.0.0.1:4173`.

### Run the whole suite

```powershell
npm.cmd run test:e2e
```

Success looks like `60` passing and `2` skipped out of `62` tests.

### Run category suites

```powershell
npm.cmd run test:sanity
npm.cmd run test:functional:positive
npm.cmd run test:functional:negative
npm.cmd run test:nonfunctional
npm.cmd run test:contract
```

### Run scenario suites

```powershell
npm.cmd run test:ui-heal
npm.cmd run test:flaky
npm.cmd run test:api
npm.cmd run test:dynamic
npm.cmd run test:generic-healing
npm.cmd run test:page-contracts
npm.cmd run test:classification
npm.cmd run test:real-agent
```

### Run the Obsidian closeout guard

```powershell
npm.cmd run obsidian:closeout -- --title real-agent-closeout --summary "Documented and validated the current agent work"
```

Use this after code, test, README, vault, or agent behavior changes. It writes a `Reports/Workspace/` closeout report and exits non-zero if required README, memory, task-note, test-map, or workflow documentation is missing.

### Run the opt-in live OpenAI real-agent smoke

```powershell
$env:OPENAI_API_KEY='sk-your-real-key'
$env:RUN_LIVE_OPENAI_AGENT_TEST='true'
npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts --grep "@live-openai"
Remove-Item Env:RUN_LIVE_OPENAI_AGENT_TEST -ErrorAction SilentlyContinue
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
```

Use this only when you want to prove the real OpenAI provider path. Do not commit the key or paste it into vault notes. A passing live run writes visible vault evidence under `obsidian-vault/Reports/Healing/` and `obsidian-vault/Reports/Workspace/`.

### Show the generic self-healing layer live

```powershell
$env:PLAYWRIGHT_SLOW_MO='1000'
npx.cmd playwright test tests/e2e/scenarios/generic-self-healing.spec.ts --headed --workers=1
Remove-Item Env:PLAYWRIGHT_SLOW_MO -ErrorAction SilentlyContinue
```

### Show the original CTA healing live

```powershell
$env:PLAYWRIGHT_SLOW_MO='1000'
npx.cmd playwright test tests/e2e/scenarios/ui-change-healing.spec.ts --headed --workers=1
Remove-Item Env:PLAYWRIGHT_SLOW_MO -ErrorAction SilentlyContinue
```

### Show the flaky dashboard recovery live

```powershell
$env:PLAYWRIGHT_SLOW_MO='1000'
npx.cmd playwright test tests/e2e/scenarios/flaky-network-recovery.spec.ts --headed --workers=1
Remove-Item Env:PLAYWRIGHT_SLOW_MO -ErrorAction SilentlyContinue
```

### Open Playwright UI mode

```powershell
npm.cmd run test:e2e:ui
```

### View the HTML report

```powershell
npx.cmd playwright show-report .artifacts/playwright-report
```

### Local Docker gate

```powershell
docker build -t ai-agentic-project-prepush .
```

## Docker Strategy Guidance

- The current local Docker gate still proves the repo can be packaged cleanly before push, and the browser-runtime path now uses a separate Playwright runner image built from `Dockerfile.e2e`
- Local containerized execution is mount-based so the repo remains the visible workspace and local credentials only enter the container when explicitly needed for GHCR pulls
- Jenkins and GitHub Actions now use the shared Playwright runner image as the browser-execution boundary, so pipeline hosts no longer need direct Playwright browser installation
- Containerization now provides the preferred shared runtime for Linux-parity troubleshooting, onboarding, and cross-machine consistency while still leaving native local execution available
- If E2E runtime grows, container sharding is the clean future scale path because identical isolated workers are easier to split and reproduce
- Running the same Linux-based container locally can surface CI-only problems earlier, including missing fonts, library mismatches, and case-sensitivity drift

## Recommended Demo Order

1. `npm.cmd run test:sanity`
2. `npx.cmd playwright test tests/e2e/scenarios/generic-self-healing.spec.ts --headed --workers=1`
3. `npx.cmd playwright test tests/e2e/scenarios/flaky-network-recovery.spec.ts --headed --workers=1`
4. `npm.cmd run test:classification`
5. `npm.cmd run test:page-contracts`
6. `npm.cmd run test:e2e`
7. `npm.cmd run test:real-agent`
8. `docker build -t ai-agentic-project-prepush .`

## How Obsidian Fits

- Obsidian is the shared project memory and operator layer
- `01 Project Map` explains the current code and product shape
- `02 Test Map` explains coverage and commands
- `Tasks/007 Real Agent Proof` is the active task record for the current real-agent proof
- `Tasks/005 Page-Level Self-Healing Adoption` remains the completed task record for page-level adoption
- `Reports/Workspace/` captures session/workspace state after meaningful agent changes
- the codebase and the executed validations remain the runtime truth

## Where To Look After A Run

- Scenario artifacts: `.artifacts/scenarios/`
- Playwright report: `.artifacts/playwright-report/`
- Playwright raw output: `.artifacts/test-results/`
- Daily automation reports: `obsidian-vault/Reports/`
- Real-agent healing notes: `obsidian-vault/Reports/Healing/`
- Real-agent workspace-state notes: `obsidian-vault/Reports/Workspace/`
