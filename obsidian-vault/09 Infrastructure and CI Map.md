---
type: map
tags:
  [
    infrastructure,
    ci,
    github-actions,
    docker,
    merge-gate,
    canary,
    policy-reconciliation,
  ]
created: 2026-06-08
---

# 09 Infrastructure and CI Map

The canonical vault map for the active GitHub-first infrastructure. The executable,
copy-paste-ready operating contract is
[`docs/ai-infrastructure-runbook.md`](../docs/ai-infrastructure-runbook.md); detailed review and
canary procedures live in
[`docs/pre-merge-review-and-canary.md`](../docs/pre-merge-review-and-canary.md).

For architecture and dependency context see [[07 Architecture Overview]] and
[[08 Vault Dependency Map]]; for the implementation record see
[[009 GitHub Pre-Merge Review and Canary]]. Entry point: [[00 Home]].

> **Authority model.** The tracked hook blocks unsafe local pushes. `PR Validation` and
> `AI Review Gate` are required process checks, but the current private-repository plan cannot
> lock the merge button. Merge requires green checks, human judgment, and explicit user approval.
> The post-merge canary is an early-warning signal, not a gate.

---

## 1. Pipeline lifecycle

```text
feature branch
  -> commit
  -> tracked pre-push hook
       full Playwright
       optional Docker from pipeline.config.json
  -> pull request into main
       PR Validation / Pre-Merge Gate
       Codex or Claude reviews exact head SHA
       AI Review Gate / Current Head Review
  -> user-approved merge
  -> Post-Merge Canary
       exact merge revision
       host or Docker from pipeline.config.json
       health + sanity + contract + artifacts
  -> Main Branch Validation

Daily Regression runs independently at 05:00 UTC.
```

The suite is **143 Playwright tests (141 pass / 2 skip) + 4 Vitest**. A clean checkout is green because
`obsidian-vault/Tasks/` is tracked (see [[08 Vault Dependency Map]] for the one HARD seam).

---

## 2. Per-workflow cards

All workflows are least-privilege. None expose secrets to fork PRs. Only `main-validation.yml`
touches the vault, and only as a tolerant artifact upload (soft).

### `pr-validation.yml` - PR Validation (required process check)

| Field       | Value                                                                                |
| ----------- | ------------------------------------------------------------------------------------ |
| Trigger     | non-draft `pull_request` events targeting `main`                                     |
| Permissions | `contents: read`, `packages: read`                                                   |
| Runner      | `ubuntu-latest`, Node 24 (host); jobs: `format` + 4-shard matrix + `gate`            |
| Suites      | formatting + Playwright **4 shards x 4 workers** (host Chromium, blob reporter)      |
| Gate        | a `Pre-Merge Gate` job aggregates `format` + all 4 shards into one required check    |
| Artifacts   | `pr-blob-<shard>` per shard + a merged HTML report `pr-merged-report-<pr>-<attempt>` |
| Vault touch | none                                                                                 |

The required check is the `Pre-Merge Gate` aggregation job (green only if formatting and all 4
shards pass). A new PR commit cancels stale validation through per-PR concurrency.

### `post-merge-canary.yml` - Post-Merge Canary (signal, not a gate)

| Field       | Value                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| Trigger     | PR closed with `merged == true` targeting `main`, or `workflow_dispatch` |
| Permissions | `contents: read` only                                                    |
| Concurrency | merge revision SHA, `cancel-in-progress: false`                          |
| Runner      | `ubuntu-latest`, Node 24, `timeout-minutes: 20`                          |
| Policy      | reads `postMerge.dockerEnabled` from `pipeline.config.json`              |
| Runtime     | current `false`: host process; `true`: app container                     |
| Suites      | `/api/health`, sanity, and contract with retries disabled                |
| Artifacts   | `post-merge-canary-<sha>`, retention 14 days                             |
| Vault touch | none                                                                     |

The canary checks out the exact merge revision. Host mode captures `canary-host.log`; Docker
mode keeps container logs and inspect data before cleanup.

### `main-validation.yml` — Main Branch Validation (full regression, SOFT vault touch)

| Field       | Value                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Trigger     | `push` → `main`, `workflow_dispatch`                                                                             |
| Permissions | `contents: read`, `packages: read`                                                                               |
| Runner      | `ubuntu-latest`; **4-shard matrix** in the containerized GHCR runner (`:main`) + a `report` job                  |
| Suites      | `npx playwright test --shard=<n>/4 --workers=4 --reporter=blob` per shard (full suite, **4 shards x 4 workers**) |
| Artifacts   | `main-blob-<shard>` per shard + merged HTML report `main-merged-report-<sha>`, retention **14d**                 |
| Vault touch | **SOFT** — uploads `obsidian-vault/Reports/` (gitignored; tolerates a missing/empty path)                        |

This is the only workflow that reaches the vault. `Reports/` is gitignored (see [[08 Vault Dependency Map]]),
so the upload is tolerant — it never fails the job when the path is empty.

### `daily-regression.yml` — Daily Regression

| Field       | Value                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Trigger     | `schedule: 0 5 * * *` (05:00 UTC), `workflow_dispatch`                                               |
| Permissions | `contents: read`, `packages: read`                                                                   |
| Runner      | `ubuntu-latest`, `timeout-minutes: 35`; containerized GHCR runner (tag `main`)                       |
| Suites      | `npm run test:e2e` (full suite, output teed to a log; report synthesized from pass/fail/skip counts) |
| Artifacts   | `daily-regression-<run_number>`: `.artifacts/` + `test-results/`, retention **14d**                  |
| Vault touch | none (report is a GitHub artifact only; never written back to the vault)                             |

Detailed operator context for the nightly run lives in [[04 Daily Regression Automation]].

### `publish-playwright-runner.yml` — Publish Playwright Runner (infra image build)

| Field       | Value                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Trigger     | `push` → `main` on `Dockerfile.e2e` / `package.json` / `package-lock.json` / this workflow; `workflow_dispatch` |
| Permissions | `contents: read`, **`packages: write`** (the only write-scoped workflow — it publishes to GHCR)                 |
| Runner      | `ubuntu-latest`, `timeout-minutes: 30`; Buildx + GHA cache (`scope=playwright-runner`)                          |
| Output      | `ghcr.io/asaf-1/genai-agenticai-demo-playwright` tagged `main` + `sha-<long>`                                   |
| Vault touch | none                                                                                                            |

This produces the runner image that PR / main / daily workflows consume. `packages: write` is
scoped to this build job only.

---

## 3. Canary contract

Per `CLAUDE.md`, the post-merge canary must:

1. Read `postMerge.dockerEnabled` from `pipeline.config.json`.
2. Check out the exact merged revision.
3. Start the app on the GitHub runner when Docker is off, or build and start `Dockerfile` when Docker is on.
4. Probe `GET /api/health`.
5. Run `npm run test:sanity` and `npm run test:contract`.
6. Upload host or container diagnostics plus `.artifacts/` and `test-results/`, then clean up.

**Keep the canary fast and focused.** It runs only health + sanity + contract. Full regression
belongs in `main-validation.yml`. **Flag any canary change that grows it toward full-regression
scope** — that scope creep is a review finding, not an enhancement.

**App Node vs runner Node are independent.** The app image (`Dockerfile`) is **`node:24`**, and the
GitHub host runners now use **Node 24** as well. The earlier Node 20 pin existed only because
Playwright 1.59's browser installer hung on Node 24; the Playwright 1.61.1 upgrade (validated on
Node 25) resolved it, so the pin was lifted on 2026-06-27 — a deliberate update, not a permanent
Node-version contract.

---

## 4. Docker topology

| Image / file                      | Base                                                         | Role                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Dockerfile`                      | `node:24-bookworm-slim`                                      | **App image.** Used by pre-merge or post-merge validation only when its Docker policy flag is enabled; honors `HOST`/`PORT`.               |
| `Dockerfile.e2e`                  | `mcr.microsoft.com/playwright:v1.61.1-noble` (digest-pinned) | **QA runner image.** Published to GHCR and used by main/daily; PR validation uses it when pre-merge Docker is enabled.                     |
| `docker-compose.yml`              | builds `Dockerfile.e2e` (`qa-runner` service)                | Local containerized runner; `.:/workspace` bind mount + named `qa_runner_node_modules` volume, `shm_size: 2gb`, `command: sleep infinity`. |
| `.devcontainer/devcontainer.json` | uses `docker-compose.yml` `qa-runner`                        | VS Code dev container wrapping the compose runner.                                                                                         |

**Runner resolution / execution scripts** (`scripts/docker/`):

- `resolve-playwright-runner.sh` — resolves the runner image (primary GHCR tag → fallbacks → local
  build label), used by PR / main / daily workflows.
- `run-containerized-playwright.sh` — runs a Playwright command inside the resolved runner with the
  shared `node_modules` volume.

App-image and runner-image are independent build paths. The app image is built only when a stage's
Docker policy is enabled. Only `publish-playwright-runner.yml` publishes `Dockerfile.e2e`; consumers
may fall back to a local runner build. See [[07 Architecture Overview]] for the app/runtime split.

---

## 5. POLICY RECONCILIATION (authoritative)

> **CI is GitHub-first. Jenkins is OUT OF SCOPE for the pre-merge and canary phase.**
> This section and the executable runbook are the current operating policy.

The current process gates are, exactly:

1. The tracked local pre-push hook passes full Playwright regression and any enabled Docker check.
2. GitHub **`PR Validation / Pre-Merge Gate`** passes.
3. **`AI Review Gate / Current Head Review`** passes for the exact PR head after findings are resolved.
4. The user explicitly approves the merge.
5. After merge, **`Post-Merge Canary`** is checked as the deployment signal.

Branch protection cannot currently hard-lock those checks on this private-repository plan, so they
are enforced by the runbook and review process. Post-merge canary, main validation, and daily
regression are signals after integration, not substitutes for the pre-merge checks. Jenkins is not
part of the current flow unless the user explicitly reopens that scope.

---

## 6. Links and runbooks

- [`docs/ai-infrastructure-runbook.md`](../docs/ai-infrastructure-runbook.md) — executable inventory
  and cold-start instructions for Codex, Claude, and human operators.
- [[009 GitHub Pre-Merge Review and Canary]] — the implementation/decision record for this phase.
- [`docs/pre-merge-review-and-canary.md`](../docs/pre-merge-review-and-canary.md) — full operator
  guide (pre-push hook wiring, advisory review options, canary triage runbook).
- [`docs/claude-review-handoff.md`](../docs/claude-review-handoff.md) — pulling Claude PR review
  comments into `obsidian-vault/Inbox/Agents/` via `npm run review:claude:pull`.
- [`docs/github-premerge-canary-plan.md`](../docs/github-premerge-canary-plan.md) — original
  plan/decisions.
- Related vault maps: [[07 Architecture Overview]] · [[08 Vault Dependency Map]] · [[00 Home]] ·
  [[AGENT_MEMORY]].
