# Test Map

## Test Folder Contract

- `tests/e2e/sanity/`
  - fastest smoke coverage for the three core pages
- `tests/e2e/functional/positive/`
  - healthy end-to-end product behavior
- `tests/e2e/functional/negative/`
  - intentionally broken inputs and failure-state validation
- `tests/e2e/non-functional/`
  - local quality gates such as latency, responsive behavior, and render quality
- `tests/e2e/contracts/`
  - response-shape governance for the core API
- `tests/e2e/scenarios/`
  - recovery, diagnosis, validation, and self-healing stories that demonstrate agent behavior
- `tests/e2e/generated/`
  - specs produced by the `playwright-test-generator` agent off the seed; one generated spec per plan item
- `tests/e2e/app/`
  - the React `/app` surface: shell/routing, Orders/Users/Products/Account flows, axe accessibility, and OpenAPI schema contract tests (ajv); each defect spec arms one flag per `runKey` (see `docs/react-surface-defects.md`)

Component/unit tests for the React surface live under `web/src/**/*.test.tsx` (Vitest + Testing Library + MSW); run with `npm run test:unit`. Opt-in visual snapshots live in `tests/visual/` (`npm run test:visual`, separate config, excluded from the gated suite).

New specs should go into the category that matches their main purpose. Do not recreate flat top-level spec files or placeholder folders.

The two top-level files `tests/e2e/auth.setup.ts` (Admin storageState mint) and `tests/e2e/seed.spec.ts` (agent seed page) are deliberate exceptions — they are project/agent infrastructure, not category specs.

## Page-Level Rule

- UI-facing tests should use page objects injected from `framework/fixtures/baseTest.ts`.
- Interactive page behavior should live in the page object, not inside each test.
- Each important page should have a page profile under `framework/agents/recovery/pageProfiles/`.
- Dedicated stale-locator scenarios may still use raw broken selectors on purpose.

## Load-Bearing Render Contracts (do not break with CSS/markup changes)

These are asserted by tests; visual changes must preserve them (see [[Tasks/010 CSS Polish]] and `docs/css-polish-plan.md`):

- **Broken-product overlap geometry:** `.product-layout--broken` absolutely positions `[data-testid="product-price"]` and `[data-testid="buy-button"]` so their bounding boxes intersect — `dynamic-content-validation`, `page-contract-validation`, `functional-negative`, and `failure-classification` assert the overlap.
- **`[hidden]` semantics:** `.error-card[hidden]` / `.loading-card[hidden]` → `display:none`; tests toggle these and assert `toBeHidden` / `toBeVisible`.
- **Numeric price finiteness + forbidden tokens** (`NaN` / `undefined` / `null`) in the broken-state render.
- Rule: CSS may change color / type / spacing / state only — never rename a test-locked `data-testid` / id / role / text, and never alter the overlap geometry.

## Main Commands

- Full regression: `npm run test:e2e`
- NPM alias: `npm test`
- Regression alias: `npm run test:regression`
- Sanity smoke: `npm run test:sanity`
- Functional positive: `npm run test:functional:positive`
- Functional negative: `npm run test:functional:negative`
- Non-functional quality: `npm run test:nonfunctional`
- API contract governance: `npm run test:contract`
- UI healing scenario: `npm run test:ui-heal`
- Flaky network recovery scenario: `npm run test:flaky`
- API diagnosis scenario: `npm run test:api`
- Dynamic validation scenario: `npm run test:dynamic`
- Generic self-healing scenario: `npm run test:generic-healing`
- Page-contract validation scenario: `npm run test:page-contracts`
- Classification and patch-proposal scenario: `npm run test:classification`
- Real Obsidian/self-healing agent proof: `npm run test:real-agent`
- Headed run: `npm run test:e2e:headed`
- UI mode: `npm run test:e2e:ui`

## Coverage Matrix

### Sanity

- `tests/e2e/sanity/sanity-smoke.spec.ts`
- Covers landing-page load, health check, stable dashboard orders, and the valid product page
- Uses the shared page-object fixtures and page-level self-healing methods
- Use it when you need the fastest confidence check
- Success looks like one fast green spec and no unexpected navigation or API errors

### Functional Positive

- `tests/e2e/functional/positive/functional-positive.spec.ts`
- Covers healthy API responses, valid user creation, stable dashboard load, and valid product rendering
- Uses the shared page-object fixtures and page-level self-healing methods
- Use it to prove the happy path works end to end
- Success looks like `201` user creation, stable orders, and a valid page-validation result

### Functional Negative

- `tests/e2e/functional/negative/functional-negative.spec.ts`
- Covers missing stale selectors, `400` validation errors, `500` type mismatch handling, flaky dashboard failure state, and broken product rendering
- Use it to prove the system fails in the expected way
- Success looks like the intended failures being observed and asserted correctly

### Non-Functional

- `tests/e2e/non-functional/non-functional-quality.spec.ts`
- Covers local latency budgets, responsive/mobile rendering, slow-mode degradation, and broken render quality detection
- Use it when the discussion moves beyond pure correctness into quality
- Success looks like healthy paths staying under local budgets and broken states being detected deliberately

### API Contract Governance

- `tests/e2e/contracts/api-contract-governance.spec.ts`
- Covers the contract of `health`, `orders`, `create-user`, and `product`
- Use it to show 2026-style contract governance and schema drift protection
- Success looks like response shapes matching the expected contract on both positive and negative API cases

### Scenario Demonstrations

- `tests/e2e/scenarios/ui-change-healing.spec.ts`
  - proves the recovery router can heal the original stale CTA selector
- `tests/e2e/scenarios/flaky-network-recovery.spec.ts`
  - proves retry logic using live request and spinner state through the shared router
- `tests/e2e/scenarios/api-error-diagnosis.spec.ts`
  - proves deterministic RCA from real request and response evidence
- `tests/e2e/scenarios/dynamic-content-validation.spec.ts`
  - proves contract-based dynamic content validation across valid and broken runtime states
- `tests/e2e/scenarios/generic-self-healing.spec.ts`
  - proves the generic locator healer works for buttons, links, and inputs on live DOM elements
- `tests/e2e/scenarios/page-contract-validation.spec.ts`
  - proves reusable page contracts across home, dashboard, and product pages
- `tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts`
  - proves deterministic UI/API classification and permanent-fix proposals
- `tests/e2e/scenarios/policy-engine.spec.ts`
  - proves QA, staging, and production policy gating for auto-mitigation
- `tests/e2e/scenarios/execution-planner.spec.ts`
  - proves deterministic strategy ordering and diagnosis-only escalation branches
- `tests/e2e/scenarios/incident-memory-and-evidence.spec.ts`
  - proves incident memory persistence and evidence artifact collection
- `tests/e2e/scenarios/failure-classifier-expansion.spec.ts`
  - proves the expanded auth, RBAC, modal, navigation, timeout, empty-state, and delayed-data classifier branches
- `tests/e2e/scenarios/advanced-locator-healing.spec.ts`
  - proves dropdown, menu, modal, row-action, and section-context locator healing on the User Manager page
- `tests/e2e/scenarios/repair-flow.spec.ts`
  - proves the QA-only repair agents (`PatchPlanner`, `PatchApplier`, `RepairVerifier`) plan, apply, and verify a patch and that production environments are skipped
- `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - proves the bounded `SelfHealingLlmAgent` can recover a stale CTA against the live app, the `ObsidianMemoryAgent` can write healing/task/workspace vault notes, the `ObsidianCloseoutAgent` can gate documentation closeout from changed files, and the live OpenAI provider path is available as an opt-in smoke
  - ⚠️ **Only vault-HARD spec:** the `updateTaskResult` test does `fs.writeFile` into `obsidian-vault/Tasks/` with no `mkdir` (`:174-212`), so a missing `Tasks/` dir fails this plus the pre-push / PR / main gates. `Tasks/` is git-tracked so a clean checkout is green. Detail in [[08 Vault Dependency Map]].
- `tests/e2e/scenarios/auth-session.spec.ts` (4 tests, `authenticated` project)
  - proves the cookie-based session feature works as positive controls and lights the `auth-or-session` classifier category: sign in from `/login` and land on the dashboard, reject wrong credentials with an inline error, see the session banner on a protected page as the storageState Admin, and have an expired session redirect a protected page to `/login`
  - arms drift per-test under its own `runKey` (`test.info().testId`) with a matching `qa_runkey` cookie; `afterEach` clears that one `runKey` only (never a full reset, which would clobber the shared Admin session under `fullyParallel`)
- `tests/e2e/scenarios/rbac.spec.ts` (5 tests, `authenticated` project, serial)
  - proves role gating on the user APIs and lights the `permissions-or-rbac` classifier category: Viewer cannot create a user (403 `RBAC_FORBIDDEN`), Editor cannot delete (403 requiring Admin), Admin can create and delete (positive control), and admin audit is forbidden for non-admins and when `adminGate` is locked
  - INTENTIONAL OVER-PERMISSION DEFECT: with `rbacBug=editor-delete` armed, the `DELETE /api/users/:id` wrongly returns `200` for an Editor when it SHOULD be `403`; this is the `playwright-test-reporter` agent's target — the test asserts the buggy `200` so the by-design defect is observed and gets filed as a local bug, not healed
  - drives roles via `POST /api/test/set-session` and arms `rbacEnforce`/`adminGate`/`rbacBug` per the test's own `runKey`; serial so the file's create-user calls never race
- `tests/e2e/sanity/new-pages.spec.ts`
  - smoke coverage for the Orders, Admin, Profile, and Settings pages and their page contracts

### Setup, Seed, and Generated

- `tests/e2e/auth.setup.ts` (`setup` project)
  - mints a real Admin session via `POST /api/test/set-session` and persists it as storageState to `.artifacts/auth/admin.json`; the `authenticated` project depends on this and loads the cookie through `use.storageState`
  - intentionally does NOT reset — a broad reset could race `default`-project specs running in parallel
- `tests/e2e/seed.spec.ts` (`default` project)
  - the seed page for the official Playwright agents (planner / generator / healer); leaves the app on a known, warm, clean home page so the MCP `setup_page` path can drive a deterministic live page
  - side-effect-only: it calls `POST /api/test/reset-users`, probes `/api/health`, and warms `/`, with no business assertions
- `tests/e2e/generated/` (`default` project)
  - output folder for the `playwright-test-generator` agent; one generated spec per plan item
  - currently holds `home-cta-navigates-to-dashboard.spec.ts`, the classic stale-CTA healer demo (Sign Up renamed to Join Now), marked `test.fixme()` so it is SKIPPED in CI and kept green until the healer demo is run

## Project Split

- `setup` — runs only `auth.setup.ts` to mint the Admin storageState
- `authenticated` — runs the `auth-session` and `rbac` specs logged-in via the saved storageState; depends on `setup`
- `default` — runs everything else storageState-free, preserving the existing no-auth suite (ignores `auth.setup.ts`, `auth-session.spec.ts`, and `rbac.spec.ts`)

## Current Fixture Model

- `framework/fixtures/baseTest.ts` injects:
  - `homePage`
  - `dashboardPage`
  - `productPage`
  - `userManagerPage`
  - `ordersPage`
  - `adminPage`
  - `profilePage`
  - `settingsPage`
  - `loginPage`

When a new UI-heavy page is added, extend the fixture model instead of scattering raw interactive locators through the tests.

## Execution Notes

- Base URL: `http://127.0.0.1:4173`
- The Playwright config starts `node server.js 4173`
- Scenario artifacts are written to `.artifacts/scenarios/<scenario>/`
- Test run output is written to `.artifacts/test-results`
- HTML reports are written to `.artifacts/playwright-report`
- The current full suite count is `62` tests across the `setup`, `authenticated`, and `default` projects (60 passed / 2 skipped); the skips are the live OpenAI smoke (unless `RUN_LIVE_OPENAI_AGENT_TEST=true` and `OPENAI_API_KEY` are set) and the `test.fixme()` stale-CTA healer demo in `tests/e2e/generated/`
- Auth storageState is written to `.artifacts/auth/admin.json` by the `setup` project

## Exact Commands

### Run the whole workspace

```powershell
npm.cmd run test:e2e
```

Use this for full regression. Success looks like 60 deterministic tests passing with 2 skipped by default (the live OpenAI smoke and the `tests/e2e/generated/` stale-CTA healer demo), and the HTML report under `.artifacts/playwright-report/`.

### Run the category suites

```powershell
npm.cmd run test:sanity
npm.cmd run test:functional:positive
npm.cmd run test:functional:negative
npm.cmd run test:nonfunctional
npm.cmd run test:contract
```

Use these when someone asks for coverage by category instead of one big suite.

### Run the scenario demos

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

Use these when you want a focused recovery, diagnosis, or validation demonstration.

### Run the Obsidian closeout guard

```powershell
npm.cmd run obsidian:closeout -- --title real-agent-closeout --summary "Documented and validated the current agent work"
```

Use this after code, test, README, vault, or agent behavior changes. It inspects changed files, writes a `Reports/Workspace/` closeout report, and exits non-zero when required README, memory, task-note, test-map, or workflow documentation is missing.

### Run the opt-in live OpenAI self-healing smoke

```powershell
$env:RUN_LIVE_OPENAI_AGENT_TEST='true'
$env:OPENAI_API_KEY='sk-your-real-key'
npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts --grep @live-openai
Remove-Item Env:RUN_LIVE_OPENAI_AGENT_TEST -ErrorAction SilentlyContinue
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
```

Use this only when you want to prove the real OpenAI provider call. Replace `sk-your-real-key` with an actual OpenAI API key; placeholder text is skipped. It is not part of the default regression gate. A passing live run writes visible vault evidence under `obsidian-vault/Reports/Healing/` and `obsidian-vault/Reports/Workspace/`.

### Show the generic self-healing layer live

```powershell
$env:PLAYWRIGHT_SLOW_MO='1000'
npx.cmd playwright test tests/e2e/scenarios/generic-self-healing.spec.ts --headed --workers=1
Remove-Item Env:PLAYWRIGHT_SLOW_MO -ErrorAction SilentlyContinue
```

Use this when you want to show button, link, and input healing in one browser run.

### Show the original stale CTA healing live

```powershell
$env:PLAYWRIGHT_SLOW_MO='1000'
npx.cmd playwright test tests/e2e/scenarios/ui-change-healing.spec.ts --headed --workers=1
Remove-Item Env:PLAYWRIGHT_SLOW_MO -ErrorAction SilentlyContinue
```

Use this when you want the simplest single-selector healing story.

### Show the flaky network recovery live

```powershell
$env:PLAYWRIGHT_SLOW_MO='1000'
npx.cmd playwright test tests/e2e/scenarios/flaky-network-recovery.spec.ts --headed --workers=1
Remove-Item Env:PLAYWRIGHT_SLOW_MO -ErrorAction SilentlyContinue
```

Use this when you want to show a real first-request failure and a recovery action that waits or refreshes based on page state.

### Open Playwright UI mode

```powershell
npm.cmd run test:e2e:ui
```

Use this when you want to step through traces, screenshots, and page state interactively.

### Run the optional local Docker check

```powershell
docker build -t ai-agentic-project-prepush .
```

Use this when `preMerge.dockerEnabled` is on or container-boundary validation is explicitly needed.
The tracked pre-push hook skips this build while that policy flag is off.

## Recommended Demo Flow

1. `npm.cmd run test:sanity`
2. `npx.cmd playwright test tests/e2e/scenarios/generic-self-healing.spec.ts --headed --workers=1`
3. `npx.cmd playwright test tests/e2e/scenarios/flaky-network-recovery.spec.ts --headed --workers=1`
4. `npm.cmd run test:classification`
5. `npm.cmd run test:page-contracts`
6. `npm.cmd run test:e2e`
7. Optional: `docker build -t ai-agentic-project-prepush .`

## CI Split

> **Authoritative CI / merge policy lives in [[09 Infrastructure and CI Map]].** CI is GitHub-first; Jenkins is out of scope unless the user reopens it.

- **Local pre-push gate:** `.githooks/pre-push` blocks the push unless `npm run test:e2e` passes; it also builds Docker when `preMerge.dockerEnabled` is true.
- **PR process gates:** `pr-validation.yml` runs formatting and full regression, and `ai-review-gate.yml` requires an attestation for the exact current head.
- **Merge authority:** the user explicitly approves merge after both PR checks pass and actionable findings are resolved.
- **Post-merge:** `post-merge-canary.yml` runs health + sanity + contract on the exact merge revision, using host or Docker mode from policy; main and daily workflows remain broader signals.
- See [[09 Infrastructure and CI Map]] for per-workflow detail (triggers, permissions, artifacts).
