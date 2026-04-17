---
type: task
status: validated
tags:
  - task
  - qa-demo
  - self-healing
  - playwright
  - agents
---

# Generic Self-Healing Layer

## Outcome

Upgrade the current scenario-scoped recovery agents into a more generic self-healing layer while keeping the deterministic QA demo behavior and existing report schema intact.

## Context

The current demo proves targeted healing and recovery for one stale button and one flaky network flow. The next step is to make the framework more reusable by adding broader locator healing, deterministic failure classification, contract-based page validation, and a recovery router that can try multiple QA-safe strategies before failing.

## Target Files

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `framework/agents/recovery/**/*.ts`
- `framework/agents/diagnosis/**/*.ts`
- `framework/agents/validation/**/*.ts`
- `framework/pom/*.ts`
- `framework/reporting/types.ts`
- `tests/e2e/scenarios/*.spec.ts`
- `docs/obsidian-vault/01 Project Map.md`
- `docs/obsidian-vault/02 Test Map.md`
- `docs/obsidian-vault/06 Reliable Agentic QA Demo Guide.md`

## Acceptance Criteria

- Generic locator healing supports buttons, links, and inputs.
- The current selector-healing and flaky-network scenarios use a shared recovery and classification stack.
- Page validation is contract-based and not limited to the current product implementation details.
- A recovery router can try multiple QA-safe strategies before failing.
- A deterministic patch proposal agent returns structured permanent-fix guidance without editing code automatically.
- The landing page exposes one real input flow that can be used to prove input healing.
- Existing scenario artifact schema stays unchanged.
- Existing deterministic demo behavior and current scenarios continue to pass.
- New coverage proves generic healing works on non-prebaked failures.

## Validation

- `npx playwright test tests/e2e/scenarios/generic-self-healing.spec.ts`
- `npx playwright test tests/e2e/scenarios/page-contract-validation.spec.ts`
- `npx playwright test tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts`
- `npx playwright test tests/e2e/scenarios/ui-change-healing.spec.ts`
- `npx playwright test tests/e2e/scenarios/flaky-network-recovery.spec.ts`
- `npx playwright test tests/e2e/scenarios/api-error-diagnosis.spec.ts`
- `npx playwright test tests/e2e/scenarios/dynamic-content-validation.spec.ts`
- `npm run test:e2e`

## Notes For The Agent

- Keep the demo deterministic by default.
- Preserve the current top-level scenario report schema.
- Keep the existing demo pages and commands stable.
- Limit auto-mitigation to QA-safe actions only.
- Update the `Result` section before finishing.

## Result

- Implemented a generic self-healing layer on top of the existing deterministic QA demo.
- Added `GenericLocatorHealer` for button, link, and input healing.
- Added `FailureClassifier`, `PatchProposalAgent`, and `RecoveryRouter`.
- Refactored the original selector-healing and flaky-network flows to run through the shared recovery stack while preserving their deterministic demo behavior.
- Refactored page validation into reusable contracts for home, dashboard, and product pages.
- Added a real quick-triage input and live output on the landing page to prove input healing on a live DOM surface.
- Added new scenario coverage:
  - `tests/e2e/scenarios/generic-self-healing.spec.ts`
  - `tests/e2e/scenarios/page-contract-validation.spec.ts`
  - `tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts`
- Validation run and outcome:
  - `npx.cmd tsc --noEmit` passed
  - `npx.cmd playwright test tests/e2e/scenarios/page-contract-validation.spec.ts` passed
  - `npx.cmd playwright test tests/e2e/scenarios/generic-self-healing.spec.ts tests/e2e/scenarios/page-contract-validation.spec.ts tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts tests/e2e/scenarios/ui-change-healing.spec.ts tests/e2e/scenarios/flaky-network-recovery.spec.ts tests/e2e/scenarios/api-error-diagnosis.spec.ts tests/e2e/scenarios/dynamic-content-validation.spec.ts` passed
  - `npm.cmd run test:e2e` passed with `14/14` tests green
- Current guardrails remain intentional:
  - QA auto-mitigation is limited to locator healing, extend-wait, refresh-and-retry, and contract re-check
  - patch proposals are deterministic and proposal-only
  - no runtime code editing is performed by the recovery layer
