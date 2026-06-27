# React Surface (/app) — Injected Defect Catalog

Diagnostician classification of the deliberate defects on the React `/app`
surface. All are flag-armed per `runKey` via `POST /api/test/flags`; defaults are
non-drifted, so nothing fires unless a test arms it. Verdict semantics:

- **HEAL** — test drift (selector/text). The healer repairs the test, not the app.
- **REPORT** — real/by-design defect a correct test should record. Never "fixed".

| Flag (default)                 | Surface         | Category        | Armed behavior                                      | Verdict    | Root cause                                              | Covering test                        |
| ------------------------------ | --------------- | --------------- | --------------------------------------------------- | ---------- | ------------------------------------------------------- | ------------------------------------ |
| `ordersRefreshLabel="Refresh"` | `/app/orders`   | DOM / selector  | Refresh button text → "Reload" (testid stable)      | **HEAL**   | Visible label changed; a text selector is stale         | `react-orders.spec.ts`               |
| `userCreateConflict=false`     | `/app/users`    | Async / state   | `POST /api/users` → 409; optimistic row rolls back  | **REPORT** | Server rejects create; optimistic UI reverts            | `react-users.spec.ts`                |
| `usersSearchStale=false`       | `/app/users`    | Async / closure | Debounced search applies the previous query         | **REPORT** | Stale-closure off-by-one in the debounce                | `react-users.spec.ts`                |
| `usersLocaleBug=false`         | `/app/users`    | i18n / locale   | "Directory as of" renders de-DE (15.01.26) vs en-US | **REPORT** | Wrong locale passed to `Intl.DateTimeFormat`            | `react-users.spec.ts`                |
| `usersA11yBug=false`           | `/app/users`    | Accessibility   | Create-user name input loses its label association  | **REPORT** | No `<label>`/`id`/`aria-label` → no accessible name     | `react-a11y.spec.ts` (axe `label`)   |
| `authRequired=true`            | `/app/account`  | Auth / session  | `GET /api/session` → 401 session-expired state      | **REPORT** | Protected session required; UI surfaces 401             | `react-account.spec.ts`              |
| `productSchemaDrift=false`     | `/api/products` | API contract    | `price` emitted as string, not number               | **REPORT** | Response violates the OpenAPI `ProductsResponse` schema | `api-openapi-contract.spec.ts` (ajv) |

## Notes

- Legacy intentional defects (RBAC editor-delete, broken product state, layout
  overlap, inactive Carol) are unchanged and out of scope here.
- Isolation: each test navigates `/app/...?runKey=<unique>` and arms flags for
  that `runKey` only, so armed drift never leaks across the parallel suite.
- The single HEAL case (`ordersRefreshLabel`) is the only one a healer should
  touch; the rest are REPORT (by-design) and must not be "fixed".
