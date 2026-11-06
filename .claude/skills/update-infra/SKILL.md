---
name: update-infra
description: Check every pinned infra tool (Playwright, Node, npm packages, Terraform, kind, TFLint, Trivy, ZAP) against its own official source, update what is out of date together with its checksum and its partners, and prove it with the gates. Use when the user says "update infra", "update the tools", "/update-infra", "what is out of date", or asks to keep the tool versions in line.
---

Update the infra tools on this machine with `scripts/infra-versions.js`. The
user passed: $ARGUMENTS

All paths are relative to the repository root.

## Rules

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
7. **Report back**, done first: what moved, what passed, what the user still
   has to do (the "for a person" list, and Terraform or kind on this PC if the
   report named them), then the one step left: a push, when they say so.

## When something fails

- A source did not answer: the report lists it under "Sources that did not
  answer". Re-run later; never guess the version.
- A test fails after an update: say whether it is the update or an existing
  problem, with the proof (run the same test on `main`). Do not revert or
  narrow the update without asking.
