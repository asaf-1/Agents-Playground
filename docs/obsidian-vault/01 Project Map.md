# Project Map

## Stack

- Runtime: Node.js 20+
- App style: static frontend served by a custom Node HTTP server with explicit page routing
- Testing: Playwright E2E with deterministic self-healing, diagnosis, validation, real-agent proof coverage, and artifact output

## Important Paths

- `server.js`
  - page routing plus local JSON API
- `public/index.html`
  - landing page with the `Join Now` CTA, health check, and quick-triage input
- `public/app.js`
  - landing-page navigation, health check logic, and quick-triage echo behavior
- `public/dashboard.html`
  - live orders recovery page
- `public/dashboard.js`
  - orders fetch, spinner, retry, and flaky-run isolation behavior
- `public/product.html`
  - dynamic product validation page
- `public/product.js`
  - runtime product rendering for valid and broken states
- `public/styles.css`
  - shared visual system and broken-layout styling
- `framework/agents/recovery/`
  - generic locator healing, recovery routing, selector compatibility wrapper, network recovery wrapper, and page profiles
- `framework/agents/diagnosis/`
  - deterministic failure classification, patch proposals, API diagnosis, and optional narrative enrichment
- `framework/agents/llm/`
  - bounded `SelfHealingLlmAgent` plus the opt-in `OpenAiSelfHealingProvider`
- `framework/agents/obsidian/`
  - `ObsidianMemoryAgent` for healing-run vault logs, workspace-state handoff logs, and task-result updates; `ObsidianCloseoutAgent` for changed-file documentation gating and closeout reports
- `framework/agents/validation/`
  - reusable page contracts plus generic page validation
- `framework/pom/`
  - page objects for home, dashboard, and product pages plus the shared `SelfHealingPage` base layer
- `framework/fixtures/baseTest.ts`
  - Playwright fixture layer that injects the current self-healing page objects into tests
- `framework/data/scenarioPayloads.ts`
  - reusable API payloads
- `framework/reporting/scenarioArtifacts.ts`
  - report, screenshot, and trace writing
- `tests/e2e/sanity/`
  - fast smoke coverage
- `tests/e2e/functional/`
  - positive and negative business behavior coverage
- `tests/e2e/non-functional/`
  - local latency, responsive, and render-quality checks
- `tests/e2e/contracts/`
  - API contract governance checks
- `tests/e2e/scenarios/`
- healing, recovery, diagnosis, contract validation, real-agent proof, and patch-proposal demonstrations

## Backend Routes In `server.js`

- `GET /api/health`
- `GET /api/orders?mode=stable|slow|flaky&delayMs=<n>`
- `POST /api/create-user`
- `GET /api/product/:id?state=valid|broken`

## Current Product Flows

- Navigate from the landing page into the dashboard through the `Join Now` CTA
- Use a real quick-triage input on the landing page and see the captured summary echoed live
- Load orders through a real local API with stable, slow, and retryable failure modes
- Recover the dashboard through the visible `Refresh data` control or extended wait behavior
- Diagnose a real API type mismatch on `POST /api/create-user`
- Validate runtime product content across valid and broken render states
- Check local API health from the landing page

## Current Framework Layers

- generic locator healing for buttons, links, and inputs
- deterministic failure classification for UI and API incidents
- recovery routing across QA-safe strategies
- deterministic patch proposals
- reusable page contracts for home, dashboard, and product pages
- page-level self-healing through page profiles, page objects, and shared fixtures
- compatibility wrappers for the original selector-healing and network-recovery demos
- bounded real LLM self-healing proof with fake-provider default coverage and opt-in live OpenAI smoke
- Obsidian memory and closeout agent proof for vault healing logs, workspace-state handoff logs, changed-file documentation gating, and task-note result updates

## Documentation Model

- `docs/obsidian-vault/` is the shared documentation system for this repo
- `AGENTS.md` holds stable repository rules
- `Tasks/007 Real Agent Proof.md` is the active implementation record for the current real-agent proof
- `Tasks/005 Page-Level Self-Healing Adoption.md` remains the completed page-level adoption record
- `Tasks/004 Generic Self-Healing Layer.md` is the prior framework milestone for the generic layer
- `Tasks/003 Reliable Agentic QA Demo.md` remains the prior milestone for the baseline demo replacement
- top-level `md/` files are not the primary project source of truth

## Current Constraints

- data is in-memory only
- the demo is local-only
- scenario artifacts are written under `.artifacts/scenarios/`
- `OPENAI_API_KEY` is optional; default regression stays offline, while `RUN_LIVE_OPENAI_AGENT_TEST=true` enables the explicit live OpenAI self-healing smoke
- QA auto-mitigation is limited to locator healing, extend-wait, refresh-and-retry, and contract re-check
- patch proposals are proposal-only; this version does not auto-edit code during recovery
- the current real-agent proof is runtime self-healing only; any future source-editing patching agent must include reset/revert handling for intentional demo bugs

## Governance

- [[05 Enterprise Infrastructure Rules]] is the reusable baseline for enterprise-style infrastructure, QA, and automation work
- for multiple products or platforms, create separate task notes and keep shared rules centralized in [[05 Enterprise Infrastructure Rules]]
- local-only personal overrides should stay in ignored files outside GitHub
