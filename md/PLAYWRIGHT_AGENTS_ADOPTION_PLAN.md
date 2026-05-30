# Playwright Agents Adoption Plan

> How to put the official Playwright **planner → generator → healer** agents to work in
> this workspace, alongside the existing bespoke self-healing framework — with the
> **seed spec** as the linchpin.

This plan was produced by analyzing the live app, the existing suite, the installed
agent sources (`node_modules/playwright/lib/agents/*`, `.claude/agents/*`), and the
project blueprints, then adversarially verifying every concrete claim against the repo.

---

## 1. Current state

**Already done**

- The three official agents are installed at `.claude/agents/` (`playwright-test-planner.md`,
  `-generator.md`, `-healer.md`).
- The MCP server is wired in `.mcp.json` under the exact name **`playwright-test`**
  (`cmd /c npx playwright run-test-mcp-server`) — this name *must* match, because the
  agents reference tools as `mcp__playwright-test__*`.
- `playwright.config.ts` is valid: `testDir: ./tests/e2e`, `baseURL http://127.0.0.1:4173`,
  `channel: "chrome"` on win32, single implicit chromium project, and `webServer`
  auto-starts `node server.js 4173` (`reuseExistingServer: !CI`). So the agents bring the
  app up themselves — **never pre-start the server manually**.
- `specs/` exists (only `README.md`) and is ready to receive plans.
- The reset hook `POST /api/test/reset-users` works (clears `managedUsers`).
- Chrome + the Playwright browser cache are already installed on this machine
  (`npx playwright install` is *not* a needed prerequisite here).

**The gap**

- **`tests/e2e/seed.spec.ts` is still the empty stub** (`// generate code here.`). It
  pauses, but establishes no clean state and warms no page — so the planner/generator
  would drive a cold, non-deterministic surface. **This is the one thing that must change
  before the agents are useful.**
- There is no isolated home or npm script for agent output yet.
- No documented decision on tracing ownership (see §6 — there is a known UI-mode landmine).

---

## 1b. The agent roster (a full QA pipeline on your site)

Beyond the official trio, this workspace now defines two more Claude-Code-invokable
subagents under `.claude/agents/`, wired to the repo's existing diagnostics/reporting
conventions. All five run on **your** site; none of them edit `server.js` or `public/*`.

| Agent | File | Role | Edits files? |
|---|---|---|---|
| **planner** | `playwright-test-planner.md` | Explore the site → write a test plan to `specs/` | plans only |
| **generator** | `playwright-test-generator.md` | Turn a plan item + seed → a spec in `tests/e2e/generated/` | generated tests |
| **healer** | `playwright-test-healer.md` | Fix tests broken by intentional drift (Sign Up→Join Now, timing…) | **test files** |
| **diagnostician** | `playwright-test-diagnostician.md` | Read-only RCA: evidence + classify (14-category taxonomy) → verdict HEAL vs REPORT | none (read-only) |
| **reporter** | `playwright-test-reporter.md` | Persist a local bug record + Obsidian incident/healing note (+ closeout) | docs/vault only |

**End-to-end pipeline (the "agentic QA" story):**
```
planner → generator → run tests
                          │
                    (a failure)
                          ▼
                 diagnostician  ──(evidence + RCA + verdict)──┐
                          │                                    │
              verdict=HEAL │                      verdict=REPORT│
                          ▼                                    ▼
                       healer                               reporter
              (rewrites the stale test)        (local bug record + incident note)
```
In this playground, selector/timing drift → **HEAL**; the by-design defects (500 on string
`phone_number`, broken-product `NaN`/overlap) → **REPORT** (the smart-reporting demo).

The diagnostician/reporter sit on top of the repo's bespoke layer
(`framework/agents/diagnosis/*`, `reporting/*`, `obsidian/*`) and its skills
(`bug-report`, `incident-note`) — local bug records land in
`obsidian-vault/Reports/Bug Reports/`, notes in `Reports/Incidents` / `Reports/Healing`.

## 2. The seed spec (the linchpin)

Both `planner_setup_page` and `generator_setup_page` resolve a seed file (first project
file whose basename contains `seed`), run **only** that file with `pauseAtEnd`, and hand
the live, paused page to the agent. So the seed's whole job is: **leave the app on a
known, warm, clean page.** Because this app has **no authentication** and stores nothing
client-side, the seed needs **no credentials and no `storageState`** — determinism comes
from the reset hook + stable API modes.

Replace the stub `tests/e2e/seed.spec.ts` with:

```ts
// tests/e2e/seed.spec.ts
// Seed for the official Playwright agents (planner / generator / healer).
// Its ONLY job: leave the app on a known, warm, clean page so that when the MCP runs
// this file (planner_setup_page / generator_setup_page) with pauseAtEnd, the agent
// drives a deterministic live page. There is NO auth in this app and nothing is stored
// client-side, so this seed captures NO credentials and needs NO storageState —
// determinism comes from the reset hook + stable API modes.
// Keep this side-effect-only: NO business assertions (those belong in generated tests).
import { test } from '@playwright/test';

test.describe('Seed', () => {
  test('seed', async ({ page }) => {
    // (1) Known clean server state. /api/test/reset-users clears runtimeState.managedUsers
    //     so User Manager add-user flows start deterministic. NOTE: it is the ONLY reset
    //     endpoint — it does NOT reset createdUsers, the flaky-orders runKey set, or the
    //     global orderRequestCount (no hooks exist for those).
    const reset = await page.request.post('/api/test/reset-users');
    if (!reset.ok()) {
      throw new Error(`Seed reset hook failed: ${reset.status()} ${await reset.text()}`);
    }

    // (2) Readiness probe — a dead server fails here once, not as 50 noisy failures later.
    const health = await page.request.get('/api/health');
    if (!health.ok()) {
      throw new Error(`Seed health probe failed: ${health.status()}`);
    }

    // (3) Warm the home page (primes file cache, validates routing). The agent navigates
    //     onward to any of the 8 routes: '/', '/dashboard', '/product/sku-123?state=valid',
    //     '/user-manager', '/orders', '/admin', '/profile', '/settings'.
    await page.goto('/');

    // Under the MCP setup_page path this test is PAUSED here. Under a plain
    // `npx playwright test tests/e2e/seed.spec.ts` it simply PASSES and exits — both expected.
  });
});

// Determinism cheat-sheet for tests generated off this seed:
//   - /orders status filter is fully deterministic (always mode=stable, client-side filter)
//     — no caveats. /dashboard is the RESILIENCE surface (mode/delay/flaky): there, assert
//     the orders "attempt" with a regex (/attempt \d+/) NOT a literal, and rely on the fresh
//     per-navigation runKey for flaky mode.
//   - User Manager "Add User" (#add-user-btn) fires TWO native window.prompt() calls (name,
//     then role): register page.on('dialog', d => d.accept(value)) handlers BEFORE clicking,
//     in order. Do not confuse it with the separate invite modal (data-testid=open-invite-modal).
//   - Broken product overlap is real CSS geometry — assert boundingBox intersection.
//   - Slow mode default is 7000ms (can exceed the default expect timeout) — use
//     ?mode=slow&delayMs=<small> or bump that one assertion's timeout.
```

Notes (verified against source):
- `page.request` relative URLs resolve against `baseURL` — which `playwright.config.ts` sets, so this is correct here.
- The basename `seed.spec.ts` contains `seed`, so `findSeedFile` resolves it. **Avoid putting the substring `seed` in any future generated filename** (use the `generated-` prefix below) or the MCP could bind the agents to the wrong file.

---

## 3. Directory & isolation layout

| Output | Location | Why |
|---|---|---|
| Plans (planner) | `specs/<feature>.plan.md` | `specs/` only has `README.md` today — no collision. |
| Generated tests (generator) | `tests/e2e/generated/` (optionally `generated-*.spec.ts`) | Inside `testDir` (so `webServer` + `playwright test` work) yet trivially separable for review/diff. |
| Seed anchor | `tests/e2e/seed.spec.ts` | Stays the codegen seed for all agents. |

- **Do not** let generated specs land in `sanity/`, `functional/`, `non-functional/`,
  `contracts/` (hand-curated) or `scenarios/` (reserved for bespoke-framework healing
  proofs the official healer would try to "fix" away).
- `generator_write_test` **auto-creates** the target directory (recursive `mkdir`) and will
  accept **any** `fileName` starting with `tests/e2e/`. The *real* safeguard that keeps
  output in `generated/` is the **`**File:**` path written into the plan** — review it
  (Step 5). Pre-creating `tests/e2e/generated/` is only a convenience so the npm script
  and path exist ahead of time.

Add one npm script:

```jsonc
// package.json scripts
"test:generated": "playwright test tests/e2e/generated"
```

---

## 4. Step-by-step adoption

### Step 0 — Sanity (no app prestart)
Confirm `.mcp.json` server name is `playwright-test` (it is). Do not run `node server.js`
manually — `webServer` brings it up. Create a working branch.
```
git checkout -b chore/official-agent-adoption
```
(`npx playwright install chrome` is optional/redundant here — browsers already present.)

### Step 1 — (Optional) create the isolation dir + add the npm script
```
mkdir tests/e2e/generated      # optional; generator auto-creates it on first write
# add  "test:generated": "playwright test tests/e2e/generated"  to package.json
```

### Step 2 — Write the real seed (replace the stub)
Paste the §2 content into `tests/e2e/seed.spec.ts`, overwriting the stub. Keep it
side-effect-only (no business assertions). Keep `seed` in the basename.

### Step 3 — Verify the seed runs green
```
npx playwright test tests/e2e/seed.spec.ts --reporter=list
```
Expect **1 passed**: `webServer` auto-started 4173, reset hook → 200, health → 200.
(In this plain CLI run the seed just passes and exits; the *pause* only happens under the
MCP `setup_page` path — both are expected.)

### Step 4 — Run the planner → plan in `specs/`
Invoke `@playwright-test-planner`. It calls `planner_setup_page` once (project from config,
`seedFile=tests/e2e/seed.spec.ts`), explores via `browser_snapshot`, designs
independent happy-path + edge + error scenarios assuming a fresh state, then
`planner_save_plan` to `specs/<feature>.plan.md`. One feature per plan file. **Target the
genuine UI gaps the curated suites miss** (see §8 recommendations); **never** target the
Big Four staged-failure scenarios.

```
@playwright-test-planner Create test plan for "User Manager" functionality of my app.
- Seed file: `tests/e2e/seed.spec.ts`
- Test plan: `specs/user-manager.plan.md`
```

### Step 5 — Review & commit the plan
Open `specs/<feature>.plan.md`. Confirm the load-bearing shape the generator parses
(`## Application Overview`, `## Test Scenarios`, `### N. {suite}`, `` **Seed:** `tests/e2e/seed.spec.ts` ``,
`#### N.M. {test}`, `**File:**`, `**Steps:**` with 2-space ordinals + 4-space `- expect:`).
**CRITICAL: every test's `**File:**` path must begin with `tests/e2e/generated/`** — edit the
plan if the planner emitted another location. Confirm scenarios encode the determinism rules
(regex for orders attempt; dialog handlers for Add User). Commit.

### Step 6 — Run the generator, ONE test case at a time
Invoke `@playwright-test-generator` **once per plan bullet (1.1, 1.2, …), sequentially**.
Use the structured envelope; `<test-file>` **must** start with `tests/e2e/generated/`:

```
@playwright-test-generator
<generate>
  <test-suite>User Manager</test-suite>
  <test-name>Add a new user via the Add User dialog</test-name>
  <test-file>tests/e2e/generated/user-manager-add-user.spec.ts</test-file>
  <seed-file>tests/e2e/seed.spec.ts</seed-file>
  <body>Steps + expectations copied verbatim from specs/user-manager.plan.md bullet 1.1</body>
</generate>
```
Each file begins with `// spec:` and `// seed:` header comments, wraps the test in
`test.describe('<suite>')`, and obeys the journal Best Practices (no `waitForLoadState`/
`waitForNavigation`/`waitForTimeout`/`page.evaluate`).

### Step 7 — Run generated tests + type-check
```
npm run test:generated          # run twice to confirm determinism across reruns
npx tsc -p tsconfig.json --noEmit   # catches wrong relative-import depth in generated specs
```

### Step 8 — Heal ONLY failing generated tests
Invoke `@playwright-test-healer`, **scoped to `tests/e2e/generated`**. Important schema fact:
`test_run` **does** accept `locations: string[]` (so scope the discovery run there);
`test_debug` does **not** — it runs a single test by `{id,title}`. So the scoping happens at
`test_run`, and the healer must be told to debug/edit **only** generated files.

```
@playwright-test-healer Run the tests in `tests/e2e/generated` and fix the failing ones one
after another. Pass locations=["tests/e2e/generated"] to test_run. Only debug and edit tests
whose file is under tests/e2e/generated — if test_run surfaces a failing test outside that
folder, stop and report it; do NOT edit it.
```
The healer carries `Edit`/`Write`; if pointed at `scenarios/` it would "heal away" the
deliberate Big Four failures. **Review every healer edit before committing.**

### Step 9 — Final verification & commit
```
npm run test:generated
npm run test:ui-heal && npm run test:flaky   # Big Four staged failures still intact
npm run test:e2e                              # full gate (heavy: also runs LLM-touching scenarios)
git add tests/e2e/generated specs && git commit -m "Add official-agent-generated E2E coverage"
```
Note: `test`/`test:e2e`/`test:regression` run the **whole** `tests/e2e` tree (including
`scenarios/real-agent-proof.spec.ts`, which hits an LLM agent and can be slow). **Keep
generated tests on `test:generated` until they have proven stable across reruns**, and run
the curated gate separately.

---

## 4b. The healer is the headline demo (intentional drift → fix the TEST)

The whole point of this app is to be the thing the agents work on. `server.js` ships
**intentional drift** so tests break against it and the **healer repairs the test files**
(never the server, never `public/*`):

| Intentional drift (in the app) | A test written the "old" way breaks because… | Healer fixes the test by… |
|---|---|---|
| Hero CTA renamed **"Sign Up" → "Join Now"** (`data-testid=join-now`) | the old `getByRole('button', { name: 'Sign Up' })` matches nothing | switching the locator to the new label / `data-testid=join-now` |
| Orders `mode=slow` (7000ms) / `mode=flaky` (first 503) | a too-short wait / strict assertion times out | using web-first assertions + the real Refresh control |
| `POST /api/create-user` 500s when `phone_number` is a string | an API test asserting 201 fails | asserting the real 500 + RFC7807 problem body |
| Product `?state=broken` renders `NaN`/`undefined`/overlap | a test expecting a clean render fails | asserting the broken-state values / fixing the expectation |

**Ready-made demo:** [tests/e2e/generated/home-cta-navigates-to-dashboard.spec.ts](../tests/e2e/generated/home-cta-navigates-to-dashboard.spec.ts)
is written against the stale "Sign Up" label and **fails today** (verified: `locator.click`
timeout waiting for `getByRole('button', { name: 'Sign Up' })`). Run the healer on it to watch
it rewrite the locator to "Join Now" and go green.

> **Healer invocation (in the interactive Claude Code window, where the `playwright-test` MCP is connected):**
> ```
> Use the playwright-test-healer to fix the failing test in
> tests/e2e/generated/home-cta-navigates-to-dashboard.spec.ts.
> Only edit the test file — do not change server.js or anything in public/.
> ```

This refines §5/Step 8: the official healer **should** heal generated tests broken by the
app's intentional drift — that's the demo. The only off-limits zone is
`tests/e2e/scenarios/` (the bespoke framework's runtime-healing *proofs*, which assert their
own recovery and would be invalidated if their files were edited).

## 5. Coexistence with the bespoke framework

The two systems live in **different lifecycle phases** — keep the lanes clean:

- **Authoring (official-only — the gap the bespoke layer never filled):** planner → `specs/`,
  generator → `tests/e2e/generated/` from the real seed.
- **Runtime healing + the deterministic demo (bespoke-only):** `framework/` (SelfHealingPage
  POMs, RecoveryRouter, page profiles, contracts, IncidentRouter, `scenarioArtifacts.ts`)
  heals at runtime and emits suggested-fix artifacts. The Big Four under
  `tests/e2e/scenarios/` depend on staged failures and **must stay owned by the bespoke layer.**
- **Maintenance of plain specs (official healer):** it *edits repo files*, so it is
  appropriate **only** for `tests/e2e/generated/` and must be scoped there.

Entry points for generated tests:
- **Stable UI journeys:** import `{ test, expect }` from `framework/fixtures/baseTest`
  (relative path from `tests/e2e/generated/` is `../../../framework/fixtures/baseTest`) to
  inherit the per-page POM fixtures + contract validation.
- **Pure API-shape tests:** import directly from `@playwright/test` (like the orchestrator specs).
- **Do NOT** call the self-healing helpers (`clickAction`/`fillAction`), `RecoveryRouter`,
  `IncidentRouter`, or the LLM agent from generated tests — those are exercised intentionally
  by `scenarios/` to *prove* healing; mixing them into ordinary regression would mask real
  selector drift. Generated assertions should **fail loudly**.
- Reuse `POST /api/test/reset-users` in any generated test that mutates users (baseTest does
  not auto-seed; the new seed only resets at agent-setup time).

---

## 6. Config changes

| Change | Required? | Notes |
|---|---|---|
| `package.json`: add `test:generated` | **Yes** | Isolated run/heal target for agent output. |
| `.mcp.json` | **No change** | Server name `playwright-test` already matches the agents' tool IDs. |
| `playwright.config.ts` trace | **Optional / decision needed** | See landmine below. |
| Agent `model:` (sonnet) | **Optional** | All three agents are pinned to `sonnet` while the workspace runs Opus. Bump in the frontmatter only if you want stronger plan/gen/heal reasoning. |

**Tracing landmine (project MEMORY — UI-mode tracing ownership).** Trace/screenshot/video
are `off` globally. This is **fine for the agents** — the healer debugs the *live paused
browser* (`test_debug` + `browser_snapshot/console/network`) and needs no recorded traces.
Turning trace on only helps humans/CI get a post-hoc `trace.zip`. But:
- A **global `use.trace`** can double-own `context.tracing` with the bespoke
  `scenarioArtifacts.ts` (which owns tracing start/stop via a WeakSet to coexist with UI
  mode) → overwritten/broken traces and a CLI-green-but-UI-broken state.
- The config has a **single implicit project** (no `projects:` array), so the "scoped
  second project for `generated/`" approach is a **non-trivial refactor** (introduce a
  `projects` array and re-home the default/scenarios run into a named project).
- **Safest no-conflict option:** leave `trace` `off` globally and capture ad hoc when needed:
  `npx playwright test tests/e2e/generated --trace on`. Per MEMORY, never declare Playwright
  work green on CLI alone — decide explicitly how generated tests get validated under UI mode.

---

## 7. Risks & determinism guardrails

- **Healer masking staged failures** — always scope to `tests/e2e/generated`; review edits.
- **Generated specs bypass the page-level self-healing pattern** — for important pages,
  prefer `baseTest` fixtures and migrate raw codegen selectors to the existing
  `data-testid` POM locators; keep raw stale selectors only in the dedicated bespoke
  healing scenarios.
- **Whole-tree gate sweep** — generated tests auto-join `test:e2e`/`test:regression`; keep
  them on `test:generated` until stable.
- **Orders `attempt`** is a global monotonic counter → assert `/attempt \d+/`, never a literal.
- **`managedUsers`/`createdUsers`/flaky-runKey set/order counter** persist for the server
  lifetime; only `managedUsers` has a reset hook — user-mutating generated tests that skip
  the reset hook drift across reruns.
- **Native `prompt()`** on Add User — register two `page.on('dialog')` handlers (name, then
  role) *before* clicking.
- **Slow mode default 7000ms** can exceed the default expect timeout — use
  `&delayMs=<small>` or bump that one assertion.
- **No path aliases** — generated tests importing `baseTest` need the exact relative depth
  (`../../../framework/fixtures/baseTest`); the `tsc --noEmit` gate catches mistakes.
- **`seed` substring hazard** — never name a generated file with `seed` in the basename
  (`findSeedFile` matches the first such file).

---

## 8. Decisions (locked 2026-05-30)

1. **Seed** — ✅ **Written.** `tests/e2e/seed.spec.ts` now holds the §2 seed and passes
   (`npx playwright test tests/e2e/seed.spec.ts` → 1 passed). `test:generated` script and
   `tests/e2e/generated/` are in place.
2. **First planner targets** — ✅ **All three**, in this order:
   1. **User Manager** full UI CRUD (Add User dialog flow, search, role filter, view, invite modal) → `specs/user-manager.plan.md`
   2. **Orders page (`/orders`)** status filtering (deterministic, client-side filter) → `specs/orders-filtering.plan.md`
   3. **Admin** log clear/refresh + action count → `specs/admin-log.plan.md`
3. **Tracing** — ✅ **Leave `trace: off` globally; capture ad hoc** with
   `npx playwright test tests/e2e/generated --trace on` when debugging. No `projects[]`
   refactor; no double-ownership of `context.tracing` with `scenarioArtifacts.ts`.
4. **Agent model** — ✅ **Keep `sonnet`** (the bundled default). The demo's pass/fail never
   depends on a model, so this is a conscious choice, not an oversight.

### Next action
Foundation is complete. The next step is **Step 4** — run `@playwright-test-planner` for
the three targets above (one plan file each under `specs/`), review the `**File:**` paths,
then generate + heal per Steps 6–8.
