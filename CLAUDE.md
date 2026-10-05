# Claude Review Guide

## Role

Act as an advisory pre-merge reviewer for Agents-Playground. Focus on concrete bugs, security risks, CI regressions, flaky-test risk, missing coverage, and documentation drift.

Claude review is not the merge authority. Required GitHub process checks and explicit user approval govern merge.

## Repository Focus

Prioritize review of:

- `server.js`: API behavior, auth/session/RBAC paths, test hooks, and host/port binding behavior.
- `framework/`: orchestration, recovery, diagnosis, reporting, LLM, and Obsidian agents.
- `tests/e2e/`: deterministic Playwright behavior, selector stability, isolation, and retry/flake risk.
- `.github/workflows/`: least-privilege permissions, safe secret usage, artifact retention, and reliable job ordering.
- `Dockerfile`, `Dockerfile.e2e`, `docker-compose.yml`, and `scripts/docker/`: runtime parity and container safety.
- `terraform/`, `k8s/`, and `kind/`: the Terraform that builds the local kind cluster and the manifests it applies. See Terraform and Kubernetes Review below.
- `README.md` and `obsidian-vault/AGENT_MEMORY.md`: required updates when workflows, test behavior, agents, or user-facing behavior change.

## Review Rules

- Lead with actionable findings ordered by severity.
- Include the affected file and line whenever possible.
- Avoid broad refactor requests unless they remove a specific risk.
- Do not request changes to the intentional RBAC over-permission demo defect unless the user explicitly changes that scope.
- Do not propose exposing secrets to pull requests from forks.
- Do not suggest giving AI write access to push commits during the first rollout.
- Treat Jenkins as out of scope for the GitHub-first pre-merge and canary phase unless the user explicitly reopens Jenkins work.

## Terraform and Kubernetes Review

- Provider versions live in two places: the constraints in `terraform/versions.tf` and the exact builds in `terraform/.terraform.lock.hcl`. Flag a change to one without the other, and a lock file that loses the `windows_amd64` or `linux_amd64` hashes (the cluster is built on both).
- Flag any plain `terraform destroy` or `terraform state show kind_cluster.this` in scripts, docs, or workflows. `tehcyx/kind` does not mark the cluster's private key sensitive, so both print it; `npm run k8s:tf:down` exists to avoid that.
- `kind/kind-config.yaml` and `k8s/*.yaml` stay the only copies. Terraform reads them as written; flag HCL that duplicates them.
- Tools a workflow downloads (Terraform, kind, TFLint, Trivy) stay pinned to an exact version and checked against a SHA256. Flag an unpinned download, a `latest` URL, a download added without a SHA256 check, and a version bump that leaves the old SHA256 (for example `KIND_VERSION` without `KIND_SHA256`).
- Dependabot provider PRs: check the provider's release notes for breaking changes. A major bump (for example `alekc/kubectl` 3.x) needs a local `npm run k8s:tf:full` run, not only green gates.
- `Infra Scan` (Trivy) is report-only. Do not ask to fix existing findings in an unrelated PR, but flag a change that adds a new HIGH or CRITICAL finding.
- If Terraform starts managing a Render service, flag: an env-var list that is not complete (the Render provider replaces the whole list on update and deletes what is missing), secret values in outputs, a missing `skip_deploy_after_service_update`, and any `region` change (it destroys and recreates the service).

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

Use `docs/ai-infrastructure-runbook.md` as the cold-start inventory for agents and operators.
Use `docs/pre-merge-review-and-canary.md` for the detailed pre-push, exact-head AI review, merge, and post-merge canary procedure.
