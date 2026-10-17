# ingress-nginx, vendored

`deploy.yaml` is **not our file**. It is the official ingress-nginx manifest for
kind clusters, copied in unchanged so that building a cluster needs no download
and so that the exact bytes applied are reviewable in a pull request.

| What        | Value                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| Version     | `controller-v1.15.1`, released 2026-03-19                                                                               |
| Source      | `https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/kind/deploy.yaml` |
| SHA256      | `2a3ae008c8786431115502644e77ab398fdebfb721a5d1195ed3089cde3299df`                                                      |
| Vendored on | 2026-10-17                                                                                                              |

Both images it runs are pinned by digest in the manifest itself, which is the
upstream project's own doing and the reason this is safe to apply as written:

- `registry.k8s.io/ingress-nginx/controller:v1.15.1@sha256:594ceea7…` — 448 MB
- `registry.k8s.io/ingress-nginx/kube-webhook-certgen:v1.6.9@sha256:01038e7d…` — 96 MB

They are pulled by the cluster when it starts and go when the cluster is
deleted. Nothing stays on the host.

## Why the `kind` variant

The project publishes a manifest per environment. The kind one differs in two
ways that matter: the controller runs with `hostPort` 80 and 443 rather than
behind a cloud load balancer, and it is pinned to a node labelled
`ingress-ready=true`. `kind/kind-config.yaml` supplies both the label and the
host port mapping.

## Updating it

1. Pick a release at least two weeks old from
   `gh release list -R kubernetes/ingress-nginx`.
2. Download that tag's kind manifest to a scratch folder, not over this file.
3. Record its SHA256 here together with the new version, and read the diff.
4. `npm run k8s:tf:full` locally before pushing — a controller that does not
   become ready fails the cluster build, not just a test.

## Terraform creates 28 and destroys 26. That is correct.

Two of the 28 objects are Jobs that generate the admission webhook's
certificate, and both carry `ttlSecondsAfterFinished: 0`, so Kubernetes
deletes them the moment they succeed. By teardown they are already gone,
Terraform drops them from state on refresh, and the destroy reports 26.

Nothing is left behind. It is worth knowing only because a count that does not
match looks like a leak.

## Not scanned by Infra Scan

Trivy scans `terraform/`, `k8s/` and the Dockerfiles. This folder is left out on
purpose: it is upstream's file, we do not edit it, and its findings would be
noise we cannot act on without forking it.
