---
type: map-of-content
tags: [agents, framework, self-healing, orchestration, roster, moc]
created: 2026-06-08
---

# 10 Agent Roster

> Canonical map of every agent and orchestrator in the framework: what it does, its inputs/outputs, and its vault touchpoint. This note consolidates the agent tables previously triplicated across [[03 Agent and Obsidian Workflow]], [[06 Agents Playground Guide]], and the portable `md/` guides. For where these pieces sit in the wider system see [[07 Architecture Overview]]; for which ones touch the vault and how safely, see [[08 Vault Dependency Map]]; for the suites that exercise them, see [[02 Test Map]]. Entry point: [[00 Home]].

Two distinct agent families live in this repo:

- The **framework self-healing engine** under `framework/` — deterministic TypeScript classes orchestrated at runtime inside Playwright. Sections 1–5 below.
- The **five Playwright/Claude agents** under `.claude/agents/` — Markdown agent definitions driven by a harness through the `playwright-test` MCP server. Section 6.

Dependency posture in one line: the engine is vault-**independent** and writes only to `.artifacts/`; the persistence/reporting sinks (section 4) are the only engine pieces that touch `obsidian-vault/`, and every one of them is mkdir-guarded or tolerant so it cannot break a CI gate. (The only HARD vault dependency in the repo lives in a test, not an agent — see [[08 Vault Dependency Map]].)

## 1. Orchestration spine

The spine is wired in `framework/orchestrator/IncidentRouter.ts`. One `route()` call drives the full chain: classify, pick the agent chain, collect evidence, evaluate policy, plan execution, attempt recovery + validation, attempt the QA/staging repair sandbox, then persist. All sink writes are best-effort.

| Stage | File | Input | Output |
| --- | --- | --- | --- |
| **IncidentRouter** | `framework/orchestrator/IncidentRouter.ts` | `IncidentRouterRequest` (page, failureEvidence, scenario, strategies, optional contract/apiRoute/environment) | `IncidentResult` with `finalStatus` of `mitigated` / `escalate` / `unresolved` |
| **FailureClassifier** | `framework/agents/diagnosis/FailureClassifier.ts:11` | `FailureSignalInput` (error message, status, render/network/locator signals) | `FailureClassification` — one of **14 categories** + `confidence` + `signals` |
| **AgentRegistry** | `framework/orchestrator/AgentRegistry.ts:93` | a `FailureCategory` | `AgentChain` — ordered `AgentStep[]`, `autoMitigationEligible`, description |
| **PolicyEngine** | `framework/orchestrator/PolicyEngine.ts:303` | classification + environment + requested strategies | `PolicyStrategyPlan` — per-strategy allow / approval-required / deny across qa/staging/production matrices |
| **ExecutionPlanner** | `framework/orchestrator/ExecutionPlanner.ts:74` | agent chain + classification + policy plan | `ExecutionPlan` — `canAttemptRecovery`, ordered strategies, kept agent steps, `escalationReason` |

`FailureClassifier` is the taxonomy authority: the 14 categories are `api-client-error`, `api-contract-drift`, `api-server-error`, `api-timeout`, `auth-or-session`, `permissions-or-rbac`, `ui-contract-or-render`, `ui-delayed-data`, `ui-empty-state`, `ui-loading-or-network`, `ui-missing-locator`, `ui-modal-not-opened`, `ui-route-or-navigation`, and `unknown`. Only `ui-*` chains are `autoMitigationEligible`; the API/auth/RBAC chains are diagnosis-only and escalate after evidence capture.

## 2. Recovery agents

All vault-independent; the only persistence is the `.artifacts/incidents/` evidence written separately by the EvidenceCollectionAgent. These act on a live `Page` and never write to the vault.

| Agent | File | Role | Output |
| --- | --- | --- | --- |
| **RecoveryRouter** | `framework/agents/recovery/RecoveryRouter.ts:13` | Runs the planned strategies in order against the page, stopping at first success | `RecoveryRouterResult` (`finalStatus: recovered \| failed`, `strategyUsed`, per-attempt log) |
| **GenericLocatorHealer** | `framework/agents/recovery/GenericLocatorHealer.ts:126` | Scores all visible candidates of a target type against intent/label/section/row/semantic signals, then acts on the top one | `LocatorHealResult` (selected + top-3 candidates, performed action) |
| **SelectorHealer** | `framework/agents/recovery/SelectorHealer.ts:46` | Thin compatibility wrapper over GenericLocatorHealer for the original button-healing demo | `HealResult` (selected/top candidates) |
| **NetworkRecoveryAgent** | `framework/agents/recovery/NetworkRecoveryAgent.ts:67` | Compatibility wrapper for the flaky-orders demo; tracks in-flight `/api/orders` requests via `OrdersRequestTracker` and routes extend-wait vs refresh-and-retry | `RecoveryResult` (strategy, final row count, evidence) |
| **pageProfiles** | `framework/agents/recovery/pageProfiles/*.ts` | Per-page locator/intent/contract config (home, dashboard, product, orders, login, profile, settings, admin, user-manager) consumed by the healers and POM | static profile objects |

Recovery strategy kinds: `locator-heal`, `extend-wait`, `refresh-and-retry`, `contract-recheck`.

## 3. Validation + repair

| Agent | File | Role | Output / sink |
| --- | --- | --- | --- |
| **PageValidationAgent** | `framework/agents/validation/PageValidationAgent.ts:25` | Validates a live page against a `PageContract` (required testids/headings/roles/text, forbidden tokens, finite numeric fields, no overlap) | `ContractValidationResult` (`valid`, issues, evidence) |
| **contracts** | `framework/agents/validation/contracts.ts` | The reusable `PageContract` definitions (home/dashboard/product, etc.) | static contracts |
| **PatchProposalAgent** | `framework/agents/diagnosis/PatchProposalAgent.ts` | Maps a classification to a deterministic, **proposal-only** fix direction: likely file targets, fix area, validation plan | `PatchProposal` (advisory; no code is edited) |
| **PatchPlanner** | `framework/agents/repair/PatchPlanner.ts:10` | Turns a proposal into a permitted/blocked plan; blocks production, low-confidence, and high-risk categories | `PatchPlan` (`permitted`, steps, `approvalRequired`, risk level) |
| **PatchApplier** | `framework/agents/repair/PatchApplier.ts:7` | Writes the permitted plan to a **sandbox JSON** only — never edits source | `.artifacts/patches/<incidentId>/patch-plan.json` |
| **RepairVerifier** | `framework/agents/repair/RepairVerifier.ts:4` | Re-validates the contract after an applied plan | `RepairVerificationResult` (`passed`, reason) |
| **ApiDiagnosisAgent** | `framework/agents/diagnosis/ApiDiagnosisAgent.ts:38` | Read-only RCA for API failures: parses response, extracts the field-type root cause, attaches a proposal | `ApiDiagnosisResult` (rootCause, suggestion, proposal) |
| **EvidenceCollectionAgent** | `framework/agents/evidence/EvidenceCollectionAgent.ts:24` | Captures title, DOM, page snapshot, and screenshot before mitigation mutates state | `.artifacts/incidents/<scenario>/<incidentId>/` (evidence.json, dom.html, page.png) |

Repair is sandbox-only by design: `PatchApplier` writes a plan artifact, it does **not** auto-edit code (per the constraints in [[01 Project Map]]).

## 4. Persistence / reporting sinks (SOFT vault)

These are the only engine components that write into `obsidian-vault/`. Every one is mkdir-guarded or tolerant, so a missing directory degrades gracefully instead of failing a gate — see [[08 Vault Dependency Map]] for the full SOFT/HARD breakdown.

| Sink | File | Vault path | Safety guard |
| --- | --- | --- | --- |
| **IncidentRouter report** | `IncidentRouter.ts:207` `writeIncidentReport` | `obsidian-vault/Reports/Incidents/<date>-<scenario>.json` | `mkdir` + `try/catch` (comment: "report write failure should not fail the test") |
| **IncidentMemoryStore** | `framework/memory/IncidentMemoryStore.ts:31` | `obsidian-vault/Reports/Incidents/incident-memory.json` | `mkdir` before write; `readAll()` catches and returns `[]` |
| **ObsidianMemoryAgent** | `framework/agents/obsidian/ObsidianMemoryAgent.ts:81` | `Reports/Healing/` (healing runs), `Reports/Workspace/` (state handoff), and task-note `## Result` sections | `writeHealingRunLog`/`writeWorkspaceStateLog` are mkdir-guarded; `updateTaskResult` does a **no-fallback** `fs.readFile` (line 108) — this is the seam the HARD real-agent-proof test drives |
| **ObsidianCloseoutAgent** | `framework/agents/obsidian/ObsidianCloseoutAgent.ts:1` | none directly — input is `git status --short`; references vault note **paths as strings** and delegates report writes to ObsidianMemoryAgent | reads git status, classifies changed files, blocks closeout on missing required docs |
| **LocalBugStoreAdapter** | `framework/agents/reporting/LocalBugStoreAdapter.ts:7` | `obsidian-vault/Reports/Bug Reports/` (injectable `rootDir`) | `mkdir` + injectable root for test isolation |
| **BugReportingAgent** | `framework/agents/reporting/BugReportingAgent.ts:1` | via LocalBugStoreAdapter; confirmation artifacts under `.artifacts/bug-reports/` | confirms a defect from scenario artifacts or a manual check, then records it locally only |

`obsidian-vault/Reports/` is gitignored, so a clean checkout has no `Reports/` subtree — these guards are why that is safe. The `bug-report` and `incident-note` skills are the operator-facing front doors to BugReportingAgent and the incident sinks respectively.

## 5. LLM layer (opt-in, disabled by default)

The framework ships a **bounded** real-LLM proof. It is disabled unless explicitly turned on, and even when on it defaults to advisory `report-only` mode rather than acting on the page. For model selection, pricing, and parameters, consult the `claude-api` reference rather than memory.

| Component | File | Gating | Notes |
| --- | --- | --- | --- |
| **SelfHealingLlmAgent** | `framework/agents/llm/SelfHealingLlmAgent.ts:132` | Mode resolves from `REAL_LLM_AGENT_MODE`, else `disabled` unless `REAL_LLM_AGENT_BACKEND=openai` (then `report-only`) | Bounded: picks at most one candidate from a supplied allowlist; min-confidence 0.7; fails safe to `disabled`/`failed` |
| **OpenAiSelfHealingProvider** | `framework/agents/llm/OpenAiSelfHealingProvider.ts:84` | Requires a real `OPENAI_API_KEY`; rejects placeholder keys | Calls the OpenAI Responses API with a strict JSON schema; `store: false` |
| **NarrativeEnricher** | `framework/agents/diagnosis/NarrativeEnricher.ts:23` | No `OPENAI_API_KEY` -> returns the deterministic text unchanged | Optional 2–3 sentence rewrite; any failure falls back to deterministic |

> **Placeholder model id:** both the provider and the enricher default to `OPENAI_MODEL || "gpt-5.4-mini"` (`OpenAiSelfHealingProvider.ts:95`, `NarrativeEnricher.ts:34`). `gpt-5.4-mini` is a **placeholder string, not a real model id** — it exists so the offline default path is obvious and never accidentally bills a real endpoint. Default regression stays fully offline; only `RUN_LIVE_OPENAI_AGENT_TEST=true` plus a real key exercises a live call.

## 6. The five Playwright / Claude agents

These are Markdown agent definitions in `.claude/agents/`, addressable from any Claude Code / VS Code / OpenCode harness through the `playwright-test` MCP server declared in `.mcp.json`. They fix **tests, never the app**.

| Agent | File | Origin | Role |
| --- | --- | --- | --- |
| planner | `.claude/agents/playwright-test-planner.md` | official | Explores the app, writes a plan to `specs/` |
| generator | `.claude/agents/playwright-test-generator.md` | official | Turns one plan item into a spec under `tests/e2e/generated/` |
| healer | `.claude/agents/playwright-test-healer.md` | official | Runs tests, root-causes drift, rewrites the broken **test** |
| diagnostician | `.claude/agents/playwright-test-diagnostician.md` | custom | Read-only RCA: gathers evidence, classifies against the 14-category taxonomy, verdict **HEAL vs REPORT** |
| reporter | `.claude/agents/playwright-test-reporter.md` | custom | On REPORT, persists a local bug record + an Obsidian incident/healing note |

Pipeline: `plan -> generate -> run -> diagnose -> (heal | report)`. Drift heals; by-design defects (the intentional RBAC over-permission and broken-product demo defects) get **reported**, never papered over. Full definitions and the workspace-agnostic adoption variant live in `.claude/agents/` and `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`.

## Canonical source note

**Agent definitions live HERE.** [[03 Agent and Obsidian Workflow]] and [[06 Agents Playground Guide]] describe the operating model and the operator walkthrough respectively; when they need to enumerate agents they should **link to this note** rather than re-listing the roster, so there is a single place to update when an agent is added, renamed, or re-scoped. The portable `md/` guides remain the export-for-another-repo copy and are expected to lag.

## Related

- [[07 Architecture Overview]] — where these agents sit in the runtime + CI picture
- [[08 Vault Dependency Map]] — HARD vs SOFT vs NONE per component
- [[02 Test Map]] — the suites that exercise each agent
- [[00 Home]] — vault entry point
