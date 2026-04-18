# Docker Infrastructure Blueprint

This file is a generic blueprint for future infrastructure, companies, and teams.

Use it when you want to design Docker around an application platform, a browser-based QA runner, local developer onboarding, and portable CI pipelines without tying the design to one specific repository.

Use it together with:

- `md/DOCKER_RUNTIME_AGENT.md`

The goal is not only to "containerize the app". The goal is to create one reproducible runtime contract that can move between developers, Jenkins, GitHub Actions, GitLab CI, Azure DevOps, or another pipeline with minimal redesign.

## Core Intent

Build Docker around four responsibilities:

1. package the application cleanly
2. run browser or QA automation in a separate dependency-complete image
3. give developers a low-friction local entry point
4. make the same runtime portable across multiple pipelines

Do not collapse all of these into one overloaded image unless there is a strong reason.

## Standard File Set

These are the recommended files and their responsibilities.

### `.dockerignore`

Purpose:

- reduce build context size
- avoid copying heavy local folders into image builds
- keep Docker builds predictable

Minimum recommended entries:

- `node_modules`
- `.git`
- `.artifacts`
- `test-results`
- generated Playwright report folders
- editor or local machine noise

Important rule:

- `.dockerignore` affects `docker build` context
- it does not control bind-mounted runtime synchronization

Reasoning:

- teams often confuse build context and bind mounts
- a fast, clean build context matters for both local builds and CI portability

### `Dockerfile`

Purpose:

- build the application image
- prove the app packages cleanly
- act as the lightweight build gate for merge readiness

Recommended responsibility:

- install production or runtime dependencies
- copy the repo or relevant app subset
- define the app runtime entrypoint

Do not overload this file with browser libraries, Playwright dependencies, fonts, or QA-only concerns unless the application image itself truly needs them.

Reasoning:

- the application image and the QA runner image solve different problems
- keeping them separate reduces rebuild cost and keeps architecture clear

### `Dockerfile.e2e`

Purpose:

- build the shared QA or browser runner image
- act as the standard execution boundary for local QA and CI automation

Recommended responsibility:

- use an official Playwright image or another dependency-complete browser base
- install project dependencies needed for browser automation
- carry Linux libraries, fonts, browsers, and Node runtime

Recommended rule:

- pin the base image by version and digest

Reasoning:

- browser automation is much more sensitive to OS drift than the app packaging path
- pinning makes failures more reproducible across developers and CI systems

### `docker-compose.yml`

Purpose:

- provide the main local Docker entry point
- coordinate bind mounts, named volumes, environment, and runner commands

Recommended responsibility:

- define the QA runner service
- bind-mount the repository into the container workspace
- mount a named volume over the container `node_modules` path
- set browser-safe shared memory

Recommended pattern:

```yaml
services:
  qa-runner:
    image: <registry>/<team>/<runner>:main
    build:
      context: .
      dockerfile: Dockerfile.e2e
    working_dir: /workspace
    shm_size: "2gb"
    volumes:
      - .:/workspace
      - qa_runner_node_modules:/workspace/node_modules
```

Reasoning:

- the bind mount gives immediate source-code synchronization
- the named volume keeps Linux dependencies out of the host machine
- the build fallback allows local progress even if the registry image is unavailable

### `.devcontainer/devcontainer.json`

Purpose:

- allow developers to reopen the repository inside the approved Docker runtime

Recommended responsibility:

- reference the same compose file and same `qa-runner` service
- point the workspace to the same mounted path used by Docker Compose

Reasoning:

- do not create a second environment model for editors
- the devcontainer should reuse the same runtime contract as local Docker and CI

### `scripts/docker/*`

Purpose:

- hide raw Docker command complexity behind stable helper scripts
- centralize fallback logic, image resolution, and execution conventions

Recommended helper script types:

- resolve a runner image from registry or local build
- run the suite inside the runner
- normalize artifact ownership after execution

Reasoning:

- shell details should not be duplicated in every pipeline definition
- one helper script is easier to migrate between CI systems than many slightly different inline commands

### Pipeline files

Examples:

- `Jenkinsfile`
- `.github/workflows/*.yml`
- `.gitlab-ci.yml`
- `azure-pipelines.yml`

Purpose:

- consume the shared runner image, not redefine the runtime

Recommended responsibility:

- authenticate to the registry
- resolve the runner image
- execute the same test command inside the runner
- archive artifacts from stable host paths

Reasoning:

- the pipeline should orchestrate the runtime, not reinvent it
- once the runtime contract is stable, moving to another pipeline system becomes mostly a translation of stages and credentials

## Architecture Pattern

### 1. Separate the app image from the QA runner

Use:

- `Dockerfile` for packaging and app build validation
- `Dockerfile.e2e` for browser and QA execution

Why:

- app packaging and browser automation have different dependency surfaces
- mixing them creates slower builds and less clear ownership

### 2. Use bind mounts for source code

Recommended mount:

- `.:/workspace`

Why:

- code changes appear inside the container immediately
- developers can keep editing on the host while the container uses the same files

### 3. Use a named volume for container `node_modules`

Recommended mount:

- `qa_runner_node_modules:/workspace/node_modules`

Why:

- Linux container dependencies do not pollute the host machine
- Windows host paths do not replace Linux-native compiled modules inside the container

### 4. Keep artifacts on the host-visible workspace

Recommended paths:

- `.artifacts/`
- `test-results/`

Why:

- developers and CI systems can inspect reports outside the container
- artifacts remain stable across local and pipeline execution

### 5. Give browsers enough shared memory

Recommended default:

- `shm_size: "2gb"`

Why:

- Chromium and similar browsers can fail with vague "Target closed" behavior when shared memory is too small

## Build This Setup From A To Z

### Step 1. Define image responsibilities

Decide early:

- what belongs in the app image
- what belongs in the QA runner image
- what should never be installed on CI hosts directly

Default:

- keep browser dependencies only in the QA runner image

### Step 2. Define the local workspace contract

Choose:

- one container workspace path
- one bind mount root
- one `node_modules` volume strategy
- one artifact directory strategy

Default:

- `/workspace`
- bind mount repo root
- named volume for container dependencies
- artifacts written back into the bind-mounted repo

### Step 3. Define the registry contract

Choose:

- one registry
- one canonical image name
- one stable tag and one immutable tag

Recommended default:

- stable tag such as `:main`
- immutable tag such as `:<commit-sha>`

Why:

- developers can use the stable tag
- pipelines can pin to immutable tags

### Step 4. Define the compose service contract

Choose and keep stable:

- service name, usually `qa-runner`
- workspace path
- volume names
- default command model

Why:

- scripts, docs, and pipelines should all refer to the same contract

### Step 5. Define the helper script contract

Create scripts that do three things well:

- resolve the runner image
- run commands inside the runner
- normalize artifact ownership when needed

### Step 6. Define the pipeline contract

Every pipeline should follow the same stages:

1. authenticate to registry
2. resolve or pull runner image
3. run tests inside runner
4. archive artifacts

If the organization later moves to another CI system, keep those same four steps and only translate the pipeline syntax.

### Step 7. Define the local onboarding contract

Developers should have at least these entry points:

- pull or prepare the runner
- run a smoke test
- run full regression
- open an interactive shell
- reopen in devcontainer

### Step 8. Define artifact and permission handling

Plan for the fact that Linux containers can create files owned by `root`.

Preferred strategies:

- run with aligned UID and GID where practical
- or run a post-test `chown` on result folders

Fallback only:

- permissive `chmod` on artifact folders when ownership cannot be aligned cleanly

## Dependency Synchronization Rule

This is the most important operational rule when you use a bind-mounted repo plus a named container `node_modules` volume.

If a developer installs or updates a library on the host machine, the container dependency volume may become stale.

That happens because:

- the source code is bind-mounted live
- but `node_modules` inside the container is isolated in its own named volume

So when `package.json` or `package-lock.json` changes, do not assume the container is already up to date.

### Required response

After a dependency change, refresh the container dependency state.

Recommended commands:

```bash
docker compose build qa-runner
docker compose run --rm qa-runner npm install
```

What each command does:

- `docker compose build qa-runner`
  - refreshes the image layer
  - ensures the container image reflects the latest manifest files
- `docker compose run --rm qa-runner npm install`
  - refreshes the existing named `node_modules` volume
  - ensures the live runtime matches the new dependency graph

Important nuance:

- rebuilding the image alone may not update an already-existing named dependency volume
- if the volume already exists, the runtime may still be stale until the container-side install runs

### Safe default rule for agents

When package manifests change:

1. rebuild the runner image
2. run container-side install
3. only then run tests

### Last-resort reset

If the dependency volume becomes inconsistent and normal refresh does not fix it, the next safe recovery option is to intentionally recreate the Docker volume for that service and then rebuild.

Treat that as a deliberate maintenance action, not the default path.

## Easy Usage Modes

This section should be easy for developers and agents to scan quickly.

### Mode 1. App packaging only

Use when:

- you only need to prove the application image builds cleanly

Typical command:

```bash
docker build -t <project>-prepush .
```

### Mode 2. Local smoke validation

Use when:

- you want a fast containerized confidence check

Typical command:

```bash
docker compose run --rm qa-runner <smoke-command>
```

### Mode 3. Full local regression

Use when:

- you want Linux-parity browser execution locally

Typical command:

```bash
docker compose run --rm qa-runner <full-suite-command>
```

### Mode 4. Interactive container shell

Use when:

- you want to debug the runtime directly

Typical command:

```bash
docker compose run --rm qa-runner bash
```

### Mode 5. Devcontainer onboarding

Use when:

- a developer wants the entire editor and terminal environment inside the approved container

### Mode 6. Pipeline execution

Use when:

- the CI platform should execute browser or QA automation in the same runtime as developers

## How To Move This From One Pipeline To Another

Design the Docker setup so the runtime contract is independent from the CI platform.

### Keep these parts stable

- runner image name
- runner image tags
- service name such as `qa-runner`
- workspace path such as `/workspace`
- artifact paths
- main validation commands
- registry authentication model

### Only translate these parts per platform

- pipeline syntax
- secret or credential storage
- artifact upload syntax
- trigger syntax

### Pipeline migration pattern

If you move from Jenkins to GitHub Actions, or from GitHub Actions to GitLab CI, keep the same flow:

1. log in to the registry
2. pull or resolve the runner image
3. run the suite inside the runner
4. upload the same artifact folders

That is how the infrastructure stays dynamic instead of locked to one pipeline vendor.

## Registry And Authentication Guidance

Choose one shared registry and make it the official runner distribution point.

Examples:

- GHCR
- ECR
- ACR
- GCR
- Artifactory-backed registry

Rules:

- developers need documented read access
- CI systems need non-interactive read access
- publish pipelines need write access
- do not hardcode credentials into Dockerfiles, compose files, or scripts

## Cold Start Expectations

The first time a developer pulls a browser-ready runner image, it may be large.

Typical expectation:

- hundreds of megabytes to roughly one gigabyte

That is normal.

Document clearly:

- the first pull may take longer
- later runs are faster because Docker reuses layers

## Recommended Defaults

- one app image
- one separate QA runner image
- one compose service named `qa-runner`
- one bind-mounted workspace path such as `/workspace`
- one named container dependency volume
- one stable registry tag plus one immutable tag
- one devcontainer that reuses the compose service
- one helper script layer for image resolution and execution

## Generic Prompt For Future Agents

```text
Use md/DOCKER_INFRASTRUCTURE_BLUEPRINT.md as the source of truth. Build or update the Docker runtime so the application image stays separate from the QA runner image, the repo is bind-mounted into the container workspace, container node_modules stays in a named volume, artifacts stay host-visible, and the same runner contract works across local dev and CI. If package.json or package-lock.json changed, refresh the runner image and the container dependency volume before running tests.
```

## Docker Agent Rule

Any Docker-focused agent or helper should follow this rule:

- if a library is added, removed, or upgraded, refresh the container dependency state before validation

Minimum command sequence:

```bash
docker compose build qa-runner
docker compose run --rm qa-runner npm install
```

If a team chooses different file names or service names later, preserve the rule even if the names change:

- rebuild the runner image
- refresh the container dependency volume
- then run validation

## Use These Two Files Together

Use:

- `md/DOCKER_INFRASTRUCTURE_BLUEPRINT.md`
- `md/DOCKER_RUNTIME_AGENT.md`

The first file defines the infrastructure model.
The second file defines how one Docker-specific agent should operate inside that model.
