# Handoff: Slice 2 Runtime + Push + CI Follow-up

**From:** Codex  
**To:** Claude  
**Date:** 2026-04-17  
**Repo state:** approved Slice 2 scope is complete, validated, committed, pushed, and followed by a GitHub Actions startup fix on `main`.

## What was done

- Completed the remaining approved Slice 2 runtime work:
  - `framework/orchestrator/ExecutionPlanner.ts`
  - `framework/memory/IncidentMemoryStore.ts`
  - `framework/agents/evidence/EvidenceCollectionAgent.ts`
  - broader `FailureClassifier.ts`
  - broader `GenericLocatorHealer.ts`
- Wired `IncidentRouter.ts` into the full deterministic flow:
  - classify
  - collect evidence
  - evaluate policy
  - build execution plan
  - recover with planned strategies only
  - validate
  - record incident memory
- Expanded `User Manager` with real dropdown, bulk-actions menu, modal, invite field, and row-action surfaces so the broader locator-healing branches are exercised against live DOM.
- Added the missing scheduled GitHub Actions workflow:
  - `.github/workflows/daily-regression.yml`
  - fixed `05:00 UTC`
  - runs `npm run test:e2e`
  - uploads artifact-only regression output
- Updated docs and memory to reflect the new workflow, suite size, and push target.
- Replaced `origin` from the unrelated `AI-Agentic-Project` remote to:
  - `https://github.com/asaf-1/GenAI-AgenticAI-Demo.git`
- Committed and pushed:
  - `60d270d` `Complete Slice 1 and approved Slice 2 orchestration`
  - `075cc0a` `Document Slice 2 push completion`
- Fixed the first GitHub Actions failure after push:
  - root cause: workflows manually started `server.js` and then waited on `/api/health`, while `playwright.config.ts` already defines `webServer`
  - fix: removed manual `Start server` and `Wait for server` steps from `pr-validation.yml`, `main-validation.yml`, and `daily-regression.yml`
  - result: GitHub Actions now uses the same Playwright-managed server lifecycle as local test execution
- Committed and pushed the CI follow-up:
  - `1ab9fff` `Fix GitHub Actions Playwright server startup`
- Added manual dispatch support for latest-main validation:
  - `main-validation.yml` now includes `workflow_dispatch`
  - this avoids relying on rerun-job for old failed workflow revisions when the user wants to validate current `main`

## What to do next

- Remaining roadmap items in `AGENT_MEMORY.md` are now:
  - repair agents: `PatchPlanner`, `PatchApplier`, `RepairVerifier`
  - new pages: `OrdersPage`, `AdminPage`, `ProfilePage`, `SettingsPage`
  - scheduled Claude remote trigger for daily regression
- Keep the intentional-bug selectors intact in the self-healing specs.
- Keep `/api/create-user` untouched and preserve the `managedUsers` vs `createdUsers` split.

## Files changed

- Orchestrator and memory:
  - `framework/orchestrator/ExecutionPlanner.ts`
  - `framework/orchestrator/IncidentRouter.ts`
  - `framework/orchestrator/AgentRegistry.ts`
  - `framework/memory/IncidentMemoryStore.ts`
- Evidence, diagnosis, and recovery:
  - `framework/agents/evidence/EvidenceCollectionAgent.ts`
  - `framework/agents/diagnosis/FailureClassifier.ts`
  - `framework/agents/diagnosis/PatchProposalAgent.ts`
  - `framework/agents/recovery/GenericLocatorHealer.ts`
  - `framework/agents/recovery/types.ts`
- App and tests:
  - `public/user-manager.html`
  - `public/user-manager.js`
  - `tests/e2e/scenarios/execution-planner.spec.ts`
  - `tests/e2e/scenarios/incident-memory-and-evidence.spec.ts`
  - `tests/e2e/scenarios/failure-classifier-expansion.spec.ts`
  - `tests/e2e/scenarios/advanced-locator-healing.spec.ts`
  - updated `tests/e2e/scenarios/orchestrated-recovery.spec.ts`
- CI and docs:
  - `.github/workflows/daily-regression.yml`
  - `.github/workflows/main-validation.yml`
  - `.github/workflows/pr-validation.yml`
  - `docs/obsidian-vault/AGENT_MEMORY.md`
  - `docs/obsidian-vault/02 Test Map.md`
  - `docs/obsidian-vault/04 Daily Regression Automation.md`
  - `README.md`

## Tests to run

```powershell
npm.cmd test
docker build -t ai-agentic-project-prepush .
```

GitHub follow-up:

```text
Watch the next Actions runs for:
- Main Branch Validation
- Daily Regression

Manual run guidance:

```text
Use "Run workflow" on the latest main branch.
Do not rely on "Re-run jobs" for an old failed commit when validating the fixed workflow.
```
```
