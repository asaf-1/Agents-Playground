---
type: status
updated: 2026-09-22 20:29
agent: Claude
---

# Status

**Updated:** 2026-09-22 20:29 · **Branch:** `feat/docs-recall-skills` → `main` · **Last commit on main:** `bab2e50 docs(push): review the code before pushing it (#32)`

## Where we are

Planning a Terraform integration for the existing kind-based Kubernetes canary
([.github/workflows/k8s-canary.yml](../.github/workflows/k8s-canary.yml)). The
plan has been presented to the user but not approved yet, and no Terraform code
exists. Along the way we added the `/docs` and `/recall` skills.

## Done this session

- Read the whole infra: README, runbook, [kubernetes-canary-plan.md](../docs/kubernetes-canary-plan.md),
  every workflow, both Dockerfiles, `docker-compose.yml`, `render.yaml`, `k8s/`, `kind/`, `pipeline.config.json`.
- Confirmed GitHub access: `gh` is logged in as `asaf-1` (admin, scopes `repo` + `workflow`).
- Added the `/docs` and `/recall` skills in [.claude/skills/](../.claude/skills/) and
  mirrored them in [.agents/skills/](../.agents/skills/). Registered them in `AGENTS.md`, the runbook
  skill catalog, `docs/repo-guide.md`, `AGENT_MEMORY.md` and `Snapshots/README.md`.
- Explained canary, Kubernetes, kind and Terraform basics to the user.

## In flight

- The two skills (both copies), their doc registrations and this file are shipping as **v1.3.0**
  in a PR from `feat/docs-recall-skills`, with auto-merge armed. Once it merges, cut the v1.3.0
  release from `main` if `gh release list` does not show it yet.
- Terraform: nothing written, and Terraform is not installed yet.

## Decisions (and why)

- Terraform manages **the kind cluster and the canary deploy**, not Render, AWS or GitHub settings.
  Why: free, no secrets, runs in CI today, and a later move to EKS/GKE only swaps the cluster piece.
  User chose this.
- Installing Terraform locally with `winget install Hashicorp.Terraform` is **approved**, so the
  config can be tested locally before CI.
- Proposed, **not yet approved**:
  - The `tehcyx/kind` provider creates the cluster and reads its port mapping from
    `kind/kind-config.yaml`, so there is one source of truth.
  - The `alekc/kubectl` provider applies `k8s/*.yaml` unchanged, with the image swapped in and a
    guard if the swap misses. Why: the official `hashicorp/kubernetes` provider needs the cluster to
    exist at plan time, or the Deployment has to be duplicated in Terraform's language.
  - Local state only, a non-required `terraform-validate.yml`, and `npm run k8s:tf:up` /
    `k8s:tf:down` via a Node wrapper that tags the image by its content ID.
- Every push goes through a short-lived branch and a PR, like all the recent ones. GitHub's
  `Repo-Main` ruleset rejects direct pushes to `main`: it requires a PR and a green `Pre-Merge Gate`,
  and nobody can bypass it. The PR auto-merges when green and GitHub deletes the branch.
- `STATUS.md` holds where the work is. Claude's private auto-memory holds how the user wants it
  done. `/docs` keeps the two consistent.

## Next step

> Ask the user to approve the Terraform plan; the main open point is the third-party `alekc/kubectl`
> provider. On approval, run `winget install Hashicorp.Terraform`, then create `terraform/versions.tf`
> and run `terraform init`.

## Waiting on the user

- Approve or change the Terraform plan.
- Whether to trigger the first manual run of the current kind canary
  (`gh workflow run k8s-canary.yml --ref main`). It has never run on GitHub.

## Watch out

- Bugs in `server.js`, the JSON files and `web/` are **deliberate test targets**. Never fix them in passing.
- The user is new to Kubernetes, canary and Terraform. Teach briefly in plain English as you build;
  it's for their CV.
- Present the plan before running setup commands such as branch creation or installs. The user
  stopped two such attempts this session. Ask before any push.
- `kubernetes.enabled` is `false`. The k8s canary only runs by manual dispatch, and it has never run
  on a GitHub runner.
- Stale docs, to fix with the Terraform doc updates: the runbook and the `AGENT_MEMORY.md` Project
  Identity call the repo "private", but it is public. The runbook's `pipeline.config.json` snippet
  lacks the `kubernetes` and `environments` blocks. `kubernetes-canary-plan.md` links
  `docs/oidc-design.md`, which is gitignored and exists only locally.
- Several skills and `.claude/settings.json` still hard-code the old path
  `C:\Users\asafn\Desktop\GenAI+AgenticAI-Demo`. This drift predates this session and is not fixed.
