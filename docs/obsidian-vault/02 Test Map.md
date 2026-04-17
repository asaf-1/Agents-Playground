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

New specs should go into the category that matches their main purpose. Do not recreate flat top-level spec files or placeholder folders.

## Page-Level Rule

- UI-facing tests should use page objects injected from `framework/fixtures/baseTest.ts`.
- Interactive page behavior should live in the page object, not inside each test.
- Each important page should have a page profile under `framework/agents/recovery/pageProfiles/`.
- Dedicated stale-locator scenarios may still use raw broken selectors on purpose.

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

## Current Fixture Model

- `framework/fixtures/baseTest.ts` injects:
  - `homePage`
  - `dashboardPage`
  - `productPage`
  - `userManagerPage`

When a new UI-heavy page is added, extend the fixture model instead of scattering raw interactive locators through the tests.

## Execution Notes

- Base URL: `http://127.0.0.1:4173`
- The Playwright config starts `node server.js 4173`
- Scenario artifacts are written to `.artifacts/scenarios/<scenario>/`
- Test run output is written to `.artifacts/test-results`
- HTML reports are written to `.artifacts/playwright-report`
- The current full suite count is `24` tests

## Exact Commands

### Run the whole workspace

```powershell
npm.cmd run test:e2e
```

Use this for full regression. Success looks like all `24/24` tests passing and the HTML report under `.artifacts/playwright-report/`.

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
```

Use these when you want a focused recovery, diagnosis, or validation demonstration.

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

### Build the local Docker gate

```powershell
docker build -t ai-agentic-project-prepush .
```

Use this before a push or when someone asks how the local merge gate is enforced.

## Recommended Demo Flow

1. `npm.cmd run test:sanity`
2. `npx.cmd playwright test tests/e2e/scenarios/generic-self-healing.spec.ts --headed --workers=1`
3. `npx.cmd playwright test tests/e2e/scenarios/flaky-network-recovery.spec.ts --headed --workers=1`
4. `npm.cmd run test:classification`
5. `npm.cmd run test:page-contracts`
6. `npm.cmd run test:e2e`
7. `docker build -t ai-agentic-project-prepush .`

## CI Split

- Daily Codex automation: run the full suite and write a report into `docs/obsidian-vault/Reports/`
- Daily Jenkins pipeline: run the full suite on a schedule for CI visibility
- Daily GitHub Actions workflow: run the full suite on a fixed UTC schedule and upload artifact-only regression reports
- Normal Jenkins validation: build the repo in Docker first, then run the matching Playwright validation
- Local pre-push rule: block push unless `npm run test:e2e` and a local Docker build both pass
- Pre-merge Jenkins rule: for code pushed to GitHub and intended for merge, Jenkins should validate the pushed revision in Docker and then run the matching Playwright validation before merge
