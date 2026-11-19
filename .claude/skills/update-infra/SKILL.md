---
name: update-infra
description: Check every pinned infra tool (Playwright, Node, npm packages, Terraform, kind, TFLint, Trivy, ZAP) against its own official source, update what is out of date together with its checksum and its partners, and prove it with the gates. Use when the user says "update infra", "update the tools", "/update-infra", "what is out of date", or asks to keep the tool versions in line.
---

Update the infra tools on this machine with `scripts/infra-versions.js`. The
user passed: $ARGUMENTS

All paths are relative to the repository root.

## Rules

- **Our tools only** (Asaf, 2026-11-19: "when i say check version i speak
  infra scope only and tools we use not games not anything else"). A version
  check covers the repo's pins (what `npm run infra:report` checks) and the
  PC's work tools in step 7, each by its own winget id. Never run a bare
  `winget upgrade` or `winget list` (they print every program on the PC), and
  never check, list or mention games, launchers, other apps, Windows, .NET
  runtimes, drivers or WSL.
- **Never commit, push or open a PR** unless the user has just asked for that.
  Leave the changes in the working tree and say what a push would contain.
- Every version comes from the tool's own source and is at least 7 days old.
  The script enforces both; do not hand-pick a newer one.
- **Never edit** `.github/workflows/pr-validation.yml` or
  `@axe-core/playwright`, and never apply an npm major, a GitHub Actions
  version or the vendored ingress-nginx manifest. The report lists them for the
  user; pass them on, plainly.
- A version and its checksum or digest always move together, and partners
  together. If the script ever leaves them apart, stop and report it.
- Narrate each step in one line, and say the result.

## Steps

0. **Catch up first** (since 2026-11-16 a weekly GitHub job,
   `.github/workflows/infra-updates.yml`, runs this same update and its PR
   merges itself). Run `node scripts/local-sync.js`, then
   `gh pr list --state open --json number,headRefName --jq '.[] | select(.headRefName | startswith("bot/infra-updates-")) | .number'`.
   An open bot PR already holds this week's update: say so and stop, unless
   the user wants to update sooner by hand. The sync's line also names PC
   programs behind the repo's pins.
1. **Report.** Run `npm run infra:report`. Tell the user, simply: what can be
   updated, what is already current, and the "for a person" list.
2. **Plan.** If nothing is ready, stop here. Otherwise say which tools would
   move (from → to) and ask for a go, unless the user's message already said to
   update.
3. **Update.** Free port 4173 first, then run `npm run infra:update`. It edits
   the pinned files and runs `npm install` for the npm packages.
4. **Check.** Run `npm run infra:check`: every copy and checksum must agree.
5. **Prove it**, sized to what moved:
   - Always: `npm run format:check` and the full suite, `npx playwright test`.
   - npm packages moved: also `npm run test:unit` and `npm run test:runner`.
   - `terraform/`, `k8s-canary.yml` or `terraform-validate.yml` changed:
     `npm run k8s:tf:check`.
   - The kind CLI or a Terraform provider moved: `npm run k8s:tf:full`.
   - `Dockerfile.e2e` changed: build it, run the suite inside it, then delete
     the image, its volume and its build-cache entries (as for Playwright 1.65,
     see the runbook).
   - Node moved: build `Dockerfile` and start it once, then delete the image.
6. **Clean up** what the proof downloaded, and say how much was removed.
7. **Programs on this PC (winget).** The sync's line in step 0 and the report's
   "This PC" line name the PC's own programs that differ from the repo's pins.
   The updater never installs them (they serve other repos too), so this step
   brings them in line, with Asaf's word (Asaf, 2026-11-17: "add this to the
   skill too for anything that need winget"):
   - **Only the repo's work tools, never Windows, games or other apps**
     (Asaf, 2026-11-17: "ur scope is this repo only"). WSL is left out too:
     only Docker uses it here, and a new major waits until Docker Desktop
     asks for it. Check what is installed and what winget offers, one id
     at a time and only the seven ids below: `winget list --id <id> --exact`.
     Never a bare `winget upgrade` or `winget list` (2026-11-19: it printed
     49 programs, games included, and Asaf was rightly angry).
   - **I update these** (with his word):
     - Terraform `Hashicorp.Terraform` and kind `Kubernetes.kind`;
     - k6 `GrafanaLabs.k6`, for the coming k6 plan ("we are gonna use k6
       next plan"; 1.4.2 → 1.8.2 on 2026-11-17);
     - Python 3.12 `Python.Python.3.12`: `scripts/media/record.js` runs
       `scripts/media/make-gifs.py` with Pillow for the README GIFs (3.12.2 →
       3.12.10 on 2026-11-17);
     - GitHub CLI `GitHub.cli`: `/push`, `/recall` and the bots' checks use
       it (2.92.0 → 2.104.0 on 2026-11-17).
   - **He updates these by hand, with VS Code closed:** Git `Git.Git` and
     Node (`OpenJS.NodeJS.LTS`). They can't be replaced while VS Code runs:
     its Git Bash terminals hold Git for Windows (the installer aborts: "The
     following process(es) use Git for Windows ... Please terminate those
     processes", 2026-11-17; that day a leftover `tail`/`grep` watcher of
     mine held it too), and VS Code's Playwright test server and Claude
     Code's MCP helpers run `node.exe` from `D:\Node.JS`. First run
     `node scripts/clear-leftovers.js` so nothing of mine holds them; then
     give him the commands for a normal PowerShell window, one per block,
     and the check after.
   - **The exact version to install:** Terraform and kind take the repo's pin
     exactly (`TF_VERSION` / `KIND_VERSION` in
     `.github/workflows/k8s-canary.yml`, the versions `npm run infra:report`
     prints); Node takes the newest of the repo's major, preferring a
     security release (nodejs.org/dist/index.json marks them), from
     `winget show --id OpenJS.NodeJS.LTS --versions`: the plain
     `OpenJS.NodeJS` id lagged behind (26.12.1 while the LTS id had the
     26.13.1 security fix, 2026-11-17), and never a newer major. k6
     takes the repo's pin once the k6 plan adds one; until then, the newest
     release at least 7 days old (the versions:
     `winget show --id GrafanaLabs.k6 --versions`; the dates:
     github.com/grafana/k6/releases). A
     new major (1.x to 2.x, open in November 2026) can change how scripts are
     written: name it, and leave the choice to the k6 plan. Python takes the
     newest patch of the installed minor (3.12), never a new minor without
     his word (Pillow lives in that install). The GitHub CLI and Git take
     their newest release.
   - **Say first, simply:** the command, that it installs for the whole PC,
     that it won't break the repo (CI already runs that version, and the
     repo's `required_version` accepts it), and the one catch: once Terraform
     writes state with the newer version, the older one can no longer read
     it, so there is no going back (no reason to).
   - **The command,** one per block, for him to run or for me to run on his
     word: `winget upgrade --id <id> --version <version>`.
   - **Prove it:** a new terminal (an old one keeps the old PATH), then
     `<program> version`, then the checks that use it: Terraform
     `npm run k8s:tf:check` and `npm run github:tf:check`; kind
     `npm run k8s:tf:check` (and `npm run k8s:tf:full` if he wants a cluster
     run, Docker first); k6 `k6 version`, plus the k6 plan's own run once it
     exists; Python `python --version` and
     `python -c "import PIL; print(PIL.__version__)"` (Pillow still there);
     GitHub CLI `gh --version` and `gh auth status` (still logged in). After
     his by-hand updates, once VS Code is open again: Git `git --version`;
     Node `node --version`, `where.exe node` (still `D:\Node.JS`), then
     `npm.cmd run test:unit` and `npx playwright test`. Then
     `node scripts/local-sync.js`: its line no longer names the program (k6
     joins that line once the repo pins it).
   - **When the k6 plan pins k6 in the repo** (a workflow or a script), it
     also gets taught to `scripts/infra-versions.js` (its own source: the
     GitHub releases of grafana/k6, the 7-day wait, a checksum with any
     download) and to `scripts/local-sync.js`'s PC check, as part of that
     plan.
8. **Report back**, done first: what moved, what passed, what the user still
   has to do (the "for a person" list, and the PC programs from step 7 still
   behind), then the one step left: a push, when they say so.

## When something fails

- A source did not answer: the report lists it under "Sources that did not
  answer". Re-run later; never guess the version.
- A test fails after an update: say whether it is the update or an existing
  problem, with the proof (run the same test on `main`). Do not revert or
  narrow the update without asking.
