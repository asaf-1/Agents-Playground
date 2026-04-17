# Reliable Agentic QA Demo Guide

This is the operator guide for the current project. It explains the live app, the generic self-healing layer, the test coverage, and the exact commands to use in a demo or handoff.

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
  - page action intents for home, dashboard, and product pages
- `framework/fixtures/baseTest.ts`
  - injects `homePage`, `dashboardPage`, and `productPage` into the tests

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

### Guardrails

- deterministic by default
- `OPENAI_API_KEY` can only enrich narrative text
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

The full suite currently contains `14` tests.

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

Success looks like `14/14` tests passing.

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
```

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

## Recommended Demo Order

1. `npm.cmd run test:sanity`
2. `npx.cmd playwright test tests/e2e/scenarios/generic-self-healing.spec.ts --headed --workers=1`
3. `npx.cmd playwright test tests/e2e/scenarios/flaky-network-recovery.spec.ts --headed --workers=1`
4. `npm.cmd run test:classification`
5. `npm.cmd run test:page-contracts`
6. `npm.cmd run test:e2e`
7. `docker build -t ai-agentic-project-prepush .`

## How Obsidian Fits

- Obsidian is the shared project memory and operator layer
- `01 Project Map` explains the current code and product shape
- `02 Test Map` explains coverage and commands
- `Tasks/005 Page-Level Self-Healing Adoption` is the active task record for the current page-level adoption step
- the codebase and the executed validations remain the runtime truth

## Where To Look After A Run

- Scenario artifacts: `.artifacts/scenarios/`
- Playwright report: `.artifacts/playwright-report/`
- Playwright raw output: `.artifacts/test-results/`
- Daily automation reports: `docs/obsidian-vault/Reports/`
