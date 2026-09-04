# Kubernetes Canary Plan

> Phases 1 and 2 are implemented. Phase 3 (turning it on) remains a decision, not a task.
> The workflow ships off: `kubernetes.enabled` is `false`, so a merge to `main` runs no Kubernetes
> job at all. Only a manual `workflow_dispatch` does.

## Scope

This plan covers adding an ephemeral Kubernetes cluster to the existing GitHub Actions
infrastructure, running entirely inside Docker on the CI runner and on a developer laptop.

In scope:

- A `k8s/` manifest set for the app container defined by the root `Dockerfile`.
- A `kind` cluster definition that runs the cluster as Docker containers.
- npm scripts for local cluster lifecycle.
- A separate opt-in GitHub Actions workflow, gated by a new `pipeline.config.json` flag.

Out of scope:

- Production deployment. `render.yaml` remains the deployment path and is not modified.
- The Playwright runner container. It stays on Docker Compose; see "What stays on Docker".
- Any managed cloud Kubernetes service, though see "Graduating to a paid managed cluster" for the
  seams that a move to one would touch.
- Jenkins, consistent with the current repository phase.

## Why kind, and what "free tier" actually means

There is no meaningful free tier for a persistent managed cluster:

- GKE covers a control plane with a monthly credit but bills every worker node.
- AKS offers a free control-plane tier and bills nodes.
- EKS bills the control plane hourly.
- Oracle Cloud Always Free ARM can host a genuinely free cluster, but it requires a real
  cloud account with a card on file, and capacity is frequently unavailable.

Every cloud option also introduces cluster credentials as repository secrets, which conflicts
with the standing rule in `CLAUDE.md` against exposing secrets to pull requests from forks.

`kind` (Kubernetes in Docker) avoids all of it. The cluster nodes are Docker containers, so it
runs on the `ubuntu-latest` runner with no setup and on Docker Desktop locally. The repository
is public, so GitHub Actions minutes are unlimited. Crucially, `kind load docker-image` moves a
locally built image into the cluster directly, so the design needs **no registry, no image push,
and no secrets of any kind**.

`k3d` is a reasonable alternative with faster startup. `kind` is preferred here because it is the
Kubernetes project's own tool and is already present on GitHub-hosted runners' Docker toolchain
path via `helm/kind-action`.

## What this buys, and what it does not

It does not improve production. Render is unaffected, and this plan should not be read as a step
toward migrating off it.

The value is confined to the canary. Today `.github/workflows/post-merge-canary.yml:65-87` runs
`docker build`, `docker run -d`, then polls `/api/health` with `curl`. A Kubernetes canary instead:

- declares a readiness probe against `/api/health` and lets the rollout gate on it,
- declares a liveness probe, so a wedged process is detectable rather than silently hung,
- waits on `kubectl rollout status`, which fails on `CrashLoopBackOff` and image errors that a
  detached `docker run` reports only as a failed `curl` many seconds later,
- reaches the app through a Service rather than a published port.

That is a real increase in signal: the current canary cannot fail on probe misconfiguration or
rollout regression, because it has no probes and no rollout. For a repository whose purpose is to
demonstrate QA infrastructure, that gap is worth closing.

Honest accounting of the cost: as its own workflow it also pays for `npm ci` and a browser install,
so expect roughly 5-6 minutes end to end, not the 2-3 minutes the cluster lifecycle alone would
suggest. Free either way, since the repository is public and Actions minutes are unmetered.

## Hard constraint: the app is single-replica by design

`server.js:247` holds `runtimeState` in process memory, including `sessions: new Map()`, and the
test hooks at `server.js:353-355` reset `createdUsers`, `managedUsers`, and `editsByUserId` in that
same process.

This makes `replicas: 1` mandatory, not a default to tune later:

- Two replicas behind a Service would round-robin, so a session established against one pod would
  intermittently fail authorization against the other.
- The state-reset test hook would reach exactly one pod, leaving the other holding stale fixture
  data. Playwright suites depending on deterministic state would fail non-deterministically, which
  is precisely the flake class `CLAUDE.md` asks reviewers to prevent.

The manifest must carry `replicas: 1` with a comment recording why, and the plan explicitly rejects
horizontal scaling until state moves out of process. Any future PR raising the replica count should
be treated as a correctness change, not a capacity tuning change.

## Runtime facts the manifests depend on

Verified against the current tree:

- `server.js:6` reads `process.argv[2]` before `process.env.PORT`. The container must continue to
  pass no port argument, matching the existing note in `Dockerfile:24-27`.
- `server.js:7` defaults `HOST` to `127.0.0.1`, which is unreachable across a pod network boundary.
  `Dockerfile:19` already sets `HOST=0.0.0.0`, so no change is required.
- `server.js:622-625` serves `GET /api/health` returning HTTP 200 with `{"status":"ok",...}`.
  Suitable for both probes as a plain `httpGet`.
- `server.js:1168-1169` handles `SIGINT` and `SIGTERM` by calling `server.close()`. Adequate for
  graceful termination. It does not destroy idle keep-alive sockets, so shutdown may rely on the
  grace period expiring; the default `terminationGracePeriodSeconds: 30` is sufficient and should
  be left at the default rather than shortened.

No `server.js` change is required for this plan. That is a deliberate acceptance criterion.

## Proposed file layout

```text
k8s/
  deployment.yaml      # replicas: 1, readiness + liveness on /api/health, resource limits
  service.yaml         # NodePort 30080 -> targetPort 4173

kind/
  kind-config.yaml     # single node, extraPortMappings 30080 -> host 4273

scripts/
  k8s-test.js          # pins the suites to the cluster; fails if it is absent

.vscode/
  settings.json        # scopes Cloud Code YAML validation to k8s/ (gitignored, see below)

.github/workflows/
  k8s-canary.yml       # new, opt-in, gated by pipeline.config.json
```

The kind config lives outside `k8s/` deliberately. It is configuration for the kind CLI
(`apiVersion: kind.x-k8s.io/v1alpha4`), not a resource the API server ever sees, so keeping it
beside real manifests would make `kubectl apply -f k8s/` try to submit it and fail. The npm
scripts therefore also apply manifests by explicit path rather than by directory.

That move alone does not satisfy the Cloud Code editor extension, which decides what to validate
from file content rather than location: it reads `apiVersion` and `kind` from any `*.yaml` and
warns when the pair is absent from its schema registry. No published JSON schema exists for
`kind.x-k8s.io/v1alpha4` - kind validates its config from a Go struct at create time and emits
nothing for editors, and SchemaStore has no entry - so the warning cannot be satisfied, only
scoped away. `.vscode/settings.json` sets `cloudcode.yaml.yamlFileMatcher` to `**/k8s/*.yaml`,
which keeps full validation on the real manifests and excludes the kind config. Note that the
obvious-looking `cloudcode.yaml.validate: false` does not suppress this particular diagnostic.

Two operational caveats. The Cloud Code language server reads this setting when it starts, so the
warning persists until the VS Code window is reloaded. And `.gitignore:4` ignores `.vscode/`
wholesale, so the file is local to whoever creates it; sharing the fix would mean adding a
`!.vscode/settings.json` negation, which is a repo-convention decision rather than a technical one.

## Port isolation: the cluster must not own 4173

The cluster publishes on host port **4273**, not 4173, and this is a correctness requirement
rather than a preference.

Port 4173 belongs to the existing tooling: `playwright.config.ts:69` boots its `webServer` there,
`npm run dev` serves there, and the pre-push gate tests against it. Two facts combine badly. A kind
cluster holds its `hostPort` for the entire life of the cluster, and Playwright's reuse check is a
bare TCP connect - `playwright.config.ts:70` supplies `port` rather than `url`, so Playwright only
asks whether something accepts a connection, never what is answering.

Publishing the cluster on 4173 would therefore mean that while the cluster is up, every ordinary
`npm test`, `npm run test:e2e`, and pre-push run silently targets the frozen `agents-playground:local`
image instead of the working tree, and reports green. A developer would get a passing pre-push gate
for code that was never exercised. Requiring `npm run k8s:down` before other test commands was
rejected as the fix: it works until the first time someone forgets, and the failure mode is a
silent false pass.

With 4273, the cluster and the ordinary suites coexist with nothing to remember.

Networking uses a NodePort plus a kind `extraPortMappings` entry rather than an ingress controller,
which keeps the cluster dependency-free. `scripts/k8s-test.js` passes `PLAYWRIGHT_BASE_URL` at
invocation, so no test file and no Playwright config change is required.

## Pinning the suites to the cluster

`npm run k8s:test` runs `scripts/k8s-test.js` rather than invoking Playwright directly, for two
reasons that are not obvious.

First, a bare `playwright test` cannot prove anything about Kubernetes. Because the `webServer`
block is active by default, a run with no cluster present finds port 4173 free, builds and boots a
host server, and passes both suites - an all-green result in which Kubernetes was never involved.
Setting `PLAYWRIGHT_EXTERNAL_TARGET=true` removes the `webServer` block entirely
(`playwright.config.ts:66`), so the run can only reach the deployed URL and fails loudly when it is
absent. The wrapper also runs `kubectl wait --for=condition=available` first, which turns a missing
or unready deployment into one clear line instead of a wall of connection errors.

Second, npm executes scripts through `cmd.exe` on Windows, where `VAR=value command` is not valid
syntax, and this repo has no `cross-env` dependency. Setting the variables on `process.env` inside a
Node wrapper works identically on every platform and adds no dependency.

The wrapper also appends `--retries=0`, matching `post-merge-canary.yml:119-120` and the reason
`docs/pre-merge-review-and-canary.md:213` already records: an intermittent failure must be
reported, not silently retried. `playwright.config.ts:31` sets `retries` to 2 whenever `CI` is set,
so without the flag a pod failing one request in three passes on a later attempt and the canary
reports green - exactly the fault a canary exists to surface, and the one class of bug a rollout
gate cannot catch on its own. This matters only on a runner, which is precisely where it would
never be noticed locally.

Manifests are plain YAML. Kustomize and Helm are deliberately not introduced: there is one
environment and one workload, so a templating layer would add indirection without removing any.

## Configuration flag

Extend `pipeline.config.json` following the existing `dockerEnabled` pattern rather than inventing
a new mechanism:

```json
{
  "preMerge": { "dockerEnabled": false },
  "postMerge": { "dockerEnabled": false },
  "kubernetes": { "enabled": false }
}
```

The workflow reads the flag with the same inline `node -e` step already used at
`.github/workflows/post-merge-canary.yml:54-58`, so the policy-read idiom stays consistent.

Note that `preMerge.dockerEnabled` and `postMerge.dockerEnabled` are both currently `false`, so the
existing Docker paths are not exercised in CI today either. The Kubernetes path should ship in the
same off-by-default posture.

## Why a separate workflow

`CLAUDE.md` states that the canary must stay fast and focused, and that any canary change growing
into full regression scope should be flagged. Adding 2-3 minutes of cluster lifecycle to
`post-merge-canary.yml` would violate that intent.

The Kubernetes canary therefore belongs in its own workflow with its own trigger, so that:

- the existing canary's runtime is unchanged,
- a Kubernetes failure is attributable on sight rather than buried in canary logs,
- the flag can be flipped without touching the merge-critical path.

Proposed trigger: `workflow_dispatch`, plus `pull_request` closed-and-merged into `main` matching
the existing canary trigger, both further gated on the config flag.

Permissions: `contents: read` only. No registry push, so no `packages: write`.

## npm scripts

```json
"k8s:up": "kind create cluster --config kind/kind-config.yaml",
"k8s:deploy": "docker build ... && kind load docker-image ... && kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml && kubectl rollout restart ... && kubectl rollout status ...",
"k8s:test": "node scripts/k8s-test.js",
"k8s:status": "kubectl get pods,svc,deployment -l app=agents-playground",
"k8s:logs": "kubectl describe deployment/agents-playground && kubectl logs -l app=agents-playground --tail=200",
"k8s:down": "kind delete cluster --name agents-playground"
```

Two details in `k8s:deploy` are load bearing. Manifests are applied by explicit path rather than
`-f k8s/` for the reason given above. And `rollout restart` is required because the image tag is
fixed at `:local`: re-loading a rebuilt image under the same tag leaves the Deployment spec
unchanged, so Kubernetes sees nothing to do and silently keeps serving the previous build.

`k8s:test` delegates to `scripts/k8s-test.js` for the reasons in "Pinning the suites to the
cluster" above. An earlier draft of this plan asserted that it needed no environment variables
because `reuseExistingServer` would attach the suites to the cluster on its own. That was wrong in
both directions: with no cluster running the suites boot their own server and pass, and under `CI`
(where `reuseExistingServer` is false) Playwright aborts with "already used" before running a
single test. The wrapper removes both failure modes.

## What stays on Docker

`docker-compose.yml` bind-mounts the working tree into the Playwright runner
(`.:/workspace` with a named volume masking `node_modules`). That pattern depends on host filesystem
sharing and does not translate to a pod spec; reproducing it would require a `hostPath` volume, which
is fragile and adds nothing.

The split is therefore deliberate:

- the **app under test** runs in the cluster,
- the **Playwright runner** stays on Docker Compose and reaches the app over the NodePort.

This also keeps the runner image publishing workflow untouched.

## Implementation phases

Phase 1: local only - COMPLETE, verified on 2026-09-04

1. Added `kind/kind-config.yaml`, `k8s/deployment.yaml`, `k8s/service.yaml`.
2. Added the `k8s:*` npm scripts and `scripts/k8s-test.js`.
3. Added `.vscode/settings.json` to scope Cloud Code YAML validation.
4. Verified locally, end to end:
   - cluster creates, image loads via `kind load`, rollout converges on the readiness probe,
   - `/api/health` answers through the NodePort on `127.0.0.1:4273`,
   - `npm run k8s:test` passes both suites against the pod,
   - deleting the deployment makes `npm run k8s:test` exit 1 with a clear message rather than
     silently passing against a host server,
   - re-running `k8s:deploy` replaces the pod, confirming `rollout restart` defeats the
     same-tag image staleness described above,
   - port 4173 stays free while the cluster runs, so no existing command is affected.
5. No workflow and no `pipeline.config.json` change in this phase.

Phase 2: CI, off by default - BUILT, awaiting a first dispatch run

1. Added `kubernetes.enabled: false` to `pipeline.config.json`.
2. Added `.github/workflows/k8s-canary.yml`. kind is installed from a pinned release URL rather
   than a third-party action, so the workflow depends on no marketplace action beyond
   `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact`, all already used
   elsewhere in this repository.
3. Trigger split: `workflow_dispatch` always runs, so the workflow can be exercised while the flag
   is still off. The merged-PR path additionally requires `kubernetes.enabled`, mirroring how
   `postMerge.dockerEnabled` gates the existing canary. Until the flag is flipped, a merge to
   `main` produces no Kubernetes run at all.
4. Uploads `.artifacts/` with pod descriptions, deployment description, app logs, and cluster
   events, at the same 14-day retention as the existing canary.
5. Remaining: one `workflow_dispatch` run to confirm green on a hosted runner.

Two differences from the local flow, both deliberate:

- CI tags the image with the commit SHA instead of `:local`. An immutable tag makes the Deployment
  spec genuinely change between runs, so `kubectl set image` produces a real rollout and the
  `rollout restart` workaround the local script needs is not required.
- The build passes `--provenance=false --sbom=false`. buildx otherwise emits an OCI index carrying
  attestation manifests, which some kind versions decline to load while reporting a misleading
  "image not found". The local script passes the same flags so the two paths cannot diverge.

Phase 3: enable

1. Flip `kubernetes.enabled` to `true` after Phase 2 has run clean.
2. Update `README.md` and `obsidian-vault/AGENT_MEMORY.md`, as `AGENTS.md` requires when
   workflows or user-facing behavior change.

## Graduating to a paid managed cluster

This is built as a proof of concept that can move to a real cluster, so the couplings to kind are
deliberately few and marked. Moving to GKE, EKS, AKS, or any managed cluster touches four things.

**1. How the image reaches the cluster.** The one real coupling. Today
`kind load docker-image` hands the image straight to the node, which is why the design needs no
registry and no secrets. On a managed cluster this becomes a `docker push` to GHCR, GAR, or ECR,
and `imagePullPolicy` moves from `Never` to `IfNotPresent`. The workflow step is marked
`SEAM (paid-tier graduation)`. Everything downstream of it is already registry-shaped, because CI
tags with the commit SHA rather than a mutable `:local`.

**2. How CI authenticates.** kind needs nothing. A managed cluster needs credentials, and
`CLAUDE.md` forbids exposing secrets to fork pull requests. The correct answer is workload identity
federation via OIDC rather than a long-lived service-account key; `docs/oidc-design.md` already
covers the approach for this repository.

**3. How the app is reached.** NodePort plus `extraPortMappings` is a kind-specific trick for
getting a port onto the runner. A managed cluster uses a LoadBalancer Service or an Ingress. Only
the Service type and the URL handed to `PLAYWRIGHT_BASE_URL` change; `scripts/k8s-test.js` already
takes the port from an environment variable for this reason.

**4. Namespacing.** Everything currently lands in `default`, which is fine for a cluster that
exists for ninety seconds and wrong for a shared one. A real cluster wants a dedicated namespace
and a `--namespace` flag on the kubectl calls. Left out deliberately: it would add friction to
every local command for no local benefit, and adding it later is mechanical.

What does **not** change: the Deployment's probes, resource limits, `replicas: 1`, the container
contract (`HOST=0.0.0.0`, port 4173, no argv port), and the test invocation. The probe
configuration is the part actually worth carrying forward, and it is cluster-agnostic.

One constraint travels with the app rather than the infrastructure. `replicas: 1` is not a kind
limitation and a paid cluster will not lift it - the in-memory `runtimeState` in `server.js` is
what pins it. Horizontal scaling on any cluster requires moving session and fixture state out of
process first.

## Acceptance criteria

- `docker compose` behavior, `post-merge-canary.yml` runtime, and `pr-validation.yml` are unchanged.
- `render.yaml` is unchanged.
- `server.js` is unchanged.
- No new repository secret is introduced.
- The Kubernetes canary fails if the rollout does not converge, if a probe never passes, or if
  sanity or contract tests fail.
- Failure diagnostics include pod logs and `kubectl describe` output in uploaded artifacts.
- The deployment manifest pins `replicas: 1` with the in-memory-state rationale recorded inline.
- A running cluster leaves port 4173 free, so `npm test`, `npm run dev`, and the pre-push gate
  behave identically whether or not the cluster exists.
- The canary suites run with `--retries=0`, so an intermittently failing pod fails the canary
  rather than passing on a retry.
- `npm run k8s:test` fails when the cluster is absent. A green result from it must mean the pod
  served the requests.

## Risks and mitigations

- Risk: cluster startup is flaky on hosted runners.
  - Mitigation: keep it off the merge-critical path in its own workflow; a failure never blocks a
    merge while the flag governs a non-required check.
- Risk: the Kubernetes canary duplicates the Docker canary.
  - Mitigation: it is opt-in and additive. If both are enabled and the duplication is confirmed
    redundant, retire the Docker branch of `post-merge-canary.yml` rather than running both.
- Risk: manifests drift from `Dockerfile` behavior, particularly port and host handling.
  - Mitigation: the container contract is exactly `HOST=0.0.0.0`, port `4173`, no argv port. The
    plan changes none of it, and the deployment sets no command override.
- Risk: someone later raises `replicas` and reintroduces nondeterministic session and fixture-state
  failures.
  - Mitigation: inline comment in the manifest plus the explicit constraint section above.
- Risk: scope creep toward running full regression in-cluster.
  - Mitigation: canary scope stays `test:sanity` and `test:contract`, matching the existing canary.

## Next action

Awaiting a decision on whether to proceed to Phase 1. No files outside this document have been
created or modified.
