---
type: map
tags: [infrastructure, ci, github-actions, docker, merge-gate, canary, policy-reconciliation]
created: 2026-06-08
---

# 09 Infrastructure and CI Map

The single authoritative note for how a change reaches `main` in Agents-Playground: the merge
lifecycle, every GitHub Actions workflow, the post-merge canary contract, the Docker topology,
and the **CI policy reconciliation** that supersedes the stale Jenkins merge-gate language still
scattered across older notes.

This note promotes [`docs/pre-merge-review-and-canary.md`](../docs/pre-merge-review-and-canary.md)
into the discoverable vault. For architecture and dependency context see
[[07 Architecture Overview]] and [[08 Vault Dependency Map]]; for the implementation record see
[[009 GitHub Pre-Merge Review and Canary]]. Entry point: [[00 Home]].

> **Authority model.** Claude review is **advisory only**. The hard merge gates are GitHub
> `PR Validation` passing **and** a human approval. The pre-push hook is a local mechanical gate;
> the post-merge canary is an early-warning signal, **not** a gate.

---

## 1. Pipeline lifecycle

```
 local change
     │  git commit
     ▼
 PRE-PUSH HOOK  (.githooks/pre-push → scripts/pre-push-check.ps1|.js)
   npm run test:e2e  +  docker build -t ai-agentic-project-prepush .
     │  pass (fail ⇒ push aborts; bypass: git push --no-verify, emergencies only)
     ▼
 open PR  ──▶  ADVISORY CLAUDE REVIEW  ("@claude review once", or local pre-push review)
     │            advisory only — resolved by human judgment (CLAUDE.md)
     ▼
 PR VALIDATION  (pr-validation.yml: sanity+contracts → functional → scenarios)
     │  +  HUMAN APPROVAL + required checks   ◀── HARD merge gate
     ▼
 merge / push to main
     ├─▶ POST-MERGE CANARY (post-merge-canary.yml)  — fast health signal, not a gate
     ├─▶ MAIN BRANCH VALIDATION (main-validation.yml) — full regression on every push
     └─▶ DAILY REGRESSION (daily-regression.yml)      — nightly full suite, 05:00 UTC cron
```

The suite is **62 tests (60 pass / 2 skip)**. A clean checkout is green because
`obsidian-vault/Tasks/` is git-tracked (see [[08 Vault Dependency Map]] for the one HARD seam).

---

## 2. Per-workflow cards

All workflows are least-privilege. None expose secrets to fork PRs. Only `main-validation.yml`
touches the vault, and only as a tolerant artifact upload (soft).

### `pr-validation.yml` — PR Validation (HARD merge gate)

| Field | Value |
|-------|-------|
| Trigger | `pull_request` → `main` |
| Permissions | `contents: read`, `packages: read` |
| Runner | `ubuntu-latest`, `timeout-minutes: 25`; containerized via the published GHCR Playwright runner (`Dockerfile.e2e` image, tag `main`) |
| Suites | sanity + contracts → functional → scenarios (three sequential steps) |
| Artifacts | `pr-test-artifacts`: `.artifacts/` + `test-results/`, retention **7d** |
| Vault touch | none |

`packages: read` exists only to pull the GHCR runner image. The `scenarios` step is the one that
exercises `real-agent-proof.spec.ts` (the HARD-but-green seam, see [[08 Vault Dependency Map]]).

### `post-merge-canary.yml` — Post-Merge Canary (signal, not a gate)

| Field | Value |
|-------|-------|
| Trigger | `push` → `main`, `workflow_dispatch` |
| Permissions | `contents: read` only |
| Concurrency | `group: post-merge-canary-${{ github.sha }}`, `cancel-in-progress: false` (per-commit, never cancelled) |
| Runner | `ubuntu-latest`, `timeout-minutes: 20`; **runner pinned to Node 20** (see §3) |
| Suites | `test:sanity --retries=0` + `test:contract --retries=0` against the running container |
| Artifacts | `post-merge-canary-<sha>`: `.artifacts/`, retention **14d** |
| Vault touch | none |

Builds the app image from `Dockerfile`, runs it with `HOST=0.0.0.0` published to
`127.0.0.1:4173:4173`, probes `GET /api/health` (up to 30 attempts, requires `{"status":"ok"}`).
Container is **not** `--rm` so a crash-on-start survives for `docker logs`/`docker inspect`
capture; an explicit `docker rm -f` cleanup runs afterward.

### `main-validation.yml` — Main Branch Validation (full regression, SOFT vault touch)

| Field | Value |
|-------|-------|
| Trigger | `push` → `main`, `workflow_dispatch` |
| Permissions | `contents: read`, `packages: read` |
| Runner | `ubuntu-latest`, `timeout-minutes: 30`; containerized GHCR runner pinned to `${{ github.sha }}` |
| Suites | `npx playwright test --reporter=list` (full suite) |
| Artifacts | `main-test-artifacts-<sha>`: `.artifacts/` + `test-results/` + **`obsidian-vault/Reports/`**, retention **14d** |
| Vault touch | **SOFT** — uploads `obsidian-vault/Reports/` (gitignored; tolerates a missing/empty path) |

This is the only workflow that reaches the vault. `Reports/` is gitignored (see [[08 Vault Dependency Map]]),
so the upload is tolerant — it never fails the job when the path is empty.

### `daily-regression.yml` — Daily Regression

| Field | Value |
|-------|-------|
| Trigger | `schedule: 0 5 * * *` (05:00 UTC), `workflow_dispatch` |
| Permissions | `contents: read`, `packages: read` |
| Runner | `ubuntu-latest`, `timeout-minutes: 35`; containerized GHCR runner (tag `main`) |
| Suites | `npm run test:e2e` (full suite, output teed to a log; report synthesized from pass/fail/skip counts) |
| Artifacts | `daily-regression-<run_number>`: `.artifacts/` + `test-results/`, retention **14d** |
| Vault touch | none (report is a GitHub artifact only; never written back to the vault) |

Detailed operator context for the nightly run lives in [[04 Daily Regression Automation]].

### `publish-playwright-runner.yml` — Publish Playwright Runner (infra image build)

| Field | Value |
|-------|-------|
| Trigger | `push` → `main` on `Dockerfile.e2e` / `package.json` / `package-lock.json` / this workflow; `workflow_dispatch` |
| Permissions | `contents: read`, **`packages: write`** (the only write-scoped workflow — it publishes to GHCR) |
| Runner | `ubuntu-latest`, `timeout-minutes: 30`; Buildx + GHA cache (`scope=playwright-runner`) |
| Output | `ghcr.io/asaf-1/genai-agenticai-demo-playwright` tagged `main` + `sha-<long>` |
| Vault touch | none |

This produces the runner image that PR / main / daily workflows consume. `packages: write` is
scoped to this build job only.

---

## 3. Canary contract

Per `CLAUDE.md`, the post-merge canary must:

1. Build the app container from `Dockerfile`.
2. Run the app with `HOST=0.0.0.0` so GitHub Actions can probe it through the published port.
3. Probe `GET /api/health`.
4. Run `npm run test:sanity`.
5. Run `npm run test:contract`.
6. Upload `.artifacts/` (and `test-results/`).

**Keep the canary fast and focused.** It runs only health + sanity + contract. Full regression
belongs in `main-validation.yml`. **Flag any canary change that grows it toward full-regression
scope** — that scope creep is a review finding, not an enhancement.

**App Node vs runner Node are independent.** The app image (`Dockerfile`) is **`node:24`**, but
the canary **runner** (`actions/setup-node`) is pinned to **Node 20** because Playwright 1.59's
browser installer hangs on Node 24. The canary boots a Node-24 app container and drives it from a
Node-20 runner; the two Node versions are deliberately decoupled.

---

## 4. Docker topology

| Image / file | Base | Role |
|--------------|------|------|
| `Dockerfile` | `node:24-bookworm-slim` | **App image.** `npm ci`, `EXPOSE 4173`, `CMD ["node","server.js","4173"]`. Built by the canary; honors `HOST`/`PORT`. |
| `Dockerfile.e2e` | `mcr.microsoft.com/playwright:v1.59.1-noble` (digest-pinned) | **QA runner image** published to GHCR by `publish-playwright-runner.yml`. PR / main / daily run the suite inside this container. |
| `docker-compose.yml` | builds `Dockerfile.e2e` (`qa-runner` service) | Local containerized runner; `.:/workspace` bind mount + named `qa_runner_node_modules` volume, `shm_size: 2gb`, `command: sleep infinity`. |
| `.devcontainer/devcontainer.json` | uses `docker-compose.yml` `qa-runner` | VS Code dev container wrapping the compose runner. |

**Runner resolution / execution scripts** (`scripts/docker/`):

- `resolve-playwright-runner.sh` — resolves the runner image (primary GHCR tag → fallbacks → local
  build label), used by PR / main / daily workflows.
- `run-containerized-playwright.sh` — runs a Playwright command inside the resolved runner with the
  shared `node_modules` volume.

App-image vs runner-image are independent build paths; only the canary builds `Dockerfile`, and
only `publish-playwright-runner.yml` builds/pushes `Dockerfile.e2e`. See [[07 Architecture Overview]]
for how these tie into the app/runtime split.

---

## 5. POLICY RECONCILIATION (authoritative)

> **CI is GitHub-first. Jenkins is OUT OF SCOPE for the pre-merge and canary phase.**
> This section is the authoritative policy. Where older notes still describe Jenkins as a merge
> gate, **this note supersedes them.**

The current merge gates are, exactly:

1. GitHub **`PR Validation`** (`pr-validation.yml`) passes.
2. A **human reviewer approves** the PR.

Claude review is advisory. The pre-push hook is a local mechanical gate. The post-merge canary,
main-validation, and daily-regression are **post-merge** signals, not gates. **No Jenkins step is
part of any current gate.** (Per `CLAUDE.md` and [[009 GitHub Pre-Merge Review and Canary]].)

### Stale Jenkins merge-gate locations that this note supersedes

Each location below still carries pre-GitHub-first Jenkins language and should defer to **this**
note. Do not act on the Jenkins gate language in them:

| Location | Stale claim | Status |
|----------|-------------|--------|
| `AGENTS.md` lines 15–17 | "treat Jenkins validation … as the required gate before merge"; "Jenkins validation passed on the pushed code before merge"; "Jenkins should run Docker validation before the Playwright validation" | Superseded — gate is GitHub `PR Validation` + human approval |
| [[05 Enterprise Infrastructure Rules]] lines 12, 29, 38, 53, 62 | "local first, Docker second, Jenkins third, then merge"; "Validate the pushed revision in Jenkins before merge"; Jenkins jobs in the no-reuse list; "portable across Jenkins, GitHub Actions"; "local validation, Docker validation, Jenkins validation, then merge gating" | Superseded for the GitHub-first phase; keep only the portability intent |
| [[04 Daily Regression Automation]] (merge-gate parity wording, lines 88–91) | "Docker gate … for … merge-gate parity"; "merge-gate parity" framing | Superseded — daily regression is a post-merge signal, not a merge-gate mirror |
| [[02 Test Map]] "CI Split" lines 287–294 | "Daily Jenkins pipeline"; "Normal Jenkins validation"; "Pre-merge Jenkins rule: … Jenkins should validate the pushed revision … before merge" | Superseded — replaced by the GitHub workflows in §2 |

If Jenkins work is ever reopened, it must be done by an **explicit user decision** that re-scopes
the policy here first (per `CLAUDE.md`).

---

## 6. Links and runbooks

- [[009 GitHub Pre-Merge Review and Canary]] — the implementation/decision record for this phase.
- [`docs/pre-merge-review-and-canary.md`](../docs/pre-merge-review-and-canary.md) — full operator
  guide (pre-push hook wiring, advisory review options, canary triage runbook).
- [`docs/claude-review-handoff.md`](../docs/claude-review-handoff.md) — pulling Claude PR review
  comments into `obsidian-vault/Inbox/Agents/` via `npm run review:claude:pull`.
- [`docs/github-premerge-canary-plan.md`](../docs/github-premerge-canary-plan.md) — original
  plan/decisions.
- Related vault maps: [[07 Architecture Overview]] · [[08 Vault Dependency Map]] · [[00 Home]] ·
  [[AGENT_MEMORY]].
