<p align="center">
  <img src="docs/assets/agents-playground-logo.svg" alt="Agents-Playground" width="440" />
</p>

<p align="center">
  <a href="https://github.com/asaf-1/Agents-Playground/releases/latest"><img src="https://img.shields.io/github/v/release/asaf-1/Agents-Playground?label=version&color=8957e5&sort=semver" alt="Latest version" /></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-dated-8957e5" alt="Changelog" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Playwright-1.64-2EAD33?logo=playwright&logoColor=white" alt="Playwright 1.64" />
  <img src="https://img.shields.io/badge/OpenAPI-3.1-6BA539?logo=openapiinitiative&logoColor=white" alt="OpenAPI 3.1" />
  <img src="https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white" alt="Vitest 4" />
  <img src="https://img.shields.io/badge/tests-445%20passing-brightgreen" alt="445 tests passing" />
  <img src="https://img.shields.io/badge/CI-4x4%20sharded-1f6feb" alt="CI 4x4 sharded" />
</p>

<p align="center">
  <b>A real web app that breaks on purpose, and the AI agents that fix the tests.</b>
</p>

---

Agents-Playground is a testbed for AI-native QA. It ships a real Node server with
two frontends, an OpenAPI-documented JSON API, and defects that can be armed
deterministically — then points six Playwright agents at it to plan, generate,
diagnose, heal, and report. No mocked UI, no fake failures.

Its React frontend is **Playground Bank**: a practice bank with a crypto
exchange, real accounts in Postgres, and planted bugs.
**[Try it live](https://agents-playground-app.onrender.com/app)**.

It also ships a **remote test runner**: a separate web app your colleagues sign
into to run the suite on the pipeline, without any GitHub, repository, or
pipeline access of their own.

<p align="center">
  <img src="docs/assets/test-runner-dashboard.png" alt="The test runner dashboard: 63 flows, one click each, running on GitHub Actions" width="900" />
</p>
<p align="center">
  <sub>The runner, live. 63 flows, one click each, executing on GitHub Actions.</sub>
</p>

## Quick start

```bash
npm install
npx playwright install chromium
npm run build        # builds the React surface at /app
npm start
```

| URL                              | What                             |
| -------------------------------- | -------------------------------- |
| `http://127.0.0.1:4173`          | Static pages + JSON API          |
| `http://127.0.0.1:4173/`         | Playground Bank (the front door) |
| `http://127.0.0.1:4173/app`      | React SPA: Playground Bank       |
| `http://127.0.0.1:4173/classic`  | The original demo site           |
| `http://127.0.0.1:4173/api/docs` | Swagger UI (OpenAPI 3.1)         |

## Commands

| Command                                      | What it does                                           |
| -------------------------------------------- | ------------------------------------------------------ |
| `npm start`                                  | Serve the app on `127.0.0.1:4173`                      |
| `npm run build`                              | Build the React surface to `public/app`                |
| `npm run dev:web`                            | Vite dev server for the React surface                  |
| `npm test`                                   | Full Playwright suite — 445 tests                      |
| `npm run test:unit`                          | Vitest + Testing Library + MSW                         |
| `npm run test:sanity`                        | Fastest confidence check, one spec                     |
| `npm run test:contract`                      | API replies against `openapi.json`                     |
| `npm run test:visual`                        | Screenshot comparison (opt-in)                         |
| `npm run test:e2e:ui`                        | Playwright UI mode, for debugging a failure            |
| `npm run format:check`                       | Prettier — one of the two checks CI runs               |
| `npm run flows:list`                         | Every flow the remote runner can start, with its id    |
| `npm run flows:check`                        | Fail if the flow catalog is stale — the other CI check |
| `npm run test:flow -- --flow group-sanity`   | Run one catalog flow locally                           |
| `npm run test:remote -- --flow group-sanity` | Start it on the GitHub-hosted runner                   |
| `npm run test:docker:e2e`                    | Full regression inside the container                   |

Agent scenarios, per-category runs, and the rest are in
[`docs/repo-guide.md`](docs/repo-guide.md#test-commands).

## What's in it

|                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two frontends, one server**  | A static surface at `/` (8 vanilla pages) and a React SPA at `/app`, both served by the same zero-framework Node server.                                                                                                                                                                                                                                                                                                                                                                          |
| **Playground Bank**            | The React SPA is a crypto-styled QA practice site with fake money: a crypto gear shop, a back office, and a bank in Postgres: sign-up, Customer / Support / Admin roles, accounts, transfers, bill pay, loans, money requests, notifications and support tickets, under `/api/bank`, with a GraphQL API and explorer beside it. Its crypto exchange opens with a market of live prices that belong to each visitor alone.                                                                         |
| **Database**                   | `bank/` keeps Playground Bank's data in Postgres: Neon when `DATABASE_URL` is set (on Render), otherwise PGlite, a Postgres engine inside Node, so local runs, tests and CI need no database server or secret. Tables come from numbered migrations in `bank/migrations/`. Every pull request also gets its own Neon branch — a copy of the live database made in seconds — and the database suites run against that too, so the real engine and the real shape of data get a say before a merge. |
| **JSON API + contract**        | Health, orders, products, users CRUD, auth/session, RBAC-gated mutations, admin audit log. OpenAPI 3.1 spec with `ajv` tests validating live responses against it.                                                                                                                                                                                                                                                                                                                                |
| **Defects you arm on purpose** | Per-`runKey` flags spanning DOM/selector, async/state, i18n, accessibility, auth/session and API-contract categories. Off by default.                                                                                                                                                                                                                                                                                                                                                             |
| **Six QA agents**              | planner, generator, healer, senior-leader, diagnostician, reporter — driven through the `playwright-test` MCP server. They fix the **tests**, never the app.                                                                                                                                                                                                                                                                                                                                      |
| **Remote test runner**         | Standalone app in `test-runner/`. Sign in, pick a flow, it runs on GitHub Actions.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **CI**                         | Branch-first PR flow, pre-push hook, AI review gate, post-merge canary, scheduled regression.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Security scan**              | OWASP ZAP scans the website (`/` and `/app`) on PRs that change it: passive and report only, never the test runner. `security-scan.yml`.                                                                                                                                                                                                                                                                                                                                                          |

## Playground Bank

A practice site for testers, like ParaBank with a crypto exchange's look: fake
money, real accounts, and bugs planted on purpose. Open `/app` after
`npm start`, or try it [live](https://agents-playground-app.onrender.com/app).

```
Browser ──▶ /app (React) ──▶ /api/bank ──▶ Postgres
                                           Neon live, PGlite locally and in CI,
                                           a throwaway Neon branch per pull request
```

- **Real accounts.** Sign up, log in, edit your profile, and pick a currency and
  number format in settings. The Devices page lists every browser signed in to
  your account, with an End button per device and "log out everywhere else".
  Five wrong passwords put a hold on that email from that client — a 429 with
  a `Retry-After` — and the hold lifts by itself; the pair is what is held, so
  one visitor's mistakes never lock a demo account for everybody.
- **Money.** Every customer opens funded, with their own amounts: the balances
  are drawn from your own account, so no two people start the same. Add
  funds (up to $1,000,000 at a time), open more accounts, send money to your own
  accounts or another customer's, filter the history, and download a CSV
  statement.
- **Bill pay and loans.** Save payees and pay bills, now or on a date: once,
  every week or every month, with a payment due on a weekend paid on the Monday
  after and a monthly one set for the 31st landing on the last day of a shorter
  month. Payments run on your own clock: the Practice page has a card that
  moves your calendar forward a day at a time, so a bill due tomorrow can be
  watched getting paid now, and nobody else's day moves. Ask for a loan of $1,000 to
  $1,000,000 with a live quote and the full schedule; an Admin approves or
  rejects it, and an approved loan is paid straight into the account. **There
  is no rate card.** Your rate is worked out from what the bank can see of you
  -- what you hold, how long you have banked here, how your earlier loans went,
  and how big the ask is next to your own money -- and the quote tells you
  which of those moved it. Spend money and your next offer gets dearer.
- **Cards.** A virtual debit card for each account, with a daily limit that
  starts as a share of the account's balance and is yours to change. Pay a shop
  with it and the purchase lands in the same history as everything else; a
  frozen card, a limit reached for the day, or an empty account declines it and
  the bell tells you why. The limit counts your own day, so it resets when your
  clock does. Freeze and unfreeze your own card; an Admin can freeze any card
  from a customer's profile, and only the bank can undo a bank freeze. The full
  number and CVV show only on request.
- **Connected screens.** What one person does shows up for another: a bell with
  notifications (money received, a loan decided, a request answered, a reply
  from support), money requests the other customer pays or declines, and
  support tickets, raised from any transaction, that staff answer from an inbox.
- **Three roles.** A Customer sees their own money, Support sees every user's
  profile and accounts and answers support tickets, and an Admin can also change
  roles, lock accounts and decide loans (never their own).
  The server checks the role on every request, not just the page.
- **Demo accounts**, password `demo1234`: `maya@` (Customer), `sam@` (Support),
  `alex@` (Admin) and `lee@` (locked), all `@playgroundbank.test`. They are
  read-only; sign up to move money or edit.
- **API keys of your own.** Make a key on the Developer page with a name and
  a scope, read or read-and-write, and it is shown exactly once; after that
  the site knows only its first characters. Send it as a bearer token and the
  REST API and GraphQL answer as you, from Postman, curl or a test. A read key
  can look but not change, every key is limited per minute with the usual
  `X-RateLimit` headers and a 429 that says when to retry, keys cannot make
  keys, and revoking one shuts it off at once. Swagger knows the scheme, so
  "Authorize" works in the docs.
- **A GraphQL API** at `/api/bank/graphql`, over the same accounts, money and
  rules as REST: ask for exactly the fields you want, and read four screens'
  worth of data in one request. The explorer at `/app/graphql` has ready-made
  queries, runs them against your own session and browses the live schema.
- **A market that is yours alone.** Eight coins with live practice prices that
  move while you watch. Your prices are not anybody else's: open the same coin
  on another machine and it sits on a different line, climbing while yours
  falls. Each coin has its own page with a chart over an hour, a day, a week or
  a month, and the strip across the top shows the same prices as the list.
- **A crypto look.** A dark exchange-style theme and a crypto gear shop where
  each of the 48 products has its own icon.

- **Buying and selling, with real bank money.** Ask for a price, and the bank
  holds it for fifteen seconds while you decide; confirm, and the money leaves
  your Checking account and the coin arrives. Selling pays straight back in.
  The fee is yours too: it starts at 0.30% and falls the more you trade.
- **A portfolio that moves.** What you hold, what it is worth on your own
  prices right now, what you paid, and whether you are up or down -- changing
  while the page is open. Every buy and sell lands in the same history as your
  transfers and bills, so there is one story, not two.

- **Orders and alerts.** Tell the exchange to buy at or below a price, or
  sell at or above one, and it fills when your own price gets there, through
  the same quote and fee as a trade by hand. Ask to be told once when a coin
  goes above or below a level, and the bell says so with the price it saw.
  Nothing watches a feed: orders and alerts are checked against your price
  whenever you are on the site, and a test can even ask for the check at a
  past instant. The first thing here that acts without a click.
- **A wallet with real addresses.** Every coin gets you an address like
  `pbx1btc7KZJ3E8B2RTDM`. Give one out and somebody can send you coin; send to
  one and the site checks it before anything moves, because the last three
  characters are a checksum. A network fee comes out in the coin itself.
- **Swapping.** Turn one coin straight into another at your own two prices,
  with the fee shown before you commit. No bank account involved.

- **Practice mode.** One switch in the top bar turns every planted fault in the
  site on at once — and only for you. Anyone else browsing at the same time
  still sees a site that behaves. Turn it off and everything is correct again;
  leave and come back and you start clean, the way a practice site should.
- **A page that tells you what to hunt for.** `/app/practice` lists all 32
  planted faults: where to go, what to try, and a reveal you open when you want
  to check yourself. Most are marked REPORT — a real fault you would raise. One
  is marked HEAL: nothing is broken for a person, and it is the test that should
  adapt. Telling those apart is the skill worth practising.

- **The headers a bank would send.** Every response carries a Content Security
  Policy — a fresh nonce per page view for the app, hashes for the classic
  pages' inline scripts — plus no framing, no MIME sniffing, a referrer
  policy, a permissions policy, the three cross-origin isolation headers, and
  HSTS behind https. One module, `security-headers.js`, serves them all. The
  OWASP ZAP baseline scan went from 2 Medium and 5 Low findings to none; what
  is left is informational, about caching and the fact that this is a
  single-page app. A browser walk through every page in the suite proves the
  policy refuses nothing the site needs.

## Remote test runner

The problem it solves: someone needs to run your test suite, and giving them
repository access is the wrong answer.

They get a username and a password on a separate web app. The app holds one
fine-grained GitHub token server-side and dispatches
`.github/workflows/remote-test-runner.yml` on their behalf. They never see the
repository, the pipeline, or the token — and it works with your machine switched
off.

```
Colleague ──▶ test runner app ──▶ GitHub Actions ──▶ 91 flows / 288 tests
  user+pass      one token,          your pipeline
                 server-side
```

- **91 flows**, three tiers: 10 curated suites, 47 spec files, 34 individual test
  blocks. Named in QA vocabulary — `sanity:smoke`, `regression:full`,
  `app:react-orders > tanstack-query`.
- **Self-updating.** `flow-catalog.yml` regenerates the catalog on every push, so
  a new spec appears in the runner without anyone touching the runner.
- **Zero npm dependencies.** CommonJS and `node:` builtins only, no build step.
- **Test-only history.** Runs are titled after the flow and who asked
  (`sanity:smoke · requested by asaf`), not after a commit message.

```bash
npm run flows:list                        # every flow, with its id
npm run test:flow -- --flow group-sanity  # run one locally
npm run test:remote -- --flow group-sanity
```

`sanity:smoke` is the display name; `group-sanity` is the id the CLI and the
workflow take. Ids are stable — names are not.

Full setup — token scope, accounts, deployment: **[`docs/remote-test-runner.md`](docs/remote-test-runner.md)**
and **[`test-runner/README.md`](test-runner/README.md)**.

## Kubernetes, Terraform and the canary

The app also runs inside a real Kubernetes cluster. kind runs the cluster as a
Docker container on your machine, and Terraform builds it. No cloud account and
no registry; the one secret on GitHub is a read-only Docker Hub token, so the
canary's image downloads are not rate-limited as anonymous ones are.

```
npm run k8s:tf:up ──▶ Terraform ──▶ kind cluster ──┬─▶ 127.0.0.1:4273  (direct)
                      cluster, image load,              └─▶ 127.0.0.1:4280  (bank.local)
                      ingress controller, every manifest in k8s/
```

- **Terraform** (`terraform/`) builds the cluster from `kind/kind-config.yaml`,
  loads the app image, installs the ingress controller, and applies every
  manifest in `k8s/` unchanged — so a new one is picked up with no code change.
  It is three modules — `cluster`, `ingress` and `app` — under one short root
  that reads the files, so a managed cluster would swap only `cluster`. Run it
  again with nothing changed and the app is left alone (only ingress-nginx's
  two one-shot setup Jobs, which Kubernetes deletes once they finish, are
  re-run); after a code change it rolls out the new version.
- **The app runs in its own namespace**, `agents-playground`, with its settings
  in a ConfigMap, as a non-root user, on a read-only filesystem, and under the
  runtime's default seccomp profile. A NetworkPolicy limits it to its own port
  inbound and DNS outbound.
- **Two ways in.** `127.0.0.1:4273` goes straight to the app, which is what the
  tests use. `127.0.0.1:4280` is the ingress controller — ingress-nginx, kept
  unchanged in `ingress-nginx/` with its version and checksum beside it — which
  routes by hostname — add `127.0.0.1 bank.local` to your hosts file and open
  `http://bank.local:4280`, or send the name yourself with
  `curl -H "Host: bank.local" http://127.0.0.1:4280/api/health`. A new Ingress
  takes a few seconds to go live after the cluster is up.
- **Kubernetes** gates the rollout on startup, readiness and liveness probes
  against `/api/health`. One replica, because the app keeps its state in memory.
- **The canary**, `.github/workflows/k8s-canary.yml`, builds a cluster on a
  GitHub runner, deploys the exact commit, and runs the sanity and contract
  suites against it. It builds the cluster with Terraform or with the kind CLI,
  one per run: `kubernetes.provisioner` in `pipeline.config.json` is the switch,
  and a manual run can override it. It runs after every merge to `main`, because
  `kubernetes.enabled` is `true`, and on a manual dispatch.
- **Infra bots**, all free and advisory, so none of them blocks a merge:
  - `terraform-validate.yml` checks every PR that touches `terraform/`,
    `kind/` or `k8s/`: `terraform fmt`, `validate`, the guard tests in
    `terraform/tests/`, a plan, TFLint (rules in `terraform/.tflint.hcl`), and
    that the lock file still covers Windows and Linux. It builds no cluster.
    It checks `terraform-github/` the same way, minus the plan.
  - `infra-scan.yml` runs Trivy over `terraform/`, `k8s/` and both Dockerfiles
    and lists unsafe settings in the job summary. It reports, never fails.
  - Dependabot (`.github/dependabot.yml`) opens a PR when a Terraform provider
    ships a new version, once that version is 7 days old.
  - `neon-branch-tests.yml` gives each PR a throwaway copy of the live database
    and runs `npm run test:db` against it, then deletes the copy — on success,
    on failure, and again when the PR closes. It skips on pull requests from
    forks, which have no access to the key.
- **The repository's own settings are code too.** `terraform-github/` holds
  the ruleset that protects `main` — a pull request, a green `Pre-Merge Gate`,
  no deleting or force-pushing, nobody exempt — plus the labels, the
  description and topics, and which merge buttons exist. Terraform adopted
  them with import blocks instead of recreating them, so the first plan read
  12 to import and nothing to create or destroy. The state lives in HCP
  Terraform; Terraform itself runs on your machine with a token scoped to this
  one repository, never in CI. Guard tests refuse a plan that drops the gate,
  adds a bypass or removes the `ai-reviewed` label, and `prevent_destroy` turns
  a destroy of the repository or the ruleset into an error.

```bash
npm run k8s:tf:full      # build the cluster, run the whole suite in it, tear it down
npm run k8s:tf:up        # build or update the cluster and the app
npm run k8s:test         # the two canary suites against the cluster
npm run k8s:test:full    # the whole suite against the cluster
npm run k8s:tf:check     # format, validity and the guard tests, no cluster
npm run k8s:tf:down      # delete the cluster and the app image
npm run github:tf:check  # format, validity and the guard tests for the GitHub settings
npm run github:tf:plan   # what Terraform would change on GitHub; the first plan only imports
npm run github:tf:apply  # make GitHub match the file, after you type yes
```

Needs Docker, kind, kubectl and Terraform 1.16+ (`winget install Hashicorp.Terraform`).
The GitHub settings need only Terraform, an HCP Terraform login and a
fine-grained token in `TF_VAR_github_token`.
Design and trade-offs: **[`docs/kubernetes-canary-plan.md`](docs/kubernetes-canary-plan.md)**.

## AI agents

```
senior leader → pod plan → planner / generator or diagnostician → healer | reporter
```

Drift — a renamed control, slow or flaky data, a 4xx/5xx, a 401/403 — gets
**healed**. By-design defects get **reported**. The distinction is the point.

Definitions live in `.claude/agents/` (Claude) and `.agents/skills/` (Codex).
Details in [`docs/repo-guide.md`](docs/repo-guide.md#ai-agents).

## Documentation

| Document                                                                     | For                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`docs/repo-guide.md`](docs/repo-guide.md)                                   | Full repo reference: every surface, path, test command, and CI rule |
| [`docs/remote-test-runner.md`](docs/remote-test-runner.md)                   | The runner: pipeline, flows, deployment                             |
| [`docs/ai-infrastructure-runbook.md`](docs/ai-infrastructure-runbook.md)     | Cold-start inventory for agents and operators                       |
| [`docs/pre-merge-review-and-canary.md`](docs/pre-merge-review-and-canary.md) | Pre-push, AI review, merge, post-merge canary                       |
| [`docs/react-surface-defects.md`](docs/react-surface-defects.md)             | Every armable defect and what it breaks                             |
| [`docs/flow-naming.md`](docs/flow-naming.md)                                 | How the test flows get their names                                  |
| [`CHANGELOG.md`](CHANGELOG.md)                                               | What changed, and what's still missing                              |
| [`md/PORTABLE_AGENT_ADOPTION_GUIDE.md`](md/PORTABLE_AGENT_ADOPTION_GUIDE.md) | Adopting this agent setup in another repository                     |

## Contributing

Work reaches `main` through a pull request from a feature branch. The pre-push
hook runs formatting and the full Playwright suite; `PR Validation / Pre-Merge
Gate` and `AI Review Gate / Current Head Review` must both pass for the exact
head SHA. Details in
[`docs/pre-merge-review-and-canary.md`](docs/pre-merge-review-and-canary.md).

## Changelog

Every release carries its notes:
**[github.com/asaf-1/Agents-Playground/releases](https://github.com/asaf-1/Agents-Playground/releases)**

The full history, including what is still missing, is in
[`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE).
