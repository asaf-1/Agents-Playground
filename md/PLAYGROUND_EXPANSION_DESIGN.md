# Playground Expansion Design (for review — no code yet)

> Goal: make this site a richer **agent playground**. Specifically, light up the **two
> failure categories nothing currently triggers** — `auth-or-session` and
> `permissions-or-rbac` — and add more surface for the planner/generator, while keeping the
> server **dependency-free, in-memory, and deterministic**. Built per-feature, merged into
> one model, then adversarially reviewed against the real `server.js`. **Nothing is built
> until you approve this.**

## 0. The four features → what they unlock

| Feature you picked | New for the agents | Dark category lit |
|---|---|---|
| **Auth + session** | login flow, session cookie, expiry, logged-out redirect; makes `storageState` *real* | **auth-or-session** |
| **RBAC / permissions** | role-gated actions, `403`s, an intentional over-permission **defect** to report | **permissions-or-rbac** |
| **Drift control panel** | toggle every intentional failure on/off on demand, deterministically | (enables all the above on demand) |
| **Richer UI flows** | pagination/sorting, a multi-step wizard, async field validation | more `ui-delayed-data` / `ui-empty-state` / `api-client-error` surface |

## 1. Five load-bearing decisions

1. **One session mechanism.** A real opaque `sid` cookie (HttpOnly), minted by `POST /api/login` against seeded credentials. RBAC reads the role **off that session** — no second, forgeable "role cookie." A test-only `POST /api/test/set-session {role}` mints a real session for a chosen seeded user (so Playwright can pick an identity without typing passwords).
2. **One flag store.** Every intentional drift (existing + new) is a named flag in a per-`runKey` store. Resolution order per request: **explicit query param > per-runKey flag > `global` flag > default**. Defaults = exactly today's non-drifted behavior, so **no existing spec breaks** and new auth/RBAC drift is never on by accident.
3. **One full-reset hook.** `POST /api/test/reset` runs `resetAll()` clearing sessions, managed users, overlays, flags, drafts, *and* the legacy counters — finally fixing the partial-reset wart. `POST /api/test/reset-users` becomes an alias.
4. **storageState becomes real.** A `setup` project logs in once and saves the cookie; an `authenticated` project consumes it. A `default` project (everything else) stays storageState-free so the ~24 existing specs and the no-auth flows stay green. This is the one **`playwright.config.ts`** change (introduces `projects[]` where there are none today).
5. **Deterministic, not time-based.** Session expiry is driven by a boolean `sessionExpired` flag, never wall-clock TTL. Drift is armed per-`runKey` so `fullyParallel` workers never collide.

## 2. Unified in-memory state model

```js
runtimeState = {
  // existing (kept; now ALL cleared by resetAll)
  createdUsers: [], managedUsers: [],
  flakyOrderFailuresByRunKey: new Set(), orderRequestCount: 0,
  // NEW — real sessions (opaque sid)
  sessions: new Map(),            // sid -> { userId, name, role, email, issuedAtMs, expiresAtMs }
  // NEW — RBAC overlays (seeded users never mutated in place)
  editsByUserId: {},              // userId -> { role?, status? } applied at read time
  deletedManagedUserIds: new Set(),
  // NEW — richer flows
  draftOrders: [],
  // NEW — drift control
  flagsByRunKey: new Map()        // runKey -> Partial<FlagSet>
};
```

Frozen module constants (no reset needed): `SEEDED_CREDENTIALS`, `ROLE_PERMISSIONS`
(`Admin: create/edit/delete`, `Editor: edit`, `Viewer: read-only`), `SYNTHETIC_ORDERS`,
`TAKEN_EMAILS`. `sid` is `sess-<userId>-<issuedAtMs>-<crypto.randomBytes(8).hex>` (Node
built-in `crypto`, no dependency). Cookies are parsed/set by hand (no library).

## 3. Flag scheme + catalog

`POST /api/test/flags {runKey, flags}` writes, `GET /api/test/flags?runKey=` reads,
`DELETE /api/test/flags?runKey=` clears one key (no `runKey` → full `resetAll()`).

| Flag | Allowed | Default | Lights |
|---|---|---|---|
| `ctaMode` | new, old | new | `ui-missing-locator` (Sign Up→Join Now heal) |
| `ordersMode` | stable, slow, flaky | stable | `ui-delayed-data` / `api-timeout` |
| `ordersDelayMs` | int ≥0 | 0 | `ui-delayed-data` |
| `productState` | valid, broken | valid | `ui-contract-or-render` |
| `createUserPhoneType` | integer, string | integer | `api-contract-drift` (the typed 500) |
| `authRequired` | bool | **false** | `auth-or-session` (401) |
| `sessionExpired` | bool | **false** | `auth-or-session` (401) |
| `loginSubmitLabel` | Sign In, Authenticate | Sign In | `ui-missing-locator` (login rename heal) |
| `rbacEnforce` | bool | **false** | `permissions-or-rbac` (403) |
| `adminGate` | open, locked | open | `permissions-or-rbac` (deterministic 403) |
| `rbacBug` | off, editor-delete | off | `permissions-or-rbac` **defect** → reporter |

Specs arm a drift in `beforeEach` (`page.request.post('/api/test/flags', {data:{runKey, flags}})`)
using a **unique runKey** (`test.info().testId`) and disarm in `afterEach`
(`DELETE /api/test/flags?runKey=`). See Guardrail G5 about `global`.

## 4. New pages

- **`/login`** — the only page without the auth guard. Real credential form → `POST /api/login`.
  testids: `login-form`, `login-heading`, `login-email`, `login-password`, `login-submit`
  (the rename target), `login-error`, `login-status`.
- **`/lab`** — drift control panel GUI over the flag store (one toggle per flag + runKey input).
  **Optional / deferred** (see Guardrail G7): tests arm flags via the API directly; `/lab` is
  human convenience. If built, it is a **non-contracted dev page** (not added to the shared contract).
- **`/orders-explorer`** — server-paginated + sorted orders table (Phase 4).
- **`/create-order`** — 3-step wizard with debounced async email-uniqueness check (Phase 4).
- **No new page for the guard** — `/admin`, `/profile`, `/settings`, `/user-manager` get an
  inline auth-guard script + a `session-banner`/`logout-btn` header. `/dashboard` and `/orders`
  stay public (preserve existing specs + the seed's `goto('/')`).

## 5. New / changed endpoints

**Auth (Phase 1)** — `POST /api/login` (200 + `Set-Cookie sid`; 401 bad creds / inactive;
400 missing fields) · `POST /api/logout` (idempotent 200, clears cookie) ·
`GET /api/session` (200 `{user, role, permissions}` or 401 when no/expired/flagged session) ·
`POST /api/test/set-session {role|userId}` (test hook: mints a real session).

**RBAC (Phase 3)** — `GET /api/admin/audit` (200 / 401 / 403 depending on flags + role) ·
`PATCH /api/users/:id` and `DELETE /api/users/:id` (role-gated; `DELETE` carries the
**intentional `rbacBug:'editor-delete'`** over-permission defect) · `GET /api/users` extended to
apply overlays · `POST /api/users` / `POST /api/create-user` gain optional `rbacEnforce`/`authRequired` gating.

**Drift control (Phase 2)** — `GET/POST/DELETE /api/test/flags` · `POST /api/test/reset` (canonical).

**Richer flows (Phase 4)** — `GET /api/orders/page` (pure: page/pageSize/sort/dir/status;
overflow → empty, not error) · `GET /api/customers/email-available` (pure; `drift=flake503`) ·
`POST /api/orders/draft` (validation 400; `drift=qtyType` typed-500).

## 6. Agent-scenario map (the payoff)

Representative scenarios — at least one per category, drift armed via the flag store:

| Scenario | Failure category | Agent | Artifact |
|---|---|---|---|
| Session-expired 401 on `/profile` redirects to `/login` | **auth-or-session** | diagnostician | RCA: 401 + escalate (don't retry) |
| Login submit renamed → stale locator | ui-missing-locator | healer | locator healed via intent tokens |
| Viewer blocked from Add User (403) | **permissions-or-rbac** | diagnostician | RCA: 403 permissionDenied |
| Editor wrongly allowed to delete (`rbacBug`) | permissions-or-rbac (defect) | reporter | local bug record + incident note |
| Admin happy path (positive control) | permissions-or-rbac | generator | passing spec (gate not over-restrictive) |
| CTA Sign Up→Join Now | ui-missing-locator | healer | healed selector |
| Orders slow / flaky | ui-delayed-data / api-timeout | diagnostician | wait-state / retry RCA |
| Broken product render | ui-contract-or-render | diagnostician | contract failure RCA |
| create-user string phone → 500 | api-contract-drift | diagnostician | typed-mismatch RCA + patch proposal |
| Pagination overflow empty page | ui-empty-state | diagnostician | empty-state RCA |
| Email check in-flight | ui-loading-or-network | diagnostician | "Checking…" RCA |
| Bad flag write rejected (400) | api-client-error | planner | negative test guarding the control plane |

(The full 28-row map is in the workflow output and becomes the generated test backlog.)

## 7. Seed + config changes (storageState becomes real)

- **`tests/e2e/seed.spec.ts`**: switch the reset call to `POST /api/test/reset` (full
  `resetAll()`); retire the "no auth / no storageState" comment — auth/RBAC are **off by
  default**, so the default path is unchanged; storageState is real only for the authenticated project.
- **New `tests/e2e/auth.setup.ts`**: logs in (or `set-session {role:'Admin'}`), saves
  `context.storageState({path:'.artifacts/auth/admin.json'})` (`.artifacts/` is already gitignored).
- **`playwright.config.ts`**: add `projects` — `setup` (runs `auth.setup.ts`),
  `authenticated` (`dependencies:['setup']`, `use.storageState`, runs the auth/RBAC specs),
  `default` (everything else, no storageState). Keep webServer / baseURL / `channel:'chrome'` /
  `fullyParallel`. No `Secure` cookie flag (plain http on 127.0.0.1).

## 8. POM / contract / fixture changes

Scaffold (via the `new-page` skill) `LoginPage` and, for Phase 4, `OrdersExplorerPage` +
`CreateOrderPage` (+ profiles, fixtures → `AppFixtures` grows from 8). Extend
`UserManagerPage`/`AdminPage`/`ProfilePage`/`SettingsPage` POMs with `sessionBanner`/`logoutBtn`
helpers. Add a `loginPageProfile` (intent tokens `['sign in','log in','submit','authenticate']`).
Add classifier empty-state tokens (`'no orders on this page'`, `'add at least one line item'`,
`'email already in use'`). **Contracts: see Guardrail G2 — do NOT add the banner to shared
required lists.**

## 9. Guardrails (folded in from adversarial review — must-do before/while building)

- **G1 — `/admin` is a REWRITE, not an extend.** `admin.html` is inline-static (hardcoded
  array, no fetch). Making `/api/admin/audit` the trigger means a fetch-driven `admin.js` that
  **preserves** `admin-log` / `admin-action-count` / `admin-log-entry` and the existing
  `clearLog → '0'` behavior so `sanity/new-pages.spec.ts` still passes. Budget Phase 3 for it.
- **G2 — Don't put the session banner in the shared contract.** Adding `"Signed in as"` /
  `session-banner` to `contracts.ts` required lists would fail the **no-auth default suite**
  (renders nothing / "undefined" → trips `forbiddenTextTokens`). Assert the banner only in
  authenticated-project specs via the POM.
- **G3 — No length-based IDs.** `DRAFT-<draftOrders.length>` duplicates under parallel workers
  (the `orderRequestCount` mistake again). Build draft IDs from `runKey` + `crypto.randomBytes`,
  or partition `draftOrders` per runKey. Keep the `/attempt \d+/` regex guidance for orders.
- **G4 — One email per seeded user, everywhere.** `seededUsers` have **no email** today — add
  it. Standardize (e.g. `alice@demo.local` to match the existing `profile.html`); fix the
  inactive-login scenario that used a mismatched `carol@demo.local` vs `carol@cedar.test`.
- **G5 — `global` flag writes are a hard rule, not a lint note.** With `fullyParallel`, specs
  **must** pass a per-test `runKey`; reserve `global` for the `/lab` GUI only.
- **G6 — Verify page JS doesn't send default query params.** Since query outranks flags, if
  `dashboard.js`/`orders.js`/`product.js` append a default `?mode`/`?state`, an armed flag is
  silently ignored. Check before wiring flags into those endpoints.
- **G7 — `/lab` GUI and Phase 4 are the optional/heavier parts.** Phases 1+3 alone light both
  dark categories. Phase 4 (orders-explorer / create-order / email-availability) feeds
  categories that *already* fire today via `/api/orders` and `/api/create-user`. You picked all
  four — fine — but they're sequenced last and can be trimmed/deferred without missing the goal.
- **G8 — Cookies only on JSON paths.** `sid` is set via `sendJson` (login/logout/session);
  `serveFile` never needs `Set-Cookie`; `/lab`'s `qa_runkey` is set client-side via `document.cookie`.
- **G9 — One canonical class for the protected redirect.** The classifier checks auth **first**
  (matches `/auth/i` on the error message). Make the POM surface the 401 → stable
  `auth-or-session` (don't also claim `ui-route-or-navigation`).

## 10. Recommended build order

1. **Phase 1 — Auth + session + real storageState** (lights `auth-or-session`; fixes the reset wart). Smallest valuable slice.
2. **Phase 2 — Flag store + `/api/test/flags`** (the control plane; `/lab` GUI optional).
3. **Phase 3 — RBAC** (lights `permissions-or-rbac`; includes the over-permission defect; absorbs the `/admin` rewrite per G1).
4. **Phase 4 — Richer flows** (additive; optional/deferrable per G7).

Each phase is shippable on its own and keeps the existing suite green (new drift defaults off).

## 11. Open questions for you

1. **Scope:** build all four phases, or land **Phase 1 + 3** first (the two dark categories) and treat Phase 4 + the `/lab` GUI as a follow-up? (Recommended: 1+3 first.)
2. **Seeded login email:** standardize on `@demo.local` (matches the existing profile page) — OK?
3. **Start now?** If you approve, I'll begin with **Phase 1** (auth + session + storageState) and show it working before moving on.
