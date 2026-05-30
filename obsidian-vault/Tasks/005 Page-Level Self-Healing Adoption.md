---
type: task
status: validated
tags:
  - task
  - qa-demo
  - self-healing
  - pom
  - playwright
---

# Page-Level Self-Healing Adoption

## Outcome

Adopt page-level self-healing across the current demo pages so UI-facing tests benefit from shared page profiles and self-healing page-object actions instead of each test owning direct locator behavior.

## Context

The repo already has generic locator healing and a recovery router, but most tests still rely on direct page locators or page objects without centralized self-healing actions. The next step is to move the current pages toward the enterprise pattern: page object + page profile + shared self-healing action helper + documentation for future page expansion such as a User Manager page.

## Target Files

- `framework/fixtures/baseTest.ts`
- `framework/agents/recovery/**/*.ts`
- `framework/pom/*.ts`
- `tests/e2e/**/*.spec.ts`
- `framework/README.md`
- `obsidian-vault/01 Project Map.md`
- `obsidian-vault/02 Test Map.md`
- `obsidian-vault/06 Agents Playground Guide.md`
- `md/DEV_TEAM_AGENT_SETUP_PLAYBOOK.md`
- `md/SHARED_AGENT_SETUP_BLUEPRINT.md`
- `md/PRODUCTION_SELF_HEALING_MULTI_AGENT_BLUEPRINT.md`

## Acceptance Criteria

- Current demo pages use shared page-level self-healing actions for UI interactions.
- Current UI-facing tests use page-object methods where possible instead of owning raw interactive locators.
- The page-level pattern is documented for future pages such as User Manager.
- The md-folder handoff docs explain how to expand the pattern to all pages in future projects.
- Existing deterministic demo behavior and full validation continue to pass.

## Validation

- `npx playwright test tests/e2e/sanity/sanity-smoke.spec.ts tests/e2e/functional/positive/functional-positive.spec.ts tests/e2e/scenarios/generic-self-healing.spec.ts`
- `npm run test:e2e`

## Notes For The Agent

- Keep the demo deterministic.
- Use wrappers and shared helpers instead of scattering recovery calls through the tests.
- Keep the md-folder additions practical and future-reusable.
- Update the `Result` section before finishing.

## Result

- Added page-level self-healing as the current UI automation pattern.
- Added `framework/pom/SelfHealingPage.ts` as the shared action layer that tries the primary locator first and falls back to the recovery router.
- Added page profiles for the current demo pages:
  - `framework/agents/recovery/pageProfiles/homePageProfile.ts`
  - `framework/agents/recovery/pageProfiles/dashboardPageProfile.ts`
  - `framework/agents/recovery/pageProfiles/productPageProfile.ts`
- Updated `framework/fixtures/baseTest.ts` to inject `homePage`, `dashboardPage`, and `productPage` into the tests.
- Refactored the current UI-facing tests to use page-object fixtures and page methods where appropriate instead of owning interactive page locators directly.
- Added `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md` as the reusable guide for future pages such as `UserManagerPage`.
- Updated the md-folder setup playbooks so future agents know how to roll this pattern out across more pages.
- Validation run and outcome:
  - `npx.cmd tsc --noEmit` passed
  - `npx.cmd playwright test tests/e2e/sanity/sanity-smoke.spec.ts tests/e2e/functional/positive/functional-positive.spec.ts tests/e2e/scenarios/generic-self-healing.spec.ts` passed
  - `npm.cmd run test:e2e` passed with `14/14` tests green
