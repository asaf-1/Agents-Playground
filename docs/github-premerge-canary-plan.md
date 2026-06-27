# GitHub Pre-Merge Review and Post-Merge Canary Plan

## Scope

This plan covers GitHub Actions only. Jenkins is intentionally out of scope for this phase.

Target repository: `Agents-Playground`

Current GitHub automation:

- `.github/workflows/pr-validation.yml` runs pull request Playwright validation against `main`.
- `.github/workflows/main-validation.yml` runs full regression after pushes to `main`.
- `.github/workflows/daily-regression.yml` runs scheduled regression.
- `.github/workflows/publish-playwright-runner.yml` publishes the Playwright runner image.

Goal:

- Add free-first Claude-assisted code review before merge.
- Add post-merge canary validation after code reaches `main`.
- Keep the current PR test gate as the hard merge signal.
- Avoid Jenkins changes in this phase.

## Design Principles

- Claude review is advisory by default. It should improve review quality, but it should not replace human approval or deterministic CI.
- GitHub Actions test jobs remain the source of truth for merge blocking.
- The canary job should be small, fast, and focused on whether the merged app starts and serves critical routes.
- All artifacts should be retained for debugging.
- Secrets must never be exposed to pull requests from forks.

## Pre-Merge Flow

Recommended phase 1 flow:

1. Developer opens a pull request into `main`.
2. Existing `PR Validation` workflow runs:
   - sanity tests
   - contract tests
   - functional tests
   - scenario tests
3. Reviewer triggers Claude review manually with `@claude review` when needed.
4. Human reviewer resolves Claude findings that are actionable.
5. PR can merge only after required GitHub checks and human approval pass.

Why this order:

- It keeps the first version free-first and avoids immediate dependency on a paid Anthropic API key.
- It limits false-positive risk because Claude findings are reviewed by a person.
- It does not weaken the existing Playwright gate.

## Optional Automated Claude Review

Automated Claude review can be added later with a dedicated workflow when budget and secret setup are accepted.

Expected requirements:

- Repository secret: `ANTHROPIC_API_KEY`
- Restricted GitHub Actions permissions:
  - `contents: read`
  - `pull-requests: write`
  - `issues: write` only if PR comments require it
- Trigger only on safe pull request events.
- Avoid running with elevated secrets on untrusted fork code.

Suggested behavior:

- Run on `pull_request` opened, synchronize, and reopened.
- Review only changed files.
- Ignore generated artifacts, dependency lock churn unless package changes need review, and local-only reports.
- Post a summary comment and inline comments for high-confidence issues.
- Never auto-commit changes.

This should stay optional because Claude automation can create API cost, and AI review should not become the only required reviewer.

## Claude Review Instructions

Add a root `CLAUDE.md` before enabling automated review.

The file should instruct Claude to focus on:

- `server.js` API behavior and test hooks.
- `framework/` agent orchestration, reporting, and diagnosis logic.
- `tests/e2e/` reliability, determinism, and Playwright selector stability.
- `.github/workflows/` CI safety, permissions, artifact handling, and secret exposure.
- `Dockerfile`, `Dockerfile.e2e`, and `docker-compose.yml` runtime behavior.
- Documentation alignment when workflows, test counts, agents, or behaviors change.

Review criteria:

- Prioritize correctness, security, CI reliability, flaky-test risk, and missing coverage.
- Do not request broad refactors unless they remove a concrete risk.
- Flag any workflow that grants unnecessary write permissions.
- Flag any test that depends on timing, shared mutable state, or external services without a controlled fallback.
- Flag any change that updates behavior without updating `README.md` and `obsidian-vault/AGENT_MEMORY.md` when required by `AGENTS.md`.

## Post-Merge Canary Flow

Add a new GitHub Actions workflow:

`.github/workflows/post-merge-canary.yml`

Trigger:

- `push` to `main`
- `workflow_dispatch`

Recommended jobs:

1. `app-canary`
   - Checkout repository.
   - Build the app image from `Dockerfile`.
   - Run the app container on port `4173`.
   - Probe `GET /api/health`.
   - Run `npm run test:sanity`.
   - Run `npm run test:contract` if runtime remains fast enough.
   - Upload `.artifacts/` and `test-results/`.

2. Optional later job: `runner-canary`
   - Resolve the Playwright runner image for `${{ github.sha }}` with fallback to `main`.
   - Run `npm run test:sanity` inside the runner image.
   - This verifies the published test runner, not just the app container.

Initial canary command set:

```bash
npm run test:sanity
npm run test:contract
```

Health endpoint:

```text
GET http://127.0.0.1:4173/api/health
```

Expected result:

```json
{
  "status": "ok"
}
```

## Branch Protection

Required before merge:

- `PR Validation / validate`
- human approval

Optional after automated Claude review is added:

- require Claude review summary to be present, but do not make it the sole approval path
- require conversation resolution for actionable Claude comments

Not recommended:

- Blocking all merges on every Claude comment.
- Giving Claude write access to push commits in the first rollout.
- Running privileged secret-bearing jobs on forked PR code.

## Implementation Steps

Phase 1: Documentation and manual Claude review

1. Add this plan.
2. Add `CLAUDE.md`.
3. Document PR process in `README.md`.
4. Use manual `@claude review` on PRs.

Phase 2: GitHub post-merge canary

1. Add `.github/workflows/post-merge-canary.yml`.
2. Build and run the app container from `Dockerfile`.
3. Add health probe against `/api/health`.
4. Run sanity and contract Playwright tests.
5. Upload artifacts with 14-day retention.

Phase 3: Optional automated Claude workflow

1. Add `ANTHROPIC_API_KEY` as a repository secret.
2. Add a minimal Claude review workflow.
3. Restrict permissions.
4. Test on a small PR.
5. Tune `CLAUDE.md` based on false positives.

Phase 4: Enterprise hardening

1. Add branch protection rule documentation.
2. Add CODEOWNERS for workflow and runtime files.
3. Add canary report summaries to GitHub job summary.
4. Add notifications only after the signal is stable.

## Acceptance Criteria

- PRs still run the existing GitHub `PR Validation` workflow.
- Manual Claude review process is documented.
- `CLAUDE.md` gives project-specific review rules.
- New post-merge canary runs on pushes to `main`.
- Canary fails if `/api/health`, sanity, or contract checks fail.
- Canary artifacts are uploaded.
- No Jenkins file or Jenkins process is changed.

## Risks and Mitigations

- Risk: Claude review is not truly free if automated through API.
  - Mitigation: start with manual `@claude review`; automate only after budget approval.
- Risk: AI comments create noise.
  - Mitigation: keep Claude advisory, tune `CLAUDE.md`, and require human judgment.
- Risk: canary duplicates full regression.
  - Mitigation: keep canary to health, sanity, and contract coverage only.
- Risk: secrets leak through PR workflows.
  - Mitigation: avoid secret-bearing Claude jobs on untrusted fork PRs.

## Next Action

Implementation started on 2026-06-08:

1. Root `CLAUDE.md` was added.
2. `README.md` and `obsidian-vault/AGENT_MEMORY.md` were updated for the GitHub-first flow.
3. `.github/workflows/post-merge-canary.yml` was added.
4. `server.js` now supports `HOST=0.0.0.0` for the canary container.
5. `playwright.config.ts` now supports `PLAYWRIGHT_REUSE_EXISTING_SERVER=true` and `PLAYWRIGHT_BASE_URL` for canary tests.

Next implementation choice:

1. Keep manual/free-first Claude review.
2. Add automated Claude review only after explicit approval for `ANTHROPIC_API_KEY` and usage-cost tradeoffs.

## Branch-First Update (2026-06-27)

- Development now occurs on feature branches rather than direct pushes to `main`.
- The tracked pre-push hook blocks ordinary direct-main pushes and always runs full Playwright; root `pipeline.config.json` controls Docker independently for pre-merge and post-merge.
- `PR Validation / Pre-Merge Gate` runs formatting and full Playwright. `preMerge.dockerEnabled: false` currently selects the host path.
- `AI Review Gate / Current Head Review` requires a trusted SHA-bound Codex or Claude review attestation.
- `npm run review:ai:mark -- --pr <number> --reviewer <codex|claude>` records the current-head attestation and retriggers the review gate.
- The post-merge canary triggers only for merged PRs into `main` or manual dispatch, checks out the exact merge revision, and uses the host while `postMerge.dockerEnabled` is `false`.

GitHub Actions remain available on the private repository. GitHub's API returned HTTP 403 for private-repository branch protection on the current plan, so the local hook and visible checks are process controls rather than a server-enforced merge lock. GitHub Pro or public repository visibility would enable the hard remote rule.
