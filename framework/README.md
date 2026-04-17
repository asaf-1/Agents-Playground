# Framework Map

This folder contains the shared Playwright support code for the QA demo and the current generic self-healing layer.

## Structure

- `agents/recovery/`
  - `GenericLocatorHealer.ts`
    - heals stale button, link, and input actions from live DOM evidence
  - `RecoveryRouter.ts`
    - classifies a failure, tries QA-safe recovery strategies, and records strategy attempts
  - `pageProfiles/`
    - page-level action intents that let one healing rule benefit many tests on the same page
  - `SelectorHealer.ts`
    - compatibility wrapper for button-focused selector recovery
  - `NetworkRecoveryAgent.ts`
    - compatibility wrapper for orders recovery that now routes through the shared recovery stack
- `agents/diagnosis/`
  - `FailureClassifier.ts`
    - deterministic UI and API failure classification
  - `PatchProposalAgent.ts`
    - deterministic permanent-fix guidance with likely files and validation steps
  - `ApiDiagnosisAgent.ts`
    - RCA for `POST /api/create-user`, now enriched with classification and patch proposal output
  - `NarrativeEnricher.ts`
    - optional OpenAI-backed narrative rewrite with no effect on pass/fail logic
- `agents/validation/`
  - `contracts.ts`
    - reusable page-contract definitions for home, dashboard, and product pages
  - `PageValidationAgent.ts`
    - generic contract validator plus the product-page wrapper used by existing scenarios
- `fixtures/`
  - shared Playwright test fixture setup, including page-object fixtures from `baseTest.ts`
- `data/`
  - reusable request payloads and other test data
- `pom/`
  - page-object helpers for the home, dashboard, and product pages
  - `SelfHealingPage.ts`
    - base page layer that tries the primary locator first and falls back to the recovery router
- `reporting/`
  - scenario report, screenshot, and trace writing

## Why This Exists

- keep shared recovery, diagnosis, and validation logic out of the specs
- preserve deterministic scenario behavior while making the self-healing layer reusable
- keep page objects available for the tests that benefit from them without mixing POM concerns into the agents
- make page-level healing reusable so UI-facing tests can call page methods instead of owning raw interactive locators
- keep the public report schema stable even as the internal router and classifier become more capable
