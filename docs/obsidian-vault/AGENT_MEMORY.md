# Agent Shared Memory

> Single source of truth for all agents (Claude, Codex, or any future agent) working in this workspace.
> Every agent MUST read this file at session start and update it when work completes.
> Plain Markdown — tracked by Git.

---

## Project Identity

- **Name:** GenAI+AgenticAI Demo
- **Type:** Self-healing Playwright QA framework + Node.js demo app
- **Repo:** https://github.com/asaf-1/GenAI-AgenticAI-Demo (private)
- **Local path:** `C:\Users\asafn\Desktop\GenAI+AgenticAI-Demo`
- **App URL (local):** `http://localhost:4173`
- **Stack:** Node.js, Playwright, TypeScript

---

## Current Phase

**Phase:** Post-Phase Hardening — Session Snapshot layer added (2026-04-19)
**Status:** All roadmap tasks (1–10) and the Docker hardening pass remain complete. NarrativeEnricher now has dedicated unit-style coverage with a known-issue lock on the `/v1/responses` endpoint. Session snapshot/resume layer is now live: `docs/obsidian-vault/Snapshots/` folder, `Templates/Session Snapshot.md`, `/snapshot` skill, and AGENTS.md rules covering both snapshot writes and the new "feature change → update README + memory together" rule. Suite remains green at `41/41`.
**Next:** Remaining post-phase follow-ups are cross-browser coverage, auth/session flows, and the NarrativeEnricher endpoint fix itself (when it lands, update the URL assertion in `tests/e2e/scenarios/narrative-enricher.spec.ts`).

**Local demo note (2026-04-18):** A local Jenkins demo controller was validated against this private repo, but that setup lives outside the repo under `D:\Jenkins` and is machine-local only.

### Slice 1 delivered
`IncidentRouter` + `AgentRegistry` + `UserManagerPage` end-to-end. `orchestrated-recovery.spec.ts` proves one stale-locator failure is classified, healed, and validated through the multi-agent chain.
Full roadmap (many phases ahead): `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`

### Push status
The first project push is complete on `main`:

- remote: `https://github.com/asaf-1/GenAI-AgenticAI-Demo.git`
- branch: `main`
- local validation before push:
  - `npm.cmd test` → `24/24` passed
  - `docker build -t ai-agentic-project-prepush .` → passed
- follow-up CI fix:
  - commit `1ab9fff` pushed to `origin/main`
  - GitHub Actions workflows now rely on Playwright `webServer` instead of manual background `node server.js` startup
  - `Main Branch Validation` also supports `workflow_dispatch` so latest `main` can be run manually without rerunning an older workflow revision

**Commit guidance for Codex:**

✅ Commit everything in:
- `framework/` (orchestrator, pom, agents, fixtures, reporting, data)
- `tests/e2e/` (all 15 specs)
- `public/` (dashboard.html/js, product.html/js, user-manager.html, modified index/app/styles)
- `server.js`, `package.json`, `package-lock.json`, `playwright.config.ts`, `Jenkinsfile`, `README.md`, `Dockerfile`, `Dockerfile.e2e`, `docker-compose.yml`
- `.github/workflows/` (pr-validation.yml, main-validation.yml, daily-regression.yml, publish-playwright-runner.yml)
- `.devcontainer/`, `scripts/docker/`
- `.claude/` (settings.json + skills)
- `docs/obsidian-vault/` (AGENT_MEMORY.md, Inbox/Agents/, Tasks/003-005, 06 Guide, modified 00-04 + Templates)
- `md/` (DEV_TEAM_AGENT_SETUP_PLAYBOOK, NEXT_PHASE_MULTI_AGENT_ROADMAP, PAGE_LEVEL_SELF_HEALING_PATTERN, PLAN, PRODUCTION_SELF_HEALING_MULTI_AGENT_BLUEPRINT, SHARED_AGENT_SETUP_BLUEPRINT)
- Accept the 7 deletions (old `framework/page-objects/`, `framework/test-data/`, `tests/e2e/portfolio-demo*`, `md/Infestracture-Reasoning.md`, vault Tasks 001-002) — they were intentionally retired

🔴 DO NOT commit:
- `asaf-1/` — it's a separate Git repo (personal portfolio) nested inside this project. Already added to `.gitignore` on 2026-04-17.
- Anything already in `.gitignore`: `node_modules/`, `.artifacts/`, `test-results/`, `.env*`, `docs/obsidian-vault/Reports/*` (except its README).

**Gate:** `npm.cmd test` must show 33+ passing before push.
**First push:** `git push -u origin main`. Subsequent: `git push`.
**Commit strategy:** one "Slice 1 + Slice 2 complete" commit is fine, OR split by area (framework / tests / docs / CI) — Codex's call.

### Last session stop point (2026-04-19, snapshot layer + doc rules)
- Added the session snapshot/resume layer:
  - `docs/obsidian-vault/Snapshots/` folder with `README.md` explaining when to write a snapshot and how it differs from `AGENT_MEMORY.md`, `Tasks/`, `Reports/`, `Inbox/Agents/`, and Git history.
  - `docs/obsidian-vault/Templates/Session Snapshot.md` defining the snapshot structure (Active Phase, What Was In Flight, Last Decisions w/ why, Workspace State, Resume Entry Point, Blockers).
  - `.claude/skills/snapshot/SKILL.md` registering `/snapshot <title>` — gathers git state, reads memory, fills the template, links from `00 Home.md`.
- Updated `AGENTS.md`:
  - New **Documentation Rules** section: any feature add/remove/rename must update `README.md` and `AGENT_MEMORY.md` in the same change set; bump the test count in `README.md` whenever spec count changes.
  - New **Session Continuity Rules** section: write `/snapshot` before stopping, on token-cap risk, or on any cross-agent handoff.
- Updated `README.md`: bumped `33` → `41` in both spots, added the OpenAI fallback coverage note, added a `Snapshots/` line under Important Paths.
- No code/test changes this session — all updates are docs, vault scaffolding, and skill registration. No suite rerun needed; last run was 41/41 from the previous stop point.

### Previous session stop point (2026-04-19, NarrativeEnricher coverage)
- Added `tests/e2e/scenarios/narrative-enricher.spec.ts` (8 tests) covering `framework/agents/diagnosis/NarrativeEnricher.ts`:
  - deterministic fallback when `OPENAI_API_KEY` missing, on non-ok status, on empty payload, and on fetch throw/abort
  - successful enrichment via `output_text` and via flattened `output[].content[].text`
  - request body carries the configured model and the 2-3-sentence rewrite prompt
  - **known-issue lock**: pins the current OpenAI URL to `https://api.openai.com/v1/responses` so any endpoint change is forced to ship with an updated assertion. When the endpoint is corrected, update both the lock test and remove the row from the Known Issues table.
- Tests use `globalThis.fetch` swap with restore in `afterEach` and restore `OPENAI_API_KEY` / `OPENAI_MODEL` env vars between tests; no real network calls.
- Suite count moved from 33 → 41 specs. `npx playwright test tests/e2e/scenarios/narrative-enricher.spec.ts` → 8/8. `npm run test:e2e` → 41/41.
- No changes to other tests, framework code, configs, or CI files this session.

### Previous session stop point (2026-04-18)
- Added repo-level `.gitattributes` to normalize text files to LF across machines while keeping Windows-native command files (`.ps1`, `.bat`, `.cmd`) on CRLF, to prevent recurring line-ending mismatch churn between this workstation and the laptop.
- Added `.env` and `.env.*` to `.dockerignore` so local env files stay out of Docker build context if they exist on a developer machine.
- Performed a repo leak scan before push prep:
  - no tracked GitHub PATs, private keys, bearer tokens, or Jenkins local-path leaks found
  - no `.env` files currently present in the repo workspace
- Re-ran the repo suite after the Docker ignore hardening:
  - `npm.cmd run test:e2e` â†’ `33/33` passed
- Set up and validated a local Jenkins demo controller outside the repo:
  - root: `D:\Jenkins`
  - local files created there: `start-jenkins.bat`, `stop-jenkins.bat`, `README.txt`, `NEXT-STEPS.txt`
  - created a local Pipeline job pointing at `https://github.com/asaf-1/GenAI-AgenticAI-Demo.git`
  - Jenkins run succeeded against the repo `Jenkinsfile`
  - local Jenkins retention for the demo job was tightened to keep `1` build and `0` artifact builds
  - this Jenkins state is machine-local only and must not be committed or copied into the repo
- Implemented the deferred Docker hardening track end to end:
  - Added `Dockerfile.e2e` pinned to the Playwright `v1.59.1-noble` base image digest
  - Added `docker-compose.yml` and optional `.devcontainer/devcontainer.json` for shared local onboarding
  - Added `scripts/docker/resolve-playwright-runner.sh` and `scripts/docker/run-containerized-playwright.sh` for CI/container execution
  - Added package scripts: `docker:prepare-runner`, `docker:pull-runner`, `test:docker:smoke`, `test:docker:e2e`, `docker:shell`
  - Updated `Jenkinsfile` so browser-based validation runs inside the shared runner instead of host-installed Playwright browsers
  - Updated GitHub Actions (`pr-validation.yml`, `main-validation.yml`, `daily-regression.yml`) to run browser validation inside the shared runner and added `publish-playwright-runner.yml` for GHCR publishing
  - Tightened `.dockerignore` and updated `README.md`, `04 Daily Regression Automation.md`, `06 Reliable Agentic QA Demo Guide.md`, and `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
  - Added `.claude/skills/docker-runtime/SKILL.md` plus Docker command permissions in `.claude/settings.json` so future agents know to refresh the runner image and container dependency volume after library changes
- Validation completed locally:
  - `docker compose config` → passed
  - `docker compose build qa-runner` → passed
  - `npm.cmd run test:docker:smoke` → passed
  - `npm.cmd run test:docker:e2e` → `33/33` passed
  - `npm.cmd run test:e2e` → `33/33` passed
  - `docker build -t ai-agentic-project-prepush .` → passed
  - Follow-up docs/skill addition: no tests rerun because product/runtime behavior did not change

### Earlier session stop point (2026-04-18, repair + new pages)
- Built `framework/agents/repair/` (PatchPlanner, PatchApplier, RepairVerifier, types) and wired the full plan → apply → verify flow into `IncidentRouter` behind an environment guard (QA/staging only; production is skipped).
- Patch artifacts now written to `.artifacts/patches/<incidentId>/patch-plan.json` when a plan is permitted.
- Added four new self-healing pages end to end: `OrdersPage`, `AdminPage`, `ProfilePage`, `SettingsPage` — each with HTML page under `public/`, page profile, page contract, POM, and `baseTest.ts` fixture. Server routes added in `server.js` for `/orders`, `/admin`, `/profile`, `/settings`.
- New specs: `tests/e2e/scenarios/repair-flow.spec.ts` (5 cases covering planner, applier, verifier, QA end-to-end, production skip) and `tests/e2e/sanity/new-pages.spec.ts` (4 cases, one per new page).
- Scheduled Claude daily regression trigger created via CronCreate at `7 5 * * *` local. Note: the harness returned session-only despite `durable:true` — persistence across agent restarts still relies on `.github/workflows/daily-regression.yml`.
- `npm.cmd test` passes locally at `33/33` (was 24 before this session).

### Previous session stop point (2026-04-17)
- Fixed state-pollution bug: `/api/create-user` and `/api/users` now use separate stores (`runtimeState.createdUsers` vs `runtimeState.managedUsers`). Added `POST /api/test/reset-users` for test isolation.
- Added visible `<label>Search</label>` on User Manager so `requiredTextTokens: ["Search"]` in the contract passes.
- Orchestrated-recovery spec now dismisses dialogs + resets managed users on setup.
- Built `framework/orchestrator/PolicyEngine.ts` and wired it into `IncidentRouter` so recovery strategies are filtered by environment-safe policy before auto-mitigation.
- Added `tests/e2e/scenarios/policy-engine.spec.ts` to lock QA-vs-production policy behavior and low-confidence approval gating.
- Built `framework/orchestrator/ExecutionPlanner.ts` and wired it into `IncidentRouter` so execution order is planned after policy and before recovery.
- Added `framework/memory/IncidentMemoryStore.ts` and `framework/agents/evidence/EvidenceCollectionAgent.ts`, both integrated into the orchestrated incident flow.
- Expanded `FailureClassifier.ts` with auth/session, RBAC, modal, navigation, timeout, empty-state, and delayed-data branches.
- Expanded `GenericLocatorHealer.ts` with select, menu, modal, row-context, label, placeholder, and section-context recovery.
- Added `.github/workflows/daily-regression.yml` with a fixed `05:00 UTC` schedule and artifact-only regression reporting.
- Added targeted coverage for planner, memory/evidence, classifier expansion, and advanced locator healing.
- `npm.cmd test` passes locally at `24/24`.
- Local Docker build passes: `docker build -t ai-agentic-project-prepush .`
- Commit `60d270d` pushed to `origin/main` after replacing `origin` with `GenAI-AgenticAI-Demo`.
- Fixed the first GitHub Actions failure on `Wait for server` by removing manual server startup from `pr-validation.yml`, `main-validation.yml`, and `daily-regression.yml`.
- Commit `1ab9fff` pushed to `origin/main` so all CI workflows use Playwright `webServer` for server lifecycle in GitHub Actions.
- Added `workflow_dispatch` to `main-validation.yml` so manual runs can target the latest `main` workflow definition instead of rerunning stale failed revisions.

---

## What Has Been Built (Completed Work)

### App
- `server.js` — Node.js on port 4173. Routes: `/`, `/dashboard`, `/product/:id`, `/api/health`, `/api/orders`, `/api/create-user`, `/api/product/:id`
- `public/` — index.html, dashboard.html, product.html + JS/CSS

### Framework
- `framework/pom/SelfHealingPage.ts` — abstract base with auto-recovery
- `framework/pom/HomePage.ts`, `DashboardPage.ts`, `ProductPage.ts`, `UserManagerPage.ts`, `OrdersPage.ts`, `AdminPage.ts`, `ProfilePage.ts`, `SettingsPage.ts`
- `framework/orchestrator/IncidentRouter.ts`, `AgentRegistry.ts` ← Slice 1
- `framework/orchestrator/PolicyEngine.ts` ← Slice 2
- `framework/orchestrator/ExecutionPlanner.ts` ← Slice 2
- `framework/agents/recovery/RecoveryRouter.ts`
- `framework/agents/recovery/GenericLocatorHealer.ts`
- `framework/agents/recovery/NetworkRecoveryAgent.ts`
- `framework/agents/evidence/EvidenceCollectionAgent.ts` ← Slice 2
- `framework/agents/repair/PatchPlanner.ts`, `PatchApplier.ts`, `RepairVerifier.ts`, `types.ts` ← roadmap #7
- `framework/agents/recovery/pageProfiles/` — home, dashboard, product, userManager, orders, admin, profile, settings profiles
- `framework/agents/diagnosis/FailureClassifier.ts`
- `framework/agents/diagnosis/ApiDiagnosisAgent.ts`
- `framework/agents/diagnosis/PatchProposalAgent.ts`
- `framework/agents/validation/PageValidationAgent.ts`
- `framework/agents/validation/contracts.ts` (home, dashboard, product, user-manager, orders, admin, profile, settings)
- `framework/fixtures/baseTest.ts` — exposes `userManagerPage` fixture
- `framework/memory/IncidentMemoryStore.ts` ← Slice 2
- `framework/reporting/scenarioArtifacts.ts`

### Tests (41 specs, all green locally)
- `tests/e2e/sanity/`, `functional/positive|negative/`, `contracts/`, `non-functional/`, `scenarios/` (15 agentic scenario specs including `orchestrated-recovery.spec.ts`, `policy-engine.spec.ts`, `execution-planner.spec.ts`, `incident-memory-and-evidence.spec.ts`, `failure-classifier-expansion.spec.ts`, `advanced-locator-healing.spec.ts`, `repair-flow.spec.ts`, and `narrative-enricher.spec.ts`)
- `tests/e2e/sanity/new-pages.spec.ts` covers the four new pages (orders, admin, profile, settings)
- `tests/e2e/scenarios/narrative-enricher.spec.ts` (8 cases) covers the OpenAI enrichment fallback paths and locks the current `/v1/responses` endpoint URL until the known-issue endpoint fix lands

### CI
- `.github/workflows/pr-validation.yml` — runs on PRs to main
- `.github/workflows/main-validation.yml` — runs on push to main and supports manual `workflow_dispatch`
- `.github/workflows/daily-regression.yml` — scheduled daily full-suite regression with artifact-only reporting
- `.github/workflows/publish-playwright-runner.yml` — publishes the shared Playwright runner image to GHCR (`main` + commit SHA tags)
- GitHub Actions browser validation now runs inside the shared Playwright runner image instead of host-installed browsers
- `Jenkinsfile` — app Docker validation gate first, then Playwright validation inside the shared runner image

### Claude Code Skills
- `/qa-run <suite>` — run any test suite
- `/new-page <PageName>` — scaffold full self-healing page
- `/next-phase` — build orchestration slice + auto-update this file
- `/incident-note <description>` — write structured vault note
- `/snapshot <title>` — write a session snapshot for cold resume across sessions or agent handoffs

### Vault + Memory
- `docs/obsidian-vault/AGENT_MEMORY.md` — this file
- `docs/obsidian-vault/Reports/Daily|Incidents|Healing/`
- `docs/obsidian-vault/Inbox/Agents/` — handoff drop zone
- `docs/obsidian-vault/Snapshots/` — point-in-time session state for cold resume (write via `/snapshot`)
- `docs/obsidian-vault/Tasks/`, `Templates/`

---

## What Is Next (Pending Work)

Roadmap tasks 1–10 and the deferred shared Docker hardening pass are complete (2026-04-18). Pick the next post-phase hardening item.

| Priority | Task | Owner | Status |
|---|---|---|---|
| ~~1~~ | ~~Build `IncidentRouter` + `AgentRegistry`~~ | Claude | ✅ done |
| ~~2~~ | ~~Build `UserManagerPage` end to end~~ | Claude | ✅ done |
| ~~3~~ | ~~Write `orchestrated-recovery.spec.ts` proof test~~ | Claude | ✅ done |
| ~~6a~~ | ~~Create GitHub Actions workflow files (pr + main)~~ | Claude | ✅ done |
| ~~6b~~ | ~~Commit + push Slice 1 + approved Slice 2 scope to `origin main` at https://github.com/asaf-1/GenAI-AgenticAI-Demo~~ | Codex | ✅ done |
| ~~1~~ | ~~Build `PolicyEngine.ts` in `framework/orchestrator/` (enforces environment-safe actions)~~ | Codex | ✅ done |
| ~~2~~ | ~~Build `ExecutionPlanner.ts` in `framework/orchestrator/` (orders strategies/workers)~~ | Codex | ✅ done |
| ~~3~~ | ~~Build `framework/memory/IncidentMemoryStore.ts` (record what worked, history)~~ | Codex | ✅ done |
| ~~4~~ | ~~Add `EvidenceCollectionAgent` in `framework/agents/evidence/`~~ | Codex | ✅ done |
| ~~5~~ | ~~Expand `FailureClassifier` (auth, RBAC, modal-not-opened, route-nav, api-timeout, 5xx, empty-state, delayed-data)~~ | Codex | ✅ done |
| ~~6~~ | ~~Expand `GenericLocatorHealer` (dropdown, menu, modal, table row/action, form-field by label/placeholder/section)~~ | Codex | ✅ done |
| ~~7~~ | ~~Repair agents: `PatchPlanner`, `PatchApplier`, `RepairVerifier` in `framework/agents/repair/` (QA/staging only)~~ | Claude | ✅ done |
| ~~8~~ | ~~New pages: `OrdersPage`, `AdminPage`, `ProfilePage`, `SettingsPage` (use `/new-page` skill)~~ | Claude | ✅ done |
| ~~9~~ | ~~`.github/workflows/daily-regression.yml` (scheduled nightly)~~ | Codex | ✅ done |
| ~~10~~ | ~~Set up scheduled Claude remote trigger (daily regression)~~ | Claude | ✅ done |
| ~~11~~ | ~~Implement shared Docker runtime across CI and dev (`Dockerfile.e2e`, Compose, GHCR publish, Jenkins/GitHub Actions containerized validation)~~ | Codex | ✅ done |

All roadmap tasks and the Docker hardening pass are complete. Remaining follow-ups sit under post-phase hardening in `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` (workspace snapshot/resume, cross-browser coverage, auth flows).

---

## How Agents Use This File

### Session start
1. Read this file
2. Read `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
3. Pick the highest-priority pending task

### Session end
1. If a task note under `docs/obsidian-vault/Tasks/` is in scope, update its `Result` section before finishing substantial implementation work
2. Update `docs/obsidian-vault/AGENT_MEMORY.md` to mark completed work and adjust pending items
3. For substantive work or any agent handoff, drop a handoff note in `docs/obsidian-vault/Inbox/Agents/`
4. Write a note to the relevant `Reports/` subfolder when the workflow calls for a report
5. State the end result clearly in the final user-facing closeout message
6. Commit when there are real repo changes worth preserving in Git history; recommended, not mandatory

### Handoff format (Claude ↔ Codex)
File: `docs/obsidian-vault/Inbox/Agents/YYYY-MM-DD-handoff-<from>.md`
```
# Handoff: <phase>
**From / To / Date:**
## What was done
## What to do next
## Files changed
## Tests to run
```

---

## Known Issues

| Issue | File | Severity |
|---|---|---|
| NarrativeEnricher calls wrong OpenAI endpoint (covered + URL-pinned in `tests/e2e/scenarios/narrative-enricher.spec.ts`; fix still pending) | `framework/agents/diagnosis/NarrativeEnricher.ts` | low |
| No cross-browser coverage | `playwright.config.ts` | medium |
| No auth/session test flows | `tests/` | medium |

---

## Key File Map

| Need | Location |
|---|---|
| App server + routes | `server.js` |
| App Docker image | `Dockerfile` |
| Shared Playwright runner | `Dockerfile.e2e`, `docker-compose.yml`, `.devcontainer/devcontainer.json` |
| Page objects | `framework/pom/` |
| Recovery agents | `framework/agents/recovery/` |
| Diagnosis agents | `framework/agents/diagnosis/` |
| Validation contracts | `framework/agents/validation/contracts.ts` |
| Container execution helpers | `scripts/docker/` |
| Docker Claude skill | `.claude/skills/docker-runtime/SKILL.md` |
| Runner publishing workflow | `.github/workflows/publish-playwright-runner.yml` |
| Full roadmap | `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` |
| Session snapshots | `docs/obsidian-vault/Snapshots/` (template: `Templates/Session Snapshot.md`, skill: `/snapshot`) |
| This memory file | `docs/obsidian-vault/AGENT_MEMORY.md` |
