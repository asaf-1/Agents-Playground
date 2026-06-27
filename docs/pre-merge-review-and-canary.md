# Pre-Merge Review, Pre-Push Hook, and Post-Merge Canary

This is the operator guide for how a change reaches `main` safely in Agents-Playground.
There are three layers, each with a different job and a different authority:

| Layer                              | Runs                                 | Blocks the change?               | Authority                              |
| ---------------------------------- | ------------------------------------ | -------------------------------- | -------------------------------------- |
| **Pre-push hook**                  | Locally, on `git push`               | **Yes** — push aborts on failure | Mechanical gate (tests + Docker build) |
| **Advisory pre-merge review**      | On the PR (or locally before a push) | No — advisory                    | Human judgment, informed by Claude     |
| **PR Validation + human approval** | GitHub Actions on the PR             | **Yes** — required merge gate    | The hard merge gate                    |
| **Post-merge canary**              | GitHub Actions, after push to `main` | No — fast health signal          | Early warning, not a gate              |

> Claude review is **advisory only**. The hard gates are GitHub `PR Validation` and a human
> approval. See `CLAUDE.md` for the review scope and rules.

## Lifecycle at a glance

```
                 ┌──────────────────────────────────────────────┐
   git commit →  │  PRE-PUSH HOOK (.githooks/pre-push)            │
                 │  npm run test:e2e  +  docker build             │  ──fail──▶ push aborts
                 └──────────────────────────────────────────────┘
                                     │ pass
                                     ▼
                 advisory PRE-MERGE REVIEW  (Claude, judgment)  ── advisory only
                                     │
                                     ▼
                 push / open PR  ──▶  PR Validation + human approval   ◀── HARD merge gate
                                     │
                                     ▼
                          merge / push to main
                                     │
                                     ▼
              POST-MERGE CANARY (.github/workflows/post-merge-canary.yml)
              build image → run with HOST=0.0.0.0 → probe /api/health
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
2. `docker build -t ai-agentic-project-prepush .` — the lightweight app-image packaging gate.
3. Prints a reminder to confirm the advisory pre-merge review is done (non-blocking).

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

- The gate is thorough but slow (full suite + Docker build). That is intentional for a
  pre-push gate. If you want a faster gate, the canary-equivalent subset is
  `npm run test:sanity -- --retries=0` + `npm run test:contract -- --retries=0`.
- The hook needs Node, npm, and a running Docker daemon on the machine doing the push.

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

### Option B — local pre-push review (Claude Code)

Before pushing, ask Claude Code in the session to do a **pre-push review** of the pending change
(the staged/committed diff plus any unstaged items). Use this when you are pushing directly or
want the review before the PR exists. Lead with actionable findings ordered by severity, per
`CLAUDE.md`.

### What stays out of scope (deferred)

- **Automated Claude review that exports private PR code/context to Anthropic is deferred.**
  Do not add a GitHub Action that sends repo code to an external LLM unless the API-key and
  usage-cost tradeoffs are **explicitly approved**. Until then, use the manual/free-first path
  above. (See `CLAUDE.md` review rules.)
- Do not grant the AI write access to push commits during the first rollout.
- Do not propose exposing secrets to pull requests from forks.

---

## 3. Post-merge canary (automated check after push)

After a push to `main`, a fast canary verifies the **shipped container** actually boots and
serves traffic. It is an early-warning signal, not a merge gate.

**Workflow:** [`.github/workflows/post-merge-canary.yml`](../.github/workflows/post-merge-canary.yml)

**Triggers:** `push` to `main`, and manual `workflow_dispatch`.

**What it does**

1. Builds the app image from `Dockerfile`.
2. Runs the container with `HOST=0.0.0.0`, published to host loopback (`-p 127.0.0.1:4173:4173`).
3. Probes `GET /api/health` (up to 30 attempts) and requires `{ "status": "ok" }`.
4. Runs `npm run test:sanity -- --retries=0` then `npm run test:contract -- --retries=0`
   against the running container (`PLAYWRIGHT_REUSE_EXISTING_SERVER=true`).
5. On failure, captures `docker ps -a`, `docker inspect`, and `docker logs`.
6. Uploads `.artifacts/` (health JSON, container log/inspect, Playwright report) for 14 days.

**Design guarantees (do not regress these)**

- `permissions: contents: read` only — least privilege; no secrets; not triggerable by fork PRs.
- Per-commit concurrency: `group: …-${{ github.sha }}` with `cancel-in-progress: false`, so each
  commit's canary runs to completion and is never cancelled by the next push.
- The container is **not** started with `--rm`, so a crash-on-start container survives for log
  capture; an explicit `docker rm -f` cleanup step removes it afterward.
- `--retries=0` on the canary tests so an intermittent failure is reported, not silently retried.

**Keep it fast and focused.** The canary runs only health + sanity + contract. Full regression
belongs in `main-validation.yml`. Flag any change that grows the canary toward full-regression scope.

**Reading a canary failure**

1. Open the failed run → download the `post-merge-canary-<sha>` artifact.
2. Check `canary-health.json` (did the app report `status: ok`?) and `canary-container.log`
   (did the app crash on start? — look for the `Server failed to start on …` line from
   `server.js`, e.g. a port bind error).
3. Check `canary-container-inspect.json` for the container exit code/state.
4. Re-run locally to reproduce:

   ```powershell
   docker build -t agents-playground-canary-local .
   docker run -d --name canary-local -e HOST=0.0.0.0 -p 127.0.0.1:4173:4173 agents-playground-canary-local
   curl http://127.0.0.1:4173/api/health
   $env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:4173"; $env:PLAYWRIGHT_REUSE_EXISTING_SERVER = "true"
   npm.cmd run test:sanity -- --retries=0
   npm.cmd run test:contract -- --retries=0
   docker rm -f canary-local
   ```

---

## End-to-end runbook

1. Make the change; update README / `obsidian-vault/AGENT_MEMORY.md` / the task note when
   behavior, tests, workflows, or user-facing behavior change (required by `AGENTS.md`).
2. Commit.
3. Run the advisory pre-merge review (Option A on a PR, or Option B locally with Claude Code).
   Resolve findings by human judgment.
4. `git push` → the pre-push hook runs `test:e2e` + `docker build`. Fix anything it blocks on.
5. PR path: ensure `PR Validation` is green and get a human approval (the hard gates), then merge.
6. After the push/merge to `main`, watch the **post-merge canary**. If it fails, pull the
   artifacts and triage as above.

---

## References

- `CLAUDE.md` — review role, repository focus, and review rules (the source of truth for scope).
- [`docs/github-premerge-canary-plan.md`](github-premerge-canary-plan.md) — original plan/decisions.
- [`docs/claude-review-handoff.md`](claude-review-handoff.md) — pulling Claude PR comments into Obsidian.
- [`.github/workflows/post-merge-canary.yml`](../.github/workflows/post-merge-canary.yml) — the canary.
- [`.githooks/pre-push`](../.githooks/pre-push) + [`scripts/pre-push-check.ps1`](../scripts/pre-push-check.ps1) / [`scripts/pre-push-check.js`](../scripts/pre-push-check.js) — the pre-push gate.
