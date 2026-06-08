---
type: task
status: completed
tags:
  - task
  - css
  - ui-polish
  - visual-regression
---

# CSS Polish

## Outcome

Make the static demo site look more professional through CSS-only changes while preserving Playwright hooks, page contracts, and the intentional broken-product overlap scenario.

## Context

The demo is a zero-build, static Node-served test target for QA agents. The goal is visual polish only, not a Vite/React conversion or a DOM rewrite.

## Target Files

- `public/styles.css`
- `docs/css-polish-plan.md`
- `README.md`
- `obsidian-vault/AGENT_MEMORY.md`

## Acceptance Criteria

- No DOM hooks, visible text, IDs, roles, or `data-testid` attributes are renamed.
- `.product-layout--broken` geometry remains test-compatible.
- `[hidden]` behavior remains intact.
- Login, orders, user manager, admin, profile, and settings pages are visually aligned with the existing landing/dashboard/product style.
- Visible focus rings, improved form controls, button states, table polish, card treatment, and reduced-motion handling are present.
- Full Playwright regression remains green.

## Validation

- `npx.cmd playwright test tests/e2e/sanity/sanity-smoke.spec.ts tests/e2e/sanity/new-pages.spec.ts tests/e2e/scenarios/auth-session.spec.ts tests/e2e/scenarios/rbac.spec.ts tests/e2e/scenarios/dynamic-content-validation.spec.ts tests/e2e/scenarios/page-contract-validation.spec.ts tests/e2e/functional/negative/functional-negative.spec.ts`
- `npm.cmd run test:e2e`
- Screenshot artifact capture under `.artifacts/css-polish/`

## Notes For The Agent

- Do not add Vite, React, or a build step.
- Keep changes visual-only.
- Do not alter the intentional product overlap rules.
- Do not include unrelated `.agents/` files.

## Result

Implemented on 2026-06-08.

- Added a CSS-only polish layer to `public/styles.css`.
- Added high-specificity bridge selectors so older page-local style blocks still receive the shared polish without editing markup.
- Hid the decorative ambient blobs and moved the app toward a calmer professional UI with stronger surfaces, focus rings, form controls, buttons, tables, badges, and reduced-motion support.
- Updated `docs/css-polish-plan.md` from parked plan to completed implementation note.
- Captured screenshots for home, login, dashboard, orders, product valid, product broken, user manager, admin, profile, and settings under `.artifacts/css-polish/`.

Validation passed:

- Focused Playwright coverage: 19/19 passed.
- Full regression: 60 passed, 2 skipped.