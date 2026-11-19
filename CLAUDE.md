# Claude Review Guide

## READ THIS FIRST — never touch git without being told to

Nothing that touches the repository happens unless the user has just asked for
that specific thing: no `git add`, no commit, no amend, no branch, no stash, no
push, no pull request, no arming auto-merge, no deleting a branch.

**None of these is permission:** approving the work or the plan; "go ahead" or
"go all the way" about the task; a skill whose steps include pushing; a yes
given earlier in the session; or the work being finished, green and obviously
ready.

Leave it uncommitted in the working tree, say what a push would contain, and
stop. If git refuses something because of uncommitted changes, say so and ask —
do not stash or commit around it.

## And never put slow work on the every-PR path

Broken on 2026-10-17 and it must not happen again. The Neon database job was
measured at 70 seconds on a laptop, wired to run on every pull request, and
took **10m43s** on a GitHub runner — three times per pull request, on open, on
every push and on close. It was measured locally and switched on globally,
which is the wrong order.

**The rule, for any new job, check or gate:**

1. **Never add a `pull_request` trigger until the work has run in CI at least
   once and been timed there.** A local timing does not transfer: the runner is
   further away, slower and has fewer cores.
2. **Ship it on `workflow_dispatch` first.** Promote it to automatic only after
   a real run shows the cost. Promoting later is one line; un-wiring it after
   it has wasted someone's day is not.
3. **State the cost in minutes per pull request, out loud, before building**,
   and let the user decide. "It takes 70 seconds locally" is not that number.
4. **Anything depending on an outside service stays advisory**, never a
   required check. Their outage must not become a blocked merge here.
5. **Approval of a feature is not approval of its blast radius.** "Go ahead"
   means build the thing; it does not mean put it in front of every merge. Ask
   about that separately.

Applies to every workflow in `.github/workflows/`, every hook, and every step
added to an existing job.

## And a version check means our tools only

When the user says "check version", "what needs update" or anything like it,
check only the infra scope and the tools this repo uses:

- the repo's pins, which `npm run infra:report` checks;
- the PC's work tools, each by its own winget id
  (`winget list --id <id> --exact`): `Hashicorp.Terraform`, `Kubernetes.kind`,
  `GrafanaLabs.k6`, `Python.Python.3.12`, `GitHub.cli`, `Git.Git`,
  `OpenJS.NodeJS.LTS`.

Never run a bare `winget upgrade` or `winget list`; they print every program on
the PC. Never check, list or mention games, launchers, other apps, Windows,
.NET runtimes, drivers or WSL. Detail in `.claude/skills/update-infra/SKILL.md`.

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
- `terraform-github/`: the repository's own settings on GitHub (the ruleset on `main`, labels, description, topics, merge buttons), state in HCP Terraform, run locally only. See Terraform and Kubernetes Review below.
- `README.md` and `obsidian-vault/AGENT_MEMORY.md`: required updates when workflows, test behavior, agents, or user-facing behavior change.

## Review Rules

- Lead with actionable findings ordered by severity.
- Include the affected file and line whenever possible.
- Avoid broad refactor requests unless they remove a specific risk.
- Do not request changes to the intentional RBAC over-permission demo defect unless the user explicitly changes that scope.
- Do not propose exposing secrets to pull requests from forks.
- Do not suggest giving AI write access to push commits during the first rollout.
- Treat Jenkins as out of scope for the GitHub-first pre-merge and canary phase unless the user explicitly reopens Jenkins work.
- `Security Scan` (`security-scan.yml`, OWASP ZAP) scans only the website (`server.js`, `/`, `/app`) on the runner, never `test-runner/` or a Render URL, and stays a passive baseline scan that is report-only. Flag a change that points it elsewhere, switches to an active scan, or makes findings fail the job without the user's approval. Do not ask to fix existing findings in an unrelated PR.
- Since 2026-10-26 the scan reads 0 High, 0 Medium and 0 Low; only informational items remain. Every response's security headers come from `security-headers.js`. Flag: a response written with `writeHead` that bypasses it; `'unsafe-inline'` or a wildcard entering the `app` policy (the classic pages' `style-src` is the one deliberate exception); a new page or dialog added without a run of the browser walk in `react-bank-devices.spec.ts`; and a PR that brings a Medium or Low finding back.

## Terraform and Kubernetes Review

- Provider versions live in two places per folder: the constraints in `versions.tf` and the exact builds in `.terraform.lock.hcl`, in both `terraform/` and `terraform-github/`. Flag a change to one without the other, and a lock file that loses the `windows_amd64` or `linux_amd64` hashes (both folders run on both). Modules under `terraform/modules/` state only a lower bound (`>=`), because Dependabot edits only the root: a second `~>` pin in a module broke its PR #82 (2026-11-06). Flag a `~>` or exact version there, and a `node_image` added back to `kind_cluster.this`, which leaves it unset so the node image follows the provider's kind.
- `terraform-github/` adopts what already exists on GitHub; it never creates or destroys the repository or the ruleset. Flag: removal of `prevent_destroy` from `github_repository.this` or `github_repository_ruleset.main`; a plan, script or doc step that creates, destroys or replaces either; `Pre-Merge Gate` leaving `required_check` or losing its `integration_id`; a `bypass_actors` block; the `ai-reviewed` label leaving `local.labels`; the token anywhere other than the `TF_VAR_github_token` environment variable (never a file, a `tfvars`, an output or a workflow secret); and any workflow that runs `plan` or `apply` for that folder in CI, which is local-only by design. The ruleset also carries a setting the provider cannot see, `require_extra_approval_for_unattributed_changes`, so a PR that changes the ruleset should say it was re-checked with `gh api` after apply.
- Flag any plain `terraform destroy` or `terraform state show module.cluster.kind_cluster.this` in scripts, docs, or workflows. `tehcyx/kind` does not mark the cluster's private key sensitive, so both print it; `npm run k8s:tf:down` exists to avoid that.
- Image pulls in CI: since 2026-10-26 the Kubernetes canary logs in to Docker Hub with the read-only `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets before building, because anonymous pulls from GitHub's shared runners hit `429 Too Many Requests`, and moving to Amazon's public mirror (2026-10-09) only delayed it. Flag: a change that drops the log-in step; a "fix" for a 429 that switches the base image to another anonymous mirror instead of logging in; a new image-building step without the log-in; and the token anywhere other than the repository secrets.
- `kind/kind-config.yaml` and `k8s/*.yaml` stay the only copies. Terraform reads them as written; flag HCL that duplicates them.
- Tools a workflow downloads (Terraform, kind, TFLint, Trivy, and the ZAP image by digest) stay pinned to an exact version and checked against a SHA256. Flag an unpinned download, a `latest` URL, a download added without a SHA256 check, and a version bump that leaves the old SHA256 (for example `KIND_VERSION` without `KIND_SHA256`).
- `scripts/infra-versions.js` (since 2026-11-06) keeps those pins current: on the user's PC (`npm run infra:update` or `/update-infra`), and since 2026-11-16, at the user's word, weekly on GitHub (`.github/workflows/infra-updates.yml`, Tuesday 06:37 UTC; off the hour since 2026-11-17, because GitHub delays scheduled runs most at the start of the hour), which opens a `bot/infra-updates-<date>` PR labelled `infra-update` with the `INFRA_UPDATE_TOKEN` secret (a fine-grained token for this repo only; a PR opened with `GITHUB_TOKEN` starts no checks). The CI run holds Prettier (`INFRA_HOLD`), because a Prettier move re-formats the repo. Guarded by `tests/e2e/infra/infra-updates.spec.ts`. Flag: the updater taught to edit `pr-validation.yml`, `@axe-core/playwright`, npm majors or GitHub Actions versions; a version read from anywhere but the tool's own source; the 7-day wait shortened; the alignment test in `tests/e2e/infra/` weakened or skipped; the workflow given a `pull_request`/`push` trigger, more than `contents: read`, the bot token used beyond its token check and PR step, or stored by the checkout (`persist-credentials` must stay `false`), a push to anything but its own branch, a `--force` push, or `git add` beyond `-u`; and the token anywhere but that secret.
- The bots' PRs carry themselves through (since 2026-11-16): `.github/workflows/dependabot-auto-merge.yml` (daily, 07:43 UTC) takes only Dependabot's PRs whose files are all under `terraform/` and `terraform-github/`, and the tools bot's PRs (the owner's name, a `bot/infra-updates-*` branch, the `infra-update` label, only the updater's own files, never `pr-validation.yml` or itself). It requires Pre-Merge Gate plus each check the files start (Terraform Validate, Infra Scan, Security Scan), runs the Kubernetes canary on the bot's branch when a change reaches the cluster (this replaced the local `npm run k8s:tf:full` for major provider bumps), merges the checked commit, and starts the post-merge runs itself. Every other PR, and the regular auto-merge `/push` arms, are untouched. Guarded by `tests/e2e/infra/dependabot-auto-merge.spec.ts`. Flag: a `pull_request`, `pull_request_target`, `push` or `workflow_run` trigger on it; acting on any other PR or file; a permission beyond `contents`, `pull-requests` and `actions` write and `checks` read; any `secrets.` or `actions/checkout`; a merge without the gates, the cluster canary or `--match-head-commit`; and a guard spec weakened or skipped. The bots' labels (`dependencies`, `terraform`, `infra-update`) are in `terraform-github/main.tf`.
- `/recall` pulls (since 2026-11-16, the user's standing permission): `scripts/local-sync.js` fetches GitHub and fast-forwards `main` only when the repo is on `main` with nothing uncommitted or untracked, then installs only what the pull changed (`npm ci` skipped while a local server runs). It never adds, commits, pushes, stashes, resets or switches branch, and never installs a program for the whole PC; guarded by `tests/e2e/infra/local-sync.spec.ts`. Flag any of those added to it.
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
- Run the app directly on the GitHub runner when Docker is disabled, after building the bank's pages (`npm run build`; a fresh checkout has none, so every `/app` page would answer "Not found").
- Build and run the app container when Docker is enabled.
- Probe the bank's ready check, `GET /api/bank/health/ready`.
- Run the bank canary, `npm run test:canary` (home, sign-up, one transfer, the practice list, and the bank's answers against `bank/openapi.json`).
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
