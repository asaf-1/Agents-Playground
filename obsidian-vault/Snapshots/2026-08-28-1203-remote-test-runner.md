---
type: snapshot
status: open
tags:
  - snapshot
  - resume
  - test-runner
---

# Session Snapshot — Remote Test Runner

**Date:** 2026-08-28 12:03 local
**Agent:** Claude
**Branch:** `main` (uncommitted — needs a feature branch before any push)
**Last commit:** `66a6c34` Merge pull request #13 from asaf-1/ci/ai-review-gate-no-red

## Active Phase

New slice: an outsourced test runner. Colleagues sign in with a username and
password and start test flows that execute on a GitHub-hosted runner, without
ever being given access to the repository or the pipeline. Canonical detail is in
`docs/remote-test-runner.md` and the Current State entries in [[AGENT_MEMORY]].

## What Was In Flight

Feature is complete and validated locally. Nothing is mid-edit. The work is
uncommitted on `main`, which violates the branch policy — the next action is to
move it to a feature branch and open a PR.

## The requirement, as it actually landed

The goal was refined three times during the session. Final shape:

1. Someone else can run the tests **while the owner's PC is off**.
2. They get **no access to the repository or pipeline** — only the ability to run.
3. They authenticate with a **username and password**, and can then run as often
   as they want. No quota.

That combination is why the design ended where it did:

- The **workflow** satisfies (1) on its own; it never touches anyone's machine.
- The **Actions UI** cannot satisfy (2): `workflow_dispatch` needs repo write.
- So runs are **brokered** through `/api/test-runner/*`, with the GitHub token
  held server-side and runner accounts in front of it. That satisfies (2) and (3).
- Satisfying (1) _and_ (2) together means the **page must be hosted somewhere
  always-on**, because `server.js` serves it. This is the one piece not yet done
  — see Blockers.

## Last Decisions

- **React page, not C#/Razor.** The user asked whether Razor was viable ("if it's
  free" — it is, MIT). Rejected for this repo because it adds a second runtime to
  a Node-only toolchain: .NET SDK in every workflow, a second build and Docker
  stage, a duplicated API client. Mitigation: the backend is API-first
  (`/api/test-runner/*`, declared in `openapi.json`), so a Razor page, CLI, or
  Slack bot can be added later without redoing the backend. Revisit only if the
  team becomes .NET-first.
- **Username/password accounts, not a shared header token.** The shared
  `TEST_RUNNER_DISPATCH_TOKEN` survives only as a machine-caller option; humans
  get accounts. scrypt hashes, constant-time compare, per-account lockout,
  httpOnly + SameSite=Strict session cookie, in-memory sessions.
- **Fail closed.** A configured GitHub token with no accounts is refused (403)
  rather than trusting whoever deploys it to have read the docs.
- **The flow list hides behind login too**, because flow entries name internal
  spec paths.
- **GitHub-hosted runner, not self-hosted.** "Runs when my PC is off" is the
  whole point. A self-hosted label can be added later if tests ever need to reach
  a private network.
- **CI regenerates and commits the catalog**, over live discovery, so it is
  versioned and reviewable and works with no repo present.
- **The Actions UI `flow` input is a generated dropdown**, regenerated from the
  catalog by `sync-workflow-inputs.js` and committed by `flow-catalog.yml`. It
  carries the group and spec tiers (46 entries); the describe tier would roughly
  double the list, so those go through `flow_override`, which wins over the
  dropdown.
- **Committed catalog carries no timestamp/SHA.** A volatile field would diff on
  every push and defeat the "commit only when the flow set changed" contract.
- **`flow-catalog.json` is in `.prettierignore`.** Prettier collapses short
  arrays and the generator does not; formatting it would put `format:check` and
  the discovery job in a loop.

## Findings the real runs produced (do not re-litigate)

- Playwright **rejects `--browser` when the config defines projects**. Browser
  choice travels as `PLAYWRIGHT_BROWSER`, read by `playwright.config.ts` into
  `use.browserName`. Chrome channel now applies only to chromium.
- **Node refuses to spawn `npx.cmd` with `shell:false`** (`EINVAL`). Everything
  spawns `process.execPath` against the local CLI entrypoints instead, keeping
  `shell:false` and the injection-free argv path.
- **Playwright's URL glob matching includes the query string**, so
  `**/api/test-runner/runs` did not intercept `?limit=15`. The spec stubs use
  regex routes.
- **Playwright's blob reporter cleans its output directory per run**, so
  sequential local shards overwrite each other. Harmless in CI (one machine per
  shard); it only affects local simulation.
- File filters and `--grep` do **not** filter out dependency projects, so
  per-spec and per-describe flows keep the `setup` project's `storageState` mint.

## Workspace State

- New: `scripts/test-runner/` (10 files, incl. the generated `flow-catalog.json`),
  `web/src/pages/TestRunnerPage.tsx`,
  `.github/workflows/remote-test-runner.yml`,
  `.github/workflows/flow-catalog.yml`,
  `tests/e2e/app/react-test-runner.spec.ts`, `docs/remote-test-runner.md`,
  this snapshot
- Modified: `server.js` (delegates `/api/test-runner*`), `playwright.config.ts`
  (`PLAYWRIGHT_EXTERNAL_TARGET`, `browserName`), `web/src/api.ts`,
  `web/src/App.tsx`, `web/src/app.css`, `openapi.json`,
  `tests/e2e/app/api-openapi-contract.spec.ts`, `package.json`, `README.md`,
  `.gitignore`, `.prettierignore`, `obsidian-vault/AGENT_MEMORY.md`
- Modified before this session, unrelated and untouched: `.mcp.json`
- Validation, all green:
  - `npm run test:e2e` → 158 tests, 156 passed / 2 skipped
  - `npm run test:unit` → 4 passed
  - `npx prettier --check .` → clean (only untracked `.claude/settings.local.json`)
  - `npx tsc -p web/tsconfig.json --noEmit` and `-p tsconfig.json` → clean
  - `npm run flows:check` → current, 67 flows / 157 E2E tests
  - `npm run flows:sync-workflow` → current, 46 dropdown entries
  - Auth boundary exercised against a live server: flows hidden before login,
    401 on runs, wrong password and unknown user indistinguishable, httpOnly
    cookie issued, flows visible after login, 401 again after logout
  - Two-shard blob run + `merge-reports` → verified locally
- Open dev servers / containers: none
- **Never executed:** the GitHub workflows themselves. Neither
  `remote-test-runner.yml` nor `flow-catalog.yml` has run once. Their YAML
  parses and the plan step's `GITHUB_OUTPUT` was verified by emulating the
  runner's delimiter parser, but the end-to-end CI path is unproven.

## Resume Entry Point

> Move the change onto a feature branch (`feat/remote-test-runner`), push through
> the pre-push gate, and open a PR. Then, on that branch, run
> **Actions → Remote Test Runner → Run workflow** with `flow=group-sanity` to
> prove the workflow end to end for the first time, and check the `plan` job's
> summary plus the `remote-test-report-*` artifact.

## Blockers / Open Questions

- **Hosting is undecided and is the last mile.** Until the app runs somewhere
  always-on, colleagues cannot reach the page while the owner's PC is off. The
  `Dockerfile` is ready; the open question is where it goes (Azure Container
  Apps / Cloud Run / Fly / a VM) and who pays for it.
- The workflows are unproven in CI. First dispatch is the real test.
- `TEST_RUNNER_GITHUB_TOKEN` must be a fine-grained PAT scoped to `actions:write`
  on this repository only. Not yet created.
- Sessions are in-memory, so a restart signs everyone out and more than one
  process would need a shared session store. Fine for a single container.
- The `TEST_RUNNER_ALLOWED_TARGETS` allowlist is enforced but has no automated
  test, because it is driven by an env var the shared test server does not set.
  Consider setting it once non-admins can sign in: `target_url` otherwise aims a
  real CI browser at any address a signed-in user types.
- `flow-catalog.yml` is the first workflow in this repo with `contents: write`.
  Worth a deliberate look in review, though it is scoped to committing two
  generated files and cannot retrigger itself.
- Visual flows will fail on a remote Linux runner until Linux baselines are
  committed. The catalog marks those flows with a warning; nothing else done.

## Notes For The Next Agent

- `scripts/test-runner/catalog.js` is the single source of truth for flow lookup,
  option validation, and command building. The workflow, the executor, the server
  API, and the CLI all import it. Change validation rules there, not in callers.
- `resolve-flow.js` is the only trust boundary. `exec-flow.js` replays a resolved
  plan and must stay free of its own resolution logic.
- Adding a spec needs no runner change. Push it; `flow-catalog.yml` regenerates
  both the catalog and the Actions dropdown. Locally: `npm run flows:discover`
  then `npm run flows:sync-workflow`.
- Adding a curated group means editing `scripts/test-runner/flow-groups.json`,
  then regenerating.
- Do not reuse the demo auth in `server.js` for anything real: it ships a shared
  password on purpose. Runner auth is deliberately separate, in
  `scripts/test-runner/auth.js`.
