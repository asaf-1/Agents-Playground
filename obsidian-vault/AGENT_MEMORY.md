# Agent Shared Memory

> Single source of truth for all agents (Claude, Codex, or any future agent) working in this workspace.
> Every agent MUST read this file at session start and update it when work completes.
> Plain Markdown — tracked by Git.

---

## Current State (2026-06-27)

- **Active slice:** GitHub-first CI automation + Obsidian **second-brain** consolidation.
- **Tests:** 143 Playwright (141 passed / 2 opt-in skipped) + 4 Vitest component/unit. Older counts in the stop-points below (`41/41`, `49`, `62`) are HISTORICAL.
- **CI:** GitHub-first; **Jenkins is OUT OF SCOPE**. App image runs on `node:24`; host PR validation and post-merge canary runners now run on Node 24 too (lifted from the earlier Node 20 pin on 2026-06-27 after the Playwright 1.61.1 upgrade resolved the 1.59 browser-install stall; app and CI runner Node versions remain independent).
- **Playwright 1.61.1 + Node-pin lift (2026-06-27):** upgraded `@playwright/test` and `playwright` to `1.61.1` (the standalone `playwright`, imported by `BugReportingAgent`, now lives in `devDependencies`). Host CI moved 20 → 24. The QA Docker runner image (`Dockerfile.e2e`) was bumped to `v1.61.1-noble` (digest `sha256:5b8f294a…`) so `main-validation`'s containerized full regression matches the toolchain and is green again. This is a runner-image version bump only — the `preMerge`/`postMerge` `dockerEnabled` flags remain `false`, so Docker stays disabled for pre-merge and the canary.
- **React /app surface (2026-06-27):** added a Vite 8 + React 19 + TypeScript SPA at `/app` (Orders, Users, Products + 48-item catalog/detail, Account) using React Router 7, TanStack Query 5, React Hook Form 7 + Zod 4, and Radix UI; built to `public/app` and served by `server.js` with a client-side routing fallback. Added an OpenAPI 3.1 spec (`openapi.json`) at `/api/openapi.json` + Swagger UI at `/api/docs`. Testing: Playwright `tests/e2e/app/` specs, axe a11y, ajv OpenAPI contract tests, and Vitest + Testing Library + MSW component tests (`web/src/**/*.test.tsx`). All frontend deps are `devDependencies`. Seven new flag-armed `/app` defects (off by default, per-`runKey`) are catalogued in `docs/react-surface-defects.md` (one HEAL, six REPORT). Suite scaled (134 → 143) to justify sharding + workers.
- **Sharded CI gates (2026-06-27):** `pr-validation` (pre-merge) and `main-validation` (post-merge) run the full Playwright suite as **4 shards × 4 workers**. pr-validation is host-sharded (`format` job + 4-shard matrix + a `Pre-Merge Gate` aggregation job that stays the single required check, plus a merged HTML report); main-validation is containerized-sharded (4 shard jobs in the GHCR `:main` runner + a `report` job). The manual `parallelism-experiment.yml` was removed.
- **Branch policy (2026-06-27):** work on feature branches, push through the local Playwright hook, open a PR, pass `PR Validation / Pre-Merge Gate`, attest current-head Codex/Claude review through `AI Review Gate`, then merge. Root `pipeline.config.json` currently disables Docker for both stages while retaining full host Playwright pre-merge and health/sanity/contract canary checks post-merge. Set the relevant `dockerEnabled` flag to `true` to restore Docker for that stage. Native private-repo branch protection is unavailable on the current GitHub plan.
- **AI infrastructure runbook (2026-06-27):** `docs/ai-infrastructure-runbook.md` is the executable catalog for hooks, workflows, policy flags, skills, agents, validation, failure recovery, and cross-tool AI operation.
- **Hook portability (2026-06-27):** the Node pre-push fallback selects `npm`/`docker` on non-Windows and `npm.cmd`/`docker.exe` on Windows; Linux/macOS agents no longer receive Windows-only command names.
- **Remote test runner (2026-08-28):** added an outsourced test runner so a suite can be started with no local Node, browsers, or checkout. `scripts/test-runner/discover-flows.js` asks Playwright for the test tree and writes `scripts/test-runner/flow-catalog.json` (committed); `.github/workflows/flow-catalog.yml` regenerates and commits it on every push to `main` that touches `tests/`, `web/src/`, the Playwright configs, or `scripts/test-runner/`, so a pushed spec becomes a runnable flow with no UI or workflow edit. Three flow tiers: curated **groups** (`group-sanity`, `group-regression`, from `flow-groups.json`), one per **spec file** (`spec-app-react-orders`), one per top-level **describe** (`suite-scenarios-rbac-rbac`, escaped `--grep`). `.github/workflows/remote-test-runner.yml` is the runner (plan → sharded matrix → merged report) and accepts `workflow_dispatch`, `repository_dispatch` (`remote-test-run`), and `workflow_call`. Surfaces: the page at `/app/test-runner` (backed by `/api/test-runner/*` in `scripts/test-runner/server-api.js`), `npm run test:remote`, the Actions UI, and any external caller. Detail in `docs/remote-test-runner.md`.
- **Test runner is TWO separate things (2026-08-28):** (1) the PIPELINE — `.github/workflows/remote-test-runner.yml` plus `scripts/test-runner/` — and (2) `test-runner/`, a STANDALONE web app with its own server, UI, login/sign-up, and Dockerfile. The standalone app is NOT a page in the demo website and shares no code, port, or process with `server.js`. `server.js` is the app UNDER TEST; `test-runner/` is what fires tests at it. An earlier attempt built the runner as `/app/test-runner` inside the demo app; that was wrong and was fully reverted — do not reintroduce it.
- **Test runner access model (2026-08-28):** colleagues sign up (invite code by default) or sign in on the standalone app and can then run any catalogued flow as often as they like. They get NO GitHub account, NO repo access, NO pipeline access: the token lives server-side in `test-runner/` and never reaches the browser. This is why runs are brokered by that app rather than by handing people the Actions UI or `repository_dispatch`, both of which require repo write. Sign-up modes via `TR_SIGNUP_MODE`: `invite` (default, needs `TR_INVITE_CODE`), `open`, `off`. First account created becomes admin. Passwords are salted scrypt hashes; sessions are in-memory httpOnly + SameSite=Strict cookies. `/api/flows` requires a login too, because flow entries name internal spec paths. Config is documented in `test-runner/.env.example` and `test-runner/README.md`.
- **Standalone runner has zero dependencies (2026-08-28):** no npm packages, no React, no build step — bare `node server.js`. It fetches the flow catalog through the GitHub API (`TR_CATALOG_PATH`, 60s cache) instead of reading a checkout, so it needs no copy of the repo and picks up newly pushed specs on its own. It must never import from `server.js`, `web/`, or `scripts/`.
- **CI cannot push workflow files (2026-08-28):** the default `GITHUB_TOKEN` is refused with "refusing to allow a GitHub App to create or update workflow ... without `workflows` permission", and that permission CANNOT be granted to it. So no workflow may regenerate and commit another workflow file. An earlier design had `flow-catalog.yml` regenerate a `flow` choice dropdown inside `remote-test-runner.yml`; it failed on the very first real run and was removed. `flow` is now a free-text input validated by the plan job, `sync-workflow-inputs.js` was deleted, and `flow-catalog.yml` commits ONLY `scripts/test-runner/flow-catalog.json`.
- **First real pipeline run (2026-08-28):** PR #14 merged as `d33306b`; run 33163908029 (`group-sanity`) succeeded — Plan → test → Report, 1m21s — and produced the `remote-test-results` artifact. Catalog is **63 flows / 142 E2E tests**; an earlier 67/157 figure was a STALE catalog committed before regenerating after specs were deleted. Always regenerate and re-run `flows:check` AFTER changing the test set. `run-name` now titles each run after the flow and the actor, because GitHub otherwise titles runs after the workflow or the commit message, which made the runner's history read like a commit log rather than a test history.
- **Test runner safety model (2026-08-28):** `resolve-flow.js` is the single trust boundary — it validates every caller-supplied value against the committed catalog and the `normalize*` rules in `catalog.js`, and `exec-flow.js` only replays the resolved plan. Runners are spawned with `shell:false` against the local CLI entrypoints (`node node_modules/@playwright/test/cli.js`), because Node refuses to spawn the `npx.cmd` shim without a shell and enabling one would reintroduce an injection surface. Workflow inputs and `client_payload` values travel through `env:` blocks, never interpolated into `run:` scripts. `remote-test-runner.yml` holds `contents: read`; only `flow-catalog.yml` holds `contents: write`, and only to commit one file. The GitHub token stays server-side and is never sent to the browser.
- **Test runner gotchas (2026-08-28):** Playwright rejects `--browser` once a config defines projects, so browser choice travels as `PLAYWRIGHT_BROWSER` and `playwright.config.ts` reads it into `use.browserName` (Chrome channel now applies only to chromium). `PLAYWRIGHT_EXTERNAL_TARGET=true` suppresses the config's `webServer` block so a run against a deployed `target_url` does not build and boot an unused local app. `flow-catalog.json` is in `.prettierignore` (Prettier collapses short arrays, the generator does not, so formatting it would put `format:check` and the discovery job in a loop) and deliberately carries no timestamp or commit SHA (a volatile field would diff on every push). File filters and `--grep` do **not** filter out dependency projects, so per-spec and per-describe flows keep the `setup` project's `storageState` mint.
- **Intentional defects (do NOT "fix"):** RBAC editor-delete (`server.js:587-616`), broken product state (`server.js:448-473`), shared password `demo1234`, open `/api/test/*` hooks.

### Canonical sources — link, don't re-duplicate detail here

| Topic                              | Canonical note                   |
| ---------------------------------- | -------------------------------- |
| Architecture / big picture         | [[07 Architecture Overview]]     |
| What breaks without the vault      | [[08 Vault Dependency Map]]      |
| Infrastructure / CI / merge policy | [[09 Infrastructure and CI Map]] |
| Agents / orchestrator              | [[10 Agent Roster]]              |
| Code layout                        | [[01 Project Map]]               |
| Test inventory                     | [[02 Test Map]]                  |
| Index / front door                 | [[00 Home]]                      |

**Summarization policy:** keep this file lean — periodically fold old stop-points into a `Snapshots/` note (see `Snapshots/README`) and let the canonical notes above hold the detail.

---

## Project Identity

- **Name:** Agents-Playground (formerly GenAI+AgenticAI Demo; `package.json` name `agents-playground`)
- **Type:** Self-healing Playwright QA framework + Node.js demo app
- **Repo:** https://github.com/asaf-1/Agents-Playground (private; renamed from `GenAI-AgenticAI-Demo`)
- **Local path:** `C:\Users\asafn\Desktop\Agents-Playground`
- **App URL (local):** `http://localhost:4173`
- **Stack:** Node.js, Playwright, TypeScript
- **Vault location:** the vault now lives at the **repo-root** `obsidian-vault/` (moved from `docs/obsidian-vault/`). Open the **repo root** as the Obsidian vault.

---

## Current Phase

**Phase:** Agents-Playground expansion — Auth (Phase 1) + RBAC (Phase 3) + 5-agent Playwright roster SHIPPED and verified (2026-05-30)
**Status:** The project is renamed to **Agents-Playground** and the vault moved to the repo-root `obsidian-vault/`. Three expansion tracks shipped and are verified at `62` tests total (`60` passed / `2` skipped):

- **5-agent roster** in `.claude/agents/`, addressable from a Claude Code / VS Code / OpenCode harness via the `playwright-test` MCP server in `.mcp.json`: `playwright-test-planner` (official, explores app → writes plan to `specs/`), `playwright-test-generator` (official, plan item → spec under `tests/e2e/generated/`), `playwright-test-healer` (official, runs tests → root-causes → rewrites the broken TEST), `playwright-test-diagnostician` (NEW, custom — read-only RCA: evidence + classify via the 14-category FailureClassifier taxonomy → verdict HEAL vs REPORT), `playwright-test-reporter` (NEW, custom — persists a local bug record + Obsidian incident/healing note). Pipeline: planner → generator → run → diagnostician → (heal | report). Agents fix TESTS, never the app; drift heals, by-design defects get reported.
- **Phase 1 (auth + session):** cookie-based sessions (opaque `sid`, HttpOnly); `/login` page (`public/login.html` + `login.js`); shared `public/auth-guard.js` on protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) redirecting to `/login` only when the `authRequired` flag is armed (default OFF, so existing tests stay green); real `storageState` via setup/authenticated/default Playwright `projects[]` split (`tests/e2e/auth.setup.ts` mints an Admin session → `.artifacts/auth/admin.json`); LoginPage POM + `loginPageProfile` + `loginPageContract` + `baseTest` `loginPage` fixture; `tests/e2e/scenarios/auth-session.spec.ts` (4 tests). New endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/session`, `POST /api/test/set-session`. `seededUsers` gained `@demo.local` emails (password `demo1234`; Carol inactive).
- **Phase 3 (RBAC):** `ROLE_PERMISSIONS` (Admin/Editor/Viewer); gated `POST /api/users` + new `PATCH/DELETE /api/users/:id` (the DELETE carries an INTENTIONAL over-permission DEFECT, `rbacBug=editor-delete` → wrong `200`, as the reporter's target); `GET /api/admin/audit` (401/403/200); `GET /api/users` applies `editsByUserId` + `deletedManagedUserIds` overlays; `/admin` REWRITTEN from inline-static to fetch-driven (`public/admin.js` hitting `/api/admin/audit`, preserving testids + clearLog→0 + contract); `tests/e2e/scenarios/rbac.spec.ts` (5 tests incl. the defect, serial).
- **Drift control:** a per-`runKey` flag store (`GET/POST/DELETE /api/test/flags`; `FLAG_DEFAULTS` + `FLAG_CATALOG`: `ctaMode`/`ordersMode`/`productState`/`createUserPhoneType` plus new `authRequired`/`sessionExpired`/`loginSubmitLabel`/`rbacEnforce`/`adminGate`/`rbacBug`). Split reset hooks: `resetData()` (user data only, PARALLEL-SAFE, used by `POST /api/test/reset-users`) vs `resetAll()` (+ flaky markers + order counter + sessions + flags; `POST /api/test/reset`, seed/setup only).
- Both previously-dark FailureClassifier categories (`auth-or-session`, `permissions-or-rbac`) are now LIT.
  Default regression stays deterministic and offline; the live OpenAI self-healing smoke remains skipped unless `RUN_LIVE_OPENAI_AGENT_TEST=true` and `OPENAI_API_KEY` are set.
  **Next:** Phase 2 (a `/lab` control-panel GUI) and Phase 4 (richer flows: orders-explorer, create-order wizard) are DESIGNED but DEFERRED. Other remaining follow-ups are cross-browser coverage, deciding whether to add a future Jira adapter on top of the local tracker boundary, and optionally running the live OpenAI smoke with a real key. LM Studio remains deferred.

**New docs (2026-05-30, at repo root — NOT in the vault):** `md/PORTABLE_AGENT_ADOPTION_GUIDE.md` (workspace-agnostic adoption guide: terminology, installation, seed, storageState, flag store, RBAC, full agent defs), `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md` (this-repo plan), `md/PLAYGROUND_EXPANSION_DESIGN.md` (the auth/RBAC/drift/flows design + guardrails).

**Historical rollout note (2026-06-08; superseded by the current policy above):** The first GitHub-first design left Jenkins out of scope, kept Claude review advisory/free-first, and ran the post-merge canary through Docker. The implemented flow now requires exact-head AI review evidence and follows `pipeline.config.json` for host or Docker execution.

**CSS polish update (2026-06-08):** Completed `obsidian-vault/Tasks/010 CSS Polish.md` and moved `docs/css-polish-plan.md` from parked plan to implementation note. The change is CSS-only in `public/styles.css`: shared visual tokens, page-shell/card polish, focus rings, form and button states, table/status treatments, reduced-motion handling, and specificity bridges for legacy page-local style blocks. No DOM hooks, text, IDs, roles, or `data-testid` values changed; `.product-layout--broken` geometry remains test-compatible. Validation passed: focused UI coverage 19/19, full `npm.cmd run test:e2e` 60 passed / 2 skipped, screenshots captured under `.artifacts/css-polish/`.

**Formatting baseline (2026-06-27):** Prettier is installed as a root dev dependency with `npm run format:check` and `npm run format`. A repo-wide Prettier pass was applied after install. Validation passed: `npm.cmd run format:check` and full `npm.cmd run test:e2e` (`60` passed / `2` skipped).

**Senior leader agent (2026-06-27):** Added `.claude/agents/playwright-test-senior-leader.md` as the sixth Playwright/Claude agent, plus Codex/Claude skill support at `.agents/skills/senior-leader/SKILL.md` and `.claude/skills/senior-leader/SKILL.md`. It models the AI-native pod pattern: a senior orchestration lead flattens goals into creation/recovery/reporting/governance pods, writes handoff briefs for the specialist agents, and sets validation/closeout gates. It coordinates the existing planner/generator/healer/diagnostician/reporter agents; it does not replace them or edit app/test code directly.

**Dynamic Claude review handoff (2026-06-08):** Added `scripts/github/fetch-claude-review.js`, `npm run review:claude:pull -- --pr <number>`, and `docs/claude-review-handoff.md` so Claude PR comments/reviews can be pulled from GitHub into `obsidian-vault/Inbox/Agents/` instead of being pasted into chat. Also applied Claude review canary fixes: per-commit non-canceling canary concurrency, no `--rm` before diagnostics, loopback-only Docker port publishing, container inspect/log capture, explicit `docker rm -f` cleanup, canary test retries forced to 0, stale `test-results/` upload removed, server startup errors logged, and focus/button contrast tightened.

**Next-phase memory-agent note (2026-04-24):** The current real-agent proof is runtime self-healing only. It does not permanently edit source files or fix the intentional stale-selector demo bugs. If a later real patching agent is added that edits source, that phase must include a reset/revert strategy for intentional demo bugs so the self-healing scenarios remain repeatable.

**Next detail (2026-04-20):** The immediate planned follow-ups for `2026-04-21` are:

- a generic workspace-to-LM Studio local provider link with deterministic fallback preserved and Obsidian kept as the logging and memory boundary
- a first real LLM-backed agent creation pass that adds a true model-driven fallback or advisory layer without replacing deterministic execution as the default path

**Local planning note (2026-04-20):** Private planning guides for LM Studio and future real-LLM integration now live under local ignored `md/` files only, including `LM_STUDIO_DEV_TESTING_GUIDE.md`, `REAL_LLM_AGENT_WORKSPACE_GUIDE.md`, and `IMPLEMENTATION_HANDOFF.md`. They are intentionally not part of the tracked repo surface.

**Local demo note (2026-04-18):** A local Jenkins demo controller was validated against this private repo, but that setup lives outside the repo under `D:\Jenkins` and is machine-local only.

### Last session stop point (2026-05-30, Agents-Playground rename + auth/RBAC/agent-roster expansion)

- **Rename:** project renamed to **Agents-Playground** — `package.json` name `agents-playground`, README title, GitHub repo `asaf-1/Agents-Playground` (still PRIVATE). The vault MOVED from `docs/obsidian-vault/` to the repo-root `obsidian-vault/`; open the REPO ROOT as the Obsidian vault.
- **5-agent roster** added under `.claude/agents/`, addressable via the `playwright-test` MCP server in `.mcp.json` from a Claude Code / VS Code / OpenCode harness:
  - `playwright-test-planner` (official) — explores the app, writes a plan to `specs/`
  - `playwright-test-generator` (official) — turns a plan item into a spec under `tests/e2e/generated/`
  - `playwright-test-healer` (official) — runs tests, root-causes failures, rewrites the broken TEST
  - `playwright-test-diagnostician` (NEW, custom) — read-only RCA: evidence + classify (14-category FailureClassifier taxonomy) → verdict HEAL vs REPORT
  - `playwright-test-reporter` (NEW, custom) — persists a local bug record + Obsidian incident/healing note
  - Pipeline: planner → generator → run → diagnostician → (heal | report). Agents fix TESTS, never the app.
- **Phase 1 (auth + session), shipped:** cookie-based sessions (opaque `sid`, HttpOnly); new `/login` page (`public/login.html` + `login.js`); shared `public/auth-guard.js` on protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) that redirects to `/login` only when the `authRequired` flag is armed (default OFF, so existing tests stay green); real `storageState` via a setup/authenticated/default Playwright `projects[]` split (`tests/e2e/auth.setup.ts` mints an Admin session → `.artifacts/auth/admin.json`); LoginPage POM + `loginPageProfile` + `loginPageContract` + `baseTest` `loginPage` fixture; `tests/e2e/scenarios/auth-session.spec.ts` (4 tests). New endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/session`, `POST /api/test/set-session`. `seededUsers` gained `@demo.local` emails (password `demo1234`; Carol inactive).
- **Phase 3 (RBAC), shipped:** `ROLE_PERMISSIONS` (Admin/Editor/Viewer); gated `POST /api/users` + new `PATCH/DELETE /api/users/:id`; the DELETE carries an INTENTIONAL over-permission DEFECT (`rbacBug=editor-delete` → wrong `200`) as the reporter's target; `GET /api/admin/audit` (401/403/200); `GET /api/users` applies `editsByUserId` + `deletedManagedUserIds` overlays; `/admin` REWRITTEN from inline-static to fetch-driven (`public/admin.js` hitting `/api/admin/audit`, preserving testids + clearLog→0 + contract); `tests/e2e/scenarios/rbac.spec.ts` (5 tests incl. the defect, serial).
- **Drift control:** per-`runKey` flag store (`GET/POST/DELETE /api/test/flags`; `FLAG_DEFAULTS` + `FLAG_CATALOG`: `ctaMode`/`ordersMode`/`productState`/`createUserPhoneType` already existed conceptually, plus new `authRequired`/`sessionExpired`/`loginSubmitLabel`/`rbacEnforce`/`adminGate`/`rbacBug`). Split reset hooks: `resetData()` (user data only, PARALLEL-SAFE, used by `POST /api/test/reset-users`) vs `resetAll()` (+ flaky markers + order counter + sessions + flags; `POST /api/test/reset`, seed/setup only).
- Both previously-dark FailureClassifier categories (`auth-or-session`, `permissions-or-rbac`) are now LIT.
- New repo-root docs (NOT in the vault): `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`, `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md`, `md/PLAYGROUND_EXPANSION_DESIGN.md`. Phase 2 (a `/lab` control-panel GUI) and Phase 4 (richer flows: orders-explorer, create-order wizard) are DESIGNED but DEFERRED.
- **Validation:** all changes SHIPPED + verified — `62` tests total, `60` passed / `2` skipped.

### Last session stop point (2026-04-24, real Obsidian/self-healing agent proof)

- Added `obsidian-vault/Tasks/007 Real Agent Proof.md` as the active scoped task note.
- Added a bounded real self-healing LLM layer:
  - `framework/agents/llm/SelfHealingLlmAgent.ts`
  - `framework/agents/llm/OpenAiSelfHealingProvider.ts`
  - default mode remains disabled/offline unless configured
  - live OpenAI provider uses `POST https://api.openai.com/v1/responses`
  - unsafe provider output is rejected before any browser action
- Added `framework/agents/obsidian/ObsidianMemoryAgent.ts` for structured healing-run Markdown logs, workspace-state session logs, and task-note `Result` updates.
- Added `tests/e2e/scenarios/real-agent-proof.spec.ts`:
  - real browser recovery with a fake provider
  - real vault healing-log write
  - temp task-note `Result` update
  - unsafe output rejection
  - disabled mode no-call guard
  - workspace-state vault log writing for session handoff
  - opt-in `@live-openai` provider smoke, skipped by default
- Updated `README.md`, `obsidian-vault/02 Test Map.md`, and `package.json` with `npm run test:real-agent`.
- Reclassified the NarrativeEnricher `/v1/responses` test as an endpoint lock rather than a known issue.
- Added a future-phase memory note: any later source-editing patching agent must include reset/revert handling for intentional demo bugs; the current `SelfHealingLlmAgent` remains runtime self-healing only.
- Tightened live OpenAI setup handling after a placeholder-key run:
  - `@live-openai` now skips common placeholder key values such as `your-openai-api-key`
  - provider failures now include the OpenAI response status/body excerpt in the agent decision
- Broadened the Obsidian vault update after the real-agent proof:
  - updated `00 Home.md`, `01 Project Map.md`, `03 Agent and Obsidian Workflow.md`, `06 Agents Playground Guide.md`, and `Reports/README.md`
  - added local session summary `Reports/Healing/2026-04-24-real-agent-session-vault-update.md`
  - clarified that the agent must record the whole relevant session/workspace state, including README/memory/task-note status when features change, while avoiding blind rewrites of unrelated notes
- Extended `ObsidianMemoryAgent.writeWorkspaceStateLog()` so future runs can write `Reports/Workspace/` handoff notes with current state, changed files, documentation status, decisions, validation, and next actions.
- Added local workspace-state report `Reports/Workspace/2026-04-24-real-agent-workspace-state-update.md` for this session.
- Wired the opt-in `@live-openai` smoke so a manual live OpenAI run writes real vault evidence under both `Reports/Healing/` and `Reports/Workspace/`; running only `--grep "@live-openai"` proves OpenAI plus those Obsidian writes, while the broader `npm.cmd run test:real-agent` still covers the deterministic fake-provider and vault-write cases.
- Added `framework/agents/obsidian/ObsidianCloseoutAgent.ts` and `scripts/obsidian-closeout.js`:
  - inspects `git status --short --untracked-files=all`
  - classifies changed files
  - infers required README, `AGENT_MEMORY.md`, task-note, `02 Test Map.md`, and Obsidian workflow updates
  - writes `Reports/Workspace/` closeout evidence
  - blocks closeout when required documentation is missing
- Added `npm.cmd run obsidian:closeout -- --title <title> --summary <summary>` as the manual closeout guard command.
- Manual live OpenAI smoke was run by the user with a real key and passed: `npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts --grep "@live-openai"` → `1/1` passed.
- Validation completed:
  - `npx.cmd tsc --noEmit` passed
  - `npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts` passed with `8` passed and `1` skipped live OpenAI smoke
  - `npm.cmd run test:e2e` passed with `49` passed and `1` skipped live OpenAI smoke out of `50` specs
  - `npm.cmd run obsidian:closeout -- --title real-agent-closeout-agent --summary "Implemented Obsidian closeout guard for changed-file documentation gating." --validation-command "npm.cmd run test:e2e" --validation-outcome "49 passed, 1 skipped live OpenAI smoke out of 50 specs"` passed and wrote final report `Reports/Workspace/2026-04-24-real-agent-closeout-agent-1777019807654.md`
- Pre-push validation rerun completed on the current working tree before push:
  - `npm.cmd run test:e2e` passed with `49` passed and `1` skipped live OpenAI smoke out of `50` specs
  - `docker build -t ai-agentic-project-prepush .` passed
- Current real Obsidian/self-healing agent proof and closeout flow were pushed to `origin/main` at commit `e38f095` on 2026-04-24 after the pre-push gate passed.

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
- `obsidian-vault/` (AGENT_MEMORY.md, Inbox/Agents/, Tasks/003-005, 06 Guide, modified 00-04 + Templates)
- `md/` (DEV_TEAM_AGENT_SETUP_PLAYBOOK, NEXT_PHASE_MULTI_AGENT_ROADMAP, PAGE_LEVEL_SELF_HEALING_PATTERN, PLAN, PRODUCTION_SELF_HEALING_MULTI_AGENT_BLUEPRINT, SHARED_AGENT_SETUP_BLUEPRINT)
- Accept the 7 deletions (old `framework/page-objects/`, `framework/test-data/`, `tests/e2e/portfolio-demo*`, `md/Infestracture-Reasoning.md`, vault Tasks 001-002) — they were intentionally retired

🔴 DO NOT commit:

- `asaf-1/` — it's a separate Git repo (personal portfolio) nested inside this project. Already added to `.gitignore` on 2026-04-17.
- Anything already in `.gitignore`: `node_modules/`, `.artifacts/`, `test-results/`, `.env*`, `obsidian-vault/Reports/*` (except its README).

**Gate:** `npm.cmd test` / `npm.cmd run test:e2e` must keep the deterministic suite green; current expected default is `60` passed and `2` skipped out of `62` tests total (the live OpenAI smoke + 1 other).
**First push:** `git push -u origin main`. Subsequent: `git push`.
**Commit strategy:** one "Slice 1 + Slice 2 complete" commit is fine, OR split by area (framework / tests / docs / CI) — Codex's call.

### Last session stop point (2026-04-20, local bug reporting)

- Added rollback markers before implementation:
  - git tag `snapshot/pre-bug-reporting-2026-04-20-0114`
  - snapshot note `obsidian-vault/Snapshots/2026-04-20-0114-pre-bug-reporting.md`
- Added the additive local bug reporting workflow without editing existing tests or product/runtime behavior:
  - `framework/agents/reporting/BugReportingAgent.ts`
  - `framework/agents/reporting/LocalBugStoreAdapter.ts`
  - `framework/agents/reporting/catalog.ts`
  - `framework/agents/reporting/types.ts`
  - `scripts/bug-reporting/run-local-bug-report.js`
  - `scripts/bug-reporting/validate-local-bug-reporting.js`
  - `.claude/skills/bug-report/SKILL.md`
- The tracker is local-only in v1:
  - bug records go to `obsidian-vault/Reports/Bug Reports/`
  - evidence goes to `.artifacts/bug-reports/`
  - confirmation requires the initial detection plus `3` reruns before opening a local bug
  - self-healed scenarios can still become tracked local bugs if the underlying website defect still reproduces
- Validation completed:
  - `npx.cmd tsc --noEmit` passed
  - `node scripts/bug-reporting/validate-local-bug-reporting.js` passed
  - `npm.cmd run test:e2e` passed with `41/41`

### Last session stop point (2026-04-20, roadmap follow-up for local LM Studio link)

- Added a new immediate follow-up section to `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` for `2026-04-21`:
  - implement a generic workspace-to-LM Studio provider link
  - keep deterministic mode available for ordinary regression
  - keep Obsidian as the logging and memory boundary
  - add connectivity verification and future Obsidian logging hooks behind a central provider config
- Kept the tracked repo change minimal:
  - updated `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
  - updated `obsidian-vault/AGENT_MEMORY.md`
  - left local-private generic LM Studio planning notes out of the tracked push
- Local pre-push validation rerun completed because the user requested a push:
  - `npm.cmd run test:e2e` passed with `41/41`
  - `docker build -t ai-agentic-project-prepush .` passed

### Last session stop point (2026-04-20, roadmap follow-up for real LLM agent creation)

- Added a second immediate follow-up section to `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` for `2026-04-21`:
  - create one real LLM-backed agent layer instead of relying only on deterministic TypeScript "agents"
  - keep deterministic-first execution for normal regression and page actions
  - use the real LLM only as a bounded fallback or advisory layer for cases such as self-healing fallback, failure triage, and repair suggestion
  - add provider-backed execution, run labeling, and explicit guardrails
- Added one new local-private generic reference note and kept it out of the tracked push:
  - `md/REAL_LLM_AGENT_WORKSPACE_GUIDE.md`
- Updated `.gitignore` so the local-private LM Studio and real-LLM planning notes stay hidden from repo status noise.

### Last session stop point (2026-04-19, snapshot layer + doc rules)

- Added the session snapshot/resume layer:
  - `obsidian-vault/Snapshots/` folder with `README.md` explaining when to write a snapshot and how it differs from `AGENT_MEMORY.md`, `Tasks/`, `Reports/`, `Inbox/Agents/`, and Git history.
  - `obsidian-vault/Templates/Session Snapshot.md` defining the snapshot structure (Active Phase, What Was In Flight, Last Decisions w/ why, Workspace State, Resume Entry Point, Blockers).
  - `.claude/skills/snapshot/SKILL.md` registering `/snapshot <title>` — gathers git state, reads memory, fills the template, links from `00 Home.md`.
- Updated `AGENTS.md`:
  - New **Documentation Rules** section: any feature add/remove/rename must update `README.md` and `AGENT_MEMORY.md` in the same change set; bump the test count in `README.md` whenever spec count changes.
  - New **Session Continuity Rules** section: write `/snapshot` before stopping, on token-cap risk, or on any cross-agent handoff.
- Updated `README.md`: bumped `33` → `41` in both spots, added the OpenAI fallback coverage note, added a `Snapshots/` line under Important Paths.
- No code/test changes this session — all updates are docs, vault scaffolding, and skill registration. No suite rerun needed; last run was 41/41 from the previous stop point.

### Last session stop point (2026-04-19, bug reporting guide note)

- Added `md/BUG_REPORTING_GUIDE.md` as a local/private reference note covering bug lifecycle, severity/priority, reporting channels, regression reporting, incident handling, and future bug-reporting-agent workflow ideas.
- Updated `README.md` and `obsidian-vault/AGENT_MEMORY.md` in the same change set so the new helper note is discoverable under the repo documentation rules.
- No code or test-count changes were made as part of this doc addition.

### Previous session stop point (2026-04-19, NarrativeEnricher coverage)

- Added `tests/e2e/scenarios/narrative-enricher.spec.ts` (8 tests) covering `framework/agents/diagnosis/NarrativeEnricher.ts`:
  - deterministic fallback when `OPENAI_API_KEY` missing, on non-ok status, on empty payload, and on fetch throw/abort
  - successful enrichment via `output_text` and via flattened `output[].content[].text`
  - request body carries the configured model and the 2-3-sentence rewrite prompt
  - endpoint lock: pins the OpenAI Responses API URL to `https://api.openai.com/v1/responses` so any provider-surface change is forced to ship with an updated assertion.
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
  - Tightened `.dockerignore` and updated `README.md`, `04 Daily Regression Automation.md`, `06 Agents Playground Guide.md`, and `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
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
- `framework/agents/reporting/BugReportingAgent.ts`, `LocalBugStoreAdapter.ts`, `catalog.ts`, `types.ts` ← local-only bug reporting + tracker boundary
- `framework/agents/llm/SelfHealingLlmAgent.ts`, `OpenAiSelfHealingProvider.ts` ← bounded real self-healing LLM proof + opt-in OpenAI provider
- `framework/agents/obsidian/ObsidianMemoryAgent.ts` ← vault healing logs + workspace-state logs + task-result updates
- `framework/agents/obsidian/ObsidianCloseoutAgent.ts` ← git-status changed-file detection + documentation closeout gating + workspace reports
- `framework/agents/validation/PageValidationAgent.ts`
- `framework/agents/validation/contracts.ts` (home, dashboard, product, user-manager, orders, admin, profile, settings)
- `framework/fixtures/baseTest.ts` — exposes `userManagerPage` fixture
- `framework/memory/IncidentMemoryStore.ts` ← Slice 2
- `framework/reporting/scenarioArtifacts.ts`

### Tests (62 tests total; 60 pass locally by default, 2 skipped — the live OpenAI smoke + 1 other)

- `tests/e2e/sanity/`, `functional/positive|negative/`, `contracts/`, `non-functional/`, `scenarios/` (16 agentic scenario specs including `orchestrated-recovery.spec.ts`, `policy-engine.spec.ts`, `execution-planner.spec.ts`, `incident-memory-and-evidence.spec.ts`, `failure-classifier-expansion.spec.ts`, `advanced-locator-healing.spec.ts`, `repair-flow.spec.ts`, `real-agent-proof.spec.ts`, and `narrative-enricher.spec.ts`)
- `tests/e2e/sanity/new-pages.spec.ts` covers the four new pages (orders, admin, profile, settings)
- `tests/e2e/scenarios/narrative-enricher.spec.ts` (8 cases) covers the OpenAI enrichment fallback paths and locks the current `/v1/responses` endpoint URL as the explicit provider surface
- `tests/e2e/scenarios/real-agent-proof.spec.ts` (9 cases) covers real browser self-healing with a fake provider, real Obsidian vault healing and workspace-state writes, task-result updates, closeout documentation gating, unsafe LLM-output rejection, disabled mode, and a skipped-by-default `@live-openai` provider smoke
- `tests/e2e/scenarios/auth-session.spec.ts` (4 cases) — Phase 1 cookie-based auth/session flows
- `tests/e2e/scenarios/rbac.spec.ts` (5 cases, serial) — Phase 3 RBAC incl. the intentional `rbacBug=editor-delete` over-permission defect
- `tests/e2e/auth.setup.ts` mints an Admin session storageState (`.artifacts/auth/admin.json`) via the setup/authenticated/default `projects[]` split

### CI

- `.github/workflows/pr-validation.yml` runs formatting and full Playwright on PRs to main; `preMerge.dockerEnabled` selects host or Docker execution.
- `.github/workflows/main-validation.yml` runs on pushes to main and supports manual `workflow_dispatch`.
- `.github/workflows/post-merge-canary.yml` runs after merged PRs or manual dispatch; `postMerge.dockerEnabled` selects host or Docker execution for health, sanity, and contract checks.
- `.github/workflows/ai-review-gate.yml` requires trusted current-head Codex/Claude review evidence on PRs to main.
- `.github/workflows/daily-regression.yml` runs the scheduled full suite with artifact-only reporting.
- `.github/workflows/remote-test-runner.yml` is the on-demand outsourced runner: a `plan` job resolves and validates the flow, a sharded `test` matrix runs it, and a `report` job merges the blob reports. Triggers: `workflow_dispatch`, `repository_dispatch` (`remote-test-run`), `workflow_call`. Not a merge gate.
- `.github/workflows/flow-catalog.yml` regenerates and commits `scripts/test-runner/flow-catalog.json` on pushes to `main`. It is the only workflow with `contents: write`; the default `GITHUB_TOKEN` cannot retrigger workflows, so it cannot loop.
- `.github/workflows/publish-playwright-runner.yml` publishes the shared Playwright runner image to GHCR (`main` + commit SHA tags).
- Docker-enabled jobs use the shared runner image; policy-selected host jobs set up Chromium on the ephemeral GitHub runner.
- `CLAUDE.md`: advisory Claude pre-merge review guidance for manual/free-first review and optional later automation
- `Jenkinsfile`: existing Jenkins validation remains present but is out of scope for the current GitHub-first merge/canary phase

### Codex / Claude Skills

- `/senior-leader <goal>` — create an AI-native pod plan and specialist dispatch briefs
- `/qa-run <suite>` — run any test suite
- `/new-page <PageName>` — scaffold full self-healing page
- `/next-phase` — build orchestration slice + auto-update this file
- `/incident-note <description>` — write structured vault note
- `/bug-report` — confirm a real website/API defect from a scenario artifact or manual page check, then create or update a local-only bug record
- `/snapshot <title>` — write a session snapshot for cold resume across sessions or agent handoffs

### Playwright Agent Roster (`.claude/agents/`, via `playwright-test` MCP in `.mcp.json`)

- `playwright-test-senior-leader` (custom) — flattens goals into AI-native pods, handoff briefs, validation gates, and closeout criteria
- `playwright-test-planner` (official) — explores the app, writes a plan to `specs/`
- `playwright-test-generator` (official) — turns a plan item into a spec under `tests/e2e/generated/`
- `playwright-test-healer` (official) — runs tests, root-causes failures, rewrites the broken TEST
- `playwright-test-diagnostician` (NEW, custom) — read-only RCA: evidence + 14-category classify → HEAL vs REPORT verdict
- `playwright-test-reporter` (NEW, custom) — persists a local bug record + Obsidian incident/healing note
- Pipeline: senior leader → pod plan → planner/generator or diagnostician → (healer | reporter). Agents fix TESTS, never the app.

### Vault + Memory

- `obsidian-vault/AGENT_MEMORY.md` — this file
- `obsidian-vault/Reports/Daily|Incidents|Healing|Workspace|Bug Reports/`
- `obsidian-vault/Inbox/Agents/` — handoff drop zone
- `obsidian-vault/Snapshots/` — point-in-time session state for cold resume (write via `/snapshot`)
- `obsidian-vault/Tasks/`, `Templates/`

---

## What Is Next (Pending Work)

Roadmap tasks 1–10 and the deferred shared Docker hardening pass are complete (2026-04-18). Pick the next post-phase hardening item.

| Priority | Task                                                                                                                                             | Owner  | Status  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------- |
| ~~1~~    | ~~Build `IncidentRouter` + `AgentRegistry`~~                                                                                                     | Claude | ✅ done |
| ~~2~~    | ~~Build `UserManagerPage` end to end~~                                                                                                           | Claude | ✅ done |
| ~~3~~    | ~~Write `orchestrated-recovery.spec.ts` proof test~~                                                                                             | Claude | ✅ done |
| ~~6a~~   | ~~Create GitHub Actions workflow files (pr + main)~~                                                                                             | Claude | ✅ done |
| ~~6b~~   | ~~Commit + push Slice 1 + approved Slice 2 scope to `origin main` at https://github.com/asaf-1/GenAI-AgenticAI-Demo~~                            | Codex  | ✅ done |
| ~~1~~    | ~~Build `PolicyEngine.ts` in `framework/orchestrator/` (enforces environment-safe actions)~~                                                     | Codex  | ✅ done |
| ~~2~~    | ~~Build `ExecutionPlanner.ts` in `framework/orchestrator/` (orders strategies/workers)~~                                                         | Codex  | ✅ done |
| ~~3~~    | ~~Build `framework/memory/IncidentMemoryStore.ts` (record what worked, history)~~                                                                | Codex  | ✅ done |
| ~~4~~    | ~~Add `EvidenceCollectionAgent` in `framework/agents/evidence/`~~                                                                                | Codex  | ✅ done |
| ~~5~~    | ~~Expand `FailureClassifier` (auth, RBAC, modal-not-opened, route-nav, api-timeout, 5xx, empty-state, delayed-data)~~                            | Codex  | ✅ done |
| ~~6~~    | ~~Expand `GenericLocatorHealer` (dropdown, menu, modal, table row/action, form-field by label/placeholder/section)~~                             | Codex  | ✅ done |
| ~~7~~    | ~~Repair agents: `PatchPlanner`, `PatchApplier`, `RepairVerifier` in `framework/agents/repair/` (QA/staging only)~~                              | Claude | ✅ done |
| ~~8~~    | ~~New pages: `OrdersPage`, `AdminPage`, `ProfilePage`, `SettingsPage` (use `/new-page` skill)~~                                                  | Claude | ✅ done |
| ~~9~~    | ~~`.github/workflows/daily-regression.yml` (scheduled nightly)~~                                                                                 | Codex  | ✅ done |
| ~~10~~   | ~~Set up scheduled Claude remote trigger (daily regression)~~                                                                                    | Claude | ✅ done |
| ~~11~~   | ~~Implement shared Docker runtime across CI and dev (`Dockerfile.e2e`, Compose, GHCR publish, Jenkins/GitHub Actions containerized validation)~~ | Codex  | ✅ done |

All roadmap tasks, the Docker hardening pass, local bug reporting, and the first real Obsidian/self-healing agent proof are complete. The Obsidian layer now records healing runs, workspace/session state, and closeout guard evidence from changed-file analysis. Remaining follow-ups sit under post-phase hardening in `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` (workspace-to-LM Studio link remains deferred, live OpenAI smoke can be run manually with a key, plus cross-browser coverage and auth flows).

---

## How Agents Use This File

### Session start

1. Read this file
2. Read `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
3. Pick the highest-priority pending task

### Session end

1. If a task note under `obsidian-vault/Tasks/` is in scope, update its `Result` section before finishing substantial implementation work
2. Update `obsidian-vault/AGENT_MEMORY.md` to mark completed work and adjust pending items
3. Run `npm.cmd run obsidian:closeout -- --title <title> --summary <summary>` when the work changes code, tests, README, vault notes, or agent behavior; fix any blocked required-doc output before final handoff
4. When the workflow needs a direct report, write a `Reports/Workspace/` state note through `ObsidianMemoryAgent.writeWorkspaceStateLog()` covering current state, changed files, docs status, decisions, validation, and next actions
5. For substantive work or any agent handoff, drop a handoff note in `obsidian-vault/Inbox/Agents/`
6. Write a note to the relevant `Reports/` subfolder when the workflow calls for a report
7. State the end result clearly in the final user-facing closeout message
8. Commit when there are real repo changes worth preserving in Git history; recommended, not mandatory

### Handoff format (Claude ↔ Codex)

File: `obsidian-vault/Inbox/Agents/YYYY-MM-DD-handoff-<from>.md`

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

| Issue                                                                                                                                                    | File                                       | Severity                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| No cross-browser coverage                                                                                                                                | `playwright.config.ts`                     | medium                  |
| ~~No auth/session test flows~~ — RESOLVED by Phase 1 (`auth-session.spec.ts`, storageState, `/login`)                                                    | `tests/e2e/scenarios/auth-session.spec.ts` | ✅ resolved             |
| RBAC over-permission on `DELETE /api/users/:id` (`rbacBug=editor-delete` → wrong `200`) — **BY DESIGN**, the reporter agent's target; do NOT fix the app | `server.js`                                | by-design (intentional) |
| home-cta heal demo parked as `test.fixme`                                                                                                                | `tests/`                                   | parked (intentional)    |

---

## Key File Map

| Need                                           | Location                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Playwright agent roster (6 agents)             | `.claude/agents/`                                                                           |
| Codex senior leader skill                      | `.agents/skills/senior-leader/SKILL.md`                                                     |
| Claude senior leader skill mirror              | `.claude/skills/senior-leader/SKILL.md`                                                     |
| MCP server config (`playwright-test`)          | `.mcp.json`                                                                                 |
| Auth setup / storageState mint                 | `tests/e2e/auth.setup.ts` → `.artifacts/auth/admin.json`                                    |
| Auth/session spec (Phase 1)                    | `tests/e2e/scenarios/auth-session.spec.ts`                                                  |
| RBAC spec (Phase 3, incl. intentional defect)  | `tests/e2e/scenarios/rbac.spec.ts`                                                          |
| Login page UI                                  | `public/login.html`, `public/login.js`, `public/auth-guard.js`                              |
| Portable adoption guide (repo root, not vault) | `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`                                                       |
| This-repo agents adoption plan                 | `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md`                                                     |
| Playground expansion design                    | `md/PLAYGROUND_EXPANSION_DESIGN.md`                                                         |
| App server + routes                            | `server.js`                                                                                 |
| App Docker image                               | `Dockerfile`                                                                                |
| Shared Playwright runner                       | `Dockerfile.e2e`, `docker-compose.yml`, `.devcontainer/devcontainer.json`                   |
| Page objects                                   | `framework/pom/`                                                                            |
| Recovery agents                                | `framework/agents/recovery/`                                                                |
| Diagnosis agents                               | `framework/agents/diagnosis/`                                                               |
| Real self-healing LLM agent                    | `framework/agents/llm/`                                                                     |
| Obsidian memory agent                          | `framework/agents/obsidian/`                                                                |
| Validation contracts                           | `framework/agents/validation/contracts.ts`                                                  |
| Container execution helpers                    | `scripts/docker/`                                                                           |
| Remote test runner (scripts + API)             | `scripts/test-runner/`                                                                      |
| Standalone Test Runner app                     | `test-runner/` (own server, UI, auth, Dockerfile)                                           |
| Flow catalog (generated, committed)            | `scripts/test-runner/flow-catalog.json`                                                     |
| Curated flow groups (hand-maintained)          | `scripts/test-runner/flow-groups.json`                                                      |
| Test runner workflow                           | `.github/workflows/remote-test-runner.yml`                                                  |
| Flow catalog refresh workflow                  | `.github/workflows/flow-catalog.yml`                                                        |
| Remote test runner runbook                     | `docs/remote-test-runner.md`                                                                |
| Docker Claude skill                            | `.claude/skills/docker-runtime/SKILL.md`                                                    |
| Local bug reporting skill                      | `.claude/skills/bug-report/SKILL.md`                                                        |
| Local bug reporting runner                     | `scripts/bug-reporting/run-local-bug-report.js`                                             |
| Local bug reporting agent                      | `framework/agents/reporting/BugReportingAgent.ts`                                           |
| Real agent proof task                          | `obsidian-vault/Tasks/007 Real Agent Proof.md`                                              |
| Runner publishing workflow                     | `.github/workflows/publish-playwright-runner.yml`                                           |
| Full roadmap                                   | `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`                                                      |
| Bug reporting reference (local/private note)   | `md/BUG_REPORTING_GUIDE.md`                                                                 |
| Session snapshots                              | `obsidian-vault/Snapshots/` (template: `Templates/Session Snapshot.md`, skill: `/snapshot`) |
| This memory file                               | `obsidian-vault/AGENT_MEMORY.md`                                                            |
