# The remote test runner

[← Back to the README](../../README.md)

<p align="center">
  <img src="../assets/runner.gif" alt="The test runner: signing in, picking a suite, confirming, watching the run and reading which tests failed" width="900" />
</p>
<p align="center">
  <sub>Recorded with the runner's stub mode, so these runs are pretend; the screens are the real ones.</sub>
</p>

The problem it solves: someone needs to run your test suite, and giving them
repository access is the wrong answer.

They get a username and a password on a separate web app. The app holds one
fine-grained GitHub token server-side and dispatches
`.github/workflows/remote-test-runner.yml` on their behalf. They never see the
repository, the pipeline, or the token — and it works with your machine switched
off.

```
Colleague ──▶ test runner app ──▶ GitHub Actions ──▶ 144 flows / 459 tests
  user+pass      one token,          your pipeline
                 server-side
```

<p align="center">
  <img src="../assets/test-runner-dashboard.png" alt="The test runner's dashboard: run counts, and the ten usual suites with how each went last time" width="900" />
</p>

- **Pick what to run, in plain words.** Three levels: **suites** for the usual
  runs (Sanity smoke, Full regression, API contract…), **pages** for one screen
  or API area of the site, and **single checks** for one block of tests. Each
  has a sentence on what it checks — read from the comment at the top of its
  spec — how many tests it holds, about how long it takes, and how it went last
  time. Search narrows any level and says where else a word turns up.
- **One question before it starts.** What runs, where, in which browser, on how
  many machines, and about how long, with a box for why.
- **Watch it go.** The run's own page shows Plan, the tests and the report as
  they happen, then which tests failed and the assertion that failed them, the
  files the run left, and the console output one job at a time. Cancel it while
  it runs; run it again when it is done.
- **History you can search.** By flow or by person, filtered by outcome. A
  pipeline that broke before the tests ran is shown apart from a test failure.
- **Tested against a fake GitHub.** `TR_GITHUB_STUB=1` swaps GitHub for a stub
  inside the runner, so its own 22 browser tests (`npm run test:runner`) can
  press Run as often as they like without starting a single real pipeline. Off
  unless set, and the header says so when it is on.
- **Self-updating.** `flow-catalog.yml` regenerates the catalog on every push, so
  a new spec appears in the runner without anyone touching the runner.
- **Zero npm dependencies.** CommonJS and `node:` builtins only, no build step;
  it wears Playground Bank's own fonts and colours.

<p align="center">
  <img src="../assets/runner-run-page.png" alt="A run's own page: Plan done, the tests failed on one of two machines, and the two failing tests named with their assertion" width="900" />
</p>

```bash
npm run flows:list                        # every flow, with its id
npm run test:flow -- --flow group-sanity  # run one locally
npm run test:remote -- --flow group-sanity
npm run test:runner                       # the runner's own tests, stubbed
```

`Sanity smoke` is the label a colleague reads; `sanity:smoke` is the tester's
name; `group-sanity` is the id the CLI and the workflow take. Ids are stable —
names are not.

Full setup — token scope, accounts, deployment: **[`docs/remote-test-runner.md`](../remote-test-runner.md)**
and **[`test-runner/README.md`](../../test-runner/README.md)**.
