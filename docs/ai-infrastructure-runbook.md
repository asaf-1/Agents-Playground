# AI Infrastructure Runbook

This is the executable operating guide for humans, Codex, Claude, and other repository-aware AI agents working on Agents-Playground infrastructure.

## 1. Scope And Authority

Use this precedence order when instructions conflict:

1. The user's latest explicit request.
2. `AGENTS.md`.
3. The active task note under `obsidian-vault/Tasks/`.
4. This runbook and `docs/pre-merge-review-and-canary.md`.
5. `obsidian-vault/AGENT_MEMORY.md`.
6. General guidance in `obsidian-vault/05 Enterprise Infrastructure Rules.md`.

For the GitHub-first flow completed in Task 009:

- Work through a feature branch and pull request.
- Jenkins is present but out of scope.
- The GitHub PR and canary process is the active product-specific release flow.
- Do not silently restore older Jenkins/Docker requirements from general notes.
- Do not push, merge, change versions, alter credentials, or change branch strategy without explicit user approval.

## 2. Current Baseline

| item                         | current state                                               |
| ---------------------------- | ----------------------------------------------------------- |
| default branch               | `main`                                                      |
| local hook path              | `.githooks`                                                 |
| PR validation                | formatting + full Playwright                                |
| AI review                    | exact-head Codex or Claude attestation                      |
| pre-merge Docker             | disabled by `pipeline.config.json`                          |
| post-merge Docker            | disabled by `pipeline.config.json`                          |
| post-merge canary            | host health + sanity + contract                             |
| GitHub host Node             | Node 20 compatibility pin                                   |
| app image Node               | Node 24                                                     |
| native branch protection     | unavailable for this private repository on the current plan |
| paid automated Claude review | deferred                                                    |
| Jenkins                      | unchanged and out of scope                                  |

Node 20 is a current compatibility pin for Playwright 1.59 browser installation. It is not a permanent restriction. Upgrade Playwright, test the newer Node version, and then update deliberately.

## 3. Required Tools

| tool                | purpose                                           | required when                                      |
| ------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Git                 | branches, commits, hooks, push                    | always                                             |
| Node.js + npm       | app, scripts, Playwright                          | always                                             |
| GitHub CLI `gh`     | PR discovery, review marker, check/run inspection | GitHub operations                                  |
| Playwright Chromium | host browser tests                                | host validation                                    |
| Docker              | app packaging and shared runner                   | only when the selected policy/workflow uses Docker |
| Obsidian            | project memory and handoffs                       | optional UI; files remain plain Markdown           |

Do not install a missing package or tool without user approval. PyYAML is not required because pipeline policy uses JSON.

## 4. Bootstrap A Fresh Clone

Run dependency and browser installation only after the user approves setup on that machine.

```powershell
npm.cmd install
npx.cmd playwright install chromium
git config core.hooksPath .githooks
gh auth status
npm.cmd run format:check
npm.cmd run test:e2e
```

Confirm the hook:

```powershell
git config --get core.hooksPath
```

Expected output:

```text
.githooks
```

## 5. End-To-End Change Procedure

1. Read `AGENTS.md`, `README.md`, `obsidian-vault/AGENT_MEMORY.md`, and the relevant task note.
2. Sync local `main` and create a feature branch.
3. Keep scope explicit; do not mix unrelated user changes.
4. Implement the smallest coherent change.
5. Update README, shared memory, and the task/report when required by `AGENTS.md`.
6. Run the smallest relevant validation, then `npm.cmd run format:check`.
7. Commit intentionally.
8. Push the feature branch. The tracked pre-push hook runs full Playwright and follows the pre-merge Docker policy.
9. Open a PR into `main`.
10. Wait for `PR Validation / Pre-Merge Gate`.
11. Have Codex or Claude review the exact current PR head.
12. Resolve or explicitly accept actionable findings.
13. Mark the reviewed SHA with `npm.cmd run review:ai:mark -- --pr <number> --reviewer <codex|claude>`.
14. Confirm both PR checks are green.
15. Merge only with user approval.
16. Watch `Post-Merge Canary` and inspect artifacts on failure.
17. Write a snapshot before a cross-agent handoff or long-session stop.

## 6. Hooks And Local Gates

### Tracked hook

File: `.githooks/pre-push`

Techniques:

- Reads pushed refs from standard input.
- Blocks ordinary direct pushes to `refs/heads/main`.
- Delegates to PowerShell on Windows and Node elsewhere.
- Keeps hook behavior versioned in the repository.

One-time activation per clone:

```powershell
git config core.hooksPath .githooks
```

### Platform checkers

- Windows: `scripts/pre-push-check.ps1`
- Cross-platform fallback: `scripts/pre-push-check.js`

They always run:

```powershell
npm.cmd run test:e2e
```

They run the app Docker build only when `pipeline.config.json -> preMerge.dockerEnabled` is `true`.

### Emergency controls

Direct-main emergency override:

```powershell
$env:ALLOW_DIRECT_MAIN_PUSH = "1"
git push origin main
Remove-Item Env:ALLOW_DIRECT_MAIN_PUSH
```

Skip only the local Docker build when Docker policy is enabled:

```powershell
$env:PREPUSH_SKIP_DOCKER = "1"
git push
Remove-Item Env:PREPUSH_SKIP_DOCKER
```

Do not use `git push --no-verify` except for an explicitly approved emergency. It bypasses the entire local gate.

## 7. Root Pipeline Policy

File: `pipeline.config.json`

```json
{
  "preMerge": {
    "dockerEnabled": false
  },
  "postMerge": {
    "dockerEnabled": false
  }
}
```

Meaning:

- `preMerge.dockerEnabled: false`: local push and PR validation retain full host Playwright but skip Docker.
- `postMerge.dockerEnabled: false`: canary starts the app on the GitHub runner and still runs health, sanity, and contract checks.
- Set one flag to `true` only with explicit approval and matching validation/documentation.
- Disabling Docker must never disable test coverage.

## 8. GitHub Workflow Catalog

| workflow                        | trigger                                            | job/check             | purpose                                            |
| ------------------------------- | -------------------------------------------------- | --------------------- | -------------------------------------------------- |
| `ai-review-gate.yml`            | PR events and label changes targeting `main`       | `Current Head Review` | verifies trusted SHA-bound Codex/Claude evidence   |
| `pr-validation.yml`             | non-draft PR to `main`                             | `Pre-Merge Gate`      | formatting + full Playwright; optional Docker path |
| `post-merge-canary.yml`         | merged PR to `main` or manual dispatch             | `app-canary`          | exact merged revision health + sanity + contract   |
| `main-validation.yml`           | push to `main` or manual dispatch                  | `full-regression`     | full regression in shared Docker runner            |
| `daily-regression.yml`          | daily at 05:00 UTC or manual dispatch              | `daily-regression`    | scheduled full suite + artifact report             |
| `publish-playwright-runner.yml` | relevant files pushed to `main` or manual dispatch | `publish-runner`      | builds/publishes GHCR Playwright runner            |

### Workflow techniques

- Least-privilege `permissions`.
- Per-PR concurrency cancels stale validation and review runs.
- Review evidence binds to the exact head SHA, so every new commit requires a new review.
- Label remove/add retriggers the AI review gate.
- Canary concurrency is keyed by merged revision and does not cancel a previous merge's canary.
- Canary checks out the exact merge commit.
- Host and Docker runtime branches preserve equivalent canary checks.
- Artifacts retain logs, health evidence, and Playwright output.
- Main and daily validation resolve a shared Playwright runner image with a local build fallback.
- The runner publish workflow uses Buildx, GHCR, commit tags, and GitHub Actions cache.

## 9. AI Review Attestation

Script: `scripts/github/mark-ai-review.js`

Command:

```powershell
npm.cmd run review:ai:mark -- --pr <number> --reviewer <codex|claude>
```

Optional exact-SHA protection:

```powershell
npm.cmd run review:ai:mark -- --pr <number> --reviewer codex --head-sha <40-character-sha>
```

The script:

1. Reads PR metadata through `gh`.
2. Rejects PRs that do not target `main`.
3. Rejects a mismatched expected SHA.
4. Posts `AI-REVIEWED-SHA` and `AI-REVIEWER` evidence.
5. Refreshes the `ai-reviewed` label to rerun the gate.

Never mark a SHA before the named AI reviewed that exact revision and findings were resolved by human judgment.

Claude PR comments can be pulled into Obsidian with:

```powershell
npm.cmd run review:claude:pull -- --pr <number>
```

## 10. Skills Catalog

Codex skills live under `.agents/skills/`. Claude mirrors live under `.claude/skills/`.

| skill            | use                                                                          |
| ---------------- | ---------------------------------------------------------------------------- |
| `senior-leader`  | decompose mixed work into creation, recovery, reporting, and governance pods |
| `qa-run`         | run a named Playwright suite and report failures                             |
| `docker-runtime` | maintain Dockerfiles, Compose, runner dependencies, and CI portability       |
| `bug-report`     | confirm a defect and write local-only bug evidence                           |
| `incident-note`  | write an Obsidian incident/healing note                                      |
| `new-page`       | scaffold page object, profile, contract, and fixture wiring                  |
| `next-phase`     | advance the multi-agent orchestration roadmap                                |
| `snapshot`       | write cold-resume session state before handoff or stop                       |

Invocation examples:

```text
Use the senior-leader skill to plan <goal>.
Use the qa-run skill to run all tests.
Use the snapshot skill for <title>.
```

Claude slash/skill surfaces may use:

```text
/senior-leader <goal>
/qa-run all
/snapshot <title>
```

## 11. Specialist Agent Catalog

Claude agent definitions live under `.claude/agents/`.

| agent                           | responsibility                                       | boundary                                  |
| ------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `playwright-test-senior-leader` | pod planning, sequencing, risk, validation, closeout | coordinates; does not replace specialists |
| `playwright-test-planner`       | explores the app and writes plans under `specs/`     | plans only                                |
| `playwright-test-generator`     | turns a plan item into a generated Playwright spec   | writes tests from approved plan           |
| `playwright-test-diagnostician` | evidence-first RCA and HEAL/REPORT verdict           | read-only diagnosis                       |
| `playwright-test-healer`        | repairs test drift after a HEAL verdict              | fixes tests, not intentional app defects  |
| `playwright-test-reporter`      | writes local bug and Obsidian evidence after REPORT  | never opens external tickets              |

Routing:

```text
creation: senior leader -> planner -> generator
recovery: senior leader -> diagnostician -> healer
reporting: senior leader -> diagnostician -> reporter
mixed: senior leader -> ordered pods -> governance closeout
```

## 12. Validation Commands

```powershell
npm.cmd run format:check
npm.cmd run test:sanity
npm.cmd run test:contract
npm.cmd run test:e2e
npm.cmd run test:docker:smoke
npm.cmd run test:docker:e2e
```

Use relevant Playwright coverage whenever `public/`, `server.js`, `framework/`, or `tests/` changes.

For workflow YAML, use a locally available Actionlint binary or the already-cached image. Do not download a tool without approval.

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color
```

## 13. Evidence And State

| evidence                       | location                                                |
| ------------------------------ | ------------------------------------------------------- |
| Playwright artifacts           | `.artifacts/`, `test-results/`                          |
| daily CI report                | uploaded GitHub artifact                                |
| canary health/runtime evidence | `.artifacts/` in post-merge run                         |
| local bug records              | `obsidian-vault/Reports/Bug Reports/`                   |
| incidents/healing              | `obsidian-vault/Reports/Incidents/`, `Reports/Healing/` |
| cross-agent handoffs           | `obsidian-vault/Inbox/Agents/`                          |
| cold-resume snapshots          | `obsidian-vault/Snapshots/`                             |
| long-term state                | `obsidian-vault/AGENT_MEMORY.md`                        |
| scoped acceptance/results      | `obsidian-vault/Tasks/`                                 |

Reports are generally local/generated and may be Git-ignored. Confirm tracking before staging.

## 14. Failure Recovery

### Playwright browser installation stalls

Observed case: Playwright 1.59 host browser installation stalled under Node 24.

1. Inspect the live job with `gh pr checks` and `gh run view`.
2. Cancel only the stuck run with `gh run cancel <run-id>`.
3. Keep host CI on Node 20 for the current dependency set.
4. Do not add a permanent Node-20-only guard.
5. Re-test a newer Node version only after a deliberate Playwright upgrade.

### AI review gate fails

An initial failure before attestation is expected.

1. Confirm the current PR head SHA.
2. Review that exact SHA.
3. Resolve findings.
4. Run `review:ai:mark`.
5. Refresh the PR page and wait for the retriggered check.

### Push to main is blocked

Create/push a feature branch and open a PR. Use `ALLOW_DIRECT_MAIN_PUSH=1` only for an approved emergency.

### Docker is unavailable

- If the relevant policy flag is `false`, continue with host validation.
- If Docker is required, stop and ask before changing policy.
- `PREPUSH_SKIP_DOCKER=1` skips only the local Docker build; full Playwright still runs.

### Post-merge canary fails

1. Download `post-merge-canary-<sha>`.
2. Check `canary-health.json`.
3. Host mode: inspect `canary-host.log`.
4. Docker mode: inspect container log and inspect JSON.
5. Reproduce with sanity and contract tests.
6. Record an incident note when investigation is substantive.

### Formatting fails on local Obsidian state

Files such as `.obsidian/app.json`, `appearance.json`, and `core-plugins.json` may change as the user operates Obsidian.

- Do not revert or format unrelated user changes.
- Do not stage them silently.
- Validate intended files directly when necessary.
- PR validation runs against committed repository state.

## 15. Local-Only Configuration

Do not stage or publish:

- Secrets or tokens.
- Personal paths or machine-specific settings.
- `.obsidian/graph.json` graph position/color state.
- Generated Reports unless the repository explicitly tracks the target.
- Unrelated Obsidian workspace/UI churn.

The local graph color groups currently distinguish Tasks, Reports, Snapshots, handoffs, Templates, docs, and agent definitions. They are intentionally ignored.

## 16. Rollback And Reversal

- Prefer a new revert PR over history rewriting.
- Never use `git reset --hard` or force push without explicit approval.
- Docker can be restored independently by changing one policy flag and validating both paths.
- A new commit invalidates the previous AI review evidence automatically.
- Cancel a stuck workflow run; do not delete evidence from earlier runs.

## 17. Copy-Paste AI Operating Prompt

```text
Read AGENTS.md, docs/ai-infrastructure-runbook.md, README.md,
obsidian-vault/AGENT_MEMORY.md, and the relevant task note.

Operate only inside this repository. Work on a feature branch. Preserve unrelated user changes.
Classify the request, use the matching skill/agent, implement the smallest coherent change, and update
README, shared memory, and the task/report when required. Run relevant validation and the tracked
pre-push gate. Open a PR into main, wait for PR Validation, review the exact current head with Codex
or Claude, mark the reviewed SHA, and merge only after user approval and green checks. Then verify
the post-merge canary and write a snapshot before handoff.

Do not install packages, change versions, enable Docker, alter Jenkins, expose secrets, run npm audit
fix, or bypass hooks without explicit approval.
```

## 18. Related Files

- `docs/pre-merge-review-and-canary.md`: detailed operator flow.
- `docs/github-premerge-canary-plan.md`: design history and rollout decisions.
- `docs/claude-review-handoff.md`: pulling Claude review comments into Obsidian.
- `CLAUDE.md`: Claude review contract.
- `obsidian-vault/09 Infrastructure and CI Map.md`: architecture map.
- `obsidian-vault/10 Agent Roster.md`: canonical agent inventory.
- `obsidian-vault/Tasks/009 GitHub Pre-Merge Review and Canary.md`: scoped implementation record.
