# CSS Polish — Plan & Constraints (deferred)

> Status: **completed** on 2026-06-08. Goal: make the demo site look more
> professional via CSS only, without breaking the Playwright suite.

## Decision: polish CSS, do NOT add Vite/React

The site is a deliberate **test target** for the QA agents, not a product. It is
zero-runtime-dependency (devDeps are only Playwright + types + `wait-on`), has no build
step (`server.js` streams static files from `public/`), and its DOM is hand-authored so the
self-healing scenarios can lock onto it. Adding Vite/React would add a large dependency
tree, a build pipeline, and would restructure the DOM — invalidating locators, page
contracts, and the Docker/CI portability the repo is built around. The desired "professional
look" is almost entirely a **CSS** concern, achievable by editing only `public/styles.css`
(plus optional per-page tweaks) with zero risk to the suite.

If a modern-SPA target is ever genuinely wanted (to prove agents can heal a React app),
do it on a separate `react-target` branch as an experiment — never as a replacement.

## Hard constraint: polish must be purely additive / visual

CSS changes must not alter anything the tests key off. Confirmed test dependencies:

- **Broken-product overlap is REAL CSS geometry.** Tests assert bounding-box intersection
  (see `tests/e2e/seed.spec.ts:46` and `"Visual overlap detected"` assertions in
  `dynamic-content-validation`, `page-contract-validation`, `functional-negative`,
  `failure-classification-and-patch-proposal`). The `.product-layout--broken` rules in
  `public/styles.css:515-549` (absolute-positioned price/buy-button + min-height) are
  **load-bearing** — preserve them verbatim or keep them geometrically equivalent.
- **`[hidden]` visibility semantics**: `.error-card[hidden]` / `.loading-card[hidden]` →
  `display:none` (`styles.css:431-434`). Tests toggle these; keep the hide behavior.
- **`data-testid`, visible text, roles, ids** across all specs are locked — don't rename
  classes used as locators, don't change rendered text, don't hide/move asserted elements.

Rule of thumb: **add, never remove/rename.** Only touch visual properties (color, type,
spacing, shadow, radius, states). No DOM/markup/text/geometry changes.

## Scope (what "polish" should cover)

- Pages to unify (index.html is the most polished reference; others may be partial/bare):
  `login, dashboard, product, orders, user-manager, admin, profile, settings`.
- Likely wins: typographic scale & rhythm, consistent spacing tokens, WCAG-AA color
  contrast, button/input states (hover/focus/active/disabled), **visible focus rings**
  (a11y), table polish, badge/pill consistency, `prefers-reduced-motion`, optional
  `prefers-color-scheme` dark mode.

## Recommended approach when resumed

1. **Recon (parallel, read-only)** — map before editing:
   - Inventory every test-locked hook (data-testid / role / text / id / class-locator)
     across `tests/**` + `framework/**`.
   - Pin the exact overlap/visibility CSS rules that are load-bearing.
   - Inventory all `public/*.html` for polish level + gaps vs index.html.
   - Design critique of `styles.css` → concrete, structure-preserving improvements.
2. **Author** the refreshed `public/styles.css` (single coherent artifact) + minimal
   per-page tweaks.
3. **Verify** — run the full suite (`npm test`) green, and screenshot each page
   before/after via the Playwright MCP browser to confirm the visual improvement.

(There is a ready-to-run recon Workflow drafted for step 1 — re-create or ask to re-run it.)

## How to run / view the site (reference)

- Start: `npm start` → http://127.0.0.1:4173 (server auto-starts during `npm test` too).
- Pages: `/ /login /dashboard /orders /product (/product/sku-123) /user-manager /admin
  /profile /settings`.
- Logins (shared password `demo1234`): `alice@demo.local` (Admin), `bob@demo.local`
  (Editor), `carol@demo.local` (Viewer — inactive, login 401 by design).
- Broken render to see the overlap defect: `/product/sku-123?state=broken`.

## Result

Implemented as a CSS-only polish layer in `public/styles.css` on 2026-06-08.

- Kept the zero-build static site architecture.
- Did not rename DOM hooks, visible text, ids, roles, or test-facing classes.
- Preserved `.product-layout--broken` geometry and `[hidden]` behavior.
- Added a shared visual layer for page shells, cards, forms, buttons, tables, focus rings, reduced-motion handling, and status treatments.
- Unified the older login/orders/user/admin/profile/settings pages with the more polished landing/dashboard/product visual language without changing their markup.
## Validation completed

- Focused Playwright UI coverage passed: 19/19.
- Full regression passed: 60 passed, 2 skipped.
- Screenshot artifacts captured for the target pages under `.artifacts/css-polish/`.