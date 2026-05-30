# Enterprise Infrastructure Rules

Use this note as the reusable operating contract for infrastructure, platform, QA, and automation work.

## Core Principles

- Ask before changing versions, ports, deployment topology, credentials, or branch strategy
- Keep personal paths, secrets, tokens, screenshots with sensitive data, and private machine details out of GitHub
- Preserve existing test behavior and `data-testid` hooks unless the task explicitly changes them
- Keep changes small, reversible, and well documented
- Prefer reusable configuration over one-off fixes
- Validate in layers: local first, Docker second, Jenkins third, then merge only after approval

## Enterprise-Level Standards

- Think like a senior QA lead, architecture lead, and organizational leader
- Treat scope, risk, rollback, and auditability as first-class concerns
- Separate shared project rules from local-only overrides
- Write decisions in Obsidian so the vault stays the project memory
- If a change affects security, release flow, infrastructure, or user data, pause and ask before committing

## Operating Sequence

1. Define the goal and the constraint
2. Identify the impacted layers
3. Check whether the change can stay local
4. Validate the change locally
5. Validate the change in Docker
6. Validate the pushed revision in Jenkins before merge
7. Record the result in the relevant Obsidian task note

## Multi-Platform And Multi-Product Scope

- Treat each platform or product as a separate scope unless the user explicitly says they share the same release path
- Confirm the active platform or product before changing code, docs, CI, credentials, or environment settings
- Keep shared baseline rules in this note and keep product-specific implementation details in the relevant task notes
- If a request spans multiple products or platforms, split the work into separate task notes and separate validation steps
- Do not reuse branch names, Jenkins jobs, Docker tags, environment files, or secrets across products unless the user explicitly approves that reuse

## Shared-By-Design Setup

- Prefer configuration that another developer can clone and adapt with their own usernames, secrets, ports, and CI access
- Use placeholders such as `your token here` only when showing where a real secret belongs
- Keep personal overrides in ignored local files, not in shared repo notes
- Separate shared defaults, local overrides, and CI-only settings in the documentation

## Docker Strategy Guidance

- Treat Docker as the clean-room validation boundary for browser automation and merge-gate parity in this repo
- For Playwright-oriented CI, prefer the Docker image as the "agent" boundary so the pipeline host only needs Docker support instead of direct browser and Linux-library management
- When shared infrastructure changes are approved, use containerization to lock the Node.js, Playwright, browser, font, and OS-library baseline as early as possible
- Prefer containerized validation when Linux-parity behavior matters, because local Windows runs may not expose case-sensitive path issues, missing fonts, or CI-only browser differences
- Favor a containerized runner when CI tooling may change later; the image should stay portable across Jenkins, GitHub Actions, or other pipeline systems
- If E2E runtime becomes a bottleneck, use containerized sharding as the preferred scale-out path because isolated workers reduce conflicts around caches, temp files, and browser state
- For team onboarding, prefer one shared container entry point over long machine-specific setup guides when the repo is ready for that investment
- Do not change the Docker base image, pinned versions, or CI container strategy without explicit approval and matching documentation updates

## AI Reading Contract

- Read the scope first, then the impacted platform or platforms, then the validation path
- If required context is missing, stop and ask instead of guessing
- For infrastructure changes, plan shared baseline, local validation, Docker validation, Jenkins validation, then merge gating
- Summarize decisions in the task note so future agents can continue the same product without replaying the whole thread

## Collaboration Rules

- Do not change versions or environments without explicit approval
- Do not push, merge, or alter remote settings without approval
- Do not introduce secrets, personal notes, or machine-specific config into shared docs
- Ask first for important decisions and highlight tradeoffs clearly
