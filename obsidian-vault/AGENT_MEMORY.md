# Agent Shared Memory

> Single source of truth for all agents (Claude, Codex, or any future agent) working in this workspace.
> Every agent MUST read this file at session start and update it when work completes.
> Plain Markdown — tracked by Git.

---

## Current State (2026-06-27)

- **Active slice:** GitHub-first CI automation + Obsidian **second-brain** consolidation.
- **Tests:** 289 Playwright (287 passed / 2 opt-in skipped) + 7 Vitest component/unit. It was 143 (141 / 2) before Playground Bank phase 1 added 9, phase 2a added 21 and phase 2b-1 added 38 (plus 3 Vitest), phase 2b-2 added 25, phase 2c added 19 and phase 2d added 34. Older counts in the stop-points below (`41/41`, `49`, `62`) are HISTORICAL.
- **CI:** GitHub-first; **Jenkins is OUT OF SCOPE**. App image runs on `node:24`; host PR validation and post-merge canary runners now run on Node 24 too (lifted from the earlier Node 20 pin on 2026-06-27 after the Playwright 1.61.1 upgrade resolved the 1.59 browser-install stall; app and CI runner Node versions remain independent).
- **Playwright 1.61.1 + Node-pin lift (2026-06-27):** upgraded `@playwright/test` and `playwright` to `1.61.1` (the standalone `playwright`, imported by `BugReportingAgent`, now lives in `devDependencies`). Host CI moved 20 → 24. The QA Docker runner image (`Dockerfile.e2e`) was bumped to `v1.61.1-noble` (digest `sha256:5b8f294a…`) so `main-validation`'s containerized full regression matches the toolchain and is green again. This is a runner-image version bump only — the `preMerge`/`postMerge` `dockerEnabled` flags remain `false`, so Docker stays disabled for pre-merge and the canary.
- **React /app surface (2026-06-27):** added a Vite 8 + React 19 + TypeScript SPA at `/app` (Orders, Users, Products + 48-item catalog/detail, Account) using React Router 7, TanStack Query 5, React Hook Form 7 + Zod 4, and Radix UI; built to `public/app` and served by `server.js` with a client-side routing fallback. Added an OpenAPI 3.1 spec (`openapi.json`) at `/api/openapi.json` + Swagger UI at `/api/docs`. Testing: Playwright `tests/e2e/app/` specs, axe a11y, ajv OpenAPI contract tests, and Vitest + Testing Library + MSW component tests (`web/src/**/*.test.tsx`). All frontend deps are `devDependencies`. Seven new flag-armed `/app` defects (off by default, per-`runKey`) are catalogued in `docs/react-surface-defects.md` (one HEAL, six REPORT). Suite scaled (134 → 143) to justify sharding + workers.
- **Sharded CI gates (2026-06-27):** `pr-validation` (pre-merge) and `main-validation` (post-merge) run the full Playwright suite as **4 shards × 4 workers**. pr-validation is host-sharded (`format` job + 4-shard matrix + a `Pre-Merge Gate` aggregation job that stays the single required check, plus a merged HTML report); main-validation is containerized-sharded (4 shard jobs in the GHCR `:main` runner + a `report` job). The manual `parallelism-experiment.yml` was removed.
- **Branch policy (2026-06-27):** work on feature branches, push through the local Playwright hook, open a PR, pass `PR Validation / Pre-Merge Gate`, attest current-head Codex/Claude review through `AI Review Gate`, then merge. Root `pipeline.config.json` currently disables Docker for both stages while retaining full host Playwright pre-merge and health/sanity/contract canary checks post-merge. Set the relevant `dockerEnabled` flag to `true` to restore Docker for that stage. Native private-repo branch protection is unavailable on the current GitHub plan.
- **AI infrastructure runbook (2026-06-27):** `docs/ai-infrastructure-runbook.md` is the executable catalog for hooks, workflows, policy flags, skills, agents, validation, failure recovery, and cross-tool AI operation.
- **Hook portability (2026-06-27):** the Node pre-push fallback selects `npm`/`docker` on non-Windows and `npm.cmd`/`docker.exe` on Windows; Linux/macOS agents no longer receive Windows-only command names.
- **Remote test runner (2026-08-28):** added an outsourced test runner so a suite can be started with no local Node, browsers, or checkout. `scripts/test-runner/discover-flows.js` asks Playwright for the test tree and writes `scripts/test-runner/flow-catalog.json` (committed); `.github/workflows/flow-catalog.yml` regenerates and commits it on every push to `main` that touches `tests/`, `web/src/`, the Playwright configs, or `scripts/test-runner/`, so a pushed spec becomes a runnable flow with no UI or workflow edit. Three flow tiers: curated **groups** (`group-sanity`, `group-regression`, from `flow-groups.json`), one per **spec file** (`spec-app-react-orders`), one per top-level **describe** (`suite-scenarios-rbac-rbac`, escaped `--grep`). `.github/workflows/remote-test-runner.yml` is the runner (plan → sharded matrix → merged report) and accepts `workflow_dispatch`, `repository_dispatch` (`remote-test-run`), and `workflow_call`. Surfaces: the page at `/app/test-runner` (backed by `/api/test-runner/*` in `scripts/test-runner/server-api.js`), `npm run test:remote`, the Actions UI, and any external caller. Detail in `docs/remote-test-runner.md`.
- **Test runner is TWO separate things (2026-08-28):** (1) the PIPELINE — `.github/workflows/remote-test-runner.yml` plus `scripts/test-runner/` — and (2) `test-runner/`, a STANDALONE web app with its own server, UI, login/sign-up, and Dockerfile. The standalone app is NOT a page in the demo website and shares no code, port, or process with `server.js`. `server.js` is the app UNDER TEST; `test-runner/` is what fires tests at it. An earlier attempt built the runner as `/app/test-runner` inside the demo app; that was wrong and was fully reverted — do not reintroduce it.
- **Test runner access model (2026-08-28):** colleagues sign up (invite code by default) or sign in on the standalone app and can then run any catalogued flow as often as they like. They get NO GitHub account, NO repo access, NO pipeline access: the token lives server-side in `test-runner/` and never reaches the browser. This is why runs are brokered by that app rather than by handing people the Actions UI or `repository_dispatch`, both of which require repo write. Sign-up modes via `TR_SIGNUP_MODE`: `invite` (default, needs `TR_INVITE_CODE`), `open`, `off`. First account created becomes admin. Passwords are salted scrypt hashes; sessions are in-memory httpOnly + SameSite=Strict cookies. `/api/flows` requires a login too, because flow entries name internal spec paths. Config is documented in `test-runner/.env.example` and `test-runner/README.md`.
- **Standalone runner has zero dependencies (2026-08-28):** no npm packages, no React, no build step — bare `node server.js`. It fetches the flow catalog through the GitHub API (`TR_CATALOG_PATH`, 60s cache) instead of reading a checkout, so it needs no copy of the repo and picks up newly pushed specs on its own. It must never import from `server.js`, `web/`, or `scripts/`.
- **CI cannot push workflow files (2026-08-28):** the default `GITHUB_TOKEN` is refused with "refusing to allow a GitHub App to create or update workflow ... without `workflows` permission", and that permission CANNOT be granted to it. So no workflow may regenerate and commit another workflow file. An earlier design had `flow-catalog.yml` regenerate a `flow` choice dropdown inside `remote-test-runner.yml`; it failed on the very first real run and was removed. `flow` is now a free-text input validated by the plan job, `sync-workflow-inputs.js` was deleted, and `flow-catalog.yml` commits ONLY `scripts/test-runner/flow-catalog.json`.
- **First real pipeline run (2026-08-28):** PR #14 merged as `d33306b`; run 33163908029 (`group-sanity`) succeeded — Plan → test → Report, 1m21s — and produced the `remote-test-results` artifact. Catalog is **63 flows / 142 E2E tests**; an earlier 67/157 figure was a STALE catalog committed before regenerating after specs were deleted. Always regenerate and re-run `flows:check` AFTER changing the test set. `run-name` now titles each run after the flow and the actor, because GitHub otherwise titles runs after the workflow or the commit message, which made the runner's history read like a commit log rather than a test history.
- **Test runner safety model (2026-08-28):** `resolve-flow.js` is the single trust boundary — it validates every caller-supplied value against the committed catalog and the `normalize*` rules in `catalog.js`, and `exec-flow.js` only replays the resolved plan. Runners are spawned with `shell:false` against the local CLI entrypoints (`node node_modules/@playwright/test/cli.js`), because Node refuses to spawn the `npx.cmd` shim without a shell and enabling one would reintroduce an injection surface. Workflow inputs and `client_payload` values travel through `env:` blocks, never interpolated into `run:` scripts. `remote-test-runner.yml` holds `contents: read`; only `flow-catalog.yml` holds `contents: write`, and only to commit one file. The GitHub token stays server-side and is never sent to the browser.
- **Test runner gotchas (2026-08-28):** Playwright rejects `--browser` once a config defines projects, so browser choice travels as `PLAYWRIGHT_BROWSER` and `playwright.config.ts` reads it into `use.browserName` (Chrome channel now applies only to chromium). `PLAYWRIGHT_EXTERNAL_TARGET=true` suppresses the config's `webServer` block so a run against a deployed `target_url` does not build and boot an unused local app. `flow-catalog.json` is in `.prettierignore` (Prettier collapses short arrays, the generator does not, so formatting it would put `format:check` and the discovery job in a loop) and deliberately carries no timestamp or commit SHA (a volatile field would diff on every push). File filters and `--grep` do **not** filter out dependency projects, so per-spec and per-describe flows keep the `setup` project's `storageState` mint.
- **Session status skills (2026-09-22):** `/docs` rewrites `obsidian-vault/STATUS.md`, the single "where we are now" file, and archives a dated copy in `Snapshots/`; `/recall` reads it, checks it against live git and GitHub, and reports where to resume. Mirrored in `.claude/skills/` and `.agents/skills/`. Obsidian holds where the work is; Claude's private auto-memory holds how the user wants it done, and `/docs` keeps the two consistent.
- **Session notes are private (2026-09-22):**
  - At the user's request, `STATUS.md`, the dated notes in `Snapshots/` and the handoff notes in `Inbox/Agents/` are gitignored and were removed from GitHub. Git history still has them. `Snapshots/README.md` and `Inbox/Agents/.gitkeep` stay tracked.
  - They exist only on the machine that wrote them, so a fresh clone starts without a saved status, and `/recall` then works from this file and git.
  - `/docs` and `/snapshot` no longer link snapshots from `00 Home.md`.
- **k8s canary is green on GitHub (2026-09-23):** its first manual dispatch (run 35764386609, 2026-09-22) failed at "Install kind". The step downloaded with `curl -o ./kind`, but the checkout already has a `kind/` folder (`kind/kind-config.yaml`), so curl exited with code 23. The step now downloads to `$RUNNER_TEMP`, and run 35847012917 passed every step (cluster, image load, rollout, health probe, sanity and contract suites) in about 2 minutes. Before that it had never really run: every earlier post-merge run passed only because `kubernetes.enabled: false` makes the job skip after about 7s. The flag is still `false`.
- **Terraform builds the local kind cluster (2026-09-23):**
  - `terraform/` (Terraform `~> 1.16`, local state) creates the kind cluster from `kind/kind-config.yaml` (read with `yamldecode`, so the YAML stays the only copy), loads the image with `kind load`, and applies `k8s/deployment.yaml` and `k8s/service.yaml` unchanged through `alekc/kubectl`. The only in-memory change is the image tag, as `k8s-canary.yml` does with sed.
  - `npm run k8s:tf:up` (`scripts/k8s-tf.js`) builds the image and tags it with the first 12 hex of its Docker image ID, so an unchanged tree plans "No changes" and any change to the build context rolls out a new revision. `npm run k8s:tf:down` destroys it all.
  - `npm run k8s:tf:full` runs up, the whole suite, then down, and tears down even when a test or `up` fails (steps throw instead of calling `process.exit`, which would skip the teardown). `npm run k8s:test:full` runs the whole suite against a running cluster: 141 passed / 2 skipped on 2026-09-23, the same as the host run. `npm run k8s:test` stays the two-suite canary check, because `k8s-canary.yml` runs it and the canary must stay small.
  - Cleanup: `up` deletes older `agents-playground` images and keeps only the one the cluster runs; `down` deletes that one and `terraform/agents-playground-config`. The cache stays on purpose: the `kindest/node:v1.35.0` image (1.35 GB) and `terraform/.terraform/` (85 MB).
  - `down` never uses a plain `terraform destroy`: `tehcyx/kind` does not mark `client_key`, the certificates or `kubeconfig` sensitive, so a destroy plan prints the admin private key. It plans the destroy with output captured, shows the one-line summary, and applies the saved plan from the temp folder, deleting it after.
  - If `terraform` is not on the PATH (a VS Code window opened before the winget install keeps the old PATH), `scripts/k8s-tf.js` falls back to `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Hashicorp.Terraform_*\terraform.exe`.
  - The cluster runs Kubernetes **v1.35.0**, not the CLI's v1.37.0: `tehcyx/kind` 0.11.0 embeds kind v0.31.0, and a v1.37.0 node image fails in `kubeadm init` on it. Bump `node_image` only together with the provider.
  - `lazy_load = true` on the kubectl provider is required, or the first plan fails with "no configuration has been provided" because the cluster credentials are unknown until apply.
  - `.dockerignore` excludes `terraform/`, or its provider cache bloats the build context and every `.tf` edit changes the image ID. Gitignored: `terraform/.terraform/`, state files, and `terraform/agents-playground-config`, the admin kubeconfig the provider writes.
  - The `npm run k8s:up`/`k8s:deploy` CLI path still exists and makes a cluster with the same name, so use one path at a time. CI still uses the CLI path until Phase 3.
- **`md/` is private (2026-09-23):** at the user's request the whole folder is gitignored, and its 11 formerly tracked notes were removed from GitHub. They stay only on the machine that has them, so a fresh clone has no `md/`. `README.md`, `docs/repo-guide.md` and the `next-phase` skill still name some of those files.
- **The k8s canary can use Terraform (2026-09-23):**
  - `.github/workflows/k8s-canary.yml` builds its cluster with `terraform/` or with the kind CLI. `kubernetes.provisioner` in `pipeline.config.json` is the switch (`terraform`), and every run uses exactly one of the two. A manual dispatch's `provisioner` dropdown (`default`, `terraform`, `kind`) overrides the switch for that run; `default` follows it.
  - The Terraform path installs Terraform 1.16.2 from releases.hashicorp.com with its SHA256SUMS checked (no extra marketplace action), applies with the SHA-tagged image, and tears down with a quietly planned destroy. Verified: 0 `PRIVATE KEY` lines in the logs.
  - The image build now runs before the cluster is created, so the health probe polls (`curl --retry 15 --retry-all-errors`). Without it, the kind path hit `curl: (56) Connection reset by peer` straight after a green rollout (run 35859220606): a Ready pod does not mean the NodePort answers yet.
  - Branch tests, both green: terraform run 35860318503, kind run 35860305789. `terraform-validate.yml` is an advisory check (fmt, `init -backend=false`, validate) on PRs touching `terraform/`; it is not required. `kubernetes.enabled` stays `false`.
- **Pre-Merge Gate fails on drafts (2026-09-23):** PR #38 merged without its tests running: its last commit was pushed while it was a draft, so `pr-validation.yml` skipped Format check, the shards and the gate, the `ready_for_review` run in the same second was cancelled, and GitHub counts a skipped required check as passed. The gate now runs on drafts too and fails there, so a draft result can never count as a pass. On a ready PR nothing changes. The user's rule: never open a draft PR; push everything in one go.
- **The k8s canary runs on every merge (2026-09-25):** `kubernetes.enabled` in `pipeline.config.json` is now `true`, so every PR merged into `main` runs `k8s-canary.yml`, with the cluster built by `kubernetes.provisioner` (`terraform`). The workflow reads the flag from the merge commit, so the merge of the PR that flips it is already a canary run. It runs after the merge and never blocks one; a red run means `main` does not deploy cleanly to Kubernetes. Set the flag back to `false` to stop the merge runs; a manual dispatch works either way.
- **Infra bots (2026-10-05):** three free, advisory helpers; none is a required check, so none blocks a merge.
  - **Dependabot** (`.github/dependabot.yml`): weekly, `terraform/` only, opens a `chore(deps)` PR when `tehcyx/kind` or `alekc/kubectl` has a release at least 7 days old (`cooldown`), at most 2 open. GitHub Actions updates are left out on purpose because they would edit `pr-validation.yml`. On 2026-10-05 both providers were on their newest stable release (kind 0.11.0, kubectl 2.4.1), so no PR was expected; kubectl 3.0.0 was in beta, which Dependabot skips.
  - **TFLint** v0.64.0 is a step in `terraform-validate.yml` after validate, with the bundled Terraform ruleset (`recommended` preset) from `terraform/.tflint.hcl`, so no `tflint --init`. Clean on the current code; it exits 2 on a finding, which turns the advisory check red.
  - **Infra Scan** (`.github/workflows/infra-scan.yml`): Trivy v0.74.0 `config` scan of `terraform/`, `k8s/`, `Dockerfile` and `Dockerfile.e2e`, with `--skip-check-update` so the rules built into the pinned version are used and findings change only on a version bump. Report only: findings go to warnings and the job summary, and the job never fails on them. `kind/` is not scanned (no rules for a kind config). Baseline on 2026-10-05: terraform clean, `k8s/deployment.yaml` 8 (2 HIGH: read-only root filesystem, default security context), each Dockerfile 2 (HIGH: no non-root `USER`; LOW: no `HEALTHCHECK`). Fixing them is a separate decision.
  - Both tools are pinned by a SHA256 written in the workflow, not downloaded: the hashes come from release checksum files whose signatures were verified when pinned (TFLint with cosign against its `release.yml`, Trivy with `gh attestation verify`). Trivy v0.75.0 was skipped as 4 days old, the same cooldown idea as Dependabot's.
  - The same change closed a gap in `k8s-canary.yml`: kind was pinned by version only. It now checks `KIND_SHA256` too (bump it with `KIND_VERSION`). kind publishes no signature, so the value was taken when three sources agreed: kind's `.sha256sum` file, GitHub's upload digest, and the downloaded binary.
  - `CLAUDE.md` gained `terraform/`, `k8s/`, `kind/` in Repository Focus and a Terraform and Kubernetes Review section.
- **Security Scan of the website (2026-10-05):** `.github/workflows/security-scan.yml` builds `/app`, starts `server.js` on the runner and runs the OWASP ZAP **baseline** scan (spider + passive checks only, no attacks) against `http://127.0.0.1:4173`, on PRs touching `server.js`, `public/`, `web/` or `scripts/zap-summary.js`. ZAP 2.17.0 is pulled by digest (`ZAP_IMAGE`; no attestation exists). Report only: `scripts/zap-summary.js` writes the job summary and one warning, the HTML/JSON report is the `security-scan-<sha>` artifact, and only a scan that could not run fails. It never targets the test runner or Render. Local baseline on 2026-10-05: High 0, Medium 2, Low 5, Informational 1, all missing security headers; not fixed, a separate decision.
- **A release ships in the same PR (2026-10-05):** the `push` skill now stamps the version into `CHANGELOG.md` before the push (step 5c), committed with `SKIP_CHANGELOG=1` because the tag does not exist yet and the hook would otherwise list the stamped commits under Unreleased again. After the merge it only tags the squash commit and publishes (step 10, `gh release create --target <merge sha>`). v1.7.0 was the last two-PR release (#41, then #42 for the stamp). The README version badge is live from shields.io and needs no edit.
- **Writes only on the user's say (2026-10-05):** the `/docs` and `/recall` skills (both copies, `.claude/skills/` and `.agents/skills/`) now say that `STATUS.md`, `Snapshots/` and an agent's private memory are written only during a `/docs` run the user started, and that no other file is edited before the user says so. Every `/recall` report ends with a fixed **Rule** line saying this. `/recall` also carries the standing rule that every new feature gets its own private runbook and glossary terms, with an "Explain it out loud" section (in order → say it → example → if they ask) and "Step by step" sections (one command per step, each with a plain line, in order, ending with clean-up), always added next to existing text.
- **Playground Bank, phase 4: practice mode (2026-10-10):** the four-phase plan
  is complete. One switch in the top bar arms all 27 planted faults for the
  visitor who pressed it, and `/app/practice` lists them with where to look, a
  hint and a reveal.
  - `practice.js` holds the catalogue; the switch and the page both read it, so
    they cannot drift. `docs/react-surface-defects.md` stays the written doc.
  - The visitor is told apart by a run key in a **session cookie**: it follows
    them around the site and ends with the browser. Deliberately not saved --
    "you go in, you practice on it, leave, start over" (Asaf, 2026-10-10).
  - **It must never write to the `global` flags.** That would turn the site
    buggy for everybody and fail the suite everywhere at once;
    `api-practice-mode.spec.ts` guards it.
  - **`"app"` now means "no explicit run key".** `useRunKey()` used to default
    to the literal string, so every request sent `?runKey=app`, which beats the
    cookie and silently disabled practice mode on the pages. `query()` in
    `web/src/api.ts` and `withRunKey()` in `web/src/bankApi.ts` leave it out,
    and `GET /api/test/flags` reads `getRunKey()`. Do not reintroduce it.
- **`/` opens Playground Bank (2026-10-10):** the bare URL used to serve the
  original demo site, so Render's dashboard link and any bookmark landed on the
  wrong one. `/` now redirects to `/app`; the old home is at `/classic` and the
  old site keeps every other page (`/login`, `/dashboard`, `/orders`,
  `/user-manager`). `framework/pom/HomePage.ts` and three tests were updated.
- **Playground Bank, phase 3: the crypto exchange (2026-10-10):** markets with
  live prices, buying and selling with bank money, a portfolio, wallets,
  sending and swapping. Shipped as 3a (market), 3b (trade) and 3c (wallet).
  - **Nothing on the site is a fixed number any more.** At the user's
    instruction, every number a visitor sees is worked out from who they are and
    what they have done: a price is a pure function of (customer, coin, instant)
    in `bank/market.js`; starting balances are drawn per customer in
    `bank/money.js`; the loan rate card (`TERMS` in `bank/loans.js` and
    `TERM_APR` in `LoansPage.tsx`) is **deleted** in favour of a rate from the
    customer's standing, with the reasons returned in the quote and shown on the
    page; and the trading fee is a tier that falls with volume. Do not
    reintroduce a rate table or a fixed starting balance.
  - **The pages feed each other:** buying crypto drains a real bank account,
    which the next loan offer reads, which writes a notification, and all of it
    lands in one `bank_transactions` history.
  - Units: money in cents, prices in **micro-dollars** (1e-6 USD, because a
    penny on a $0.39 coin is a 2.5% jump), coin in **atoms** (1e-8). GraphQL
    gained `Micros` and `Atoms` scalars for the same 32-bit reason as `Cents`.
  - Migrations 005 (market), 006 (trading), 007 (wallet); the live site should
    report `"migrations":7`.
  - `?at=` pins the clock for a caller that brought its own run key, which is
    how a live market stays testable; a real visitor can never pin it.
  - Twenty `bank*` planted bugs now, all armable by run key, ready for phase 4's
    practice-mode switch. `docs/react-surface-defects.md` is the catalogue.
  - Tests 289 → 369 (367 passed, 2 skipped), with an API spec and a browser spec
    for every screen.
- **App shell accessibility fixed (2026-10-10):** the practice-site banner was a
  bare div outside every landmark, so axe's `region` rule failed on every page.
  It is a labelled region now, and the a11y scans in
  `tests/e2e/app/react-a11y.spec.ts` were widened from `<main>` to the whole
  page. A sweep of ten pages is clean.
- **Playground Bank, phase 1 (2026-10-09):** the React SPA at `/app` is now Playground Bank, a crypto-styled QA practice site with fake money. The bank (phase 2, with a database), the crypto exchange (phase 3) and practice mode (phase 4) come next. The classic site at `/` is untouched.
  - **Look only, for the old pages:** a dark theme built on design tokens in `web/src/app.css`; self-hosted variable fonts (`@fontsource-variable/inter`, `space-grotesk`, `jetbrains-mono`; browsers download only the Latin files, about 110 KB); an app shell in `web/src/components/Layout.tsx` (grouped sidebar, a "practice site, fake money" banner, a static simulated price ticker from `web/src/market.ts`); and a home hub. Every test hook, tested text and route stayed as it was. Baseline: 141 passed / 2 skipped before, the same plus 9 new after, and the React specs passed `--repeat-each=3` (270/270).
  - **Traps for any later change:** the products test counts every `li` in the grid, so no lists inside a card; one `app-heading` per page; the create-user dialog stays opaque and unanimated, because axe measures contrast as it runs; its name input must not gain a placeholder or title, because that gives it an accessible name and hides `usersA11yBug`; `OrdersPage` makes no new API calls, because its Vitest MSW server errors on unknown requests.
  - **Data:** the 48 products got crypto-gear names (`PRODUCT_NAMES` in `server.js`; ids, categories, prices and stock unchanged) and one unique Lucide icon each (`web/src/components/ProductIcon.tsx`, keyed by SKU; `lucide-react` is a devDependency and tree-shaken). `server.js` serves `.woff2`/`.woff` with font content types.
  - **Account menu:** `web/src/components/UserMenu.tsx` reads `/api/session?runKey=shell`, so flags a test arms for its own run key never reach the shell. `/app/login` signs in with the existing demo accounts through `/api/login` (real Admin/Editor/Viewer roles, in memory; Carol is inactive, so 401 by design). Edit profile and Settings show "Soon" until phase 2 adds the database (Neon Postgres, decided 2026-10-09; see the next bullet). The About page credits Asaf Nuri, Quality Platform Engineer.
  - New spec `tests/e2e/app/react-bank-shell.spec.ts` (9 tests). The JS bundle is about 500 KB, so Vite prints its chunk-size warning; phase 2 splits it per page.
- **After-merge image timing, and the Neon project (2026-10-09):**
  - `main-validation.yml` runs the full suite inside `ghcr.io/asaf-1/genai-agenticai-demo-playwright:main`, which `publish-playwright-runner.yml` rebuilds on the same push. When a merge adds npm packages, validation can pull the old image first and fail on the missing package; v1.9.0 failed on `@fontsource-variable/inter` before any test ran. Wait for the publish run to finish, then `gh run rerun <id> --failed` (it then passed 4/4).
  - A Neon Postgres project, `playground-bank` (AWS eu-central-1, Frankfurt, free plan, Postgres only), exists for Playground Bank phase 2. Production reads the direct `DATABASE_URL` from a Render secret, while local runs, tests and CI use PGlite (Postgres inside Node), so CI needs no secret. The connection string is never stored in the repo.
  - **The app's Node base image comes from `public.ecr.aws/docker/library/node:24-bookworm-slim`** (Amazon's public copy of Docker's official images, the same sha256 digest) since 2026-10-10. After the v1.10.0 merge, Docker Hub answered "429 Too Many Requests" to GitHub's shared runners three times (the k8s canary failed at "Build app image"). Render's failed deploys at the same time were explained by memory, not Docker Hub (see the PGlite bullet below). Don't switch it back to `node:…` on Docker Hub. `test-runner/Dockerfile` still uses Docker Hub (the runner is out of scope).
  - **Playwright 1.64.0 (2026-10-10):** `@playwright/test` and `playwright` bumped from 1.61.1, and `Dockerfile.e2e` moved to `mcr.microsoft.com/playwright:v1.64.0-noble` (digest `sha256:06a9939e…`). The 1.62–1.64 breaking changes (experimental component-testing packages, Ubuntu 20.04, device `screen` emulation, video encoding) touch nothing here; the suite stayed 171 passed / 2 skipped. `@axe-core/playwright` stays 4.12.1 on purpose: a newer axe can add rules and change the accessibility tests' results. 1.64.0 was 3 days old, inside the 7-day cooldown the bots use; the user asked for it.
- **Playground Bank phase 2a: accounts in Postgres (2026-10-09):**
  - **Back end `bank/`**, mounted by `server.js` at `/api/bank/*` (the only `server.js` changes: the mount, and opening the port only after `bank.start()`; if the database can't start the process exits, so a bad deploy fails its health check). `bank/db.js` picks `pg` when `DATABASE_URL` is set and PGlite (in memory) otherwise; `bank/migrate.js` runs numbered files in `bank/migrations/` once each (recorded in `bank_schema_migrations`); `bank/seed.js` adds read-only demo accounts (`is_demo`), password `demo1234`: `maya@` Customer, `sam@` Support, `alex@` Admin, `lee@` Customer and locked, all `@playgroundbank.test`. `pg` and `@electric-sql/pglite` are runtime `dependencies`.
  - **Security:** scrypt password hashes; random session tokens stored only as SHA-256 hashes, in an httpOnly `SameSite=Lax` `pb_session` cookie (Secure behind HTTPS via `X-Forwarded-Proto`); every change must be `application/json` (415 otherwise; part of the CSRF protection); parameterized queries only; the password is checked before the lock, and an unknown email runs a decoy hash, so neither timing nor answers reveal which emails exist; locking a user ends their sessions; Admins can't change themselves or demo accounts; 500s never leak error details.
  - **API:** register, login, logout, me, `PATCH me/profile`, `PUT me/settings`, `GET admin/users` (Support and Admin), `PATCH admin/users/{id}` (Admin), `status`, all in `openapi.json` with strict `Bank*` schemas (`additionalProperties: false`, so a leaked field fails the contract tests).
  - **Front end:** sign-up, log-in (now bank accounts; `?next=` limited to same-site paths), profile, edit profile, settings with a live format preview, and Bank users for staff; the account menu and sidebar follow the bank session. `/app/account` keeps its back-office session card (the planted `authRequired` bug and its test hooks) under a new bank card. Pages are lazy-loaded, so the first load is about 318 KB and Vite's chunk warning is gone.
  - **Tests:** `react-bank-accounts.spec.ts` (13), `api-bank.spec.ts` (8) and helpers in `tests/e2e/app/_bank.ts`; tests that change data sign up their own `@example.test` customer, and demo accounts are never changed. Two phase-1 tests moved to bank accounts.
  - **Local trap:** Playwright reuses whatever already listens on 4173 (`reuseExistingServer` off CI). A stale `npm start` from before a change makes new tests fail with "API route not found."; stop it, or run against another port with `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_EXTERNAL_TARGET=true` (where `api-contract-governance` fails only on its `port: 4173` check).
- **Playground Bank phase 2b-1: money (2026-10-10):**
  - **Back end:** `bank/migrations/002_money.sql` (`bank_money_accounts`, `bank_transfers`, `bank_transactions`; amounts are bigint cents) and `bank/money.js`. Every customer starts with $100,000 (Checking $25,000, Savings $75,000); 2a sign-ups get the same at start-up (`ensureStarterAccounts`). Maya has two months of seeded history on fixed numbers `PB-1000-0001`/`-0002`; demo accounts can't send or receive money (`DEMO_READ_ONLY`, `DEMO_ACCOUNT`). Add funds and a new account's starting amount are capped at $1,000,000 each time (the user's choice); transfers are limited only by the balance; up to 10 accounts per customer.
  - **Correct paths:** the debit is one `UPDATE ... WHERE balance_cents >= $2`, so parallel transfers can't overdraw; an `Idempotency-Key` header (unique per user) makes a repeat return the first transfer (200, `replayed: true`); another customer's account answers 404; dates are UTC days, both ends included; the CSV defuses cells starting with `= + - @`.
  - **Front end:** `/app/bank` (overview, Add funds, Open account, recent activity), `/app/bank/accounts/:id` (history with date/type/amount filters, 20 per page, CSV), `/app/bank/transfer` (form, review, receipt). Demo customers see a note with a Sign up button (`/signup?next=/bank/transfer`; sign-up now honours a same-site `?next=`). Bank links keep `?runKey` (`bankPath` in `web/src/useMoney.ts`); balances are cached for a minute and refreshed after every money change. The Users ⋯ menu now works (View; Edit changes role and status only, because `PATCH /api/users/:id` can't change a name); Bank users rows have a ⋯ menu (View profile, Change role, Lock/Unlock; the `admin-toggle-*` hook is inside it).
  - **Planted bugs (off by default, per `runKey`):** `bankNegativeTransfer`, `bankDoubleSubmit`, `bankTransferRace`, `bankStaleBalance`, `bankDateFilterOffByOne`, `bankStatementTotal`, in `docs/react-surface-defects.md`. `server.js` only gained the flags and `createBank({ getFlags })`.
  - **Tests:** `api-bank-money.spec.ts` (15), `react-bank-money.spec.ts` (16), `bank-money-bugs.spec.ts` (7), `web/src/pages/UsersPage.test.tsx` (3 Vitest). The Users ⋯ tests use MSW on purpose: `/api/users` is shared state that original tests count (the classic User Manager's role filter expects exactly 1 Admin) and reset (`/api/test/reset-users`), so an E2E test must never create or edit real users there.
- **Playground Bank phase 2b-2: bill pay and loans (2026-10-10):**
  - **Back end:** `bank/migrations/003_bills_loans.sql` (`bank_payees` soft-deleted with `deleted_at`, `bank_bill_payments` with an idempotency key, `bank_loans`; the transaction kinds gain `bill_payment` and `loan_disbursement`), `bank/bills.js`, `bank/loans.js`. Up to 20 payees; a bill payment is one checked debit like a transfer. Loans: $1,000 to $1,000,000 over 12/24/36/60 months at 5.90/6.40/6.90/7.90% APR; the standard fixed payment, rounded to the cent, with the last month settling the rest so the balance ends at exactly 0. At most 3 waiting per customer. An Admin approves (paying the amount into the chosen account in the same transaction) or rejects with a reason; nobody decides their own loan (`CANNOT_DECIDE_OWN`); demo loans can't change. Maya is seeded with 3 payees and an approved $15,000 / 24-month loan decided by the demo Admin.
  - **Front end:** `/app/bank/bills` (payees, pay with review and receipt, recent payments), `/app/bank/loans` (live quote, schedule, your loans), `/app/admin/loans` (staff queue with a ⋯ menu; Support read-only). History can filter `type=bill` and `type=loan`.
  - **Planted bugs:** `bankLoanRounding` and `bankPayeeIdor` (the IDOR one was the user's yes after the trade-off was explained: on the shared live site, whoever arms it can delete other visitors' payees).
  - **Tests:** `api-bank-bills-loans.spec.ts` (13), `react-bank-bills-loans.spec.ts` (10), two more in `bank-money-bugs.spec.ts`. Payees list alphabetically: seeded rows can share a timestamp, so "by creation time" wasn't a stable order.
- **Playground Bank phase 2c: connected screens (2026-10-10):** the user asked for screens that affect each other, not separate pages.
  - **Back end:** `bank/migrations/004_connected.sql` (`bank_notifications`, `bank_money_requests`, `bank_support_tickets`, `bank_support_messages`), `bank/notify.js`, `bank/requests.js`, `bank/support.js`. Every notification is written in the same transaction as its action: money from someone else (`moveMoney` in `bank/money.js`, now reusable inside another transaction), loan decisions, role changes and unlocks, requests asked/paid/declined, support replies and solves. Paying a request claims it ("only while pending") and moves the money in one transaction. Demo accounts can't ask or be asked; demo staff (Sam, Alex) can answer real customers' tickets, like the demo Admin decides loans; demo tickets stay read-only. Maya is seeded with a welcome note and a solved ticket answered by Sam.
  - **Front end:** the bell (`web/src/components/NotificationBell.tsx`, refetching every 15 seconds) and `/app/notifications`; `/app/bank/requests`; `/app/support`, `/app/support/:id`, staff `/app/admin/support`; "Report a problem" in each history row's ⋯ menu.
  - **Planted bugs:** `bankNotificationCount`, `bankRequestDoublePay`, `bankSupportStatus` (eleven `bank*` flags in all).
  - **Tests:** `api-bank-connected.spec.ts` (9), `react-bank-connected.spec.ts` (7, two browser contexts per test; the other side reloads instead of waiting for the polling), three more in `bank-money-bugs.spec.ts`.
  - **GraphQL is phase 2d**, built 2026-10-10 (below).
- **Playground Bank phase 2d: GraphQL (2026-10-10):** one address over the same bank code as REST, so the two can never disagree.
  - **Back end:** `bank/graphql.js`, routed at `POST /api/bank/graphql` in `bank/routes.js`. 12 queries and 13 mutations over the existing modules, with the same session cookie, roles, demo read-only rule and "someone else's data is not found" behaviour. **No migration**: it reads the tables phases 2a-2c created, so Neon's schema is unchanged. One new runtime package, `graphql` 16.14.2 (MIT, no dependencies of its own); it was already in the lockfile as a dev dependency, so nothing new is downloaded.
  - **A custom `Cents` scalar**, because GraphQL's `Int` is 32-bit and stops at $21,474,836.47 in cents. Proved against a real Postgres 17 in Docker through the same `pg` driver Neon uses: that driver returns bigint as a **string**, GraphQL still answers with numbers, and a balance of $22,025,000 survived. A test guards it; if anyone turns `Cents` into `Int` it fails.
  - **Query depth is capped at 8**, with introspection exempt so the explorer's schema panel still works. A GraphQL answer is always HTTP 200: problems live in the `errors` array, so tests assert on that, never on the status code.
  - **Front end:** the explorer at `/app/graphql` (`web/src/pages/GraphqlPage.tsx`, `web/src/graphqlApi.ts`): seven ready-made examples, a query and variables box, the response, and a schema panel built from introspection. New **Developers** sidebar group with a link to the REST docs at `/api/docs`.
  - **Planted bugs:** `bankGraphqlOwnerLeak` (a nested `counterpartyDetails` field returns another customer's name and email), `bankGraphqlErrorDetail` (an unexpected error answers with the real message and stack), `bankGraphqlDepth` (the depth limit is dropped) — fourteen `bank*` flags in all. **Three existing bugs now fire through GraphQL too** (`bankNegativeTransfer`, `bankTransferRace`, `bankDateFilterOffByOne`), because practice mode (phase 4) turns every bug on at once and a surface that stayed correct would read as a GraphQL fault. Four stay REST- or UI-only: `bankDoubleSubmit` and `bankStaleBalance` are front-end, `bankStatementTotal` is the CSV, `bankPayeeIdor` needs a delete-payee mutation that doesn't exist.
  - **Tests:** `api-bank-graphql.spec.ts` (21), `react-bank-graphql.spec.ts` (7), six more in `bank-money-bugs.spec.ts`.
- **PGlite needs about 1 GB to start (2026-10-10):** starting the in-memory database peaks at about 1 GB (1003 MB measured on one CPU core) and then settles near 400 MB, so anything that runs the app without `DATABASE_URL` needs a memory limit above that peak.
  - **Render** (free plan, 512 MB) can't: after v1.10.0 the deploy failed until the Neon `DATABASE_URL` secret was added on 2026-10-10. `/api/bank/status` on the live site now says `postgres`. Render's log shows a `pg` SSL warning: today `sslmode=require` already means full certificate checks, but pg 9 will weaken it, so on that upgrade change the secret to `sslmode=verify-full`.
  - **The Kubernetes canary** has no secret on purpose, so `k8s/deployment.yaml` limits memory to 1536Mi. At 512Mi the pod was OOMKilled (exit 137) on every start and the canary failed at "Create cluster and deploy". If a smaller limit is ever needed, V8's `--liftoff-only` flag cut the peak to about 674 MB in a local test.
- **Intentional defects (do NOT "fix"):** RBAC editor-delete (`server.js:587-616`), broken product state (`server.js:448-473`), shared password `demo1234`, open `/api/test/*` hooks.

### Canonical sources — link, don't re-duplicate detail here

| Topic                              | Canonical note                   |
| ---------------------------------- | -------------------------------- |
| Architecture / big picture         | [[07 Architecture Overview]]     |
| What breaks without the vault      | [[08 Vault Dependency Map]]      |
| Infrastructure / CI / merge policy | [[09 Infrastructure and CI Map]] |
| Agents / orchestrator              | [[10 Agent Roster]]              |
| Code layout                        | [[01 Project Map]]               |
| Test inventory                     | [[02 Test Map]]                  |
| Index / front door                 | [[00 Home]]                      |

**Summarization policy:** keep this file lean — periodically fold old stop-points into a `Snapshots/` note (see `Snapshots/README`) and let the canonical notes above hold the detail.

---

## Project Identity

- **Name:** Agents-Playground (formerly GenAI+AgenticAI Demo; `package.json` name `agents-playground`)
- **Type:** Self-healing Playwright QA framework + Node.js demo app
- **Repo:** https://github.com/asaf-1/Agents-Playground (public; renamed from `GenAI-AgenticAI-Demo`)
- **Local path:** `C:\Users\asafn\Desktop\Agents-Playground`
- **App URL (local):** `http://localhost:4173`
- **Stack:** Node.js, Playwright, TypeScript
- **Vault location:** the vault now lives at the **repo-root** `obsidian-vault/` (moved from `docs/obsidian-vault/`). Open the **repo root** as the Obsidian vault.

---

## Current Phase

**Phase:** Agents-Playground expansion — Auth (Phase 1) + RBAC (Phase 3) + 5-agent Playwright roster SHIPPED and verified (2026-05-30)
**Status:** The project is renamed to **Agents-Playground** and the vault moved to the repo-root `obsidian-vault/`. Three expansion tracks shipped and are verified at `62` tests total (`60` passed / `2` skipped):

- **5-agent roster** in `.claude/agents/`, addressable from a Claude Code / VS Code / OpenCode harness via the `playwright-test` MCP server in `.mcp.json`: `playwright-test-planner` (official, explores app → writes plan to `specs/`), `playwright-test-generator` (official, plan item → spec under `tests/e2e/generated/`), `playwright-test-healer` (official, runs tests → root-causes → rewrites the broken TEST), `playwright-test-diagnostician` (NEW, custom — read-only RCA: evidence + classify via the 14-category FailureClassifier taxonomy → verdict HEAL vs REPORT), `playwright-test-reporter` (NEW, custom — persists a local bug record + Obsidian incident/healing note). Pipeline: planner → generator → run → diagnostician → (heal | report). Agents fix TESTS, never the app; drift heals, by-design defects get reported.
- **Phase 1 (auth + session):** cookie-based sessions (opaque `sid`, HttpOnly); `/login` page (`public/login.html` + `login.js`); shared `public/auth-guard.js` on protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) redirecting to `/login` only when the `authRequired` flag is armed (default OFF, so existing tests stay green); real `storageState` via setup/authenticated/default Playwright `projects[]` split (`tests/e2e/auth.setup.ts` mints an Admin session → `.artifacts/auth/admin.json`); LoginPage POM + `loginPageProfile` + `loginPageContract` + `baseTest` `loginPage` fixture; `tests/e2e/scenarios/auth-session.spec.ts` (4 tests). New endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/session`, `POST /api/test/set-session`. `seededUsers` gained `@demo.local` emails (password `demo1234`; Carol inactive).
- **Phase 3 (RBAC):** `ROLE_PERMISSIONS` (Admin/Editor/Viewer); gated `POST /api/users` + new `PATCH/DELETE /api/users/:id` (the DELETE carries an INTENTIONAL over-permission DEFECT, `rbacBug=editor-delete` → wrong `200`, as the reporter's target); `GET /api/admin/audit` (401/403/200); `GET /api/users` applies `editsByUserId` + `deletedManagedUserIds` overlays; `/admin` REWRITTEN from inline-static to fetch-driven (`public/admin.js` hitting `/api/admin/audit`, preserving testids + clearLog→0 + contract); `tests/e2e/scenarios/rbac.spec.ts` (5 tests incl. the defect, serial).
- **Drift control:** a per-`runKey` flag store (`GET/POST/DELETE /api/test/flags`; `FLAG_DEFAULTS` + `FLAG_CATALOG`: `ctaMode`/`ordersMode`/`productState`/`createUserPhoneType` plus new `authRequired`/`sessionExpired`/`loginSubmitLabel`/`rbacEnforce`/`adminGate`/`rbacBug`). Split reset hooks: `resetData()` (user data only, PARALLEL-SAFE, used by `POST /api/test/reset-users`) vs `resetAll()` (+ flaky markers + order counter + sessions + flags; `POST /api/test/reset`, seed/setup only).
- Both previously-dark FailureClassifier categories (`auth-or-session`, `permissions-or-rbac`) are now LIT.
  Default regression stays deterministic and offline; the live OpenAI self-healing smoke remains skipped unless `RUN_LIVE_OPENAI_AGENT_TEST=true` and `OPENAI_API_KEY` are set.
  **Next:** Phase 2 (a `/lab` control-panel GUI) and Phase 4 (richer flows: orders-explorer, create-order wizard) are DESIGNED but DEFERRED. Other remaining follow-ups are cross-browser coverage, deciding whether to add a future Jira adapter on top of the local tracker boundary, and optionally running the live OpenAI smoke with a real key. LM Studio remains deferred.

**New docs (2026-05-30, at repo root — NOT in the vault):** `md/PORTABLE_AGENT_ADOPTION_GUIDE.md` (workspace-agnostic adoption guide: terminology, installation, seed, storageState, flag store, RBAC, full agent defs), `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md` (this-repo plan), `md/PLAYGROUND_EXPANSION_DESIGN.md` (the auth/RBAC/drift/flows design + guardrails).

**Historical rollout note (2026-06-08; superseded by the current policy above):** The first GitHub-first design left Jenkins out of scope, kept Claude review advisory/free-first, and ran the post-merge canary through Docker. The implemented flow now requires exact-head AI review evidence and follows `pipeline.config.json` for host or Docker execution.

**CSS polish update (2026-06-08):** Completed `obsidian-vault/Tasks/010 CSS Polish.md` and moved `docs/css-polish-plan.md` from parked plan to implementation note. The change is CSS-only in `public/styles.css`: shared visual tokens, page-shell/card polish, focus rings, form and button states, table/status treatments, reduced-motion handling, and specificity bridges for legacy page-local style blocks. No DOM hooks, text, IDs, roles, or `data-testid` values changed; `.product-layout--broken` geometry remains test-compatible. Validation passed: focused UI coverage 19/19, full `npm.cmd run test:e2e` 60 passed / 2 skipped, screenshots captured under `.artifacts/css-polish/`.

**Formatting baseline (2026-06-27):** Prettier is installed as a root dev dependency with `npm run format:check` and `npm run format`. A repo-wide Prettier pass was applied after install. Validation passed: `npm.cmd run format:check` and full `npm.cmd run test:e2e` (`60` passed / `2` skipped).

**Senior leader agent (2026-06-27):** Added `.claude/agents/playwright-test-senior-leader.md` as the sixth Playwright/Claude agent, plus Codex/Claude skill support at `.agents/skills/senior-leader/SKILL.md` and `.claude/skills/senior-leader/SKILL.md`. It models the AI-native pod pattern: a senior orchestration lead flattens goals into creation/recovery/reporting/governance pods, writes handoff briefs for the specialist agents, and sets validation/closeout gates. It coordinates the existing planner/generator/healer/diagnostician/reporter agents; it does not replace them or edit app/test code directly.

**Dynamic Claude review handoff (2026-06-08):** Added `scripts/github/fetch-claude-review.js`, `npm run review:claude:pull -- --pr <number>`, and `docs/claude-review-handoff.md` so Claude PR comments/reviews can be pulled from GitHub into `obsidian-vault/Inbox/Agents/` instead of being pasted into chat. Also applied Claude review canary fixes: per-commit non-canceling canary concurrency, no `--rm` before diagnostics, loopback-only Docker port publishing, container inspect/log capture, explicit `docker rm -f` cleanup, canary test retries forced to 0, stale `test-results/` upload removed, server startup errors logged, and focus/button contrast tightened.

**Next-phase memory-agent note (2026-04-24):** The current real-agent proof is runtime self-healing only. It does not permanently edit source files or fix the intentional stale-selector demo bugs. If a later real patching agent is added that edits source, that phase must include a reset/revert strategy for intentional demo bugs so the self-healing scenarios remain repeatable.

**Next detail (2026-04-20):** The immediate planned follow-ups for `2026-04-21` are:

- a generic workspace-to-LM Studio local provider link with deterministic fallback preserved and Obsidian kept as the logging and memory boundary
- a first real LLM-backed agent creation pass that adds a true model-driven fallback or advisory layer without replacing deterministic execution as the default path

**Local planning note (2026-04-20):** Private planning guides for LM Studio and future real-LLM integration now live under local ignored `md/` files only, including `LM_STUDIO_DEV_TESTING_GUIDE.md`, `REAL_LLM_AGENT_WORKSPACE_GUIDE.md`, and `IMPLEMENTATION_HANDOFF.md`. They are intentionally not part of the tracked repo surface.

**Local demo note (2026-04-18):** A local Jenkins demo controller was validated against this private repo, but that setup lives outside the repo under `D:\Jenkins` and is machine-local only.

### Last session stop point (2026-05-30, Agents-Playground rename + auth/RBAC/agent-roster expansion)

- **Rename:** project renamed to **Agents-Playground** — `package.json` name `agents-playground`, README title, GitHub repo `asaf-1/Agents-Playground` (still PRIVATE). The vault MOVED from `docs/obsidian-vault/` to the repo-root `obsidian-vault/`; open the REPO ROOT as the Obsidian vault.
- **5-agent roster** added under `.claude/agents/`, addressable via the `playwright-test` MCP server in `.mcp.json` from a Claude Code / VS Code / OpenCode harness:
  - `playwright-test-planner` (official) — explores the app, writes a plan to `specs/`
  - `playwright-test-generator` (official) — turns a plan item into a spec under `tests/e2e/generated/`
  - `playwright-test-healer` (official) — runs tests, root-causes failures, rewrites the broken TEST
  - `playwright-test-diagnostician` (NEW, custom) — read-only RCA: evidence + classify (14-category FailureClassifier taxonomy) → verdict HEAL vs REPORT
  - `playwright-test-reporter` (NEW, custom) — persists a local bug record + Obsidian incident/healing note
  - Pipeline: planner → generator → run → diagnostician → (heal | report). Agents fix TESTS, never the app.
- **Phase 1 (auth + session), shipped:** cookie-based sessions (opaque `sid`, HttpOnly); new `/login` page (`public/login.html` + `login.js`); shared `public/auth-guard.js` on protected pages (`/profile`, `/settings`, `/user-manager`, `/admin`) that redirects to `/login` only when the `authRequired` flag is armed (default OFF, so existing tests stay green); real `storageState` via a setup/authenticated/default Playwright `projects[]` split (`tests/e2e/auth.setup.ts` mints an Admin session → `.artifacts/auth/admin.json`); LoginPage POM + `loginPageProfile` + `loginPageContract` + `baseTest` `loginPage` fixture; `tests/e2e/scenarios/auth-session.spec.ts` (4 tests). New endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/session`, `POST /api/test/set-session`. `seededUsers` gained `@demo.local` emails (password `demo1234`; Carol inactive).
- **Phase 3 (RBAC), shipped:** `ROLE_PERMISSIONS` (Admin/Editor/Viewer); gated `POST /api/users` + new `PATCH/DELETE /api/users/:id`; the DELETE carries an INTENTIONAL over-permission DEFECT (`rbacBug=editor-delete` → wrong `200`) as the reporter's target; `GET /api/admin/audit` (401/403/200); `GET /api/users` applies `editsByUserId` + `deletedManagedUserIds` overlays; `/admin` REWRITTEN from inline-static to fetch-driven (`public/admin.js` hitting `/api/admin/audit`, preserving testids + clearLog→0 + contract); `tests/e2e/scenarios/rbac.spec.ts` (5 tests incl. the defect, serial).
- **Drift control:** per-`runKey` flag store (`GET/POST/DELETE /api/test/flags`; `FLAG_DEFAULTS` + `FLAG_CATALOG`: `ctaMode`/`ordersMode`/`productState`/`createUserPhoneType` already existed conceptually, plus new `authRequired`/`sessionExpired`/`loginSubmitLabel`/`rbacEnforce`/`adminGate`/`rbacBug`). Split reset hooks: `resetData()` (user data only, PARALLEL-SAFE, used by `POST /api/test/reset-users`) vs `resetAll()` (+ flaky markers + order counter + sessions + flags; `POST /api/test/reset`, seed/setup only).
- Both previously-dark FailureClassifier categories (`auth-or-session`, `permissions-or-rbac`) are now LIT.
- New repo-root docs (NOT in the vault): `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`, `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md`, `md/PLAYGROUND_EXPANSION_DESIGN.md`. Phase 2 (a `/lab` control-panel GUI) and Phase 4 (richer flows: orders-explorer, create-order wizard) are DESIGNED but DEFERRED.
- **Validation:** all changes SHIPPED + verified — `62` tests total, `60` passed / `2` skipped.

### Last session stop point (2026-04-24, real Obsidian/self-healing agent proof)

- Added `obsidian-vault/Tasks/007 Real Agent Proof.md` as the active scoped task note.
- Added a bounded real self-healing LLM layer:
  - `framework/agents/llm/SelfHealingLlmAgent.ts`
  - `framework/agents/llm/OpenAiSelfHealingProvider.ts`
  - default mode remains disabled/offline unless configured
  - live OpenAI provider uses `POST https://api.openai.com/v1/responses`
  - unsafe provider output is rejected before any browser action
- Added `framework/agents/obsidian/ObsidianMemoryAgent.ts` for structured healing-run Markdown logs, workspace-state session logs, and task-note `Result` updates.
- Added `tests/e2e/scenarios/real-agent-proof.spec.ts`:
  - real browser recovery with a fake provider
  - real vault healing-log write
  - temp task-note `Result` update
  - unsafe output rejection
  - disabled mode no-call guard
  - workspace-state vault log writing for session handoff
  - opt-in `@live-openai` provider smoke, skipped by default
- Updated `README.md`, `obsidian-vault/02 Test Map.md`, and `package.json` with `npm run test:real-agent`.
- Reclassified the NarrativeEnricher `/v1/responses` test as an endpoint lock rather than a known issue.
- Added a future-phase memory note: any later source-editing patching agent must include reset/revert handling for intentional demo bugs; the current `SelfHealingLlmAgent` remains runtime self-healing only.
- Tightened live OpenAI setup handling after a placeholder-key run:
  - `@live-openai` now skips common placeholder key values such as `your-openai-api-key`
  - provider failures now include the OpenAI response status/body excerpt in the agent decision
- Broadened the Obsidian vault update after the real-agent proof:
  - updated `00 Home.md`, `01 Project Map.md`, `03 Agent and Obsidian Workflow.md`, `06 Agents Playground Guide.md`, and `Reports/README.md`
  - added local session summary `Reports/Healing/2026-04-24-real-agent-session-vault-update.md`
  - clarified that the agent must record the whole relevant session/workspace state, including README/memory/task-note status when features change, while avoiding blind rewrites of unrelated notes
- Extended `ObsidianMemoryAgent.writeWorkspaceStateLog()` so future runs can write `Reports/Workspace/` handoff notes with current state, changed files, documentation status, decisions, validation, and next actions.
- Added local workspace-state report `Reports/Workspace/2026-04-24-real-agent-workspace-state-update.md` for this session.
- Wired the opt-in `@live-openai` smoke so a manual live OpenAI run writes real vault evidence under both `Reports/Healing/` and `Reports/Workspace/`; running only `--grep "@live-openai"` proves OpenAI plus those Obsidian writes, while the broader `npm.cmd run test:real-agent` still covers the deterministic fake-provider and vault-write cases.
- Added `framework/agents/obsidian/ObsidianCloseoutAgent.ts` and `scripts/obsidian-closeout.js`:
  - inspects `git status --short --untracked-files=all`
  - classifies changed files
  - infers required README, `AGENT_MEMORY.md`, task-note, `02 Test Map.md`, and Obsidian workflow updates
  - writes `Reports/Workspace/` closeout evidence
  - blocks closeout when required documentation is missing
- Added `npm.cmd run obsidian:closeout -- --title <title> --summary <summary>` as the manual closeout guard command.
- Manual live OpenAI smoke was run by the user with a real key and passed: `npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts --grep "@live-openai"` → `1/1` passed.
- Validation completed:
  - `npx.cmd tsc --noEmit` passed
  - `npx.cmd playwright test tests/e2e/scenarios/real-agent-proof.spec.ts` passed with `8` passed and `1` skipped live OpenAI smoke
  - `npm.cmd run test:e2e` passed with `49` passed and `1` skipped live OpenAI smoke out of `50` specs
  - `npm.cmd run obsidian:closeout -- --title real-agent-closeout-agent --summary "Implemented Obsidian closeout guard for changed-file documentation gating." --validation-command "npm.cmd run test:e2e" --validation-outcome "49 passed, 1 skipped live OpenAI smoke out of 50 specs"` passed and wrote final report `Reports/Workspace/2026-04-24-real-agent-closeout-agent-1777019807654.md`
- Pre-push validation rerun completed on the current working tree before push:
  - `npm.cmd run test:e2e` passed with `49` passed and `1` skipped live OpenAI smoke out of `50` specs
  - `docker build -t ai-agentic-project-prepush .` passed
- Current real Obsidian/self-healing agent proof and closeout flow were pushed to `origin/main` at commit `e38f095` on 2026-04-24 after the pre-push gate passed.

### Slice 1 delivered

`IncidentRouter` + `AgentRegistry` + `UserManagerPage` end-to-end. `orchestrated-recovery.spec.ts` proves one stale-locator failure is classified, healed, and validated through the multi-agent chain.
Full roadmap (many phases ahead): `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`

### Push status

The first project push is complete on `main`:

- remote: `https://github.com/asaf-1/GenAI-AgenticAI-Demo.git`
- branch: `main`
- local validation before push:
  - `npm.cmd test` → `24/24` passed
  - `docker build -t ai-agentic-project-prepush .` → passed
- follow-up CI fix:
  - commit `1ab9fff` pushed to `origin/main`
  - GitHub Actions workflows now rely on Playwright `webServer` instead of manual background `node server.js` startup
  - `Main Branch Validation` also supports `workflow_dispatch` so latest `main` can be run manually without rerunning an older workflow revision

**Commit guidance for Codex:**

✅ Commit everything in:

- `framework/` (orchestrator, pom, agents, fixtures, reporting, data)
- `tests/e2e/` (all 15 specs)
- `public/` (dashboard.html/js, product.html/js, user-manager.html, modified index/app/styles)
- `server.js`, `package.json`, `package-lock.json`, `playwright.config.ts`, `Jenkinsfile`, `README.md`, `Dockerfile`, `Dockerfile.e2e`, `docker-compose.yml`
- `.github/workflows/` (pr-validation.yml, main-validation.yml, daily-regression.yml, publish-playwright-runner.yml)
- `.devcontainer/`, `scripts/docker/`
- `.claude/` (settings.json + skills)
- `obsidian-vault/` (AGENT_MEMORY.md, Inbox/Agents/, Tasks/003-005, 06 Guide, modified 00-04 + Templates)
- `md/` (DEV_TEAM_AGENT_SETUP_PLAYBOOK, NEXT_PHASE_MULTI_AGENT_ROADMAP, PAGE_LEVEL_SELF_HEALING_PATTERN, PLAN, PRODUCTION_SELF_HEALING_MULTI_AGENT_BLUEPRINT, SHARED_AGENT_SETUP_BLUEPRINT)
- Accept the 7 deletions (old `framework/page-objects/`, `framework/test-data/`, `tests/e2e/portfolio-demo*`, `md/Infestracture-Reasoning.md`, vault Tasks 001-002) — they were intentionally retired

🔴 DO NOT commit:

- `asaf-1/` — it's a separate Git repo (personal portfolio) nested inside this project. Already added to `.gitignore` on 2026-04-17.
- Anything already in `.gitignore`: `node_modules/`, `.artifacts/`, `test-results/`, `.env*`, `obsidian-vault/Reports/*` (except its README).

**Gate:** `npm.cmd test` / `npm.cmd run test:e2e` must keep the deterministic suite green; current expected default is `60` passed and `2` skipped out of `62` tests total (the live OpenAI smoke + 1 other).
**First push:** `git push -u origin main`. Subsequent: `git push`.
**Commit strategy:** one "Slice 1 + Slice 2 complete" commit is fine, OR split by area (framework / tests / docs / CI) — Codex's call.

### Last session stop point (2026-04-20, local bug reporting)

- Added rollback markers before implementation:
  - git tag `snapshot/pre-bug-reporting-2026-04-20-0114`
  - snapshot note `obsidian-vault/Snapshots/2026-04-20-0114-pre-bug-reporting.md`
- Added the additive local bug reporting workflow without editing existing tests or product/runtime behavior:
  - `framework/agents/reporting/BugReportingAgent.ts`
  - `framework/agents/reporting/LocalBugStoreAdapter.ts`
  - `framework/agents/reporting/catalog.ts`
  - `framework/agents/reporting/types.ts`
  - `scripts/bug-reporting/run-local-bug-report.js`
  - `scripts/bug-reporting/validate-local-bug-reporting.js`
  - `.claude/skills/bug-report/SKILL.md`
- The tracker is local-only in v1:
  - bug records go to `obsidian-vault/Reports/Bug Reports/`
  - evidence goes to `.artifacts/bug-reports/`
  - confirmation requires the initial detection plus `3` reruns before opening a local bug
  - self-healed scenarios can still become tracked local bugs if the underlying website defect still reproduces
- Validation completed:
  - `npx.cmd tsc --noEmit` passed
  - `node scripts/bug-reporting/validate-local-bug-reporting.js` passed
  - `npm.cmd run test:e2e` passed with `41/41`

### Last session stop point (2026-04-20, roadmap follow-up for local LM Studio link)

- Added a new immediate follow-up section to `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` for `2026-04-21`:
  - implement a generic workspace-to-LM Studio provider link
  - keep deterministic mode available for ordinary regression
  - keep Obsidian as the logging and memory boundary
  - add connectivity verification and future Obsidian logging hooks behind a central provider config
- Kept the tracked repo change minimal:
  - updated `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
  - updated `obsidian-vault/AGENT_MEMORY.md`
  - left local-private generic LM Studio planning notes out of the tracked push
- Local pre-push validation rerun completed because the user requested a push:
  - `npm.cmd run test:e2e` passed with `41/41`
  - `docker build -t ai-agentic-project-prepush .` passed

### Last session stop point (2026-04-20, roadmap follow-up for real LLM agent creation)

- Added a second immediate follow-up section to `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` for `2026-04-21`:
  - create one real LLM-backed agent layer instead of relying only on deterministic TypeScript "agents"
  - keep deterministic-first execution for normal regression and page actions
  - use the real LLM only as a bounded fallback or advisory layer for cases such as self-healing fallback, failure triage, and repair suggestion
  - add provider-backed execution, run labeling, and explicit guardrails
- Added one new local-private generic reference note and kept it out of the tracked push:
  - `md/REAL_LLM_AGENT_WORKSPACE_GUIDE.md`
- Updated `.gitignore` so the local-private LM Studio and real-LLM planning notes stay hidden from repo status noise.

### Last session stop point (2026-04-19, snapshot layer + doc rules)

- Added the session snapshot/resume layer:
  - `obsidian-vault/Snapshots/` folder with `README.md` explaining when to write a snapshot and how it differs from `AGENT_MEMORY.md`, `Tasks/`, `Reports/`, `Inbox/Agents/`, and Git history.
  - `obsidian-vault/Templates/Session Snapshot.md` defining the snapshot structure (Active Phase, What Was In Flight, Last Decisions w/ why, Workspace State, Resume Entry Point, Blockers).
  - `.claude/skills/snapshot/SKILL.md` registering `/snapshot <title>` — gathers git state, reads memory, fills the template, links from `00 Home.md`.
- Updated `AGENTS.md`:
  - New **Documentation Rules** section: any feature add/remove/rename must update `README.md` and `AGENT_MEMORY.md` in the same change set; bump the test count in `README.md` whenever spec count changes.
  - New **Session Continuity Rules** section: write `/snapshot` before stopping, on token-cap risk, or on any cross-agent handoff.
- Updated `README.md`: bumped `33` → `41` in both spots, added the OpenAI fallback coverage note, added a `Snapshots/` line under Important Paths.
- No code/test changes this session — all updates are docs, vault scaffolding, and skill registration. No suite rerun needed; last run was 41/41 from the previous stop point.

### Last session stop point (2026-04-19, bug reporting guide note)

- Added `md/BUG_REPORTING_GUIDE.md` as a local/private reference note covering bug lifecycle, severity/priority, reporting channels, regression reporting, incident handling, and future bug-reporting-agent workflow ideas.
- Updated `README.md` and `obsidian-vault/AGENT_MEMORY.md` in the same change set so the new helper note is discoverable under the repo documentation rules.
- No code or test-count changes were made as part of this doc addition.

### Previous session stop point (2026-04-19, NarrativeEnricher coverage)

- Added `tests/e2e/scenarios/narrative-enricher.spec.ts` (8 tests) covering `framework/agents/diagnosis/NarrativeEnricher.ts`:
  - deterministic fallback when `OPENAI_API_KEY` missing, on non-ok status, on empty payload, and on fetch throw/abort
  - successful enrichment via `output_text` and via flattened `output[].content[].text`
  - request body carries the configured model and the 2-3-sentence rewrite prompt
  - endpoint lock: pins the OpenAI Responses API URL to `https://api.openai.com/v1/responses` so any provider-surface change is forced to ship with an updated assertion.
- Tests use `globalThis.fetch` swap with restore in `afterEach` and restore `OPENAI_API_KEY` / `OPENAI_MODEL` env vars between tests; no real network calls.
- Suite count moved from 33 → 41 specs. `npx playwright test tests/e2e/scenarios/narrative-enricher.spec.ts` → 8/8. `npm run test:e2e` → 41/41.
- No changes to other tests, framework code, configs, or CI files this session.

### Previous session stop point (2026-04-18)

- Added repo-level `.gitattributes` to normalize text files to LF across machines while keeping Windows-native command files (`.ps1`, `.bat`, `.cmd`) on CRLF, to prevent recurring line-ending mismatch churn between this workstation and the laptop.
- Added `.env` and `.env.*` to `.dockerignore` so local env files stay out of Docker build context if they exist on a developer machine.
- Performed a repo leak scan before push prep:
  - no tracked GitHub PATs, private keys, bearer tokens, or Jenkins local-path leaks found
  - no `.env` files currently present in the repo workspace
- Re-ran the repo suite after the Docker ignore hardening:
  - `npm.cmd run test:e2e` â†’ `33/33` passed
- Set up and validated a local Jenkins demo controller outside the repo:
  - root: `D:\Jenkins`
  - local files created there: `start-jenkins.bat`, `stop-jenkins.bat`, `README.txt`, `NEXT-STEPS.txt`
  - created a local Pipeline job pointing at `https://github.com/asaf-1/GenAI-AgenticAI-Demo.git`
  - Jenkins run succeeded against the repo `Jenkinsfile`
  - local Jenkins retention for the demo job was tightened to keep `1` build and `0` artifact builds
  - this Jenkins state is machine-local only and must not be committed or copied into the repo
- Implemented the deferred Docker hardening track end to end:
  - Added `Dockerfile.e2e` pinned to the Playwright `v1.59.1-noble` base image digest
  - Added `docker-compose.yml` and optional `.devcontainer/devcontainer.json` for shared local onboarding
  - Added `scripts/docker/resolve-playwright-runner.sh` and `scripts/docker/run-containerized-playwright.sh` for CI/container execution
  - Added package scripts: `docker:prepare-runner`, `docker:pull-runner`, `test:docker:smoke`, `test:docker:e2e`, `docker:shell`
  - Updated `Jenkinsfile` so browser-based validation runs inside the shared runner instead of host-installed Playwright browsers
  - Updated GitHub Actions (`pr-validation.yml`, `main-validation.yml`, `daily-regression.yml`) to run browser validation inside the shared runner and added `publish-playwright-runner.yml` for GHCR publishing
  - Tightened `.dockerignore` and updated `README.md`, `04 Daily Regression Automation.md`, `06 Agents Playground Guide.md`, and `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
  - Added `.claude/skills/docker-runtime/SKILL.md` plus Docker command permissions in `.claude/settings.json` so future agents know to refresh the runner image and container dependency volume after library changes
- Validation completed locally:
  - `docker compose config` → passed
  - `docker compose build qa-runner` → passed
  - `npm.cmd run test:docker:smoke` → passed
  - `npm.cmd run test:docker:e2e` → `33/33` passed
  - `npm.cmd run test:e2e` → `33/33` passed
  - `docker build -t ai-agentic-project-prepush .` → passed
  - Follow-up docs/skill addition: no tests rerun because product/runtime behavior did not change

### Earlier session stop point (2026-04-18, repair + new pages)

- Built `framework/agents/repair/` (PatchPlanner, PatchApplier, RepairVerifier, types) and wired the full plan → apply → verify flow into `IncidentRouter` behind an environment guard (QA/staging only; production is skipped).
- Patch artifacts now written to `.artifacts/patches/<incidentId>/patch-plan.json` when a plan is permitted.
- Added four new self-healing pages end to end: `OrdersPage`, `AdminPage`, `ProfilePage`, `SettingsPage` — each with HTML page under `public/`, page profile, page contract, POM, and `baseTest.ts` fixture. Server routes added in `server.js` for `/orders`, `/admin`, `/profile`, `/settings`.
- New specs: `tests/e2e/scenarios/repair-flow.spec.ts` (5 cases covering planner, applier, verifier, QA end-to-end, production skip) and `tests/e2e/sanity/new-pages.spec.ts` (4 cases, one per new page).
- Scheduled Claude daily regression trigger created via CronCreate at `7 5 * * *` local. Note: the harness returned session-only despite `durable:true` — persistence across agent restarts still relies on `.github/workflows/daily-regression.yml`.
- `npm.cmd test` passes locally at `33/33` (was 24 before this session).

### Previous session stop point (2026-04-17)

- Fixed state-pollution bug: `/api/create-user` and `/api/users` now use separate stores (`runtimeState.createdUsers` vs `runtimeState.managedUsers`). Added `POST /api/test/reset-users` for test isolation.
- Added visible `<label>Search</label>` on User Manager so `requiredTextTokens: ["Search"]` in the contract passes.
- Orchestrated-recovery spec now dismisses dialogs + resets managed users on setup.
- Built `framework/orchestrator/PolicyEngine.ts` and wired it into `IncidentRouter` so recovery strategies are filtered by environment-safe policy before auto-mitigation.
- Added `tests/e2e/scenarios/policy-engine.spec.ts` to lock QA-vs-production policy behavior and low-confidence approval gating.
- Built `framework/orchestrator/ExecutionPlanner.ts` and wired it into `IncidentRouter` so execution order is planned after policy and before recovery.
- Added `framework/memory/IncidentMemoryStore.ts` and `framework/agents/evidence/EvidenceCollectionAgent.ts`, both integrated into the orchestrated incident flow.
- Expanded `FailureClassifier.ts` with auth/session, RBAC, modal, navigation, timeout, empty-state, and delayed-data branches.
- Expanded `GenericLocatorHealer.ts` with select, menu, modal, row-context, label, placeholder, and section-context recovery.
- Added `.github/workflows/daily-regression.yml` with a fixed `05:00 UTC` schedule and artifact-only regression reporting.
- Added targeted coverage for planner, memory/evidence, classifier expansion, and advanced locator healing.
- `npm.cmd test` passes locally at `24/24`.
- Local Docker build passes: `docker build -t ai-agentic-project-prepush .`
- Commit `60d270d` pushed to `origin/main` after replacing `origin` with `GenAI-AgenticAI-Demo`.
- Fixed the first GitHub Actions failure on `Wait for server` by removing manual server startup from `pr-validation.yml`, `main-validation.yml`, and `daily-regression.yml`.
- Commit `1ab9fff` pushed to `origin/main` so all CI workflows use Playwright `webServer` for server lifecycle in GitHub Actions.
- Added `workflow_dispatch` to `main-validation.yml` so manual runs can target the latest `main` workflow definition instead of rerunning stale failed revisions.

---

## What Has Been Built (Completed Work)

### App

- `server.js` — Node.js on port 4173. Routes: `/`, `/dashboard`, `/product/:id`, `/api/health`, `/api/orders`, `/api/create-user`, `/api/product/:id`
- `public/` — index.html, dashboard.html, product.html + JS/CSS

### Framework

- `framework/pom/SelfHealingPage.ts` — abstract base with auto-recovery
- `framework/pom/HomePage.ts`, `DashboardPage.ts`, `ProductPage.ts`, `UserManagerPage.ts`, `OrdersPage.ts`, `AdminPage.ts`, `ProfilePage.ts`, `SettingsPage.ts`
- `framework/orchestrator/IncidentRouter.ts`, `AgentRegistry.ts` ← Slice 1
- `framework/orchestrator/PolicyEngine.ts` ← Slice 2
- `framework/orchestrator/ExecutionPlanner.ts` ← Slice 2
- `framework/agents/recovery/RecoveryRouter.ts`
- `framework/agents/recovery/GenericLocatorHealer.ts`
- `framework/agents/recovery/NetworkRecoveryAgent.ts`
- `framework/agents/evidence/EvidenceCollectionAgent.ts` ← Slice 2
- `framework/agents/repair/PatchPlanner.ts`, `PatchApplier.ts`, `RepairVerifier.ts`, `types.ts` ← roadmap #7
- `framework/agents/recovery/pageProfiles/` — home, dashboard, product, userManager, orders, admin, profile, settings profiles
- `framework/agents/diagnosis/FailureClassifier.ts`
- `framework/agents/diagnosis/ApiDiagnosisAgent.ts`
- `framework/agents/diagnosis/PatchProposalAgent.ts`
- `framework/agents/reporting/BugReportingAgent.ts`, `LocalBugStoreAdapter.ts`, `catalog.ts`, `types.ts` ← local-only bug reporting + tracker boundary
- `framework/agents/llm/SelfHealingLlmAgent.ts`, `OpenAiSelfHealingProvider.ts` ← bounded real self-healing LLM proof + opt-in OpenAI provider
- `framework/agents/obsidian/ObsidianMemoryAgent.ts` ← vault healing logs + workspace-state logs + task-result updates
- `framework/agents/obsidian/ObsidianCloseoutAgent.ts` ← git-status changed-file detection + documentation closeout gating + workspace reports
- `framework/agents/validation/PageValidationAgent.ts`
- `framework/agents/validation/contracts.ts` (home, dashboard, product, user-manager, orders, admin, profile, settings)
- `framework/fixtures/baseTest.ts` — exposes `userManagerPage` fixture
- `framework/memory/IncidentMemoryStore.ts` ← Slice 2
- `framework/reporting/scenarioArtifacts.ts`

### Tests (62 tests total; 60 pass locally by default, 2 skipped — the live OpenAI smoke + 1 other)

- `tests/e2e/sanity/`, `functional/positive|negative/`, `contracts/`, `non-functional/`, `scenarios/` (16 agentic scenario specs including `orchestrated-recovery.spec.ts`, `policy-engine.spec.ts`, `execution-planner.spec.ts`, `incident-memory-and-evidence.spec.ts`, `failure-classifier-expansion.spec.ts`, `advanced-locator-healing.spec.ts`, `repair-flow.spec.ts`, `real-agent-proof.spec.ts`, and `narrative-enricher.spec.ts`)
- `tests/e2e/sanity/new-pages.spec.ts` covers the four new pages (orders, admin, profile, settings)
- `tests/e2e/scenarios/narrative-enricher.spec.ts` (8 cases) covers the OpenAI enrichment fallback paths and locks the current `/v1/responses` endpoint URL as the explicit provider surface
- `tests/e2e/scenarios/real-agent-proof.spec.ts` (9 cases) covers real browser self-healing with a fake provider, real Obsidian vault healing and workspace-state writes, task-result updates, closeout documentation gating, unsafe LLM-output rejection, disabled mode, and a skipped-by-default `@live-openai` provider smoke
- `tests/e2e/scenarios/auth-session.spec.ts` (4 cases) — Phase 1 cookie-based auth/session flows
- `tests/e2e/scenarios/rbac.spec.ts` (5 cases, serial) — Phase 3 RBAC incl. the intentional `rbacBug=editor-delete` over-permission defect
- `tests/e2e/auth.setup.ts` mints an Admin session storageState (`.artifacts/auth/admin.json`) via the setup/authenticated/default `projects[]` split

### CI

- `.github/workflows/pr-validation.yml` runs formatting and full Playwright on PRs to main; `preMerge.dockerEnabled` selects host or Docker execution.
- `.github/workflows/main-validation.yml` runs on pushes to main and supports manual `workflow_dispatch`.
- `.github/workflows/post-merge-canary.yml` runs after merged PRs or manual dispatch; `postMerge.dockerEnabled` selects host or Docker execution for health, sanity, and contract checks.
- `.github/workflows/ai-review-gate.yml` requires trusted current-head Codex/Claude review evidence on PRs to main.
- `.github/workflows/daily-regression.yml` runs the scheduled full suite with artifact-only reporting.
- `.github/workflows/remote-test-runner.yml` is the on-demand outsourced runner: a `plan` job resolves and validates the flow, a sharded `test` matrix runs it, and a `report` job merges the blob reports. Triggers: `workflow_dispatch`, `repository_dispatch` (`remote-test-run`), `workflow_call`. Not a merge gate.
- `.github/workflows/flow-catalog.yml` regenerates and commits `scripts/test-runner/flow-catalog.json` on pushes to `main`. It is the only workflow with `contents: write`; the default `GITHUB_TOKEN` cannot retrigger workflows, so it cannot loop.
- `.github/workflows/publish-playwright-runner.yml` publishes the shared Playwright runner image to GHCR (`main` + commit SHA tags).
- Docker-enabled jobs use the shared runner image; policy-selected host jobs set up Chromium on the ephemeral GitHub runner.
- `CLAUDE.md`: advisory Claude pre-merge review guidance for manual/free-first review and optional later automation
- `Jenkinsfile`: existing Jenkins validation remains present but is out of scope for the current GitHub-first merge/canary phase

### Codex / Claude Skills

- `/senior-leader <goal>` — create an AI-native pod plan and specialist dispatch briefs
- `/qa-run <suite>` — run any test suite
- `/new-page <PageName>` — scaffold full self-healing page
- `/next-phase` — build orchestration slice + auto-update this file
- `/incident-note <description>` — write structured vault note
- `/bug-report` — confirm a real website/API defect from a scenario artifact or manual page check, then create or update a local-only bug record
- `/snapshot <title>` — write a session snapshot for cold resume across sessions or agent handoffs
- `/docs [title]` — save the session: rewrite `STATUS.md` (latest state) and archive a dated snapshot
- `/recall` — read `STATUS.md`, verify it against live git/GitHub, report where to resume

### Playwright Agent Roster (`.claude/agents/`, via `playwright-test` MCP in `.mcp.json`)

- `playwright-test-senior-leader` (custom) — flattens goals into AI-native pods, handoff briefs, validation gates, and closeout criteria
- `playwright-test-planner` (official) — explores the app, writes a plan to `specs/`
- `playwright-test-generator` (official) — turns a plan item into a spec under `tests/e2e/generated/`
- `playwright-test-healer` (official) — runs tests, root-causes failures, rewrites the broken TEST
- `playwright-test-diagnostician` (NEW, custom) — read-only RCA: evidence + 14-category classify → HEAL vs REPORT verdict
- `playwright-test-reporter` (NEW, custom) — persists a local bug record + Obsidian incident/healing note
- Pipeline: senior leader → pod plan → planner/generator or diagnostician → (healer | reporter). Agents fix TESTS, never the app.

### Vault + Memory

- `obsidian-vault/AGENT_MEMORY.md` — this file
- `obsidian-vault/Reports/Daily|Incidents|Healing|Workspace|Bug Reports/`
- `obsidian-vault/Inbox/Agents/` — handoff drop zone
- `obsidian-vault/Snapshots/` — point-in-time session state for cold resume (write via `/snapshot`)
- `obsidian-vault/Tasks/`, `Templates/`

---

## What Is Next (Pending Work)

Roadmap tasks 1–10 and the deferred shared Docker hardening pass are complete (2026-04-18). Pick the next post-phase hardening item.

| Priority | Task                                                                                                                                             | Owner  | Status  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------- |
| ~~1~~    | ~~Build `IncidentRouter` + `AgentRegistry`~~                                                                                                     | Claude | ✅ done |
| ~~2~~    | ~~Build `UserManagerPage` end to end~~                                                                                                           | Claude | ✅ done |
| ~~3~~    | ~~Write `orchestrated-recovery.spec.ts` proof test~~                                                                                             | Claude | ✅ done |
| ~~6a~~   | ~~Create GitHub Actions workflow files (pr + main)~~                                                                                             | Claude | ✅ done |
| ~~6b~~   | ~~Commit + push Slice 1 + approved Slice 2 scope to `origin main` at https://github.com/asaf-1/GenAI-AgenticAI-Demo~~                            | Codex  | ✅ done |
| ~~1~~    | ~~Build `PolicyEngine.ts` in `framework/orchestrator/` (enforces environment-safe actions)~~                                                     | Codex  | ✅ done |
| ~~2~~    | ~~Build `ExecutionPlanner.ts` in `framework/orchestrator/` (orders strategies/workers)~~                                                         | Codex  | ✅ done |
| ~~3~~    | ~~Build `framework/memory/IncidentMemoryStore.ts` (record what worked, history)~~                                                                | Codex  | ✅ done |
| ~~4~~    | ~~Add `EvidenceCollectionAgent` in `framework/agents/evidence/`~~                                                                                | Codex  | ✅ done |
| ~~5~~    | ~~Expand `FailureClassifier` (auth, RBAC, modal-not-opened, route-nav, api-timeout, 5xx, empty-state, delayed-data)~~                            | Codex  | ✅ done |
| ~~6~~    | ~~Expand `GenericLocatorHealer` (dropdown, menu, modal, table row/action, form-field by label/placeholder/section)~~                             | Codex  | ✅ done |
| ~~7~~    | ~~Repair agents: `PatchPlanner`, `PatchApplier`, `RepairVerifier` in `framework/agents/repair/` (QA/staging only)~~                              | Claude | ✅ done |
| ~~8~~    | ~~New pages: `OrdersPage`, `AdminPage`, `ProfilePage`, `SettingsPage` (use `/new-page` skill)~~                                                  | Claude | ✅ done |
| ~~9~~    | ~~`.github/workflows/daily-regression.yml` (scheduled nightly)~~                                                                                 | Codex  | ✅ done |
| ~~10~~   | ~~Set up scheduled Claude remote trigger (daily regression)~~                                                                                    | Claude | ✅ done |
| ~~11~~   | ~~Implement shared Docker runtime across CI and dev (`Dockerfile.e2e`, Compose, GHCR publish, Jenkins/GitHub Actions containerized validation)~~ | Codex  | ✅ done |

All roadmap tasks, the Docker hardening pass, local bug reporting, and the first real Obsidian/self-healing agent proof are complete. The Obsidian layer now records healing runs, workspace/session state, and closeout guard evidence from changed-file analysis. Remaining follow-ups sit under post-phase hardening in `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md` (workspace-to-LM Studio link remains deferred, live OpenAI smoke can be run manually with a key, plus cross-browser coverage and auth flows).

---

## How Agents Use This File

### Session start

1. Read this file
2. Read `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
3. Pick the highest-priority pending task

### Session end

1. If a task note under `obsidian-vault/Tasks/` is in scope, update its `Result` section before finishing substantial implementation work
2. Update `obsidian-vault/AGENT_MEMORY.md` to mark completed work and adjust pending items
3. Run `npm.cmd run obsidian:closeout -- --title <title> --summary <summary>` when the work changes code, tests, README, vault notes, or agent behavior; fix any blocked required-doc output before final handoff
4. When the workflow needs a direct report, write a `Reports/Workspace/` state note through `ObsidianMemoryAgent.writeWorkspaceStateLog()` covering current state, changed files, docs status, decisions, validation, and next actions
5. For substantive work or any agent handoff, drop a handoff note in `obsidian-vault/Inbox/Agents/`
6. Write a note to the relevant `Reports/` subfolder when the workflow calls for a report
7. State the end result clearly in the final user-facing closeout message
8. Commit when there are real repo changes worth preserving in Git history; recommended, not mandatory

### Handoff format (Claude ↔ Codex)

File: `obsidian-vault/Inbox/Agents/YYYY-MM-DD-handoff-<from>.md`

```
# Handoff: <phase>
**From / To / Date:**
## What was done
## What to do next
## Files changed
## Tests to run
```

---

## Known Issues

| Issue                                                                                                                                                    | File                                       | Severity                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| No cross-browser coverage                                                                                                                                | `playwright.config.ts`                     | medium                  |
| ~~No auth/session test flows~~ — RESOLVED by Phase 1 (`auth-session.spec.ts`, storageState, `/login`)                                                    | `tests/e2e/scenarios/auth-session.spec.ts` | ✅ resolved             |
| RBAC over-permission on `DELETE /api/users/:id` (`rbacBug=editor-delete` → wrong `200`) — **BY DESIGN**, the reporter agent's target; do NOT fix the app | `server.js`                                | by-design (intentional) |
| home-cta heal demo parked as `test.fixme`                                                                                                                | `tests/`                                   | parked (intentional)    |

---

## Key File Map

| Need                                           | Location                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Playwright agent roster (6 agents)             | `.claude/agents/`                                                                           |
| Codex senior leader skill                      | `.agents/skills/senior-leader/SKILL.md`                                                     |
| Claude senior leader skill mirror              | `.claude/skills/senior-leader/SKILL.md`                                                     |
| MCP server config (`playwright-test`)          | `.mcp.json`                                                                                 |
| Auth setup / storageState mint                 | `tests/e2e/auth.setup.ts` → `.artifacts/auth/admin.json`                                    |
| Auth/session spec (Phase 1)                    | `tests/e2e/scenarios/auth-session.spec.ts`                                                  |
| RBAC spec (Phase 3, incl. intentional defect)  | `tests/e2e/scenarios/rbac.spec.ts`                                                          |
| Login page UI                                  | `public/login.html`, `public/login.js`, `public/auth-guard.js`                              |
| Portable adoption guide (repo root, not vault) | `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`                                                       |
| This-repo agents adoption plan                 | `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md`                                                     |
| Playground expansion design                    | `md/PLAYGROUND_EXPANSION_DESIGN.md`                                                         |
| App server + routes                            | `server.js`                                                                                 |
| App Docker image                               | `Dockerfile`                                                                                |
| Shared Playwright runner                       | `Dockerfile.e2e`, `docker-compose.yml`, `.devcontainer/devcontainer.json`                   |
| Page objects                                   | `framework/pom/`                                                                            |
| Recovery agents                                | `framework/agents/recovery/`                                                                |
| Diagnosis agents                               | `framework/agents/diagnosis/`                                                               |
| Real self-healing LLM agent                    | `framework/agents/llm/`                                                                     |
| Obsidian memory agent                          | `framework/agents/obsidian/`                                                                |
| Validation contracts                           | `framework/agents/validation/contracts.ts`                                                  |
| Container execution helpers                    | `scripts/docker/`                                                                           |
| Remote test runner (scripts + API)             | `scripts/test-runner/`                                                                      |
| Standalone Test Runner app                     | `test-runner/` (own server, UI, auth, Dockerfile)                                           |
| Flow catalog (generated, committed)            | `scripts/test-runner/flow-catalog.json`                                                     |
| Curated flow groups (hand-maintained)          | `scripts/test-runner/flow-groups.json`                                                      |
| Test runner workflow                           | `.github/workflows/remote-test-runner.yml`                                                  |
| Flow catalog refresh workflow                  | `.github/workflows/flow-catalog.yml`                                                        |
| Remote test runner runbook                     | `docs/remote-test-runner.md`                                                                |
| Docker Claude skill                            | `.claude/skills/docker-runtime/SKILL.md`                                                    |
| Local bug reporting skill                      | `.claude/skills/bug-report/SKILL.md`                                                        |
| Local bug reporting runner                     | `scripts/bug-reporting/run-local-bug-report.js`                                             |
| Local bug reporting agent                      | `framework/agents/reporting/BugReportingAgent.ts`                                           |
| Real agent proof task                          | `obsidian-vault/Tasks/007 Real Agent Proof.md`                                              |
| Runner publishing workflow                     | `.github/workflows/publish-playwright-runner.yml`                                           |
| Full roadmap                                   | `md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md`                                                      |
| Bug reporting reference (local/private note)   | `md/BUG_REPORTING_GUIDE.md`                                                                 |
| Session snapshots                              | `obsidian-vault/Snapshots/` (template: `Templates/Session Snapshot.md`, skill: `/snapshot`) |
| This memory file                               | `obsidian-vault/AGENT_MEMORY.md`                                                            |
