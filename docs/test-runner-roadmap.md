# Test Runner — state, backlog, and plan

Working notes for the test runner work. This is the running record that the
final process runbook will be written from, so keep it honest: what is actually
done, what is parked, and what is not built yet.

**Rule for this project: no mock, demo, or placeholder data anywhere.** Every
screen shows real data from the real catalog and the real GitHub API, or it shows
an honest diagnosis of why it cannot. If something cannot be done for real, it
does not ship.

## The two halves

|            | What                                          | Where                                                              |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Pipeline   | Runs the tests on GitHub-hosted runners       | `.github/workflows/remote-test-runner.yml`, `scripts/test-runner/` |
| Runner app | Standalone site people log into to start runs | `test-runner/`                                                     |

`server.js` at the repo root is the **website under test**. It is not part of the
runner and must never be coupled to it.

## Done and verified

- **Pipeline**: plan → sharded test matrix → merged report. Triggers via
  `workflow_dispatch`, `repository_dispatch`, `workflow_call`.
- **Self-updating flow catalog**: `flow-catalog.yml` regenerates
  `scripts/test-runner/flow-catalog.json` on every push to `main`, committing
  only when the flow set changed. Currently **63 flows / 142 E2E tests** across
  three tiers (groups, spec files, describe blocks). It commits only that JSON:
  anything under `.github/workflows/` has to be edited by a human, because the
  default `GITHUB_TOKEN` cannot push a workflow file.
- **Standalone app**: own server, no npm dependencies, no build step. Sign-up
  (invite / open / off), login, sessions, roles. Dashboard, Run, History, Users
  tabs. Console logs per job, cancel, run history.
- **Verified against a live server**: invite-code gating; first account becomes
  admin; non-admin gets 403 on admin routes; last-admin and self-delete guards;
  no plaintext password in the store or the log; unknown flow rejected with 400
  before GitHub is called; non-http target URL rejected.
- **Security fix**: `currentUser()` re-reads the account on every request, so a
  session can no longer outlive its account and a demoted admin loses admin
  immediately. Verified by deleting a signed-in user from `users.json` by hand
  and by promoting a user in the file — both took effect on the next request.
- **Resilience fix**: the dashboard and history tab degrade with an actionable
  message when GitHub cannot answer, instead of surfacing a bare "Not Found".

## First real run — done

PR #14 merged as `d33306b`, and the pipeline executed for the first time:
run [33163908029](https://github.com/asaf-1/Agents-Playground/actions/runs/33163908029),
`group-sanity`, **success**. Plan → Sanity smoke (1/1) → Report, 1m21s. It
produced the artifacts the app needs, including `remote-test-results`
(1519 bytes) which unblocks per-test results.

### Two bugs that only a real run could find

Both were mine, and both are fixed in the follow-up branch:

1. **`flow-catalog.yml` could not push.** It failed with _"refusing to allow a
   GitHub App to create or update workflow `remote-test-runner.yml` without
   `workflows` permission"_. The default `GITHUB_TOKEN` **cannot be granted**
   that permission, so the design of having CI regenerate a `flow` dropdown
   inside another workflow file was impossible from the start. Fix: the dropdown
   is gone, `flow` is a free-text input validated by the plan job, and
   `sync-workflow-inputs.js` was deleted rather than left as dead code.
2. **The committed catalog was stale.** CI regenerated 63 flows / 142 tests
   against my committed 67 / 157: the catalog still described
   `tests/e2e/app/react-test-runner.spec.ts`, which was deleted during the
   revert without regenerating. CI was right. Lesson for the runbook:
   regenerate and re-run `flows:check` _after_ any change to the test set, not
   before.

### Still needed for colleagues to use it

1. **Create a fine-grained PAT** scoped to this one repository, Actions: read
   and write, nothing else. That is the runner app's only credential.
2. **Set the app's env** (`TR_GITHUB_TOKEN`, `TR_REPO`, `TR_INVITE_CODE`, and
   `TR_SECURE_COOKIE=true` behind HTTPS). See `test-runner/.env.example`.
3. **Deploy the app somewhere always-on** so it is reachable while the owner's
   machine is off. `test-runner/Dockerfile` is ready; mount a volume at
   `/app/data` or accounts vanish on redeploy.

## Parked side tasks

Deliberately deferred. Do not silently drop these.

- **Linux visual baselines.** Three flows (`group-visual`, `spec-visual-visual`,
  `suite-visual-visual-react-surface-visual-snapshots`) carry a warning in the
  catalog: screenshot baselines were generated on Windows, and a Linux runner
  renders fonts and antialiasing differently, so they fail on pixel diffs
  remotely even when nothing is broken. Fix by generating baselines inside a
  Linux container (`--update-snapshots`) and committing them. Until then the
  warning stays and those flows are expected to be red remotely.
- **`example.com` in the Target URL placeholder.** Cosmetic input hint, not
  data. Revisit if it reads as sample content.
- **GitHub auto-merge for our own PRs.** Requested 2026-08-28, to be done
  **after** the test runner checklist is closed, and clarified in the same
  breath: this is not an agent and not Copilot. It is GitHub's built-in
  auto-merge, which merges a pull request by itself the moment its required
  checks pass. Nothing reviews, nothing edits, nothing needs a token.

  What it takes:

  1. Settings -> General -> Pull Requests -> tick **Allow auto-merge**. Repo
     setting, once.
  2. Branch protection on `main` with the required checks listed - at minimum
     `PR Validation / Pre-Merge Gate` and `AI Review Gate / Current Head Review`.
     Without required checks auto-merge has nothing to wait for and fires
     immediately, which is the opposite of the point.
  3. Per PR: click **Enable auto-merge**, or `gh pr merge --auto --squash <n>`.
     A push to the branch re-runs the checks and the merge waits again, so
     "merge automatically when we push changes" is exactly what it does.

  This does **not** conflict with `CLAUDE.md`: required checks plus human
  approval stay the merge authority, and enabling auto-merge on a PR is a human
  act. No AI gets push access. That was the concern with the agent framing, and
  it does not apply here.

  Unrelated but worth keeping straight, since it came up while discussing this:
  `GITHUB_TOKEN` cannot be granted the `workflows` permission, so no CI job can
  ever create or modify a file under `.github/workflows/`. That is what killed
  `sync-workflow-inputs.js`. It has nothing to do with auto-merge.

## Decided: no database, credentials stay in the environment

Decided 2026-08-28, by the user, after the options were laid out. Do not reopen
this without being asked to.

Accounts live in `TR_USERS` on Render: newline or comma separated
`username:role:scrypt$...` entries. Only the hash is stored anywhere; the
password itself exists on no server, in no repository, and in no transcript.

The reason is Render's free plan, which has **no persistent disk**. A
file-backed store there is wiped on every restart and redeploy, and because the
first account created on an empty store becomes admin, the next visitor would be
handed admin. Environment accounts survive restarts and cannot be edited from
inside the app, so `TR_SIGNUP_MODE=off` there is correct rather than a
limitation.

The cost of this choice is real and should be stated plainly to anyone who asks:
adding a person means editing an environment variable in the Render dashboard
and waiting for a redeploy. There is no audit log of who ran what.

**The upgrade path needs no code.** `src/store.js` already implements the
file-backed store, `TR_USERS_FILE=/app/data/users.json` is already set, and the
Dockerfile already creates `/app/data`. Attaching a Render disk at `/app/data`
turns on persistence and self-signup with zero code change. `node:sqlite` ships
with Node 24 if a real table is wanted later, still with no npm dependency.

Rejected, with reasons worth keeping:

- **Render's free Postgres** is deleted after 30 days. An auth store that
  disappears on a timer is worse than no store.
- **Neon or Supabase free Postgres** needs the `pg` package, which breaks the
  zero-dependency rule this app is built on. Writing a Postgres wire-protocol
  client by hand to preserve that rule would be a much larger and riskier piece
  of code than the problem justifies.

Note also that once OIDC lands, credential storage stops mattering: the identity
provider holds the account, authorisation comes from an email-domain allowlist,
and there is nothing left to store.

## Standing rules

Non-negotiable for this project. Violations are defects, not preferences.

- **No mock, demo, or placeholder data.** Real data or an honest diagnosis.
- **Point the runner only at this repository.** An agent once aimed it at
  `microsoft/playwright` to get live run data for a screenshot. Real data from
  somebody else's repo is worse than a mock: it looks legitimate and it is not
  ours. Validate against our own runs, or against nothing.
- **Only test failures are presented as failures.** A run that failed because
  the pipeline broke - cancelled, timed out, runner died, checkout or npm ci
  failed, browser install failed - is not a test failure and must not be shown
  or counted as one. It is an infrastructure problem and needs its own category
  and wording. This applies to the history list, the dashboard tiles, and the
  success-rate figure, which currently lumps every non-success conclusion
  together.
- **The UI must stay readable.** Clean, organised, not compressed. A dark/light
  toggle is required, not optional.

## Open checklist

Requested directly. Not yet complete.

- [x] Sign-up and sign-in working. Verified end to end after fixing a real
      break: the security hardening changed `signup`/`login` to take the request
      and become async (per-IP rate limiting, off-thread scrypt), and `server.js`
      still called them synchronously — every attempt would have 500'd.
- [ ] **OIDC / company sign-in.** Not built. Needs an app registration on the
      identity provider (Entra or Google) before it can be verified, so it can be
      written but not proven without those credentials.
- [ ] **UI: too compressed and narrow.** Needs a real spacing scale, wider and
      clearer use of the window, and a responsive layout rather than one that
      assumes a wide screen.
- [ ] **Dark/light toggle.**
- [ ] **History must be test-only.** It currently shows GitHub's run title, which
      for push-triggered runs is the commit message, plus the branch — so it reads
      like a commit log. `run-name` now names each run after the flow and the
      person who started it; the UI still needs to drop the branch and commit
      columns in favour of flow, who, outcome, duration.
- [ ] **Cancel button for tests.** Built server-side (`cancelRun`, guarded so a
      user cannot cancel unrelated CI) and wired in the UI, but not yet verified
      against a real in-flight run.

## Elevation plan

Agreed order. Each step is sequenced for a reason, not by preference.

1. **Per-test results** — show _which_ tests failed, not just a red run. The
   workflow now uploads a machine-readable `results.json` artifact
   (`remote-test-results`); the app needs to download it, unzip it (GitHub always
   zips artifacts; a small zip reader keeps the zero-dependency promise), parse
   it, and render per-spec results with links to the trace and screenshot.
   _Highest daily value, and self-contained._
2. **SQLite + audit log + the app's own test suite** — `node:sqlite` is built
   into Node 24, so still zero dependencies (upstream still marks it
   experimental; note that in the runbook). Persist users, audit entries, and
   cached run data. Add a real Playwright suite for the runner itself. _Comes
   before scheduling because a schedule that forgets itself on restart is not a
   feature._
3. **Scheduling + failure alerts** — cron-style schedules held by the app, plus
   Slack/generic webhook notification on failure. Depends on step 2 for durable
   storage.
4. **SSO (Entra / Google) + per-flow permissions** — free, and the right answer
   for company-wide access. Deliberately last: hand-rolled OIDC is where subtle
   security bugs live (state, nonce, PKCE, audience, clock skew), so it wants
   tests in place first. Keep password login as a fallback rather than replacing
   it outright.

## Final deliverable

A process runbook so another AI or engineer can reproduce this work from
scratch: the architecture decisions and _why_, the mistakes made and how they
were caught, the exact verification steps, and the operational setup. Write it
from this file once the plan above is complete.

### Mistakes worth recording in that runbook

- The runner was first built as a page inside the demo app (`/app/test-runner`)
  served by `server.js`. That was wrong: it coupled the runner to the app under
  test, and it dies whenever that app is down. Fully reverted. The runner is a
  separate application.
- Playwright rejects `--browser` once a config defines projects; browser choice
  has to travel as an env var the config reads.
- Node refuses to spawn `npx.cmd` with `shell:false`; spawn `process.execPath`
  against the local CLI entrypoint instead.
- Playwright's URL glob matching includes the query string, so
  `**/api/x/runs` does not intercept `runs?limit=15`.
- Playwright's blob reporter cleans its output directory per run, so sequential
  local shards overwrite each other.
- A stale `node server.js` holding an old `openapi.json` in memory caused a
  contract test to fail against a reverted file. Playwright reuses an existing
  server locally, so restart it after changing served fixtures.
