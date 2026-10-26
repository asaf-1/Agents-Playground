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
  <img src="https://img.shields.io/badge/tests-460%20passing-brightgreen" alt="460 tests passing" />
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

## See it

<p align="center">
  <img src="docs/assets/see-it.gif" alt="Playground Bank, practice mode, cards, API keys and the test runner, one picture after another" width="900" />
</p>
<p align="center">
  <sub>Playground Bank, practice mode, cards, API keys and the test runner, one after another. The runner's runs are pretend (recorded with its stub mode); every screen is real.</sub>
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
| `npm test`                                   | Full Playwright suite — 460 tests                      |
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
| `npm run test:runner`                        | The test runner's own browser tests, against its stub  |
| `npm run media:record`                       | Record the README's GIFs and the slide PNGs again      |
| `npm run test:docker:e2e`                    | Full regression inside the container                   |

Agent scenarios, per-category runs, and the rest are in
[`docs/repo-guide.md`](docs/repo-guide.md#test-commands).

## What's in it

|                                |                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two frontends, one server**  | A static surface at `/` (8 vanilla pages) and a React SPA at `/app`, both served by the same zero-framework Node server.                                                                  |
| **Playground Bank**            | A practice bank with a crypto exchange: real accounts in Postgres, cards, loans, trading, a GraphQL API, and 35 faults planted on purpose. **[More →](docs/features/playground-bank.md)** |
| **Database**                   | Postgres: Neon on Render, PGlite in memory everywhere else, built from numbered migrations. Every table, drawn: **[docs/database.md](docs/database.md)**                                  |
| **JSON API + contract**        | Health, orders, products, users CRUD, auth/session, RBAC-gated mutations, admin audit log. OpenAPI 3.1 spec with `ajv` tests validating live responses against it.                        |
| **Defects you arm on purpose** | Per-`runKey` flags spanning DOM/selector, async/state, i18n, accessibility, auth/session and API-contract categories. Off by default.                                                     |
| **Six QA agents**              | planner, generator, healer, senior-leader, diagnostician, reporter — driven through the `playwright-test` MCP server. They fix the **tests**, never the app.                              |
| **Remote test runner**         | A separate app: colleagues sign in, pick what to run in plain words, and watch it run on GitHub Actions. **[More →](docs/features/test-runner.md)**                                       |
| **Kubernetes and Terraform**   | The app in a real kind cluster that Terraform builds, a canary after every merge, and the repository's own settings as code. **[More →](docs/features/kubernetes.md)**                    |
| **CI**                         | Branch-first PR flow, pre-push hook, AI review gate, post-merge canary, scheduled regression.                                                                                             |
| **Security scan**              | OWASP ZAP scans the website (`/` and `/app`) on PRs that change it: passive and report only, never the test runner. `security-scan.yml`.                                                  |

## Playground Bank

A practice site for testers, like ParaBank with a crypto exchange's look: fake
money, real accounts, and 35 bugs planted on purpose. Try it
[live](https://agents-playground-app.onrender.com/app), or open `/app` after
`npm start`.

**[Everything it does, with pictures →](docs/features/playground-bank.md)** ·
**[Its database, drawn →](docs/database.md)**

## Remote test runner

Someone needs to run your tests, and giving them repository access is the wrong
answer. They sign in to a separate app instead, pick a suite in plain words, and
watch it run on GitHub Actions.

**[How it works, with pictures →](docs/features/test-runner.md)** ·
**[Setting it up →](docs/remote-test-runner.md)**

## Kubernetes, Terraform and the canary

The app also runs in a real Kubernetes cluster that Terraform builds on your
machine, and a canary deploys every merge to one on GitHub.

**[The cluster, the canary and the infra bots →](docs/features/kubernetes.md)**

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
| [`docs/features/playground-bank.md`](docs/features/playground-bank.md)       | Playground Bank: everything it does, with pictures                  |
| [`docs/features/test-runner.md`](docs/features/test-runner.md)               | The test runner: what a colleague sees, with pictures               |
| [`docs/features/kubernetes.md`](docs/features/kubernetes.md)                 | The cluster, the canary, the infra bots, GitHub as code             |
| [`docs/database.md`](docs/database.md)                                       | Every table the bank keeps, drawn                                   |
| [`docs/remote-test-runner.md`](docs/remote-test-runner.md)                   | The runner: pipeline, flows, deployment                             |
| [`docs/ai-infrastructure-runbook.md`](docs/ai-infrastructure-runbook.md)     | Cold-start inventory for agents and operators                       |
| [`docs/pre-merge-review-and-canary.md`](docs/pre-merge-review-and-canary.md) | Pre-push, AI review, merge, post-merge canary                       |
| [`docs/react-surface-defects.md`](docs/react-surface-defects.md)             | Every armable defect and what it breaks                             |
| [`docs/flow-naming.md`](docs/flow-naming.md)                                 | How the test flows get their names                                  |
| [`CHANGELOG.md`](CHANGELOG.md)                                               | What changed, and what's still missing                              |

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
