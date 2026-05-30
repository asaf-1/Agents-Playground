# Handoff: Slice 1 → Slice 2 (Multi-Agent Orchestration)

**From:** Claude (Opus 4.7)
**To:** Codex
**Date:** 2026-04-17
**Repo state:** 15/15 tests green, no pending edits, working tree dirty (uncommitted Slice 1 work).

---

## What was done (Slice 1 — complete)

- Built `framework/orchestrator/IncidentRouter.ts` and `AgentRegistry.ts`.
- Built `framework/pom/UserManagerPage.ts` + `framework/agents/recovery/pageProfiles/userManagerProfile.ts` + `userManagerPageContract` in `framework/agents/validation/contracts.ts`.
- Added `userManagerPage` fixture in `framework/fixtures/baseTest.ts`.
- Added `/user-manager`, `GET /api/users`, `POST /api/users`, `POST /api/test/reset-users` routes in `server.js`.
- Built `public/user-manager.html`.
- Wrote `tests/e2e/scenarios/orchestrated-recovery.spec.ts` — proves one stale-locator failure is classified, healed via `locator-heal`, and validated through the multi-agent chain.
- Added `.github/workflows/pr-validation.yml` + `main-validation.yml`.

### Bugs fixed at session end
- **State pollution between `/api/create-user` and `/api/users`.** Split `runtimeState` into `createdUsers` and `managedUsers` so functional tests don't pollute the User Manager table with `undefined` rows.
- **Contract mismatch on User Manager.** Added visible `<label>Search</label>` so `requiredTextTokens: ["Search"]` matches live DOM.
- **Test isolation.** Orchestrated-recovery spec now calls `/api/test/reset-users` on setup and dismisses dialogs to prevent healed-click side-effects from persisting.

---

## What to do next (Slice 2 — pending)

Read in this order:
1. `obsidian-vault/AGENT_MEMORY.md` — pending task table
2. `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` sections 2–7
3. `md/PRODUCTION_SELF_HEALING_MULTI_AGENT_BLUEPRINT.md` — target architecture

Priority order (see AGENT_MEMORY.md "What Is Next" table):
1. `framework/orchestrator/PolicyEngine.ts` — enforces environment-safe actions
2. `framework/orchestrator/ExecutionPlanner.ts` — orders strategies/workers
3. `framework/memory/IncidentMemoryStore.ts` — record what worked, history
4. `framework/agents/evidence/EvidenceCollectionAgent.ts`
5. Expand `FailureClassifier` (auth, RBAC, modal-not-opened, route-nav, api-timeout, 5xx, empty-state, delayed-data)
6. Expand `GenericLocatorHealer` (dropdown, menu, modal, table row/action, form-field by label/placeholder/section)
7. Repair agents in `framework/agents/repair/`: `PatchPlanner`, `PatchApplier`, `RepairVerifier` (QA/staging only)
8. New pages: `OrdersPage`, `AdminPage`, `ProfilePage`, `SettingsPage` (use `/new-page` skill if on Claude)
9. `.github/workflows/daily-regression.yml`

### Reference patterns to mirror
- New orchestrator files → follow shape of `framework/orchestrator/IncidentRouter.ts` + `AgentRegistry.ts`
- New classifications → extend `framework/agents/diagnosis/FailureClassifier.ts`
- New healing strategies → extend `framework/agents/recovery/GenericLocatorHealer.ts` and `RecoveryRouter.ts`

---

## Files changed this session

- `server.js` (split runtime state, add `/api/test/reset-users`)
- `public/user-manager.html` (add `<label>Search</label>`)
- `tests/e2e/scenarios/orchestrated-recovery.spec.ts` (reset + dialog dismiss)
- `obsidian-vault/AGENT_MEMORY.md` (Slice 1 ✅, Slice 2 pending table)
- `obsidian-vault/Inbox/Agents/2026-04-17-handoff-claude-to-codex.md` (this file)

(plus all previously uncommitted Slice 1 artifacts already in working tree)

---

## Tests to run after each Slice 2 step

```
npm.cmd test
```

All 15 specs must stay green. Key invariant: the 8 intentional-bug tests must still heal through their bugs (not bypass them). Verify via `.artifacts/scenarios/<name>/report.json` — look for `recovered: true` + `strategyUsed: "locator-heal"`.

---

## Rules

- Do not remove intentional-bug selectors from tests.
- Do not touch `/api/create-user` — it serves positive/negative functional tests.
- Keep the deterministic classifier/heal behavior; Slice 2 adds breadth, not LLM magic.
- Update `AGENT_MEMORY.md` when each pending item lands.
