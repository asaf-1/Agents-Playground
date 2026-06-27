# Claude Review Guide

## Role

Act as an advisory pre-merge reviewer for Agents-Playground. Focus on concrete bugs, security risks, CI regressions, flaky-test risk, missing coverage, and documentation drift.

Claude review is not the merge authority. Required GitHub checks and human approval remain the hard gates.

## Repository Focus

Prioritize review of:

- `server.js`: API behavior, auth/session/RBAC paths, test hooks, and host/port binding behavior.
- `framework/`: orchestration, recovery, diagnosis, reporting, LLM, and Obsidian agents.
- `tests/e2e/`: deterministic Playwright behavior, selector stability, isolation, and retry/flake risk.
- `.github/workflows/`: least-privilege permissions, safe secret usage, artifact retention, and reliable job ordering.
- `Dockerfile`, `Dockerfile.e2e`, `docker-compose.yml`, and `scripts/docker/`: runtime parity and container safety.
- `README.md` and `obsidian-vault/AGENT_MEMORY.md`: required updates when workflows, test behavior, agents, or user-facing behavior change.

## Review Rules

- Lead with actionable findings ordered by severity.
- Include the affected file and line whenever possible.
- Avoid broad refactor requests unless they remove a specific risk.
- Do not request changes to the intentional RBAC over-permission demo defect unless the user explicitly changes that scope.
- Do not propose exposing secrets to pull requests from forks.
- Do not suggest giving AI write access to push commits during the first rollout.
- Treat Jenkins as out of scope for the GitHub-first pre-merge and canary phase unless the user explicitly reopens Jenkins work.

## Pre-Merge Expectations

Before merge, expect:

- The change is on a feature branch and reaches `main` through a PR.
- GitHub `PR Validation / Pre-Merge Gate` passes after formatting and full Playwright regression; Docker also runs when enabled in `pipeline.config.json`.
- Codex or Claude reviews the current PR head.
- Actionable AI findings are resolved or explicitly accepted by human judgment.
- `AI Review Gate / Current Head Review` passes for the exact head SHA before merge.

When asked to review a PR, inspect:

- Changed files only, plus nearby code needed to understand behavior.
- Whether Playwright changes preserve deterministic state and `data-testid` hooks.
- Whether workflow changes keep permissions minimal.
- Whether docs and Obsidian memory were updated when required by `AGENTS.md`.

## Post-Merge Canary Expectations

The post-merge canary should:

- Trigger only for a PR that was merged into `main` or a deliberate manual dispatch.
- Read `postMerge.dockerEnabled` from `pipeline.config.json`.
- Run the app directly on the GitHub runner when Docker is disabled.
- Build and run the app container when Docker is enabled.
- Probe `GET /api/health`.
- Run `npm run test:sanity` and `npm run test:contract`.
- Upload `.artifacts/`.

Flag any canary change that grows into full regression scope. Full regression belongs in `main-validation.yml`; canary should stay fast and focused.

## Dynamic Claude Handoff

For PRs, keep Claude output in GitHub instead of chat. After Claude reviews a PR, pull the review into Obsidian with:

```powershell
npm.cmd run review:claude:pull -- --pr <number>
```

The generated handoff note lives under `obsidian-vault/Inbox/Agents/` and should be used as the source for follow-up fixes.

## Process Runbook

The end-to-end operator guide for the pre-push hook, the advisory pre-merge review, and the post-merge canary is `docs/pre-merge-review-and-canary.md`.
