---
type: task
status: completed
tags:
  - task
  - react
  - vite
  - openapi
  - testing
---

# 011 React Surface and OpenAPI Expansion

## Scope

Add an industry-relevant React surface at `/app` alongside the legacy static app, with deliberate flag-armed defects and matching test coverage; document the API with OpenAPI 3.1 + Swagger UI and contract tests. Strangler approach — the legacy `/` surface and the prior 62-test baseline are preserved.

## Delivered (phases)

- **P0** (merged via PR #7): Vite 8 + React 19 + TS + React Router SPA at `/app`, built to `public/app`, served by `server.js` with a client-side routing fallback; the Playwright `webServer` builds before serving.
- **P1**: TanStack Query (Orders), React Hook Form + Zod create dialog (Radix Dialog), Radix DropdownMenu row actions, routes/nav.
- **P2**: 6 flag-armed `/app` defects (per `runKey`, default off): `userCreateConflict`, `usersA11yBug`, `usersLocaleBug`, `usersSearchStale`, `ordersRefreshLabel`, account session via `authRequired`/`sessionExpired`.
- **P3**: Playwright `tests/e2e/app/` specs + axe a11y + Vitest/Testing Library/MSW component tests + opt-in visual (`tests/visual/`).
- **P4**: diagnosis catalog `docs/react-surface-defects.md` (HEAL vs REPORT per defect).
- **P6**: Products catalog (48 items) + detail + 57 parallel-safe parametrized tests (scales the suite to justify sharding + workers).
- **P7**: OpenAPI 3.1 (`openapi.json`) at `/api/openapi.json`, Swagger UI at `/api/docs`, ajv contract tests, and a `productSchemaDrift` defect.

## Tech added (all devDependencies)

`vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@axe-core/playwright`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw`, `swagger-ui-dist`, `ajv`, `ajv-formats`.

## New routes / endpoints

- Pages: `/app`, `/app/orders`, `/app/users`, `/app/products`, `/app/products/:id`, `/app/account`.
- API: `GET /api/products`, `GET /api/products/:id`, `GET /api/openapi.json`, `GET /api/docs`, `GET /api/docs-assets/*`.

## Validation

- `npm run build` ok; `npm run test:e2e` → 141 passed / 2 skipped (143 total); `npm run test:unit` → 4 passed; `tsc -p web/tsconfig.json` + `npm run format:check` clean.
- Docker untouched/disabled; legacy baseline and all prior intentional defects preserved.

## Commands

`npm run build`, `npm run dev:web`, `npm run test:e2e`, `npm run test:unit`, `npm run test:visual`.
