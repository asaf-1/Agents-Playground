# Workspace Overview — Agentic QA Demo

> ⚠️ **HISTORICAL / SUPERSEDED — do not treat as truth.** This note predates the rename to **Agents-Playground** and the auth/RBAC/CI work (it references the old project name, port 3000, and a 3-page / 4-scenario scope). The current canonical overview is `obsidian-vault/07 Architecture Overview.md` + `obsidian-vault/01 Project Map.md` (open the repo root as the Obsidian vault). Kept for history only.

This document was an early overview of the workspace (now historical).
It covered the then-current project structure, agents, tests, and pipeline.

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [Folder Structure](#2-folder-structure)
3. [The Application](#3-the-application)
4. [The Agent Architecture](#4-the-agent-architecture)
5. [Page Objects and Self-Healing Layer](#5-page-objects-and-self-healing-layer)
6. [Page Profiles and Contracts](#6-page-profiles-and-contracts)
7. [Test Suite — Every File, Every Test, Every Purpose](#7-test-suite--every-file-every-test-every-purpose)
8. [From Running a Test to the Full Pipeline](#8-from-running-a-test-to-the-full-pipeline)
9. [Docker](#9-docker)
10. [Jenkins](#10-jenkins)
11. [Artifact Output](#11-artifact-output)
12. [Obsidian Vault — Project Memory](#12-obsidian-vault--project-memory)
13. [Known Issues and What to Fix Next](#13-known-issues-and-what-to-fix-next)
14. [How to Explain This in an Interview](#14-how-to-explain-this-in-an-interview)

---

## 1. What This Project Is

This is a local-first Agentic QA platform. It demonstrates how a QA framework can go beyond writing tests and clicking buttons — it can **detect failures, classify them, recover from them, propose permanent fixes, and validate that recovery worked**, all without human input.

The project has three layers:

- **The product** — a local real estate operations demo UI backed by a Node.js server
- **The framework** — a set of deterministic agents that each own one job in the recovery pipeline
- **The tests** — scenario-based specs that prove each agent works end to end

The goal is not to show that Playwright works. The goal is to show that a QA system can behave like a thinking infrastructure layer.

---

## 2. Folder Structure

```
GenAI+AgenticAI-Demo/
│
├── server.js                          # Local Node HTTP server and all API endpoints
├── playwright.config.ts               # Playwright runner configuration
├── package.json                       # Scripts and dependencies
├── tsconfig.json                      # TypeScript settings
├── Dockerfile                         # Docker image definition
├── Jenkinsfile                        # Jenkins pipeline definition
├── README.md                          # Setup and run instructions
├── AGENTS.md                          # Rules for agents working in this repo
│
├── public/                            # Frontend — the product UI
│   ├── index.html                     # Home page structure
│   ├── app.js                         # Home page browser logic
│   ├── dashboard.html                 # Orders Recovery Console
│   ├── dashboard.js                   # Dashboard browser logic
│   ├── product.html                   # Product detail page
│   ├── product.js                     # Product page browser logic
│   └── styles.css                     # Shared styles
│
├── framework/                         # All reusable QA infrastructure
│   ├── fixtures/
│   │   └── baseTest.ts                # Injects page objects into every test
│   ├── pom/                           # Self-healing page objects
│   │   ├── SelfHealingPage.ts         # Abstract base with healing fallback
│   │   ├── HomePage.ts
│   │   ├── DashboardPage.ts
│   │   └── ProductPage.ts
│   ├── agents/
│   │   ├── validation/
│   │   │   ├── PageValidationAgent.ts # Validates page against a contract
│   │   │   └── contracts.ts           # Three page contracts (home, dashboard, product)
│   │   ├── recovery/
│   │   │   ├── RecoveryRouter.ts      # Orchestrates the full recovery pipeline
│   │   │   ├── GenericLocatorHealer.ts# Scores and heals stale element selectors
│   │   │   ├── SelectorHealer.ts      # Button-specific healing wrapper
│   │   │   ├── NetworkRecoveryAgent.ts# Recovers from dashboard network failures
│   │   │   └── pageProfiles/
│   │   │       ├── types.ts           # PageActionProfile type definition
│   │   │       ├── homePageProfile.ts
│   │   │       ├── dashboardPageProfile.ts
│   │   │       └── productPageProfile.ts
│   │   └── diagnosis/
│   │       ├── ApiDiagnosisAgent.ts   # Root cause analysis for API failures
│   │       ├── FailureClassifier.ts   # Labels any failure with a category + confidence
│   │       ├── PatchProposalAgent.ts  # Recommends file targets and fix direction
│   │       ├── NarrativeEnricher.ts   # Optional OpenAI-powered explanation enrichment
│   │       └── types.ts               # Shared types for all diagnosis agents
│   ├── data/
│   │   └── scenarioPayloads.ts        # Reusable API payloads for tests
│   └── reporting/
│       ├── scenarioArtifacts.ts       # Writes report.json, screenshot, trace
│       └── types.ts                   # ScenarioReport type
│
├── tests/e2e/
│   ├── sanity/
│   │   └── sanity-smoke.spec.ts
│   ├── functional/
│   │   ├── positive/functional-positive.spec.ts
│   │   └── negative/functional-negative.spec.ts
│   ├── non-functional/
│   │   └── non-functional-quality.spec.ts
│   ├── contracts/
│   │   └── api-contract-governance.spec.ts
│   └── scenarios/
│       ├── ui-change-healing.spec.ts
│       ├── flaky-network-recovery.spec.ts
│       ├── api-error-diagnosis.spec.ts
│       ├── dynamic-content-validation.spec.ts
│       ├── generic-self-healing.spec.ts
│       ├── page-contract-validation.spec.ts
│       └── failure-classification-and-patch-proposal.spec.ts
│
├── .artifacts/                        # Generated outputs — not source code
│   ├── scenarios/                     # Per-scenario report.json + screenshot + trace
│   ├── playwright-report/             # HTML test report
│   └── test-results/                  # Raw Playwright result data
│
├── obsidian-vault/               # Project memory in Markdown
│   ├── Tasks/                         # Task notes with scope and acceptance criteria
│   ├── Reports/                       # Daily regression and incident reports
│   └── Templates/                     # Reusable note templates
│
└── md/                                # Handoff and architecture notes
    ├── WORKSPACE_OVERVIEW.md          # This file
    ├── PLAN.md
    ├── PAGE_LEVEL_SELF_HEALING_PATTERN.md
    ├── DEV_TEAM_AGENT_SETUP_PLAYBOOK.md
    ├── SHARED_AGENT_SETUP_BLUEPRINT.md
    ├── PRODUCTION_SELF_HEALING_MULTI_AGENT_BLUEPRINT.md
    └── NEXT_PHASE_MULTI_AGENT_ROADMAP.md
```

**Why this structure exists:**

- Application code, framework code, and test specs are never mixed
- Agents are organized by job: validation, recovery, diagnosis
- Generated outputs live in `.artifacts/` — not polluting source code
- The Obsidian vault is the human-readable memory layer for tasks, reports, and decisions

---

## 3. The Application

The app is a simulated real estate operations product. It exists to give the test framework real, predictable behavior to automate against.

### Pages

| Page      | URL            | What it does                                                                |
| --------- | -------------- | --------------------------------------------------------------------------- |
| Home      | `/`            | Landing page with hero CTA, health check, triage input, product demo button |
| Dashboard | `/dashboard`   | Orders Recovery Console — fetches orders from API, shows table or error     |
| Product   | `/product/:id` | Product detail page — renders from API, supports valid and broken states    |

### API Endpoints

| Method | Route              | Purpose                                                               |
| ------ | ------------------ | --------------------------------------------------------------------- |
| GET    | `/api/health`      | Returns `{ status: "ok", port: 4173, service: "..." }`                |
| GET    | `/api/orders`      | Returns 3 seeded orders. Supports `mode` param: stable / slow / flaky |
| POST   | `/api/create-user` | Creates a user. Returns 201, 400, or 500 based on payload validity    |
| GET    | `/api/product/:id` | Returns product data. Supports `state` param: valid / broken          |

### Built-In Failure Modes

This is what makes the app useful for QA demos — the failures are real and deterministic:

| Failure Mode         | How to Trigger                                         | What Happens                                                              |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Flaky 503            | `GET /api/orders?mode=flaky`                           | First request per runKey returns 503, retry succeeds                      |
| Slow response        | `GET /api/orders?mode=slow`                            | 7 second delay before response                                            |
| Custom delay         | `GET /api/orders?delayMs=5500`                         | Custom delay in milliseconds                                              |
| Broken product       | `GET /api/product/sku-123?state=broken`                | NaN price, missing subtitle, visual overlap of price over button          |
| 400 validation error | POST `/api/create-user` with missing or invalid fields | Returns field-level error messages                                        |
| 500 type mismatch    | POST `/api/create-user` with `phone_number` as string  | Returns `{ problem: { field: "phone_number", expectedType: "integer" } }` |

**Why this matters:** Every agent in the framework has a real failure to respond to. This makes the demo honest — it is not faking recovery, it is actually recovering.

---

## 4. The Agent Architecture

There are seven agents organized into three groups. Each agent owns exactly one job and nothing more.

---

### Validation Group

#### `PageValidationAgent`

**File:** `framework/agents/validation/PageValidationAgent.ts`

**Job:** Check a live page against a declared contract and report every issue found.

**How it works:**

- Receives a `PageContract` object
- Checks up to 5 types of rules on the live page
- Returns `{ valid, issues[], evidence, explanation }`

**Rule types:**
| Rule | What it checks |
|---|---|
| `requiredTestIds` | Element with `data-testid` must be visible |
| `requiredHeadings` | `role="heading"` with exact text must be visible |
| `requiredTextTokens` | Page body must contain these strings (case-insensitive) |
| `forbiddenTextTokens` | Page body must NOT contain these strings |
| `numericFields` | Extract number from element text — must be a finite number, not NaN |
| `overlapPairs` | Check bounding boxes of two elements — they must not visually overlap |

**Used by:** `SelfHealingPage.validateContract()`, scenario tests, functional tests

**Why it exists:** Without contract validation, you cannot know whether recovery actually fixed the problem or just made the test pass for the wrong reason.

---

### Recovery Group

#### `RecoveryRouter`

**File:** `framework/agents/recovery/RecoveryRouter.ts`

**Job:** Orchestrate the full recovery pipeline for any UI failure.

**How it works:**

1. Receives a recovery request with a failure description and a list of strategies to try
2. Calls `FailureClassifier` to label the failure
3. Calls `PatchProposalAgent` to generate a fix recommendation
4. Tries each strategy in order: `locator-heal`, `extend-wait`, `refresh-and-retry`
5. Returns on first success or reports all attempts as failed

**Output:** `{ finalStatus: "recovered" | "failed", attempts[], classification, patchProposal, recoveryEvidence }`

**Used by:** `SelfHealingPage.clickAction()`, `SelfHealingPage.fillAction()`, scenario tests

**Why it exists:** Without a router, each test would need its own recovery logic. The router makes recovery reusable and auditable.

---

#### `GenericLocatorHealer`

**File:** `framework/agents/recovery/GenericLocatorHealer.ts`

**Job:** Find the correct element on a page when the original selector is stale or broken.

**How it works:**

- Scans all buttons, links, inputs, and textareas on the page
- Scores each candidate using:
  - **Token match:** +5 per intent token found in element text, testId, or class
  - **Class hints:** +2 for classes like `rounded`, `primary`, `cta`, `nav`
  - **Semantic signals:** +1.5 for matching testId, +1.25 for aria-label, +1.5 for label text
  - **Location bonus:** small bonus for elements near top-left of page
- Selects the highest-scoring candidate
- Performs the action (click or fill) on the winner
- Returns top 3 candidates with scores for audit evidence

**Used by:** `RecoveryRouter` (locator-heal strategy), `SelectorHealer`

**Why it exists:** Selectors go stale when UI changes. Instead of failing, the healer finds the right element by intent rather than by exact selector.

---

#### `NetworkRecoveryAgent`

**File:** `framework/agents/recovery/NetworkRecoveryAgent.ts`

**Job:** Recover the dashboard when the orders API fails or loads slowly.

**How it works:**

- Uses `OrdersRequestTracker` to monitor live `/api/orders` network activity
- Decision logic:
  - If spinner is visible OR active requests > 0 → try `extend-wait` first
  - Otherwise → try `refresh-and-retry` first
- `extend-wait`: waits for `[data-testid="orders-row"]` up to a configurable timeout
- `refresh-and-retry`: clicks the refresh button and waits for rows to appear

**Output:** `{ finalRowCount, strategy, agentDecision, evidence }`

**Used by:** `flaky-network-recovery.spec.ts`

**Why it exists:** Network failures need different recovery logic than UI failures. This agent handles the specific case of the dashboard going down and coming back.

---

#### `SelectorHealer`

**File:** `framework/agents/recovery/SelectorHealer.ts`

**Job:** Thin wrapper around `GenericLocatorHealer` specifically for button recovery.

**Used by:** Scenarios that need to recover a single stale button without going through the full recovery router.

---

### Diagnosis Group

#### `FailureClassifier`

**File:** `framework/agents/diagnosis/FailureClassifier.ts`

**Job:** Look at a failure and decide what kind of failure it is.

**Categories:**
| Category | Confidence | When triggered |
|---|---|---|
| `api-contract-drift` | 0.97 | 5xx response with a typed field mismatch |
| `api-server-error` | 0.91 | 5xx without a type mismatch |
| `api-client-error` | 0.90 | 4xx response |
| `ui-contract-or-render` | 0.93 | Missing elements, NaN values, forbidden text, visual overlap |
| `ui-loading-or-network` | 0.89 | Spinner visible, active requests, failed requests |
| `ui-missing-locator` | 0.94 | Stale selector, locator error in message |
| `unknown` | 0.42 | No recognized signals |

**Output:** `{ category, confidence, explanation, signals[] }`

**Used by:** `RecoveryRouter`, `ApiDiagnosisAgent`

**Why it exists:** Before you can fix a failure you have to know what kind of failure it is. This classification drives which recovery strategy and which patch proposal gets generated.

---

#### `PatchProposalAgent`

**File:** `framework/agents/diagnosis/PatchProposalAgent.ts`

**Job:** Given a failure classification, recommend where to look and what to fix.

**Output per failure category:**
| Field | What it contains |
|---|---|
| `likelyFileTargets` | File names most likely to need a change |
| `likelyFixArea` | Human-readable area description |
| `qaAutoMitigationEligible` | Whether an agent can auto-fix this without human review |
| `recommendedPermanentFixDirection` | Plain-English fix suggestion |
| `validationPlan` | Ordered list of steps to verify the fix worked |

**Example for `ui-missing-locator`:**

- Targets: `HomePage.ts`, `GenericLocatorHealer.ts`, `index.html`
- Direction: "Update page object or selector contract to target a durable data-testid or role"
- Auto-eligible: true

**Example for `api-contract-drift`:**

- Targets: `server.js`
- Direction: "Align the server response type with the client expectation for the failing field"
- Auto-eligible: false (requires human review)

**Used by:** `RecoveryRouter`, `ApiDiagnosisAgent`

---

#### `ApiDiagnosisAgent`

**File:** `framework/agents/diagnosis/ApiDiagnosisAgent.ts`

**Job:** Diagnose an API failure with full root cause analysis.

**How it works:**

1. Parses the API response body to extract `{ field, expectedType, receivedType }`
2. Calls `FailureClassifier` to label the failure
3. Calls `PatchProposalAgent` to generate the fix recommendation
4. Calls `NarrativeEnricher` to produce a human-readable explanation
5. Returns the full diagnosis object

**Output:** `{ rootCause, classification, patchProposal, explanation, agentDecision, responseBody, responseHeaders, status }`

**Used by:** `api-error-diagnosis.spec.ts`, `failure-classification-and-patch-proposal.spec.ts`

---

#### `NarrativeEnricher`

**File:** `framework/agents/diagnosis/NarrativeEnricher.ts`

**Job:** Optionally rewrite a technical diagnosis into a plain-English explanation using OpenAI.

**How it works:**

- If `OPENAI_API_KEY` is set: calls OpenAI to rewrite the explanation in 2-3 sentences
- If key is not set or call fails: returns the original text unchanged with `engine: "deterministic"`
- Timeout: 5 seconds

**Used by:** `ApiDiagnosisAgent`

**Why it exists:** The raw diagnosis output is accurate but dense. The enricher makes it readable for a human reviewing an incident report.

> **Known issue:** The current OpenAI endpoint is set to `/v1/responses` which is incorrect. The correct endpoint is `/v1/chat/completions`. This means OpenAI enrichment always falls back to deterministic. Fix is a one-line change.

---

## 5. Page Objects and Self-Healing Layer

### `SelfHealingPage` (Abstract Base)

**File:** `framework/pom/SelfHealingPage.ts`

Every page object extends this class. It provides two healing-aware methods:

- `clickAction(profile)` — try to click using the primary selector; if it fails, call `RecoveryRouter` to heal and retry
- `fillAction(profile, value)` — same but for input fields
- `validateContract(contract)` — delegates to `PageValidationAgent`
- `validateContractOrThrow(contract)` — same but throws if validation fails

**Why it matters:** Tests never need to know about recovery. They just call `homePage.goToDashboardFromHero()` and the healing happens automatically if the selector is stale.

---

### `HomePage`

**File:** `framework/pom/HomePage.ts`

| Method                    | What it does                                             |
| ------------------------- | -------------------------------------------------------- |
| `goto()`                  | Navigate to `/`                                          |
| `expectLoaded()`          | Validate against `homePageContract`                      |
| `checkHealth()`           | Click the health check button (with healing fallback)    |
| `fillQuickTriage(value)`  | Fill the triage input (with healing fallback)            |
| `goToDashboardFromHero()` | Click the join-now CTA (with healing fallback)           |
| `goToDashboardFromNav()`  | Click the dashboard nav link (with healing fallback)     |
| `openProductDemo()`       | Click the inspect-product button (with healing fallback) |

---

### `DashboardPage`

**File:** `framework/pom/DashboardPage.ts`

| Method                                | What it does                                            |
| ------------------------------------- | ------------------------------------------------------- |
| `goto(mode, delayMs)`                 | Navigate to `/dashboard` with query params              |
| `expectLoaded()`                      | Validate against `dashboardPageContract`                |
| `refreshOrders()`                     | Click the refresh button (with healing fallback)        |
| `waitForOrdersLoaded(count, timeout)` | Wait for N order rows to appear                         |
| `openBrokenProductProfile()`          | Click the broken product button (with healing fallback) |

---

### `ProductPage`

**File:** `framework/pom/ProductPage.ts`

| Method                   | What it does                                        |
| ------------------------ | --------------------------------------------------- |
| `goto(productId, state)` | Navigate to `/product/:id?state=...`                |
| `expectLoaded()`         | Validate against `productPageContract`              |
| `expectStateText(value)` | Assert the state badge text                         |
| `openManualReview()`     | Click the buy/review button (with healing fallback) |

---

## 6. Page Profiles and Contracts

### Page Profiles

Page profiles are declarative intent definitions. They describe what an action is for and how to find it — without hard-coding a single selector.

Each profile action contains:

- `description` — plain English
- `intentTokens` — words that describe the element's purpose (used by the healer for scoring)
- `primary` — the preferred locator strategy (testId, role, or selector)
- `targetType` — button / input / link
- `timeoutMs` — optional custom timeout

**Example — joinNow action from `homePageProfile`:**

```typescript
joinNow: {
  description: "Click the hero CTA to navigate to the dashboard",
  intentTokens: ["join", "dashboard", "start"],
  primary: { testId: "join-now" },
  targetType: "button"
}
```

If `data-testid="join-now"` disappears from the UI, the `GenericLocatorHealer` uses `["join", "dashboard", "start"]` to find the right replacement without any test code changes.

---

### Page Contracts

Page contracts define what a healthy page looks like. They are used by `PageValidationAgent` to check live pages.

**`homePageContract`:**

- Required test IDs: hero-heading, join-now, inspect-product, check-health, health-output, triage-input, triage-output
- Required heading: "Make failures visible. Recover on purpose."
- Required text: "Runtime Healing", "Scenario Coverage", "Operations Checkpoint", "Quick Triage"

**`dashboardPageContract`:**

- Required test IDs: orders-mode, orders-delay, refresh-orders, orders-status, orders-table
- Required headings: "Orders Recovery Console", "Live orders feed"
- Forbidden text: "undefined", "NaN"

**`productPageContract`:**

- Required test IDs: product-layout, product-title, product-summary, product-price, buy-button, product-notes
- Required heading: "Agentic QA Console"
- Numeric field: product-price (must be a finite number)
- Overlap check: product-price must not overlap buy-button
- Forbidden text: "undefined", "NaN"

---

## 7. Test Suite — Every File, Every Test, Every Purpose

### Sanity

#### `tests/e2e/sanity/sanity-smoke.spec.ts`

| Test                                                                      | What it does                                                                                                           | Why it exists                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| "sanity smoke covers the landing page, dashboard, and valid product view" | Loads all 3 pages, checks health API returns "ok", checks dashboard shows 3 orders, checks product has title and price | Fastest possible signal that nothing is completely broken after a change |

**Agents used:** None (pure Playwright assertions)
**Benefit:** Runs in under 30 seconds. The first thing to run before any deeper suite.

---

### Functional

#### `tests/e2e/functional/positive/functional-positive.spec.ts`

| Test                                                                   | What it does                                                                                                                                                                            | Why it exists                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| "validates healthy API, stable dashboard, and valid product rendering" | Calls health API and asserts shape, posts valid create-user payload and asserts 201 + response shape, loads stable dashboard and checks 3 rows, validates product page against contract | Proves the core happy path works at both API and UI level |

**Agents used:** `PageValidationAgent`

---

#### `tests/e2e/functional/negative/functional-negative.spec.ts`

| Test                                                 | What it does                                                                                                                                                           | Why it exists                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| "surfaces stale selectors and broken rendering"      | Confirms `button:has-text("Sign Up")` does not exist (stale selector), validates broken product state fails with NaN and overlap                                       | Proves failure detection works, not just success detection |
| "surfaces validation and retryable service failures" | Posts invalid payload → expects 400 with field errors, posts type mismatch → expects 500 with typed error, loads flaky dashboard → expects error state before recovery | Proves the app fails correctly and predictably             |

**Agents used:** `PageValidationAgent`
**Benefit:** Negative tests are just as important as positive ones. A system that only passes happy paths is not tested.

---

### Non-Functional

#### `tests/e2e/non-functional/non-functional-quality.spec.ts`

| Test                                                                                    | What it does                                                                                                                                                     | Why it exists                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| "positive non-functional checks meet local latency and responsive quality expectations" | Health API responds in under 1000ms, dashboard loads in under 4000ms, product page renders correctly on mobile viewport (390x844)                                | Catches performance regression and layout breakage on small screens      |
| "negative non-functional checks surface latency degradation and broken render quality"  | Slow dashboard with 5500ms delay does not load rows within 2500ms timeout (spinner still visible), broken product fails validation with NaN and undefined tokens | Proves the framework detects degraded quality, not just binary pass/fail |

**Agents used:** `PageValidationAgent`
**Benefit:** Performance and mobile coverage that most QA suites skip entirely.

---

### Contracts

#### `tests/e2e/contracts/api-contract-governance.spec.ts`

| Test                                                      | What it does                                                                                 | Why it exists                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "api contract governance covers the core local endpoints" | Asserts exact shape and values for all 4 API endpoints: health, orders, create-user, product | Any backend change that breaks a contract is caught immediately, before UI tests even run |

**Agents used:** None (direct API assertions)

**Contract assertions:**

- `/api/health`: `{ port: 4173, service: "Reliable Agentic QA Demo", status: "ok" }`
- `/api/orders`: mode="stable", array of 3 items with id/customer/status/region/total
- `/api/create-user`: 201 with user object containing id (USR-\* pattern), email, phone_number
- `/api/product/sku-123`: product shape with currency, layout.overlap flag, notes array

**Benefit:** API contract tests are the cheapest and fastest way to catch integration drift. They run in milliseconds and do not need a browser.

---

### Scenarios

This is the core of the demo. Each scenario proves one recovery or diagnosis capability end to end.

---

#### `tests/e2e/scenarios/ui-change-healing.spec.ts`

**Scenario:** A button selector goes stale. The team shipped a UI change and the test that used `button:has-text("Sign Up")` now fails.

**What the test does:**

1. Attempts to click the stale selector — it fails
2. Calls `RecoveryRouter` with intent tokens `["join", "dashboard", "start"]`
3. `GenericLocatorHealer` scores all buttons and selects the correct one
4. Click is executed, page navigates to `/dashboard`
5. Test asserts `finalStatus === "recovered"` and that evidence contains `selectedCandidate`

**Agents used:** `RecoveryRouter` → `FailureClassifier` → `GenericLocatorHealer` → `PatchProposalAgent`

**Benefit:** Proves the framework can survive a UI rename without changing test code.

---

#### `tests/e2e/scenarios/flaky-network-recovery.spec.ts`

**Scenario:** The orders API returns 503 on the first request. The dashboard shows an error state.

**What the test does:**

1. Loads dashboard with `mode=flaky`
2. `OrdersRequestTracker` monitors all `/api/orders` network activity
3. `NetworkRecoveryAgent` decides strategy based on spinner visibility and active requests
4. If spinner visible → try `extend-wait` first
5. If not → try `refresh-and-retry`
6. Final assertion: 3 order rows visible

**Agents used:** `NetworkRecoveryAgent` → `OrdersRequestTracker`

**Benefit:** Proves the framework handles intermittent infrastructure failures, not just UI failures.

---

#### `tests/e2e/scenarios/api-error-diagnosis.spec.ts`

**Scenario:** A POST request sends `phone_number` as a string instead of an integer. The API returns 500.

**What the test does:**

1. Posts `typeMismatchCreateUserPayload` to `/api/create-user`
2. `ApiDiagnosisAgent` parses the 500 response
3. Extracts `rootCause: { field: "phone_number", expectedType: "integer", receivedType: "string" }`
4. `FailureClassifier` labels it `api-contract-drift` with confidence 0.97
5. `PatchProposalAgent` suggests `server.js` as the target
6. `NarrativeEnricher` enriches the explanation
7. Full diagnosis is written to `.artifacts/scenarios/api-error-diagnosis/report.json`

**Agents used:** `ApiDiagnosisAgent` → `FailureClassifier` → `PatchProposalAgent` → `NarrativeEnricher`

**Benefit:** Proves the framework can diagnose backend failures, not just detect them.

---

#### `tests/e2e/scenarios/dynamic-content-validation.spec.ts`

**Scenario:** The product page has two states — valid and broken. The framework must tell them apart.

**What the test does:**

1. Loads product with `state=valid` → `PageValidationAgent` runs contract → asserts `valid === true`
2. Loads product with `state=broken` → `PageValidationAgent` runs contract → asserts `valid === false`
3. Checks that broken state issues include: "not a finite number", "NaN token", "undefined token", "Visual overlap"

**Agents used:** `PageValidationAgent`

**Benefit:** Proves contract validation catches multiple simultaneous failure signals (price, text, layout) in a single run.

---

#### `tests/e2e/scenarios/generic-self-healing.spec.ts`

**Scenario:** Three different element types have stale selectors — a button, a link, and an input.

**What the test does:**

1. Stale button `button:has-text("Launch Console")` — healed with tokens `["join", "dashboard", "start"]`
2. Stale link `a:has-text("Operations Console")` — healed with tokens `["dashboard", "orders", "console"]`
3. Stale input `input[placeholder="Incident prompt"]` — healed with tokens `["triage", "incident", "summary"]`
4. All three recoveries assert `finalStatus === "recovered"`

**Agents used:** `RecoveryRouter` → `GenericLocatorHealer` (three separate calls)

**Benefit:** Proves the healing engine works across all interactive element types, not just buttons.

---

#### `tests/e2e/scenarios/page-contract-validation.spec.ts`

**Scenario:** Run contract validation against all four page states (home, dashboard, valid product, broken product).

**What the test does:**

1. Home page contract — all required testIds, headings, and text tokens pass
2. Dashboard contract — required testIds and headings pass, no "undefined" or "NaN"
3. Valid product contract — numeric price is finite, no overlap, no forbidden tokens
4. Broken product contract — fails with NaN price, undefined token, visual overlap detected

**Agents used:** `PageValidationAgent`

**Benefit:** Shows that one validation agent can govern all pages with different rule sets.

---

#### `tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts`

**Scenario:** Two failures — one UI render failure, one API contract drift — each get classified and a patch proposal is generated.

**What the test does:**

1. UI: broken product page → `PageValidationAgent` reports issues → `FailureClassifier` labels `ui-contract-or-render` → `PatchProposalAgent` targets `public/product.js` → `qaAutoMitigationEligible === true`
2. API: type mismatch POST → `ApiDiagnosisAgent` classifies `api-contract-drift` → `PatchProposalAgent` targets `server.js` → `qaAutoMitigationEligible === false`

**Agents used:** `PageValidationAgent` → `FailureClassifier` → `PatchProposalAgent` → `ApiDiagnosisAgent`

**Benefit:** Proves the classification + proposal pipeline works for both UI and API failure types in one test.

---

## 8. From Running a Test to the Full Pipeline

This section explains the complete flow from a developer running a single test on their machine to a gated merge in Jenkins.

---

### Step 1 — Local Development Run

```powershell
npm.cmd run start           # Start the app on port 4173
npm.cmd run test:e2e        # Run the full test suite
```

**What happens:**

- Playwright starts the web server automatically via `webServer` config in `playwright.config.ts`
- Tests run headlessly in Chromium
- Results go to `.artifacts/playwright-report/`
- Scenario reports go to `.artifacts/scenarios/<scenario-name>/`

**Available test commands:**

```powershell
npm run test:e2e             # Full suite
npm run test:e2e:headed      # Headed browser (you can watch)
npm run test:e2e:ui          # Playwright UI mode (interactive trace viewer)
npm run test:e2e:debug       # Playwright Inspector (step through tests)
npm run test:sanity          # Sanity suite only
npm run test:functional      # Functional suite only
npm run test:contracts       # API contract suite only
npm run test:scenarios       # Scenario suite only
npm run test:non-functional  # Non-functional quality suite
```

**Benefit of local runs:** Fast feedback loop. A developer can run the scenario suite in under 2 minutes and know if their change broke any agent behavior.

---

### Step 2 — Pre-Push Gate

Before any push to GitHub, the developer must run:

```powershell
npm.cmd run test:e2e         # Full suite must pass
docker build -t agentic-qa . # Docker image must build without errors
```

**Why this gate exists:** Catch broken tests and broken builds before they reach the remote. Keeps the main branch always green.

---

### Step 3 — GitHub Push

Push to GitHub triggers the Jenkins pipeline on the pushed revision.

**What Jenkins sees:** The exact code that was pushed — no assumptions about local state.

---

### Step 4 — Jenkins Pipeline

**File:** `Jenkinsfile`

The Jenkins pipeline runs in this order:

```
Stage 1: Docker Build
  → Build the Docker image from the repo
  → Fail fast if the image does not build

Stage 2: Playwright Validation (inside Docker)
  → Start the app inside the container
  → Run the full Playwright suite
  → Collect artifacts: reports, traces, screenshots

Stage 3: Artifact Archival
  → Save .artifacts/ for review in Jenkins UI
```

**Why Docker runs before Playwright:** If the image does not build, there is no point running tests. Fail fast saves time.

**Merge rule:** Local tests passed + local Docker build passed + Jenkins validation passed on the pushed revision = approved to merge.

---

## 9. Docker

**File:** `Dockerfile`

Docker packages the app and its dependencies into a consistent, portable image.

**What it does:**

- Copies the project into the container
- Installs Node dependencies (`npm install`)
- Installs Playwright browser binaries (`playwright install --with-deps chromium`)
- Exposes port 4173
- Starts the app with `npm run start`

**Why Docker exists in this project:**

- Eliminates "works on my machine" — the container runs identically on every developer's laptop and in Jenkins
- Makes the Jenkins pipeline self-contained — no need to pre-install Node or Playwright on the Jenkins agent
- Makes the project portable — anyone can clone and run `docker build + docker run` without any setup

**Benefit for QA Architects:** Docker is the standard way to run test suites in CI. Knowing how to write and maintain a test-ready Docker image is an expected skill.

---

## 10. Jenkins

**File:** `Jenkinsfile`

Jenkins is the CI gate that validates code before it is allowed to merge.

**Pipeline job setup:**

- Job type: Pipeline
- Definition: Pipeline script from SCM
- SCM: Git
- Repository: `https://github.com/asaf-1/AI-Agentic-Project`
- Branch: `*/main`
- Script path: `Jenkinsfile`

**What Jenkins enforces:**

- No merge without a passing Docker build
- No merge without a passing full Playwright suite run
- Artifacts from every run are archived and reviewable

**Daily scheduled run:**

- Jenkins runs the full suite on a schedule as a daily regression
- Any overnight breakage is caught before the team starts work
- Reports are written to `obsidian-vault/Reports/Daily/`

**Benefit of Jenkins over just local runs:**

- Tests run on clean infrastructure, not on a developer's potentially dirty machine
- Every merge candidate is validated against the actual pushed code
- Artifact history is preserved for debugging past failures
- The pipeline is the same for every developer — no individual variation

---

## 11. Artifact Output

Every scenario test writes three artifacts to `.artifacts/scenarios/<scenario-name>/`:

| File          | What it contains                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `report.json` | Full structured evidence: finalStatus, agentDecision, classification, patchProposal, recovery attempts, timing |
| `final.png`   | Full-page screenshot of the browser state at the end of the test                                               |
| `trace.zip`   | Playwright trace file — open with `npx playwright show-trace trace.zip` for step-by-step replay                |

**Why artifacts matter:**

- They make failures explainable without re-running the test
- Traces show exactly what the browser saw, not just what the assertion checked
- `report.json` is machine-readable — it can feed a dashboard, a Slack notification, or an Obsidian incident note
- In Jenkins, artifacts are archived and accessible from the build page

---

## 12. Obsidian Vault — Project Memory

**Location:** `obsidian-vault/`

The vault is the human-readable memory layer for the project. It is versioned in Git so history is preserved.

| Folder / File                           | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `00 Home.md`                            | Entry point and links to all sections                                |
| `01 Project Map.md`                     | High-level product and framework overview                            |
| `02 Test Map.md`                        | Map of all test categories and what they cover                       |
| `03 Agent and Obsidian Workflow.md`     | How agents write to the vault                                        |
| `04 Daily Regression Automation.md`     | Daily run setup and report format                                    |
| `05 Enterprise Infrastructure Rules.md` | Rules for multi-product and multi-team work                          |
| `Tasks/`                                | One note per task with scope, acceptance criteria, validation result |
| `Reports/Daily/`                        | Daily regression reports written by automation                       |
| `Reports/Incidents/`                    | Per-incident notes with evidence and recovery summary                |
| `Templates/`                            | Reusable note templates for tasks and reports                        |

**Recommended agent write pattern:**

- After every task: update the task note `Result` section
- After every failure recovery: write an incident note to `Reports/Incidents/`
- After every scheduled run: write a dated report to `Reports/Daily/`

**Benefit:** The vault turns ephemeral chat history into a persistent, reviewable, Git-versioned project record.

---

## 13. Known Issues and What to Fix Next

| Issue                                                                                                   | File                                               | Severity              | Fix                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Wrong OpenAI endpoint                                                                                   | `framework/agents/diagnosis/NarrativeEnricher.ts`  | Medium                | Change `/v1/responses` to `/v1/chat/completions`                                                    |
| PatchProposalAgent may be incomplete for `api-contract-drift`, `api-server-error`, `unknown` categories | `framework/agents/diagnosis/PatchProposalAgent.ts` | Medium                | Verify and add missing category handlers                                                            |
| RecoveryRouter `refresh-and-retry` strategy implementation needs verification                           | `framework/agents/recovery/RecoveryRouter.ts`      | Low–Medium            | Read and verify the full strategy case block                                                        |
| No GitHub Actions CI yet                                                                                | `.github/workflows/` (does not exist)              | High for portfolio    | Add `pr-validation.yml`, `main-validation.yml`, `daily-regression.yml`                              |
| No orchestrator layer                                                                                   | `framework/orchestrator/` (does not exist)         | Medium for next phase | Build `IncidentRouter`, `AgentRegistry`, `ExecutionPlanner` per `NEXT_PHASE_MULTI_AGENT_ROADMAP.md` |

---

## 14. How to Explain This in an Interview

### 30-second version

> I built a local agentic QA platform that goes beyond writing tests. It detects failures, classifies them, recovers from them using the right strategy, proposes permanent fixes, and validates that the recovery actually worked — all without human input. The framework has seven deterministic agents, each owning one job, orchestrated through a recovery router. The whole thing runs locally, in Docker, and in Jenkins with artifact output at every stage.

### If they ask about the agents

> There are three groups. The validation agent checks a live page against a declared contract with five types of rules. The recovery group includes a router that orchestrates strategy selection, a locator healer that scores candidates by intent tokens, and a network recovery agent for API failures. The diagnosis group classifies failures by category with confidence scores, generates fix recommendations, and optionally enriches explanations using OpenAI.

### If they ask why you built it this way

> Because QA at scale is not about who can write the most tests. It is about building infrastructure that makes the test suite self-maintaining, failure-explainable, and recoverable. The agent architecture means that when a selector goes stale or an API contract drifts, the framework handles it — it does not just fail and wait for someone to fix it manually.

### If they ask about CI

> Local runs use Playwright directly. Before a push, the developer must pass the full test suite and a Docker build. Jenkins validates every pushed revision before merge. Docker runs first — if the image does not build there is no point running tests. Artifacts are archived in Jenkins for every run. The daily scheduled regression catches overnight drift before the team starts work.
