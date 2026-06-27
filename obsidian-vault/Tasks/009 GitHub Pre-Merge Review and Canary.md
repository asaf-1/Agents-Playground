---
type: task
status: completed
tags:
  - task
  - automation
  - github-actions
  - claude-review
---

# GitHub Pre-Merge Review and Canary

## Outcome

Add a GitHub-first branch/PR flow with current-head Codex or Claude review evidence, deterministic pre-merge validation, and a post-merge canary for merged PR revisions.

## Context

The user wants to leave Jenkins out of scope for this phase and focus on the GitHub pipeline. Claude review should start free-first/manual, while automated Claude review remains deferred unless API-key and cost tradeoffs are explicitly approved.

## Target Files

- `CLAUDE.md`
- `.github/workflows/post-merge-canary.yml`
- `server.js`
- `playwright.config.ts`
- `README.md`
- `docs/github-premerge-canary-plan.md`
- `obsidian-vault/AGENT_MEMORY.md`
- `obsidian-vault/Inbox/Agents/2026-06-08-handoff-codex-to-claude-github-premerge-canary.md`

## Acceptance Criteria

- Jenkins is not modified.
- Pre-merge Claude review is documented as advisory and free-first/manual through `@claude review`.
- Automated Claude review is deferred until `ANTHROPIC_API_KEY` and usage-cost tradeoffs are explicitly approved.
- Direct pushes to `main` are blocked by the tracked local hook unless an emergency override is explicitly set.
- PR validation runs formatting and full Playwright coverage; root `pipeline.config.json` controls whether pre-merge Docker is also required.
- A GitHub post-merge canary workflow runs after a PR is merged into `main` and by manual dispatch.
- The canary probes `/api/health` and runs sanity plus contract tests using either the host or Docker runtime selected by policy.
- README and shared memory describe the GitHub-first flow.
- A continuation handoff exists for Claude or another agent.

## Validation

- `npm.cmd run test:sanity`
- `npm.cmd run test:contract`
- Docker canary build and container verification completed locally after Docker Desktop was activated.

## Notes For The Agent

- Keep Jenkins out of this phase unless the user explicitly reopens it.
- Keep Claude review advisory until the user explicitly accepts API secret/cost setup.
- Do not grant Claude write access to push commits in the first rollout.
- Keep the canary small; full regression remains separate.

## Result

Implemented the GitHub-first pre-merge/canary slice on 2026-06-08.

- Added root `CLAUDE.md` with project-specific review guidance.
- Added `.github/workflows/post-merge-canary.yml`.
- Updated `server.js` with `HOST` binding support so the app container can be probed through a published Docker port.
- Updated `playwright.config.ts` with `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_REUSE_EXISTING_SERVER=true` support for canary tests against an already-running app.
- Updated `README.md` and `obsidian-vault/AGENT_MEMORY.md` for the GitHub-first merge gate and post-merge canary.
- Added `docs/github-premerge-canary-plan.md` and a Claude handoff report.

Validation:

- `npm.cmd run test:sanity` passed: 1/1.
- `npm.cmd run test:contract` passed: 1/1.
- Docker health probe passed against `http://127.0.0.1:4173/api/health` with `status: ok`.
- Canary `npm.cmd run test:sanity` passed against the running Docker container: 1/1.
- Canary `npm.cmd run test:contract` passed against the running Docker container: 1/1.
- `git diff --check` passed.
- `docker build -t agents-playground-canary-local .` passed locally after Docker Desktop was activated.

## Dynamic Review And Canary Hardening Update

Updated on 2026-06-08.

- User added GitHub secret `CLAUDE_CODE_OAUTH_TOKEN` and approved OAuth-based Claude review wiring.
- Automatic Claude PR review workflow could not be added in this environment because the approval layer blocked persistent GitHub Actions export of private PR code/context to Anthropic.
- Safe dynamic handoff remains implemented with `scripts/github/fetch-claude-review.js`, `npm run review:claude:pull -- --pr <number>`, and `docs/claude-review-handoff.md` so Claude comments already present in GitHub can be pulled into Obsidian without copy/paste.
- Post-merge canary hardening was completed: per-commit non-canceling concurrency, loopback-only Docker port publishing, no `--rm` before diagnostics, container inspect/log capture, explicit `docker rm -f` cleanup, canary retries forced to `0`, and stale `test-results/` upload removed.

Validation:

- `git diff --check` passed with only line-ending warnings.
- `npm.cmd run test:sanity -- --retries=0` passed: 1/1.
- `npm.cmd run test:contract -- --retries=0` passed: 1/1.
- `npm.cmd run review:claude:pull -- --help` passed.

## Branch-First Gate Update

Updated on 2026-06-27.

- Work now starts on a feature branch; the tracked pre-push hook blocks ordinary direct pushes to `main`.
- `PR Validation / Pre-Merge Gate` runs formatting and full Playwright regression.
- Root `pipeline.config.json` temporarily sets both `preMerge.dockerEnabled` and `postMerge.dockerEnabled` to `false`; either stage can restore Docker independently.
- `AI Review Gate / Current Head Review` requires a trusted comment for the exact PR head SHA and the `ai-reviewed` label.
- `npm run review:ai:mark -- --pr <number> --reviewer <codex|claude>` records the review evidence and retriggers the gate.
- The post-merge canary triggers from a merged PR event, checks out the merge revision, and runs health, sanity, and contract checks on the host while Docker is disabled.
- GitHub returned HTTP 403 for private-repository branch protection on the current plan. The hook and checks are process controls; GitHub Pro or public visibility is required for a server-side merge lock.

Validation:

- `npm.cmd run format:check` passed.
- `npm.cmd run test:e2e` passed: 60 passed / 2 skipped.
- Host canary health probe passed with `status: ok`.
- Host canary `npm.cmd run test:sanity -- --retries=0` passed: 1/1.
- Host canary `npm.cmd run test:contract -- --retries=0` passed: 1/1.
- Cached `rhysd/actionlint:latest` workflow lint passed.
- `node --check scripts/github/mark-ai-review.js` and `git diff --check` passed.
- Dormant Docker runner build and dependency-volume sync passed before both runtime flags were disabled.
