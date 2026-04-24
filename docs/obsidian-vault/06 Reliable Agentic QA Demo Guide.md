# Reliable Agentic QA Demo Guide

This is the operator guide for the current project. It explains the live app, the generic self-healing layer, the real-agent proof, the test coverage, and the exact commands to use in a demo or handoff.

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

### API Surface

- `GET /api/health`
- `GET /api/orders?mode=stable|slow|flaky&delayMs=<n>`
- `POST /api/create-user`
- `GET /api/product/:id?state=valid|broken`

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

The full suite currently contains `50` tests. Default local regression passes `49` specs and skips `1` live OpenAI smoke unless explicitly enabled.

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

Success looks like `49` passing specs and `1` skipped live OpenAI smoke out of `50` specs.

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

Use this only when you want to prove the real OpenAI provider path. Do not commit the key or paste it into vault notes. A passing live run writes visible vault evidence under `docs/obsidian-vault/Reports/Healing/` and `docs/obsidian-vault/Reports/Workspace/`.

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
- Daily automation reports: `docs/obsidian-vault/Reports/`
- Real-agent healing notes: `docs/obsidian-vault/Reports/Healing/`
- Real-agent workspace-state notes: `docs/obsidian-vault/Reports/Workspace/`
