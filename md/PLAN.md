# Reliable Agentic QA Demo (Custom Local App)

> ⚠️ **HISTORICAL / SUPERSEDED.** This is the original V1 build plan, kept for history only. Current truth lives in `obsidian-vault/07 Architecture Overview.md`, `obsidian-vault/01 Project Map.md`, and the `obsidian-vault/Tasks/` notes.

## Summary

- Build a custom mini website with a real local API, not Parabank. This is the easier and safer option because the UI, latency, and failure modes stay under our control, so the demo can reliably pass in interviews.
- The demo will be functional, not cosmetic: real pages, real `fetch` calls, real POST validation, real delayed responses, real DOM changes, and real Playwright-driven recovery/diagnosis.
- V1 will use runtime self-healing and root-cause diagnosis rather than editing repo test files. Each agent will also emit a suggested permanent fix artifact so the “auto-fix” story is concrete without making the demo brittle.

## Implementation Changes

- `server.js` will run a plain Node HTTP server on `127.0.0.1:3000`, serve static assets, and hold in-memory users, orders, and products. No Express or database in v1.
- `public/` will contain three real pages:
  - `/` hero page with the already-changed CTA: text `Join Now`, class `.btn-rounded`, and real navigation into the flow.
  - `/dashboard` page that fetches orders from the API, shows a real spinner, and exposes a real `Refresh data` button.
  - `/product/sku-123` page that loads product data dynamically and supports valid/broken render states.
- API routes will be real local endpoints:
  - `GET /api/orders?mode=stable|slow|flaky&delayMs=<n>` returns seeded orders after a real server-side delay.
  - `POST /api/create-user` validates payloads and returns a real `500` problem response when `phone_number` is sent as a string.
  - `GET /api/product/:id?state=valid|broken` returns dynamic product content; `broken` injects invalid price/layout data.
- The agent layer will be code, not theater:
  - `SelectorHealer` will inspect the live DOM, enumerate visible buttons, score candidates by intent tokens and location, then retry the action with the best match.
  - `NetworkRecoveryAgent` will inspect Playwright request lifecycle and spinner state; if the request is still active it extends the wait, otherwise it clicks the page’s real refresh control and retries once.
  - `ApiDiagnosisAgent` will capture request body, response headers, and response JSON/text, then produce a deterministic RCA object plus a human-readable explanation.
  - `PageValidationAgent` will verify structure and render quality by rules: required elements present, price parses to a finite number, no `NaN`/`undefined`, and no overlap between key elements using bounding boxes from Playwright.
  - `NarrativeEnricher` will call OpenAI only when `OPENAI_API_KEY` is present, and only to enrich the explanation text. Pass/fail logic will never depend on the model.
- `scenarios/` will contain four Playwright specs:
  - `ui-change-healing.spec.ts`
  - `flaky-network-recovery.spec.ts`
  - `api-error-diagnosis.spec.ts`
  - `dynamic-content-validation.spec.ts`
- Each scenario will write real artifacts under `artifacts/<scenario>/`: `report.json`, screenshot(s), and Playwright trace. Reports will contain `scenario`, `initialFailure`, `evidence`, `agentDecision`, `finalStatus`, `suggestedPermanentFix`, and `engine`.

## Interfaces And Runtime Defaults

- `package.json` scripts:
  - `npm start` starts the app.
  - `npm test` runs all scenarios.
  - `npm run test:ui-heal`
  - `npm run test:flaky`
  - `npm run test:api`
  - `npm run test:dynamic`
- `playwright.config.ts` will use the local web server and prefer `channel: 'chrome'` on Windows because Chrome is already installed on this machine. If Playwright-managed Chromium is later installed, it can remain a fallback.
- The tests will hit the local server directly. No `page.route()` request mocking, no fake fixture interception, and no stubbed UI-only flows.
- The app will use in-memory data only. That keeps setup trivial while still making the interactions real and stateful during a run.

## Test Plan

- `ui-change-healing.spec.ts`
  - Attempt the outdated selector `button:has-text("Sign Up")` and confirm it fails.
  - Run `SelectorHealer`, click the recovered CTA, and assert real navigation or a real server-backed success state.
  - Persist the chosen selector and the evidence used to choose it.
- `flaky-network-recovery.spec.ts`
  - Load `/dashboard` against `mode=slow` or `delayMs=7000` so the initial 5-second assertion fails.
  - Run `NetworkRecoveryAgent`; if the request is still pending or spinner is visible, extend the wait, else click `Refresh data` and wait for the second real response.
  - Assert the orders table eventually renders real rows.
- `api-error-diagnosis.spec.ts`
  - Send `{ phone_number: "0541234567" }` to `POST /api/create-user`.
  - Assert the endpoint returns `500`.
  - Run `ApiDiagnosisAgent` and assert the RCA identifies the type mismatch and proposes `phone_number` as an integer.
- `dynamic-content-validation.spec.ts`
  - Validate a `state=valid` product page with dynamic price changes and confirm it passes without hardcoded price assertions.
  - Validate a `state=broken` page containing a `NaN` price and overlapping UI and confirm it fails with specific reasons.
- Acceptance criteria:
  - Fresh setup plus dependency install can run `npm test` successfully on this machine.
  - Every scenario produces a real agent report and trace.
  - The demo works without an OpenAI key; adding a key only improves narrative quality.

## Assumptions And Defaults

- V1 optimizes for reliability over maximal autonomy. Agents heal at runtime and generate suggested permanent fixes; they do not rewrite repo test files automatically.
- The local app is intentionally small and purpose-built for the four interview scenarios, not a generic sample storefront.
- The implementation will stay dependency-light: Node built-ins for the server, `@playwright/test` for execution, and optional official OpenAI integration only for report enrichment.

## side note "Big Four" Agentic scenarios

1. The "Marketing Update" (Self-Healing)
   The Problem: The marketing team changed the "Sign Up" button text to "Join Now" and updated the CSS class from .btn-blue to .btn-rounded. Your test is now broken.

The Scenario: Your Playwright test looks for button:has-text("Sign Up"). It fails.

The AI Agent Action: The agent captures the current HTML, realizes the button still exists but with a different label and class, identifies the new selector, and completes the login flow.

Interview Value: Shows you can handle maintenance-heavy UI changes without manual intervention.

2. The "Flaky Data" (Self-Healing / Retry)
   The Problem: You are testing a dashboard that takes variable time to load data. Sometimes it takes 2 seconds, sometimes 7. A static wait or a strict timeout causes flakiness.

The Scenario: The test fails to find a table row within the 5-second timeout.

The AI Agent Action: The agent checks the network logs (via Playwright) and the UI. It realizes the "Loading" spinner is still active or a specific API call is Pending. Instead of just failing, it "decides" to extend the wait or refresh only the data-component.

Interview Value: Shows you can distinguish between a system bug and environment flakiness.

3. The "Unclear Error" (Autonomous Diagnosis)
   The Problem: A test fails with a generic 500 Internal Server Error. Usually, a QA has to open DevTools, check the Network tab, and copy the payload to find out why.

The Scenario: Your API test for POST /create-user fails.

The AI Agent Action: The agent automatically extracts the Request Payload, the Response Headers, and the Error Message. It sends them to GenAI, which explains: "The error occurred because the 'phone_number' field was sent as a string instead of an integer."

Interview Value: This is "Smart Reporting." You aren't just reporting a fail; you are providing the Root Cause Analysis (RCA).

4. The "Dynamic Content" (Smart Validation)
   The Problem: You are testing a news site or a marketplace where the content changes every hour. You can't hardcode "The price is $99" because it changes.

The Scenario: You need to verify that a product page is "Valid."

The AI Agent Action: Instead of checking for a specific price, the agent uses GenAI to look at the page and answer: "Does this page look like a broken product page? Are there overlapping elements or 'NaN' in the price field?"

Interview Value: Shows you can perform Visual & Logical QA that traditional "if/else" code cannot do.
