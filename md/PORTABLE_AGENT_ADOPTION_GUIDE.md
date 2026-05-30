# Portable Guide: Adopting Playwright QA Agents in Any Workspace

A complete, copy-paste-ready playbook for running an **AI QA agent pipeline** —
*plan → generate → heal → diagnose → report* — against any web app, with **everything**
included: the seed spec, real `storageState`, the drift flag store, reset hooks,
session/cookie helpers, RBAC, the full agent definitions, page-object/contract/fixture
patterns, and scenario examples. Nothing here is project-specific; the code blocks are
generic templates to adapt.

---

## Table of contents
1. Mental model
2. Terminology — what each piece is
3. Installation & setup (toolchain, harness, agents, config, MCP)
4. The seed spec (the linchpin) — full
5. storageState + auth — full (login API, login page, auth guard, setup, projects)
6. Drift control: the flag store + reset hooks — full
7. Session & cookie helpers — full
8. RBAC: roles, gating, overlays, intentional defect — full
9. The generated-test lane
10. The five agents (full definitions)
11. Page object / profile / contract / fixture pattern
12. Scenario spec patterns (auth + RBAC)
13. The pipeline — exact invocations
14. Making your app a good agent playground
15. Coexistence & determinism guardrails
16. Verification
17. Adoption checklist
18. Quick reference

---

## 1. Mental model

Five agents work on *your running app*:

| Agent | Origin | Does | Edits |
|---|---|---|---|
| **planner** | official (`npx playwright init-agents`) | explores the live app, writes a test plan | plan files |
| **generator** | official | drives the browser to turn a plan item into a real spec | test files |
| **healer** | official | runs tests, root-causes failures, **rewrites the broken test** | test files |
| **diagnostician** | custom (you author) | read-only RCA: evidence + classify + decide *heal vs report* | nothing |
| **reporter** | custom | persists a bug record / incident note from a diagnosis | docs only |

Two principles:
1. **Agents act on the app but fix the *tests*, never the app.** Intentional app behavior (a
   renamed control, a slow endpoint, a 4xx/5xx, a 401/403) is *drift the healer adapts tests to*
   or *a defect the reporter records* — not something to "fix" in the server.
2. **The seed is the linchpin.** Every agent boots its browser from a *seed spec*. Get it right
   first or the agents start from a blank tab.

---

## 2. Terminology — what each piece is

| Term | What it means |
|---|---|
| **Agent** | A specialized AI persona the harness can invoke, defined by a markdown file with a `name`, `description`, and an allowed `tools` list. |
| **Harness / loop** | The environment that runs the agents and exposes their tools — **Claude Code**, the **VS Code** extension, or **OpenCode**. `--loop=` picks which. |
| **MCP server** | A *Model Context Protocol* server. The `playwright-test` one exposes browser + test-runner tools (navigate, snapshot, network, `test_run`, `test_debug`, `planner_save_plan`, …) to the agents. |
| **Planner** | Official agent — explores the live app and writes a test plan. |
| **Generator** | Official agent — drives the browser to turn a plan item into a real spec. |
| **Healer** | Official agent — runs tests, root-causes failures, and rewrites the broken **test**. |
| **Diagnostician** | Custom agent — read-only root-cause analysis; decides **heal vs report**. |
| **Reporter** | Custom agent — persists a diagnosis as a local bug record / incident note. |
| **Seed spec** | The test the agents run (paused) to put the app in a known state before exploring/generating. The linchpin. |
| **storageState** | Playwright's saved cookies + localStorage JSON; replays a logged-in session so tests skip login. |
| **Project (Playwright)** | A named run config in `projects[]`. A *setup* project logs in once; `dependencies` orders projects. |
| **Page Object (POM)** | A class wrapping a page's locators and actions. |
| **Page profile** | Per-action primary locator + "intent tokens" used to heal a stale locator. |
| **Page contract** | Structural assertions (required testids/headings, forbidden tokens) a validator checks. |
| **Drift** | An intentional app change/behavior that breaks a naive test (renamed control, slow endpoint, 4xx/5xx, 401/403). |
| **Flag store** | Per-`runKey` named toggles that arm drift deterministically. |
| **runKey** | A per-test key that scopes flags so parallel tests don't collide. |
| **Reset hook** | A test-only endpoint that returns the app to a known state. |
| **data-testid** | A stable HTML attribute used as a test selector — the #1 reliability lever. |
| **RBAC** | Role-based access control (e.g. Admin/Editor/Viewer gating). |
| **RCA** | Root-cause analysis. |

---

## 3. Installation & setup

### 3.1 Install the toolchain
```bash
node -v                       # need Node >= 18 (install from nodejs.org or a version manager)
npm i -D @playwright/test     # the test runner the agents drive
npx playwright install        # download the browser binaries (Chromium / Firefox / WebKit)
```
You also need a web app you can start locally on a known URL (the agents launch it via `webServer`).

### 3.2 Install an agent harness (pick one)
The agents run inside a "loop"/harness that exposes their browser tools over MCP:
- **Claude Code** (CLI): `npm i -g @anthropic-ai/claude-code`, then run `claude` in the repo and sign in.
- **VS Code**: install the **Playwright** extension + the agent/Copilot agent mode from the Marketplace.
- **OpenCode**: install per its docs (https://opencode.ai).

### 3.3 Initialize the agents
```bash
npx playwright init-agents --loop=claude     # or --loop=vscode | --loop=opencode
```
This generates the **planner / generator / healer** agent definitions (under `.claude/agents/`
for Claude, or the loop's equivalent), a **stub seed** file, and the **`playwright-test` MCP
server** wiring. (You add the custom **diagnostician** + **reporter** yourself — §10.)

### 3.4 Point Playwright at your app
```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
const port = 3000;
export default defineConfig({
  testDir: "./tests/e2e",                              // generator only writes under here
  use: { baseURL: `http://127.0.0.1:${port}` },        // relative URLs in tests/seed resolve here
  webServer: {                                         // agents auto-start the app; don't start it by hand
    command: `node server.js ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### 3.5 Confirm the MCP server is connected
`init-agents` registers it (e.g. in `.mcp.json`). The name **must** be `playwright-test` (the
agents reference `mcp__playwright-test__*` tools):
```json
{ "mcpServers": { "playwright-test": { "command": "npx", "args": ["playwright", "run-test-mcp-server"] } } }
```
In Claude Code, run `/mcp` to confirm it's connected. **Windows tip:** the command often needs to be
`"command": "cmd", "args": ["/c", "npx", "playwright", "run-test-mcp-server"]`.

With the toolchain, harness, agents, config, and MCP in place, continue to §4 — writing the
**seed**, which is the first real configuration step and the foundation everything else builds on.

---

## 4. The seed spec (the linchpin) — full

`tests/e2e/<name-containing-"seed">.spec.ts`. Both `planner_setup_page` and
`generator_setup_page` run the **first test file whose basename contains `seed`**, paused, and
hand the live page to the agent. Keep it **side-effect-only** (no business assertions).

> ⚠️ Never put the substring `seed` in a *generated* test filename, or the agents may bind to the
> wrong file.

**No-auth app:**
```ts
// tests/e2e/seed.spec.ts
import { test } from "@playwright/test";

test.describe("Seed", () => {
  test("seed", async ({ page }) => {
    // (1) Known clean state via your reset hook (see §6). Safe, data-only reset.
    const reset = await page.request.post("/api/test/reset-users");
    if (!reset.ok()) throw new Error(`seed reset failed: ${reset.status()}`);

    // (2) Readiness probe — a dead server fails here once, not 50 times later.
    const health = await page.request.get("/api/health");
    if (!health.ok()) throw new Error(`seed health failed: ${health.status()}`);

    // (3) Warm the start page; the agent navigates onward from here.
    await page.goto("/");
    // Under the MCP setup_page path this pauses here; under `npx playwright test` it just passes.
  });
});
```

**App with login** — the seed stays the same (it does NOT need credentials, because auth is
established by the *setup project* in §5). Determinism reminders worth leaving as comments:
assert volatile values with regex not literals; arm flaky/slow modes per-test; register
`page.on('dialog')` handlers before native `prompt()`/`confirm()` clicks.

---

## 5. storageState + auth — full

Make `storageState` *real* with a dedicated setup project that logs in once and saves the
session; only the authenticated project loads it, so a logged-out suite keeps passing.

### 5.1 The login API (plain Node example — adapt to your stack)
```js
// In your server: a real opaque session cookie, set/parsed by hand (no library needed).
const crypto = require("crypto");
const SEEDED_CREDENTIALS = {
  "alice@demo.local": { userId: "USR-001", password: "demo1234", role: "Admin",  name: "Alice", status: "Active" },
  "bob@demo.local":   { userId: "USR-002", password: "demo1234", role: "Editor", name: "Bob",   status: "Active" },
  "carol@demo.local": { userId: "USR-003", password: "demo1234", role: "Viewer", name: "Carol", status: "Inactive" },
};
const sessions = new Map();                         // sid -> { userId, name, role, email }
function mintSession(u) {
  const sid = `sess-${u.userId}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`; // per-login random, NOT a counter
  sessions.set(sid, { userId: u.userId, name: u.name, role: u.role, email: u.email });
  return sid;
}
const sidCookie  = (sid) => `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`; // no Secure on 127.0.0.1
const clearCookie = "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

// POST /api/login {email,password}
//   400 AUTH_MISSING_FIELDS · 401 AUTH_INVALID_CREDENTIALS · 401 AUTH_INACTIVE_ACCOUNT
//   200 {user} + Set-Cookie sid
// POST /api/logout  -> idempotent 200, clears cookie
// GET  /api/session -> 200 {authenticated, role, user} when valid; 401 only when authRequired armed
// POST /api/test/set-session {role|userId} -> mints a real session for a chosen seeded user (TEST HOOK)
```

### 5.2 The login page (static HTML + a tiny JS)
- `data-testid`s on everything: `login-form`, `login-heading`, `login-email`, `login-password`,
  `login-submit`, `login-error`, `login-status`.
- `login.js`: on submit `POST /api/login`; on 200 redirect to `?next=` (default `/dashboard`); on
  4xx show the error message. (Optional drift: read a `loginSubmitLabel` flag and relabel the
  submit button so a stale "Sign In" locator goes stale → a healer demo.)

### 5.3 The auth guard (shared, default no-op)
A small script on each protected page. **Default off**: it only redirects when an `authRequired`
flag is armed for this run, so existing tests stay green.
```js
// public/auth-guard.js  — included on protected pages
(function () {
  const runKey = new URLSearchParams(location.search).get("runKey")
    || (document.cookie.split(";").map(s=>s.trim()).find(s=>s.startsWith("qa_runkey="))||"").split("=")[1]
    || "global";
  const banner = document.querySelector("[data-testid='session-banner']");
  fetch("/api/session?runKey=" + encodeURIComponent(runKey))
    .then(r => r.json().then(d => ({ status: r.status, d })))
    .then(({ status, d }) => {
      if (status === 401 || (d && d.authRequired && !d.authenticated)) {
        location.assign("/login?next=" + encodeURIComponent(location.pathname + location.search));
        return;
      }
      if (banner) banner.textContent = d && d.authenticated ? `Signed in as ${d.user.name} (${d.role})` : "Not signed in";
    }).catch(() => {});
})();
```

### 5.4 The setup project (makes storageState real)
```ts
// tests/e2e/auth.setup.ts
import { test as setup } from "@playwright/test";
const ADMIN_STORAGE = ".artifacts/auth/admin.json";
setup("authenticate as admin", async ({ page }) => {
  // Mint a real session (set-session test hook, or POST /api/login with real creds).
  const res = await page.request.post("/api/test/set-session", { data: { role: "Admin" } });
  if (!res.ok()) throw new Error(`auth.setup failed: ${res.status()}`);
  // storageState captures the HttpOnly sid cookie at context level (works on chrome/127.0.0.1).
  await page.context().storageState({ path: ADMIN_STORAGE });
  // Do NOT broadly reset here — a fresh webServer is already clean, and a reset could race the default project.
});
```

### 5.5 The projects split
```ts
// playwright.config.ts → add `projects` (top-level `use` still applies to all)
projects: [
  { name: "setup", testMatch: /auth\.setup\.ts$/ },
  {
    name: "authenticated",
    testMatch: /(auth-session|rbac)\.spec\.ts$/,   // specs that need a logged-in identity
    dependencies: ["setup"],
    use: { storageState: ".artifacts/auth/admin.json" },
  },
  {
    name: "default",                                // everything else, storageState-free
    testIgnore: [/auth\.setup\.ts$/, /(auth-session|rbac)\.spec\.ts$/],
  },
],
```
- **Gitignore the storage file** (`.artifacts/` is a good home — it usually already is). It holds a live session.
- **Timing rule:** authenticated specs must **not** call a *full* reset mid-run (it clears the
  setup-minted session → 401). They use per-test flag arming + per-`runKey` cleanup (see §6).

---

## 6. Drift control: the flag store + reset hooks — full

Drive every intentional failure with **named flags scoped per `runKey`**, so parallel workers
never collide and any scenario can arm exactly what it needs.

```js
// In your server:
const FLAG_DEFAULTS = {            // defaults == today's non-drifted behavior (nothing fires by accident)
  ctaMode: "new", ordersMode: "stable", productState: "valid",
  authRequired: false, sessionExpired: false, loginSubmitLabel: "Sign In",
  rbacEnforce: false, adminGate: "open", rbacBug: "off",
};
const FLAG_CATALOG = {             // validation (reject unknown name / invalid value with 400)
  ctaMode: { values: ["new","old"] }, ordersMode: { values: ["stable","slow","flaky"] },
  productState: { values: ["valid","broken"] },
  authRequired: { values: [true,false] }, sessionExpired: { values: [true,false] },
  loginSubmitLabel: { values: ["Sign In","Authenticate"] },
  rbacEnforce: { values: [true,false] }, adminGate: { values: ["open","locked"] },
  rbacBug: { values: ["off","editor-delete"] },
};
const flagsByRunKey = new Map();
function resolveFlags(runKey) {
  return { ...FLAG_DEFAULTS, ...(flagsByRunKey.get("global")||{}),
           ...(runKey && runKey !== "global" ? (flagsByRunKey.get(runKey)||{}) : {}) };
}
function getRunKey(req, url) {
  return url.searchParams.get("runKey") || parseCookies(req).qa_runkey || "global"; // query > cookie > global
}

// GET  /api/test/flags?runKey=  -> { runKey, flags: resolveFlags(runKey) }
// POST /api/test/flags {runKey, flags} -> validate against FLAG_CATALOG; merge onto flagsByRunKey
// DELETE /api/test/flags?runKey= -> clear that key  |  no runKey -> resetAll()
```

**Reset hooks — split data-only vs full** (this is the determinism fix that matters):
```js
function resetData() {              // SAFE in parallel: never touches sessions or flags
  createdUsers = []; managedUsers = []; flakyByRunKey = new Set(); orderCounter = 0;
  editsByUserId = {}; deletedIds = new Set();
}
function resetAll() {               // FULL: + sessions + flags. Seed/setup phase ONLY.
  resetData(); sessions.clear(); flagsByRunKey.clear();
}
// POST /api/test/reset-users -> resetData()   (legacy/back-compat; safe for parallel specs)
// POST /api/test/reset        -> resetAll()   (canonical; do not call mid-run in parallel)
```

**Arming drift in a spec (deterministic, no leakage):**
```ts
const runKey = test.info().testId;                                   // unique per test
await page.request.post("/api/test/flags", { data: { runKey, flags: { authRequired: true } } });
await context.addCookies([{ name: "qa_runkey", value: runKey, url: baseURL }]); // so the page guard resolves it
// ... navigate / act ...
test.afterEach(async ({ page }) => {                                 // clear ONLY this runKey
  await page.request.delete(`/api/test/flags?runKey=${encodeURIComponent(test.info().testId)}`);
});
```
> **Never** write to the `global` bucket from a parallel spec, and **never** call the full reset
> from a spec that runs alongside the authenticated project.

---

## 7. Session & cookie helpers — full

Dependency-free, plain Node:
```js
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("="); if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function getSessionFromRequest(req) {
  const sid = parseCookies(req).sid;
  return sid ? (sessions.get(sid) || null) : null;
}
// Add an optional `setCookie` arg to your JSON responder so login/logout can attach Set-Cookie:
function sendJson(res, status, payload, setCookie) {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  res.writeHead(status, headers); res.end(JSON.stringify(payload));
}
```

---

## 8. RBAC: roles, gating, overlays, intentional defect — full

```js
const ROLE_PERMISSIONS = {
  Admin:  { canRead:true, canCreate:true,  canEdit:true,  canDelete:true  },
  Editor: { canRead:true, canCreate:false, canEdit:true,  canDelete:false },
  Viewer: { canRead:true, canCreate:false, canEdit:false, canDelete:false },
};
const ANON = { canRead:true, canCreate:false, canEdit:false, canDelete:false };
function getRoleContext(req, url) {
  const flags = resolveFlags(getRunKey(req, url));
  const session = getSessionFromRequest(req);
  const role = session && !flags.sessionExpired ? session.role : null;
  return { flags, session, role, permissions: role ? ROLE_PERMISSIONS[role] : ANON };
}

// Gate a mutation (defaults off, so existing tests are unaffected):
// POST /api/users
const ctx = getRoleContext(req, url);
if (ctx.flags.rbacEnforce && !ctx.permissions.canCreate)
  return sendJson(res, 403, { code:"RBAC_FORBIDDEN", permissionDenied:true, requiredRole:"Editor", actualRole:ctx.role });

// INTENTIONAL OVER-PERMISSION DEFECT (the reporter's target):
// DELETE /api/users/:id
const editorDeleteBug = ctx.flags.rbacBug === "editor-delete" && ctx.role === "Editor";
if (ctx.flags.rbacEnforce && !ctx.permissions.canDelete && !editorDeleteBug)
  return sendJson(res, 403, { code:"RBAC_FORBIDDEN", requiredRole:"Admin", permissionDenied:true });
// ...with the bug armed, an Editor reaches the delete and gets a WRONG 200.

// Read-time overlays keep seed data immutable while reflecting edits/deletes:
// GET /api/users -> [...seeded, ...managed].filter(u => !deletedIds.has(u.id))
//                                           .map(u => ({ ...u, ...(editsByUserId[u.id]||{}) }))

// Admin-only endpoint, ordered auth-then-rbac:
// GET /api/admin/audit
if (ctx.flags.authRequired && !ctx.session)            return sendJson(res,401,{code:"AUTH_REQUIRED", authRequired:true});
if (ctx.session && ctx.flags.sessionExpired)           return sendJson(res,401,{code:"SESSION_EXPIRED", authRequired:true}, clearCookie);
if ((ctx.flags.rbacEnforce && ctx.role!=="Admin") || ctx.flags.adminGate==="locked")
                                                       return sendJson(res,403,{code:"RBAC_FORBIDDEN", requiredRole:"Admin", permissionDenied:true});
return sendJson(res,200,{ entries: SEEDED_AUDIT, role: ctx.role });
```
> If a page renders server data client-side from an inline array, switch it to **fetch** the
> gated endpoint so 401/403 is observable — but preserve its existing `data-testid`s and
> behaviors (and guard against a late fetch overwriting a user action with a generation token).

---

## 9. The generated-test lane

```bash
mkdir -p tests/e2e/generated
# package.json: "test:generated": "playwright test tests/e2e/generated"
```
Keep generated specs out of curated suites and any deterministic "demo" specs. The plan's
`**File:**` path (pointing at `tests/e2e/generated/…`) — not a tool guard — is what keeps output
in the lane, so **review it**.

---

## 10. The five agents (full definitions)

`init-agents` ships **planner / generator / healer**. Add these two siblings in `.claude/agents/`
(adapt tool IDs/paths). Both run in the same harness and use the same `playwright-test` MCP server.

**`.claude/agents/playwright-test-diagnostician.md`**
```markdown
---
name: playwright-test-diagnostician
description: Read-only root-cause analysis of a failing Playwright test; classify and decide HEAL vs REPORT.
tools: Glob, Grep, Read, LS, mcp__playwright-test__browser_console_messages,
  mcp__playwright-test__browser_network_requests, mcp__playwright-test__browser_evaluate,
  mcp__playwright-test__browser_snapshot, mcp__playwright-test__browser_generate_locator,
  mcp__playwright-test__test_list, mcp__playwright-test__test_run, mcp__playwright-test__test_debug
---
You diagnose failing E2E tests. You are READ-ONLY — never edit tests, app code, or the server.
Workflow: (1) test_list -> test_run (pass `locations` to scope) to surface failures; test_debug
the failing test to pause on the error. (2) Collect evidence: browser_snapshot, console messages,
network request/response (capture request body + status + response body for API failures),
browser_generate_locator to see what the live element actually is now. (3) Classify into your
project's failure taxonomy with a confidence and the signals you used. (4) Decide the verdict:
HEAL (the app drifted as designed, the test is stale -> hand to playwright-test-healer) or REPORT
(a real/by-design defect a correct test should record -> hand to playwright-test-reporter).
(5) Output a single RCA block: { test, category, confidence, signals, rootCause, evidence,
expected, actual, suggestedFix, verdict, handOffTo }. Never wait for networkidle or use deprecated
APIs. If you cannot determine the cause, say so with low confidence rather than guess.
```

**`.claude/agents/playwright-test-reporter.md`**
```markdown
---
name: playwright-test-reporter
description: Turn a diagnosis into durable LOCAL artifacts — a bug record and an incident/healing note. Never opens external trackers.
tools: Glob, Grep, Read, LS, Write, Edit, Bash
---
You persist a failure/diagnosis/heal into local-only docs. You do not edit tests or app code, and
you NEVER open external trackers (Jira/GitHub/etc.). Input: an RCA block from the diagnostician
(or a scenario report). Produce, verdict-driven:
- REAL/BY-DESIGN DEFECT -> a local bug record via your repo's bug-report entrypoint/skill
  (reproduce + confirm across reruns before filing; dedupe by signature).
- FAILURE -> an incident note (date-slug markdown) in your docs/vault incidents folder.
- SUCCESSFUL HEAL -> a healing note recording what drifted and what the healer changed in the test.
Copy the RCA's signals, error message, and request/response facts verbatim into the evidence
section. After writing a note, link it from your docs index. Be faithful: if a bug was not
confirmed across reruns, report it as unconfirmed — do not file it.
```
> Keep agents on whatever model your harness defaults to unless you need stronger reasoning; the
> demo's pass/fail must never depend on a model.

---

## 11. Page object / profile / contract / fixture pattern

This is what lets one page fix benefit many tests (and gives generated tests a clean target).

```ts
// framework/pom/LoginPage.ts  — a self-healing page object
export class LoginPage extends SelfHealingPage {     // base provides getLocator/clickAction/fillAction/validateContract
  constructor(page) { super(page, "Login");
    this.emailInput = page.getByTestId("login-email");
    this.submitBtn  = page.getByTestId("login-submit"); /* ... */ }
  async goto(next) { await this.page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login"); }
  async expectLoaded() { return this.validateContractOrThrow(loginPageContract); }
  async login(email, pw) {
    await this.fillAction(loginPageProfile.actions.email, email);
    await this.fillAction(loginPageProfile.actions.password, pw);
    return this.clickAction(loginPageProfile.actions.submit);   // heals if the label drifts
  }
}
```
```ts
// page profile — primary locator + intent tokens used to heal when the primary goes stale
export const loginPageProfile = { pageLabel: "Login", actions: {
  email:    { intentTokens:["email","username"], primary:{ kind:"testId", value:"login-email" },    targetType:"input"  },
  password: { intentTokens:["password","secret"], primary:{ kind:"testId", value:"login-password" }, targetType:"input"  },
  submit:   { intentTokens:["sign in","log in","submit","authenticate"], primary:{ kind:"role", role:"button", name:"Sign In" }, targetType:"button" },
}};
```
```ts
// page contract — structural assertions a validator checks
export const loginPageContract = {
  name: "login-page",
  requiredTestIds: ["login-form","login-heading","login-email","login-password","login-submit","login-error"],
  requiredHeadings: ["Sign In"], requiredTextTokens: ["Email","Password"],
  forbiddenTextTokens: ["undefined","NaN"],
};
// fixture: expose `loginPage` from your baseTest so specs do `{ loginPage }`.
```
> **Contract caution:** do NOT add an auth-only element (e.g. a "Signed in as…" banner) to a
> *shared* contract — a no-auth suite would fail on it. Assert it only in authenticated specs.

---

## 12. Scenario spec patterns (auth + RBAC)

```ts
// tests/e2e/scenarios/auth-session.spec.ts  (authenticated project)
import { expect, test } from "../../../framework/fixtures/baseTest";
test.afterEach(async ({ page }) => {
  await page.request.delete(`/api/test/flags?runKey=${encodeURIComponent(test.info().testId)}`);
});
test("signs in and lands on the dashboard", async ({ loginPage, page }) => {
  await loginPage.goto(); await loginPage.login("alice@demo.local","demo1234");
  await expect(page).toHaveURL(/\/dashboard$/);
});
test("expired session redirects a protected page to login", async ({ page, context, baseURL }) => {
  const runKey = test.info().testId;
  await page.request.post("/api/test/flags", { data:{ runKey, flags:{ authRequired:true, sessionExpired:true } } });
  await context.addCookies([{ name:"qa_runkey", value:runKey, url:baseURL }]);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/);
});
```
```ts
// tests/e2e/scenarios/rbac.spec.ts  (authenticated project) — serial to avoid id races
import { expect, test } from "@playwright/test";
test.describe.configure({ mode: "serial" });
async function arm(page, flags) { const rk = test.info().testId; await page.request.post("/api/test/flags",{data:{runKey:rk,flags}}); return rk; }
async function setRole(page, role) { expect((await page.request.post("/api/test/set-session",{data:{role}})).ok()).toBeTruthy(); }
test("Viewer cannot create a user (403)", async ({ page }) => {
  const rk = await arm(page, { rbacEnforce:true }); await setRole(page,"Viewer");
  expect((await page.request.post(`/api/users?runKey=${rk}`,{data:{name:"X"}})).status()).toBe(403);
});
test("INTENTIONAL DEFECT: Editor wrongly allowed to delete (200)", async ({ page }) => {
  const rk = await arm(page, { rbacEnforce:true, rbacBug:"editor-delete" }); await setRole(page,"Admin");
  const id = (await (await page.request.post(`/api/users?runKey=${rk}`,{data:{name:"Y"}})).json()).user.id;
  await setRole(page,"Editor");
  expect((await page.request.delete(`/api/users/${id}?runKey=${rk}`)).status()).toBe(200); // should be 403 -> reporter files it
});
```

---

## 13. The pipeline — exact invocations

| Step | Say to your harness |
|---|---|
| **Plan** | "Use the playwright-test-planner to plan tests for `<feature>`; seed `tests/e2e/seed.spec.ts`; save to `specs/<feature>.plan.md`." Then review every `**File:**` → `tests/e2e/generated/`. |
| **Generate** | "Use the playwright-test-generator for plan item N.M → `tests/e2e/generated/<name>.spec.ts`, seed `tests/e2e/seed.spec.ts`." Once per item, sequentially. Then `npm run test:generated` + `npx tsc --noEmit`. |
| **Heal** | "Use the playwright-test-healer on `tests/e2e/generated` (pass `locations`); only edit files in that folder." |
| **Diagnose** | "Use the playwright-test-diagnostician on `tests/e2e/generated/<name>.spec.ts`; return the RCA + verdict." |
| **Report** | "Use the playwright-test-reporter to file the diagnosis as a local bug + incident note." |

---

## 14. Making your app a good agent playground

- **Stable, unique `data-testid`s** on every interactive/asserted element — the single biggest
  reliability lever.
- **A full reset hook** that returns the app to a known state (reset *everything* mutable; partial
  resets cause cross-test flake — see §6's data-vs-full split).
- **Deterministic, switchable failure injection** via named flags (§6), covering the full
  classifier taxonomy: renamed control (heal), slow/flaky endpoint (delayed-data/timeout),
  4xx/5xx (API RCA), 401/403 (auth/rbac), and an **intentional defect** for the reporter.
- **Per-test isolation under parallelism:** scope drift to `test.info().testId`; clear in
  `afterEach`; never use a global flag bucket; never derive IDs from `array.length`.

---

## 15. Coexistence & determinism guardrails

- **Separate lanes** — generated tests in `tests/e2e/generated/`; curated suites and deterministic
  demos elsewhere. Scope the healer to the generated lane so it can't rewrite an intentional fail.
- **Default-off drift** — new failure modes default off so existing tests stay green.
- **storageState is per-project** — only the authenticated project loads it.
- **Don't full-reset mid-run** in parallel — it clears the setup session/flags. Use `resetData`
  for the legacy hook; reserve `resetAll` for seed/setup.
- **Don't over-couple contracts** — keep auth/role UI out of shared contracts.
- **Tracing/UI-mode** — leaving `trace: off` is fine (the healer debugs the live paused browser).
  If you want trace artifacts, capture ad hoc (`--trace on`) rather than a global flag that could
  double-own context tracing with any self-managed tracing; and never declare Playwright work
  green on CLI alone if you also use UI mode.

---

## 16. Verification

After every phase: run the curated suite + the new scenario, and confirm regression stays green.
A typical split:
```bash
npx playwright test --project=authenticated                 # auth + rbac scenarios (logged-in)
npx playwright test --project=default tests/e2e/sanity tests/e2e/functional \
  tests/e2e/contracts tests/e2e/scenarios/<touched>.spec.ts  # regression on what you changed
npm run test:generated                                       # the agent-built lane
```

---

## 17. Adoption checklist

- [ ] `npx playwright init-agents --loop=…`; planner/generator/healer present
- [ ] `playwright.config.ts`: `testDir`, `baseURL`, `webServer`; app auto-starts
- [ ] `playwright-test` MCP server connected (`/mcp`)
- [ ] Seed spec rewritten: reset/clean → (login + save storageState if auth) → warm page
- [ ] `tests/e2e/generated/` lane + `test:generated`
- [ ] App: stable `data-testid`s, a full reset hook, named/deterministic drift flags
- [ ] (Auth) login API + login page + auth guard + `auth.setup.ts` + projects split + gitignored storage
- [ ] (RBAC) role permissions + gated mutations + read-time overlays + an intentional defect
- [ ] Custom `diagnostician` + `reporter` agents added
- [ ] Healer always scoped to the generated lane; edits reviewed before commit
- [ ] Per-test `runKey` isolation; no length-based IDs; no global flag bucket; no mid-run full reset
- [ ] Each phase verified; curated regression green

---

## 18. Quick reference — endpoints & files a full setup adds

| Concern | Adds |
|---|---|
| Auth | `POST /api/login`, `POST /api/logout`, `GET /api/session`, `POST /api/test/set-session`; `/login` page + `login.js`; `auth-guard.js` on protected pages |
| Drift control | `GET/POST/DELETE /api/test/flags`; `FLAG_DEFAULTS` + `FLAG_CATALOG` + `resolveFlags` |
| Reset | `POST /api/test/reset-users` (data-only), `POST /api/test/reset` (full); `resetData()` / `resetAll()` |
| RBAC | `ROLE_PERMISSIONS`; gated `POST/PATCH/DELETE /api/users(/:id)`; `GET /api/admin/audit`; read-time overlays; an intentional defect flag |
| Playwright | `tests/e2e/seed.spec.ts`; `tests/e2e/auth.setup.ts`; `projects` (setup/authenticated/default); `tests/e2e/generated/` + `test:generated` |
| POM layer | `LoginPage` (+ profile + contract + fixture) and one per new page |
| Agents | `.claude/agents/`: planner, generator, healer (official) + diagnostician, reporter (custom) |

That's the whole loop, end to end: get the **seed** right, make **storageState** real with a
setup project, drive **drift** deterministically with a per-runKey flag store and split reset
hooks, gate with **RBAC**, keep generated tests in their own lane, and let the five agents plan,
build, heal, diagnose, and report against your app.
