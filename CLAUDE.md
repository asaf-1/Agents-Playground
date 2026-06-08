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

- GitHub `PR Validation` passes.
- A human reviewer approves the PR.
- Claude review is advisory and should be resolved by human judgment.

When asked to review a PR, inspect:

- Changed files only, plus nearby code needed to understand behavior.
- Whether Playwright changes preserve deterministic state and `data-testid` hooks.
- Whether workflow changes keep permissions minimal.
- Whether docs and Obsidian memory were updated when required by `AGENTS.md`.

## Post-Merge Canary Expectations

The post-merge canary should:

- Build the app container from `Dockerfile`.
- Run the app with `HOST=0.0.0.0` so GitHub Actions can probe it through the published port.
- Probe `GET /api/health`.
- Run `npm run test:sanity`.
- Run `npm run test:contract`.
- Upload `.artifacts/` and `test-results/`.

Flag any canary change that grows into full regression scope. Full regression belongs in `main-validation.yml`; canary should stay fast and focused.