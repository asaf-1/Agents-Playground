---
name: docker-runtime
description: Maintain shared Docker runtime infrastructure for app packaging, QA runners, and CI portability. Use when the user wants to build or update Docker setup, move it across pipelines, or sync container dependencies after package changes.
allowed-tools: Read Write Edit Bash Glob Grep
---

Read the project Docker runtime files first:

- `Dockerfile.e2e`
- `docker-compose.yml`
- `Jenkinsfile`
- `.github/workflows/`
- `scripts/docker/`

The user passed: $ARGUMENTS

## Mission

Use Docker as a reusable infrastructure boundary, not just as a one-off local command.

Preserve these ideas:

- app image separate from QA runner image
- bind-mounted workspace
- named container dependency volume
- host-visible artifacts
- registry-backed runner portability across CI systems

## Dependency Sync Rule

If `package.json` or `package-lock.json` changed, assume the container dependency volume may be stale.

Run this before validation:

1. `docker compose build qa-runner`
2. `docker compose run --rm qa-runner npm install`

Reason:

- rebuild refreshes the image layer
- container-side install refreshes the named dependency volume

Do not assume rebuild alone updates an existing volume.

## When The User Wants Docker Work

Typical tasks:

- add or revise `Dockerfile`
- add or revise `Dockerfile.e2e`
- add or revise `docker-compose.yml`
- add or revise `.dockerignore`
- add helper scripts under `scripts/docker/`
- wire the runner into Jenkins or another CI system
- wire the runner into GitHub Actions or another CI system
- document the setup for developers

## Pipeline Portability Rule

If moving between CI systems:

1. keep the same runner image contract
2. keep the same workspace and artifact contract
3. translate only the pipeline syntax and credentials

Do not redesign the runtime just because the pipeline vendor changed.
