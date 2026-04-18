# Next Phase Multi-Agent Roadmap

Use this file when the next step is to move the current workspace from a QA-safe self-healing demo into a more generic orchestrated self-healing QA platform.

## Goal

The current repo already has:

- page-level self-healing foundations
- locator healing
- failure classification
- recovery routing
- API diagnosis
- page contracts
- patch proposal logic

The next phase is to stop treating recovery as isolated scenario logic and turn it into a real multi-agent orchestration model.

## Current Foundation In This Repo

The current workspace already contains the base pieces:

- `framework/pom/SelfHealingPage.ts`
- `framework/agents/recovery/GenericLocatorHealer.ts`
- `framework/agents/recovery/RecoveryRouter.ts`
- `framework/agents/diagnosis/FailureClassifier.ts`
- `framework/agents/diagnosis/ApiDiagnosisAgent.ts`
- `framework/agents/diagnosis/PatchProposalAgent.ts`
- `framework/agents/validation/PageValidationAgent.ts`
- `framework/agents/validation/contracts.ts`
- `framework/fixtures/baseTest.ts`
- page profiles under `framework/agents/recovery/pageProfiles/`

That means the repo is ready for a broader orchestrated model without rewriting the entire framework.

## What To Build Next

### 1. Make every page self-heal the same way

For every important page, add:

- a page object in `framework/pom/`
- a page profile in `framework/agents/recovery/pageProfiles/`
- a page contract in `framework/agents/validation/contracts.ts`
- fixture exposure through `framework/fixtures/baseTest.ts`

This pattern should be applied to future pages such as:

- `UserManagerPage`
- `OrdersPage`
- `AdminPage`
- `ProfilePage`
- `SettingsPage`

The goal is that tests stop owning raw locators and instead call shared page methods.

### 2. Expand the healing engine beyond the current cases

Extend:

- `framework/agents/recovery/GenericLocatorHealer.ts`
- `framework/agents/recovery/RecoveryRouter.ts`

Add support for:

- stale `data-testid` fallback
- stale `id` fallback
- dropdown, menu, and modal healing
- table row and action healing
- form-field healing by label
- form-field healing by placeholder
- form-field healing by section context

### 3. Make failure classification broader

Extend:

- `framework/agents/diagnosis/FailureClassifier.ts`

Add classifications for:

- auth or session failures
- permissions or RBAC failures
- modal not opened
- route or navigation failure
- API timeout
- API `5xx`
- API contract drift
- empty state
- broken render
- delayed data

### 4. Strengthen backend diagnosis

Expand:

- `framework/agents/diagnosis/ApiDiagnosisAgent.ts`
- `framework/agents/diagnosis/PatchProposalAgent.ts`

Add:

- endpoint-specific contract rules
- retryability rules
- likely owning service or team mapping
- suggested compatibility fix direction
- targeted rerun plan by endpoint or flow

### 5. Add a real orchestrator layer

Create:

- `framework/orchestrator/IncidentRouter.ts`
- `framework/orchestrator/AgentRegistry.ts`
- `framework/orchestrator/PolicyEngine.ts`
- `framework/orchestrator/ExecutionPlanner.ts`
- `framework/memory/IncidentMemoryStore.ts`

This layer should allow the system to:

- take one failure
- classify it
- choose the right agent set
- try approved recovery strategies
- record what worked
- escalate if confidence is low

### 6. Add patching in QA and staging only

Create:

- `framework/agents/repair/PatchPlanner.ts`
- `framework/agents/repair/PatchApplier.ts`
- `framework/agents/repair/RepairVerifier.ts`

This should allow:

- proposing a code change
- applying it in an isolated workspace or branch
- rerunning targeted tests
- producing a patch or PR candidate

This should not mean risky live edits in production.

### 7. Add more realistic non-prebaked tests

Create scenario coverage for cases like:

- a locator changes unexpectedly
- a modal button moves
- a table action changes text
- an API field changes type
- a dashboard widget renders late
- a page loses a required contract element

The goal is to prove the framework can recover from real drift patterns instead of only pre-scripted demos.

## What Multi-Agents Means In This Repo

The correct next step is not "many agents running around."

The correct next step is an orchestrated system with bounded responsibilities.

Instead of one recovery path doing everything, split responsibility across agents.

### Control layer

- `Incident Router`
  - receives the failure
  - decides which agents to invoke
- `Policy Engine`
  - enforces environment-safe actions
- `Execution Planner`
  - orders strategies and workers

### Worker agents

- `Failure Classification Agent`
  - labels the failure type
- `Evidence Collection Agent`
  - collects DOM, API, logs, traces, screenshots, timing, and other evidence
- `UI Recovery Agent`
  - heals locators and page actions
- `API Diagnosis Agent`
  - explains backend or API issues
- `Validation Agent`
  - checks whether recovery actually fixed the problem
- `Patch Proposal Agent`
  - proposes permanent fix direction
- `Runtime Mitigation Agent`
  - handles restart, rollback, feature-flag, or instance-isolation actions later
- `Incident Memory Agent`
  - stores incident history and successful recoveries

## How The Multi-Agent Flow Should Work

### UI failure example

1. Test fails.
2. `Incident Router` receives the failure.
3. `Failure Classification Agent` labels it as `ui-missing-locator`.
4. `Evidence Collection Agent` captures page evidence.
5. `UI Recovery Agent` tries locator or interaction healing.
6. `Validation Agent` checks the relevant page contract.
7. If validation passes, mark the incident as mitigated.
8. `Patch Proposal Agent` suggests the permanent code fix.
9. If mitigation fails, try another approved strategy or escalate.

### API failure example

1. Failure occurs.
2. `Failure Classification Agent` labels it as `api-contract-drift`.
3. `Evidence Collection Agent` captures request and response data.
4. `API Diagnosis Agent` identifies the mismatch.
5. `Patch Proposal Agent` suggests frontend or backend alignment.
6. `Validation Agent` defines the rerun plan.
7. If confidence is low, escalate instead of acting.

## What This Would Give The Repo

- true separation of responsibilities
- easier extension for new failure types
- more enterprise-like architecture
- easier path toward QA and staging automation at scale
- easier path toward production-safe policy later

## What This Would Not Mean Yet

- not multiple LLMs magically fixing anything
- not uncontrolled autonomous agents
- not safe direct production code changes
- not one giant agent trying to do every job badly

The correct model is:

- multi-agent orchestration
- deterministic policies
- bounded responsibilities
- evidence-driven actions
- validation before marking success

## Best Next Implementation In This Repo

If the next implementation phase starts now, the recommended first build is:

1. `IncidentRouter`
2. `AgentRegistry`
3. `FailureClassificationAgent`
4. `EvidenceCollectionAgent`
5. adapt the current recovery, diagnosis, and validation logic into worker agents
6. `IncidentMemoryStore`
7. tests proving one failure gets routed across multiple agents

## Recommended First Slice

Start with:

- orchestrator
- stronger stale-locator healing
- one new real page such as `UserManagerPage` end to end

That gives the best balance of:

- real architecture progress
- visible product value
- reusable framework improvement
- testable proof that the system is moving beyond scenario-by-scenario healing

## Prompt For The Next Build Phase

```text
Read md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md and use it as the source of truth for the next framework expansion. Build the first real multi-agent orchestration slice for this repository: IncidentRouter, AgentRegistry, FailureClassificationAgent, EvidenceCollectionAgent, stronger stale-locator healing, and one new page-level self-healing implementation such as UserManagerPage. Keep the current deterministic demo behavior and tests passing while adding new coverage that proves one failure can be routed across multiple agents.
```

## Next Phase After Multi-Agent Runtime: Obsidian Workspace Memory

Once the repo has a stronger multi-agent orchestration layer, the next important phase is persistent workspace memory.

The goal is to make sure the system remembers:

- what changed
- what failed
- what was healed
- what mitigation worked
- what permanent fix was suggested
- what still needs follow-up

This should not depend on chat history alone.

## Best Way To Use Obsidian For This Workspace

For this workspace, the best model is a hybrid:

1. keep `docs/obsidian-vault/` as the project memory inside the repo
2. let agents write structured Markdown directly into the vault
3. use Obsidian as the human-readable memory layer
4. use Git as the versioned history layer

If a richer live integration is needed later, add the Obsidian Local REST API on top of that.

That means the recommended order is:

### Best current default for this repo

- direct file writes into `docs/obsidian-vault/`
- structured task notes
- structured reports
- structured incident summaries
- Git history for traceability

### Best future upgrade for custom local agents

- Obsidian Local REST API

### Good secondary layer

- Git integration for history and syncing

### Useful only in the right cases

- folder watcher for external tools
- no-code automation platforms for web-based agents

## Evaluation Of The Common Options

### 1. Local REST API method

This is the best option for custom agents when you want live note creation or note updates without manual steps.

Benefits:

- agents can append or create notes instantly
- agents can target exact vault paths
- works well for local custom tooling
- useful for daily notes, incident logs, or agent activity feeds

Best use:

- local agent runtime
- custom orchestrator
- real-time workspace memory updates

Limit:

- it adds another local service and plugin dependency

### 2. Folder watcher method

This is the easiest option when tools can only export files.

Benefits:

- simple
- low setup cost
- works with many tools

Best use:

- external logs
- third-party agents
- quick ingestion of exported Markdown or text

Limit:

- weaker structure
- easier to create vault clutter
- less control over note format and location

### 3. Automation platforms

This is useful when the agent is web-based and cannot write directly into the repo or local vault.

Benefits:

- works for cloud tools
- useful for webhook-driven summaries

Best use:

- SaaS agents
- web workflows
- cross-system notifications

Limit:

- more moving parts
- harder to keep repo-local and deterministic

### 4. Git integration

Git is excellent for version history and traceability, but it is not the best primary ingestion mechanism for live memory.

Benefits:

- strong audit trail
- versioned documentation
- reviewable note changes

Best use:

- history
- backup
- sync
- accountability

Limit:

- not ideal as the only way for agents to write memory in real time

## Best Recommendation For This Workspace

For this repo specifically, the recommended model is:

1. keep using `docs/obsidian-vault/` as the main workspace memory
2. let repo-local agents write structured Markdown files directly
3. keep task notes and reports as the main source of memory
4. later, if a local orchestrator is added, integrate Obsidian Local REST API for live appends
5. use Git to preserve the history of those notes

This is better than using only daily notes or only raw inbox dumping.

## Recommended Memory Model

Use Obsidian to store four kinds of memory:

### 1. Planning memory

- task notes
- scope
- acceptance criteria
- validation plan

### 2. Operational memory

- incident summaries
- healing attempts
- recovery decisions
- patch proposals

### 3. Reporting memory

- daily regression reports
- scenario reports
- release-readiness summaries

### 4. Knowledge memory

- project maps
- test maps
- workflow guides
- operating standards

## Recommended Vault Structure For Agent Memory

For this repo, a structure like this is stronger than a generic `00_Inbox/Agents/` only model:

```text
docs/obsidian-vault/
  00 Home.md
  01 Project Map.md
  02 Test Map.md
  03 Agent and Obsidian Workflow.md
  04 Daily Regression Automation.md
  05 Enterprise Infrastructure Rules.md
  Reports/
    Daily/
    Incidents/
    Healing/
  Tasks/
  Templates/
  Inbox/
    Agents/
```

### Why this is better

- `Inbox/Agents/` can receive raw unprocessed agent output
- `Tasks/` holds structured work items
- `Reports/Incidents/` stores recovery and failure summaries
- `Reports/Healing/` stores healing attempts and outcomes
- `Reports/Daily/` stores scheduled regression output

This keeps the vault readable instead of mixing raw events with final project memory.

## Daily Notes Recommendation

Daily Notes can still be useful, but they should not be the only memory layer.

Use Daily Notes for:

- short daily summaries
- status snapshots
- links to the real task or report notes

Do not use Daily Notes as the only storage for:

- incident details
- healing evidence
- patch proposals
- test reports

Those should live in dedicated notes and be linked from the daily note if needed.

## Suggested Agent Write Patterns

### For every major task

Write or update:

- one task note in `Tasks/`
- one result section update after validation

### For every important failure or recovery

Write:

- one incident or healing note in `Reports/Incidents/` or `Reports/Healing/`

### For scheduled automation

Write:

- one dated report in `Reports/Daily/`

### For raw external agent output

Drop:

- raw files into `Inbox/Agents/`
- then summarize or normalize them into structured notes

## If A Better Option Is Needed Later

If this workspace evolves into a real local multi-agent runtime, the best upgrade path is:

1. keep the current file-based vault model
2. add Obsidian Local REST API
3. let the orchestrator append to incident, healing, and daily notes automatically
4. keep Git as the history and review layer

That is better than replacing the current vault model.

## Phase Goal

At the end of this phase, the workspace should be able to remember:

- what agents did
- why they did it
- what evidence they used
- what succeeded
- what failed
- what should be done next

without relying on the chat thread as the only memory.

## Post-Phase Hardening: Workspace Snapshot And Resume

After the Obsidian workspace memory phase is fully complete, add a dedicated workspace snapshot feature.

The goal is to preserve enough state to recover cleanly if the session is interrupted by shutdown, token exhaustion, or another unexpected stop.

This snapshot layer should capture:

- current phase and active task
- latest handoff summary and next actions
- key decisions from the current conversation in structured note form
- relevant workspace state such as changed files, validation status, and linked artifacts
- a clear resume entry point for the next agent or session

Obsidian plus Git already gives persistent project memory and history, but it does not automatically guarantee a full conversation backup or a single resumable workspace-state snapshot.

Treat this as a recovery and continuity feature on top of the existing vault and Git model, not as a replacement for task notes, reports, or version control.

## Final Phase After That: Push To A New GitHub Repo And Move To GitHub Actions

After the workspace is strong enough, the final delivery phase should be:

1. push the project into a new GitHub repository
2. preserve the repo structure, framework structure, tests, and Obsidian project memory
3. add GitHub Actions as the main CI workflow for the project
4. keep the same validation intent that exists locally

## Why This Phase Matters

This turns the workspace from a local evolving system into a shareable engineering project that can be:

- versioned cleanly
- reviewed by other developers
- validated on every push or pull request
- handed to another team
- expanded with real CI history and artifact retention

## What Should Be Pushed

The future GitHub repository should include:

- application code
- framework code
- tests
- `AGENTS.md`
- `README.md`
- `docs/obsidian-vault/`
- CI workflow files
- Docker files
- scripts needed for validation

It should not include:

- personal local-only notes
- local secrets
- machine-specific paths
- temporary local artifacts

## GitHub Actions Goal

GitHub Actions should become the project CI layer for:

- install and bootstrap
- lint or type-check if present
- targeted validation
- full regression
- artifact upload for reports, traces, and screenshots
- optional Docker build validation

## Required Workflow Shape

When this phase starts, add workflows that cover at minimum:

- pull request validation
- push validation for the main branch
- optional scheduled regression

## Validation Rule

The GitHub Actions workflows should validate the same core behavior as local runs.

That means the future CI should map to the same intent as:

- local setup
- local test runs
- local Docker validation

and should not invent a separate hidden validation model.

## Recommended Future Files

When the GitHub phase starts, add:

- `.github/workflows/pr-validation.yml`
- `.github/workflows/main-validation.yml`
- `.github/workflows/daily-regression.yml`

and document them in:

- `README.md`
- `docs/obsidian-vault/02 Test Map.md`
- `docs/obsidian-vault/04 Daily Regression Automation.md`

## Recommended Future Prompt

```text
Read md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md and prepare the final delivery phase for this project. Push the workspace into a new GitHub repository, preserve the current framework and docs structure, and add GitHub Actions workflows for pull request validation, main-branch validation, and optional scheduled regression. Keep the CI behavior aligned with the local validation model and preserve artifact reporting.
```

## Deferred Considerations

These are not for execution in the current phase. Keep them as end-of-phase reminders for Codex or Claude to revisit after the full phase is complete.

> Status update (2026-04-18): the shared Docker hardening pass is now implemented. The repo has a dedicated Playwright runner image (`Dockerfile.e2e`), Docker Compose/devcontainer onboarding, GHCR publishing, and containerized Playwright execution in Jenkins and GitHub Actions. Remaining post-phase follow-ups are workspace snapshot/resume, cross-browser expansion, and auth/bootstrap hardening.

### Dockerized E2E sandbox review

- Re-evaluate whether the current `Dockerfile` base image is strong enough for browser-based Playwright execution.
- The current `node:20-bookworm-slim` image is lightweight, but a future E2E-focused container may need the official Playwright image or an equivalent dependency-complete setup with the required browser libraries and fonts.
- `playwright.config.ts` already makes this repo a good candidate for container-triggered Playwright execution later.
- `Jenkinsfile` already suggests a natural future path for container-aware CI validation.

### Local safe-container execution concept

- When this becomes an execution task later, consider a mount-based Docker workflow that runs the current repo inside an isolated container instead of creating a separate copied workspace.
- The main reason to revisit this is safety and isolation: scope the runtime to the repo, avoid exposing unrelated local folders, and avoid passing local credentials into the container unless explicitly needed.
- Treat this as a later design review item, not an implementation item for the current roadmap slice.

### Jenkins and CI container-agent concept

- When this becomes active work later, consider letting Jenkins run the E2E flow inside a Docker agent instead of teaching the Jenkins host how to manage every Playwright browser dependency directly.
- Preserve the core concept explicitly: use the Docker image as the "Agent" boundary for Playwright-oriented CI execution.
- The future model to review is: Jenkins only needs Docker support, while the container image carries the browser runtime, Linux libraries, fonts, and Playwright tooling.
- If this is adopted later, keep it aligned with the repo validation model so containerized Jenkins runs map cleanly to the same Playwright intent already defined in `playwright.config.ts`.
- Treat any example Jenkinsfile image pinning as something to choose fresh during implementation, not something locked by this reminder note.

### Developer onboarding and execution consistency

- Revisit whether a containerized local run path should become the standard onboarding option for other developers once the phase is complete.
- The main advantage is consistency: the same container image can reduce machine-specific differences in browsers, fonts, timing behavior, and screenshot rendering.
- This is especially relevant if the repo leans more heavily on visual assertions or screenshot-based validation later.
- If this becomes real work later, document it as a simple shared entry point such as Docker Compose or an equivalent one-command local startup flow.

### Developer setup and zero-config handoff

- If a Dockerized developer flow is adopted later, design it as an optional low-friction handoff path so developers can run the QA stack quickly without fighting local machine setup.
- The main reason to revisit this is developer adoption: if the regression environment is too hard to install or too easy to break locally, people will skip running it.
- Consider a future `.devcontainer/` setup for VS Code so developers can reopen the repo inside the approved Playwright environment when that workflow becomes worth the maintenance cost.
- If this is implemented later, map report and artifact folders back to the host so screenshots, traces, and reports remain easy to inspect outside the container.
- Consider adding one simple package entry point such as `npm run test:dev` that wraps the containerized dev workflow instead of forcing contributors to remember raw Docker commands.
- Keep the default containerized run headless for speed unless an explicit headed demo or debugging path is needed.
- Prefer cleanup patterns such as `--rm` so temporary containers do not pile up and create local noise.
- Keep this versatile: a future Dockerized dev path should complement the local path, not replace local execution entirely unless the repo explicitly chooses that tradeoff later.

### Clean-slate container-first advantage

- If the infrastructure is rebuilt or expanded later, consider whether Docker should be treated as a day-one foundation instead of a later add-on.
- A container-first model can lock the Node.js version, Playwright version, browser runtime, and related dependencies earlier, which reduces drift between local runs and CI.
- It also reduces host pollution by avoiding hidden dependence on whatever Java, Python, browser, or system libraries happen to exist on a developer machine.
- This can turn onboarding from a long local setup guide into a shared container startup path that is faster and easier to reproduce.

### Pipeline independence and future portability

- Treat Dockerization as a possible portability layer for the future test runner, not just as a local convenience.
- A containerized Playwright runner is easier to move between Jenkins, GitHub Actions, or other CI systems because the runtime travels with the image instead of being rebuilt from host-specific scripts each time.
- This matters if the organization changes CI tooling later and the repo needs to preserve the same execution behavior without reworking browser setup logic from scratch.

### Parallel execution scaling

- Revisit Docker as a scaling tool later if E2E runtime becomes a bottleneck.
- A containerized runner creates a cleaner path to sharding tests across multiple identical workers or containers.
- Isolation can also reduce conflicts around browser state, cache locations, and temporary files when more parallel execution is introduced.

### Linux-parity headless validation

- Consider local containerized Linux execution later as a way to catch CI-like issues earlier, even when development happens on Windows.
- This can surface Linux-only drift such as case-sensitive path problems, missing fonts, or browser-library mismatches before code reaches the shared pipeline.
- This becomes more valuable as the repo leans further into headless Playwright validation and screenshot-sensitive coverage.

### Reminder trigger

- At the end of the full current phase, have Codex or Claude explicitly remind the user to review the Docker, Playwright, CI-container, pipeline-portability, and Linux-parity strategy before moving into the next delivery stage.
