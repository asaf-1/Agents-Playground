# Kubernetes, Terraform and the canary

[← Back to the README](../../README.md)

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
Design and trade-offs: **[`docs/kubernetes-canary-plan.md`](../kubernetes-canary-plan.md)**.
