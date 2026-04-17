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

**Phase:** Multi-Agent Orchestration — Slice 2
**Status:** In progress (2026-04-17) — approved Slice 2 scope complete, full suite + Docker gate green
**Next:** Commit and push this repo to `GenAI-AgenticAI-Demo`, then leave the remaining roadmap items for the next phase

### Slice 1 delivered
`IncidentRouter` + `AgentRegistry` + `UserManagerPage` end-to-end. `orchestrated-recovery.spec.ts` proves one stale-locator failure is classified, healed, and validated through the multi-agent chain.
Full roadmap (many phases ahead): `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`

### ⚠️ Not pushed yet
Working tree has **~90 uncommitted changes** as of 2026-04-17 (65 untracked + 24 modified + 7 deletions). After Slice 2 is complete + green, commit and push to `https://github.com/asaf-1/GenAI-AgenticAI-Demo` (main branch). See pending item 6b.

**Commit guidance for Codex:**

✅ Commit everything in:
- `framework/` (orchestrator, pom, agents, fixtures, reporting, data)
- `tests/e2e/` (all 15 specs)
- `public/` (dashboard.html/js, product.html/js, user-manager.html, modified index/app/styles)
- `server.js`, `package.json`, `package-lock.json`, `playwright.config.ts`, `Jenkinsfile`, `README.md`
- `.github/workflows/` (pr-validation.yml, main-validation.yml)
- `.claude/` (settings.json + skills)
- `docs/obsidian-vault/` (AGENT_MEMORY.md, Inbox/Agents/, Tasks/003-005, 06 Guide, modified 00-04 + Templates)
- `md/` (DEV_TEAM_AGENT_SETUP_PLAYBOOK, NEXT_PHASE_MULTI_AGENT_ROADMAP, PAGE_LEVEL_SELF_HEALING_PATTERN, PLAN, PRODUCTION_SELF_HEALING_MULTI_AGENT_BLUEPRINT, SHARED_AGENT_SETUP_BLUEPRINT)
- Accept the 7 deletions (old `framework/page-objects/`, `framework/test-data/`, `tests/e2e/portfolio-demo*`, `md/Infestracture-Reasoning.md`, vault Tasks 001-002) — they were intentionally retired

🔴 DO NOT commit:
- `asaf-1/` — it's a separate Git repo (personal portfolio) nested inside this project. Already added to `.gitignore` on 2026-04-17.
- Anything already in `.gitignore`: `node_modules/`, `.artifacts/`, `test-results/`, `.env*`, `docs/obsidian-vault/Reports/*` (except its README).

**Gate:** `npm.cmd test` must show 24+ passing before push.
**First push:** `git push -u origin main`. Subsequent: `git push`.
**Commit strategy:** one "Slice 1 + Slice 2 complete" commit is fine, OR split by area (framework / tests / docs / CI) — Codex's call.

### Last session stop point (2026-04-17)
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

---

## What Has Been Built (Completed Work)

### App
- `server.js` — Node.js on port 4173. Routes: `/`, `/dashboard`, `/product/:id`, `/api/health`, `/api/orders`, `/api/create-user`, `/api/product/:id`
- `public/` — index.html, dashboard.html, product.html + JS/CSS

### Framework
- `framework/pom/SelfHealingPage.ts` — abstract base with auto-recovery
- `framework/pom/HomePage.ts`, `DashboardPage.ts`, `ProductPage.ts`, `UserManagerPage.ts`
- `framework/orchestrator/IncidentRouter.ts`, `AgentRegistry.ts` ← Slice 1
- `framework/orchestrator/PolicyEngine.ts` ← Slice 2
- `framework/orchestrator/ExecutionPlanner.ts` ← Slice 2
- `framework/agents/recovery/RecoveryRouter.ts`
- `framework/agents/recovery/GenericLocatorHealer.ts`
- `framework/agents/recovery/NetworkRecoveryAgent.ts`
- `framework/agents/evidence/EvidenceCollectionAgent.ts` ← Slice 2
- `framework/agents/recovery/pageProfiles/` — home, dashboard, product, userManager profiles
- `framework/agents/diagnosis/FailureClassifier.ts`
- `framework/agents/diagnosis/ApiDiagnosisAgent.ts`
- `framework/agents/diagnosis/PatchProposalAgent.ts`
- `framework/agents/validation/PageValidationAgent.ts`
- `framework/agents/validation/contracts.ts` (home, dashboard, product, user-manager)
- `framework/fixtures/baseTest.ts` — exposes `userManagerPage` fixture
- `framework/memory/IncidentMemoryStore.ts` ← Slice 2
- `framework/reporting/scenarioArtifacts.ts`

### Tests (24 specs, all green locally)
- `tests/e2e/sanity/`, `functional/positive|negative/`, `contracts/`, `non-functional/`, `scenarios/` (13 agentic scenario specs including `orchestrated-recovery.spec.ts`, `policy-engine.spec.ts`, `execution-planner.spec.ts`, `incident-memory-and-evidence.spec.ts`, `failure-classifier-expansion.spec.ts`, and `advanced-locator-healing.spec.ts`)

### CI
- `.github/workflows/pr-validation.yml` — runs on PRs to main
- `.github/workflows/main-validation.yml` — runs on push to main
- `Jenkinsfile` — Docker validation gate

### Claude Code Skills
- `/qa-run <suite>` — run any test suite
- `/new-page <PageName>` — scaffold full self-healing page
- `/next-phase` — build orchestration slice + auto-update this file
- `/incident-note <description>` — write structured vault note

### Vault + Memory
- `docs/obsidian-vault/AGENT_MEMORY.md` — this file
- `docs/obsidian-vault/Reports/Daily|Incidents|Healing/`
- `docs/obsidian-vault/Inbox/Agents/` — handoff drop zone
- `docs/obsidian-vault/Tasks/`, `Templates/`

---

## What Is Next (Pending Work)

Slice 2 is in progress. Pick the highest-priority remaining pending item.

| Priority | Task | Owner | Status |
|---|---|---|---|
| ~~1~~ | ~~Build `IncidentRouter` + `AgentRegistry`~~ | Claude | ✅ done |
| ~~2~~ | ~~Build `UserManagerPage` end to end~~ | Claude | ✅ done |
| ~~3~~ | ~~Write `orchestrated-recovery.spec.ts` proof test~~ | Claude | ✅ done |
| ~~6a~~ | ~~Create GitHub Actions workflow files (pr + main)~~ | Claude | ✅ done |
| 6b | **Commit + push Slice 1 + approved Slice 2 scope to `origin main` at https://github.com/asaf-1/GenAI-AgenticAI-Demo** — do now that all 24+ tests are green | Codex | pending |
| ~~1~~ | ~~Build `PolicyEngine.ts` in `framework/orchestrator/` (enforces environment-safe actions)~~ | Codex | ✅ done |
| ~~2~~ | ~~Build `ExecutionPlanner.ts` in `framework/orchestrator/` (orders strategies/workers)~~ | Codex | ✅ done |
| ~~3~~ | ~~Build `framework/memory/IncidentMemoryStore.ts` (record what worked, history)~~ | Codex | ✅ done |
| ~~4~~ | ~~Add `EvidenceCollectionAgent` in `framework/agents/evidence/`~~ | Codex | ✅ done |
| ~~5~~ | ~~Expand `FailureClassifier` (auth, RBAC, modal-not-opened, route-nav, api-timeout, 5xx, empty-state, delayed-data)~~ | Codex | ✅ done |
| ~~6~~ | ~~Expand `GenericLocatorHealer` (dropdown, menu, modal, table row/action, form-field by label/placeholder/section)~~ | Codex | ✅ done |
| 7 | Repair agents: `PatchPlanner`, `PatchApplier`, `RepairVerifier` in `framework/agents/repair/` (QA/staging only) | Claude | pending |
| 8 | New pages: `OrdersPage`, `AdminPage`, `ProfilePage`, `SettingsPage` (use `/new-page` skill) | Claude | pending |
| ~~9~~ | ~~`.github/workflows/daily-regression.yml` (scheduled nightly)~~ | Codex | ✅ done |
| 10 | Set up scheduled Claude remote trigger (daily regression) | Claude | pending |

---

## How Agents Use This File

### Session start
1. Read this file
2. Read `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
3. Pick the highest-priority pending task

### Session end
1. Mark completed tasks in the table above
2. Write a note to `Reports/` subfolder
3. If handing off → drop file in `Inbox/Agents/`

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
| NarrativeEnricher calls wrong OpenAI endpoint | `framework/agents/diagnosis/NarrativeEnricher.ts` | low |
| No cross-browser coverage | `playwright.config.ts` | medium |
| No auth/session test flows | `tests/` | medium |

---

## Key File Map

| Need | Location |
|---|---|
| App server + routes | `server.js` |
| Page objects | `framework/pom/` |
| Recovery agents | `framework/agents/recovery/` |
| Diagnosis agents | `framework/agents/diagnosis/` |
| Validation contracts | `framework/agents/validation/contracts.ts` |
| Full roadmap | `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` |
| This memory file | `docs/obsidian-vault/AGENT_MEMORY.md` |
