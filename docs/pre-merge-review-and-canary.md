# Pre-Merge Review, Pre-Push Hook, and Post-Merge Canary

This is the operator guide for how a change reaches `main` safely in Agents-Playground.
There are four layers, each with a different job and a different authority:

> **Current branch policy:** work on a feature branch. The tracked pre-push hook blocks ordinary
> direct pushes to `main`. Open a PR, pass `PR Validation / Pre-Merge Gate`, attest
> Codex or Claude review for the exact head SHA, then merge. The canary runs from the merged PR
> event, not from an arbitrary direct push.

| Layer                              | Runs                                 | Blocks the change?               | Authority                      |
| ---------------------------------- | ------------------------------------ | -------------------------------- | ------------------------------ |
| **Pre-push hook**                  | Locally, on `git push`               | **Yes** — push aborts on failure | Full tests + optional Docker   |
| **Advisory pre-merge review**      | On the PR (or locally before a push) | No — advisory                    | Human judgment, informed by AI |
| **PR Validation + AI Review Gate** | GitHub Actions on the PR             | By process, not server-enforced  | Required by this runbook       |
| **Post-merge canary**              | GitHub Actions after a merged PR     | No — fast health signal          | Early warning, not a gate      |

> Codex/Claude findings remain subject to human judgment. On the current private-repo plan,
> GitHub cannot lock the merge button with branch protection, so green checks are a required
> team process rather than a server-enforced rule.

## Lifecycle at a glance

```
                 ┌──────────────────────────────────────────────┐
   git commit →  │  PRE-PUSH HOOK (.githooks/pre-push)            │
                 │  npm run test:e2e  +  optional docker build    │  ──fail──▶ push aborts
                 └──────────────────────────────────────────────┘
                                     │ pass
                                     ▼
                 advisory PRE-MERGE REVIEW  (Codex or Claude)  ── advisory only
                                     │
                                     ▼
                 push / open PR  ──▶  PR Validation + AI Review Gate  ◀── process gate
                                     │
                                     ▼
                          merge PR into main
                                     │
                                     ▼
              POST-MERGE CANARY (.github/workflows/post-merge-canary.yml)
              start host (Docker optional) → probe /api/health
              → test:sanity --retries=0 → test:contract --retries=0 → upload .artifacts/
```

---

## 1. Pre-push hook (mechanical gate)

A local git hook runs the heavy mechanical checks before any `git push` leaves the machine.
If it fails, the push is aborted.

**Wiring**

- Hook script: [`.githooks/pre-push`](../.githooks/pre-push) (tracked in the repo).
- Activated by `core.hooksPath = .githooks` (a per-clone git config — see setup below).
- The hook delegates to a platform-specific checker:
  - Windows / PowerShell: [`scripts/pre-push-check.ps1`](../scripts/pre-push-check.ps1)
  - Other / fallback: [`scripts/pre-push-check.js`](../scripts/pre-push-check.js)

**What it runs**

1. `npm run test:e2e` — the full Playwright regression suite.
2. `docker build -t ai-agentic-project-prepush .` only when `preMerge.dockerEnabled` is `true`.
3. Blocks a direct push to `main` unless `ALLOW_DIRECT_MAIN_PUSH=1` is explicitly set.
4. Prints the branch/PR/review next steps after validation passes.

**Docker switches**

Root `pipeline.config.json` controls Docker independently:

- `preMerge.dockerEnabled: false`: local pre-push and PR validation run full Playwright on the host.
- `postMerge.dockerEnabled: false`: the post-merge canary runs the app directly on the GitHub runner.

Change either value to `true` when that stage should use Docker again. Disabling Docker does not
disable tests: pre-merge still runs the full suite, and post-merge still runs health, sanity, and
contract checks.

The policy is JSON instead of root YAML so Node can read it without another parser. PyYAML is a
Python package for reading YAML; this repository does not install or need it for the pipeline policy.

**Emergency direct-main override**

```powershell
$env:ALLOW_DIRECT_MAIN_PUSH = "1"; git push origin main
Remove-Item Env:ALLOW_DIRECT_MAIN_PUSH
```

**One-time setup (fresh clone)**

`core.hooksPath` is local config and does not travel with a clone. After cloning, run once:

```powershell
git config core.hooksPath .githooks
```

Verify it is active:

```powershell
git config --get core.hooksPath   # → .githooks
```

**Skipping only the Docker build (e.g. Docker Desktop is down)**

```powershell
$env:PREPUSH_SKIP_DOCKER = "1"; git push   # runs the full Playwright suite, skips only the Docker build
Remove-Item Env:PREPUSH_SKIP_DOCKER        # unset afterward
```

Prefer this over `--no-verify` when Docker is unavailable: the Playwright suite **still gates the push**;
only the image build is skipped. (`PREPUSH_SKIP_DOCKER=1` is honored by both `scripts/pre-push-check.ps1`
and `scripts/pre-push-check.js`.)

**Bypassing the whole gate (emergencies only)**

```powershell
git push --no-verify
```

Only use this with a deliberate reason (e.g. a docs-only hotfix). It skips **both** the suite and the
Docker build, so nothing is validated locally.

**Notes**

- The full suite is intentionally thorough. The canary-equivalent subset is
  `npm run test:sanity -- --retries=0` + `npm run test:contract -- --retries=0`.
- The hook needs Docker only when `preMerge.dockerEnabled` is `true`.

---

## 2. Advisory pre-merge review (judgment)

This is the human-judgment review layer. It does not block merges by itself; it surfaces bugs,
CI/security risks, flake risk, and doc drift so a human can decide. It runs **free-first and
manual**.

### Option A — Claude review on the PR (GitHub-first)

1. Open a pull request.
2. Ask for one review in a PR comment:

   ```text
   @claude review once
   ```

3. After Claude replies, pull the review into the workspace so the next agent can work from a
   stable local note (no copy/paste):

   ```powershell
   npm.cmd run review:claude:pull -- --pr <number>
   ```

   The note is written to `obsidian-vault/Inbox/Agents/YYYY-MM-DD-claude-review-pr-<number>.md`.
   If nothing is found, re-run with `--all` to capture every PR comment for debugging.

   Mechanism and details: [`docs/claude-review-handoff.md`](claude-review-handoff.md);
   script: [`scripts/github/fetch-claude-review.js`](../scripts/github/fetch-claude-review.js).

4. After Codex or Claude has reviewed the current PR head and actionable findings are resolved,
   record SHA-bound evidence:

   ```powershell
   npm.cmd run review:ai:mark -- --pr <number> --reviewer <codex|claude>
   ```

   This posts a trusted `AI-REVIEWED-SHA` comment and refreshes the `ai-reviewed` label.
   A new commit changes the head SHA, so the review gate fails until the new head is reviewed.

### Option B — local pre-push review (Claude Code)

Ask Codex or Claude to review the feature-branch diff with findings ordered by severity.
Apply or explicitly accept findings, push the reviewed commit, then run
`npm.cmd run review:ai:mark -- --pr <number> --reviewer <codex|claude>`.

### What stays out of scope (deferred)

- **Automated Claude review that exports private PR code/context to Anthropic is deferred.**
  Do not add a GitHub Action that sends repo code to an external LLM unless the API-key and
  usage-cost tradeoffs are **explicitly approved**. Until then, use the manual/free-first path
  above. (See `CLAUDE.md` review rules.)
- Do not grant the AI write access to push commits during the first rollout.
- Do not propose exposing secrets to pull requests from forks.

---

## 3. Post-merge canary (automated check after PR merge)

After a PR is merged into `main`, a fast canary verifies the merged revision actually
boots and serves traffic. It is an early-warning signal, not a merge gate.

**Workflow:** [`.github/workflows/post-merge-canary.yml`](../.github/workflows/post-merge-canary.yml)

**Triggers:** a closed PR with `merged == true` targeting `main`, and manual `workflow_dispatch`.

**What it does**

1. Reads `postMerge.dockerEnabled` from `pipeline.config.json`.
2. Starts the app directly on the GitHub runner when Docker is off (current setting).
3. Builds and starts the app container instead when Docker is on.
4. Probes `GET /api/health` (up to 30 attempts) and requires `{ "status": "ok" }`.
5. Runs `npm run test:sanity -- --retries=0` then `npm run test:contract -- --retries=0`.
6. Uploads `.artifacts/` with health, runtime diagnostics, and test evidence for 14 days.

**Design guarantees (do not regress these)**

- `permissions: contents: read` only — least privilege; no secrets; not triggerable by fork PRs.
- Current implementation note: concurrency is keyed by the PR `merge_commit_sha` (or
  `github.sha` for manual dispatch), so every merged revision runs to completion.
- Concurrency uses the merged revision SHA with `cancel-in-progress: false`, so each canary
  runs to completion and is not cancelled by the next merge.
- Host mode captures `canary-host.log` and stops its recorded process after the checks.
- Docker mode retains container inspect/log evidence and removes the container afterward.
- `--retries=0` on the canary tests so an intermittent failure is reported, not silently retried.

**Keep it fast and focused.** The canary runs only health + sanity + contract. Full regression
belongs in `main-validation.yml`. Flag any change that grows the canary toward full-regression scope.

**Reading a canary failure**

1. Open the failed run and download the `post-merge-canary-<sha>` artifact.
2. Check `canary-health.json` and `canary-host.log` with the current host runtime.
3. If Docker was enabled for that run, check `canary-container.log` and
   `canary-container-inspect.json` instead.
4. Re-run the same focused checks locally:

   ```powershell
   npm.cmd run test:sanity -- --retries=0
   npm.cmd run test:contract -- --retries=0
   ```

---

## Current branch-first runbook

1. Create a feature branch from current `main`.
2. Make the change and update README, shared memory, and the relevant task/report.
3. Commit and push the feature branch. The pre-push hook runs full Playwright and follows the root policy for optional Docker.
4. Open a PR into `main`.
5. Wait for `PR Validation / Pre-Merge Gate`.
6. Ask Codex or Claude to review the current PR head and resolve findings by human judgment.
7. Run `npm.cmd run review:ai:mark -- --pr <number> --reviewer <codex|claude>`.
8. Merge only when both PR checks are green.
9. Watch the post-merge canary for the merged revision.

---

## References

- `CLAUDE.md` — review role, repository focus, and review rules (the source of truth for scope).
- [`docs/github-premerge-canary-plan.md`](github-premerge-canary-plan.md) — original plan/decisions.
- [`docs/claude-review-handoff.md`](claude-review-handoff.md) — pulling Claude PR comments into Obsidian.
- [`.github/workflows/post-merge-canary.yml`](../.github/workflows/post-merge-canary.yml) — the canary.
- [`.githooks/pre-push`](../.githooks/pre-push) + [`scripts/pre-push-check.ps1`](../scripts/pre-push-check.ps1) / [`scripts/pre-push-check.js`](../scripts/pre-push-check.js) — the pre-push gate.
