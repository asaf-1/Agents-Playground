# Remote Test Runner

Two separate things. Keep them straight:

|                         | What it is                                                                                                            | Who uses it                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **The pipeline**        | `.github/workflows/remote-test-runner.yml` plus `scripts/test-runner/`. Runs any test flow on a GitHub-hosted runner. | Maintainers, via `gh` / the Actions UI. Needs repo write.       |
| **The Test Runner app** | `test-runner/` — a standalone web app with its own server, UI, and login.                                             | Colleagues, via a username and password. No repo access at all. |

`server.js` at the repository root is the website **under test**. The runner is
what fires tests at it. They are not the same app and share no code.

This document covers the pipeline. For the standalone app — setup, sign-up modes,
deployment — see **`test-runner/README.md`**.

## Access model

A run has to be startable by someone who has no GitHub account. That rules out
the Actions UI and `repository_dispatch`, because `workflow_dispatch` requires
repository write permission, which is far more than "may run the tests".

So the standalone app brokers it: the GitHub token lives inside that app,
colleagues authenticate against accounts it issues, and all they can do is start
a catalogued flow and read its status. They never see the code, push anything,
read a secret, or open the Actions tab.

Nothing in the pipeline depends on anyone's machine being on. The app does need
to run somewhere always-on for people to reach it — it has its own `Dockerfile`
for that.

## The pieces

| Piece                                      | What it does                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `scripts/test-runner/flow-groups.json`     | Curated, hand-maintained flow groups. Stable ids that pipelines and docs can reference.             |
| `scripts/test-runner/discover-flows.js`    | Asks Playwright for the test tree and writes the catalog. Adds spec-level and describe-level flows. |
| `scripts/test-runner/flow-catalog.json`    | The generated catalog. Committed, so the page and the workflow read the same list.                  |
| `scripts/test-runner/catalog.js`           | Shared flow lookup, option validation, and command building. The single source of truth.            |
| `scripts/test-runner/resolve-flow.js`      | Validates a flow id plus options into an execution plan. The trust boundary.                        |
| `scripts/test-runner/exec-flow.js`         | Replays one shard of a plan. Spawns the runner with `shell:false`.                                  |
| `scripts/test-runner/trigger-remote.js`    | `npm run test:remote`: starts and follows a run from a terminal.                                    |
| `test-runner/`                             | The standalone runner app: own server, UI, login/sign-up, Dockerfile.                               |
| `.github/workflows/remote-test-runner.yml` | The runner itself: plan → sharded test matrix → merged report.                                      |
| `.github/workflows/flow-catalog.yml`       | Refreshes and commits the catalog on every push to `main`.                                          |

## Flow tiers

Discovery produces three tiers, all runnable:

- **Groups** (`group-sanity`, `group-regression`, …) — curated in
  `flow-groups.json`. Stable ids, safe to reference from other pipelines.
- **Spec files** (`spec-app-react-orders`) — one per spec file. This tier grows
  by itself when you push a new spec.
- **Test blocks** (`suite-scenarios-rbac-rbac`) — one per top-level
  `test.describe`, targeted with an escaped `--grep`.

List them:

```powershell
npm.cmd run flows:list
```

## Starting a run

### From the Test Runner app

Open the app (default `http://127.0.0.1:4300`), sign in, pick a flow, press
**Run**. This is the surface for people who should be able to run tests without
any GitHub access.

The app is a separate deployment with its own configuration; see
`test-runner/README.md`. It fetches the flow catalog through the GitHub API
rather than from a checkout, so it stays in step with pushed specs on its own.

### From a terminal

```powershell
npm.cmd run test:remote -- --list
npm.cmd run test:remote -- --flow group-sanity
npm.cmd run test:remote -- --flow group-regression --shards 4 --watch
npm.cmd run test:remote -- --flow spec-app-react-orders --target-url https://staging.example.com --watch --download
```

`--watch` exits with the run's status. `--download` pulls artifacts into
`.artifacts/remote/<run-id>/`.

### From the Actions UI

**Actions -> Remote Test Runner -> Run workflow.** `flow` is a free-text
input rather than a dropdown: GitHub refuses to let the default
`GITHUB_TOKEN` push changes to a workflow file, so a dropdown generated from
the catalog could never be kept in step by CI. The plan job validates the id
and fails fast with the list of valid ones. `npm run flows:list` prints them.

This surface needs **repository write access**, so it is for maintainers
rather than for colleagues - that is what the runner app exists to avoid.

### From anything else

`repository_dispatch` lets an external system start a run over HTTPS — a Slack
bot, another repository, a scheduler:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{"event_type":"remote-test-run","client_payload":{"flow":"group-sanity","shards":"1","browser":"chromium"}}'
```

`client_payload` accepts `flow`, `target_url`, `shards`, `browser`, `retries`,
`workers`, `reason`, and `ref`. A `repository_dispatch` always starts on the
default branch, so name the revision you want in `ref`.

### From another workflow

The runner also exposes `workflow_call`:

```yaml
jobs:
  smoke:
    uses: ./.github/workflows/remote-test-runner.yml
    with:
      flow: group-sanity
      target_url: https://staging.example.com
```

It outputs `result` and `flow_name`.

## Run options

| Option       | Values                    | Notes                                                               |
| ------------ | ------------------------- | ------------------------------------------------------------------- |
| `target_url` | any `http(s)` URL         | Blank builds and serves the app in CI. Set it to test a deployment. |
| `shards`     | 1–8                       | Capped by the flow's own `maxShards`. Blank uses that maximum.      |
| `browser`    | chromium, firefox, webkit | Travels as `PLAYWRIGHT_BROWSER`; see the note below.                |
| `retries`    | 0–3                       | Playwright retries per test.                                        |
| `workers`    | 1–8                       | Workers per shard.                                                  |
| `reason`     | free text, 200 chars      | Recorded in the run's job summary.                                  |

When `target_url` is set, `PLAYWRIGHT_EXTERNAL_TARGET=true` suppresses the
config's `webServer` block, so CI does not build and boot a local app the tests
will never talk to.

Browser choice is an env var, not `--browser`: Playwright rejects that CLI flag
once a config defines projects, and this one defines
`setup`/`authenticated`/`default`.

## Keeping the catalog current

`flow-catalog.yml` runs on every push to `main` that touches `tests/`,
`web/src/`, the Playwright configs, or `scripts/test-runner/`. It regenerates the
catalog and commits it only when the flow set actually changed.

The committed catalog holds no timestamp or commit SHA on purpose — a volatile
field would produce a diff on every push and defeat that check.

The commit uses the default `GITHUB_TOKEN`. Pushes made with that token do not
trigger workflows, so the job cannot retrigger itself.

Locally:

```powershell
npm.cmd run flows:discover   # regenerate
npm.cmd run flows:check      # exit 1 if stale
```

`flow-catalog.json` is in `.prettierignore`: Prettier collapses short arrays and
the generator does not, so formatting it would put `format:check` and the
discovery job in a loop.

## Running a flow locally

The same plan the workflow executes, on your machine:

```powershell
npm.cmd run test:flow -- --flow group-sanity
npm.cmd run test:flow -- --flow suite-scenarios-rbac-rbac --dry-run
```

## Safety model

- **One trust boundary.** `resolve-flow.js` validates every caller-supplied
  value against the committed catalog and the `normalize*` rules. `exec-flow.js`
  only replays the result.
- **No shell.** Runners are spawned with `shell:false` against the local CLI
  entrypoints. Spec paths and `--grep` patterns containing regex metacharacters
  are passed as argv, never as shell text.
- **Caller data travels as env.** The workflow puts inputs and
  `client_payload` values into `env:` blocks and lets Node read them, rather than
  interpolating them into a `run:` script.
- **Least privilege.** `remote-test-runner.yml` runs with `contents: read`.
  Only `flow-catalog.yml` holds `contents: write`, and only to commit one file.
- **The token stays server-side.** It lives in the standalone app, is never
  sent to the browser, and is never echoed in a response or a log line.
- **Runs are attributed.** The signed-in account name is recorded in the run's
  job summary, so "who started this" is answerable without repo access.
- **Sign-up is gated by default.** The app ships in `invite` mode, so a
  deployment is not open to whoever finds the URL.
- **Validated before dispatch.** The app checks the flow id against the catalog
  and every run option before calling GitHub, so a bad request never reaches CI.

## Artifacts

Every run uploads:

- `remote-test-plan-<run>` — the resolved plan, so the exact command is on record
- `remote-test-blob-<run>-<shard>` — per-shard blob reports
- `remote-test-artifacts-<run>-<shard>` — `.artifacts/` and `test-results/`
- `remote-test-report-<flow>-<run>` — the merged HTML report

## Known limits

- Visual flows carry a warning: screenshot baselines are platform-specific, so a
  remote Linux run needs Linux baselines committed or it fails on pixel diffs.
- `workflow_dispatch` returns no run id, so the run is located by polling for the
  newest run created after the dispatch. Under simultaneous dispatches of the
  same flow the reported id can be a colleague's run; the run page is always
  authoritative.
- Run history needs a configured token, because it reads the GitHub API.
- The standalone app keeps sessions in memory, so restarting it signs everyone
  out and running more than one instance would need a shared session store.

## Related

- `docs/pre-merge-review-and-canary.md` — the pre-merge gate and canary flow
- `docs/ai-infrastructure-runbook.md` — cold-start inventory for agents
