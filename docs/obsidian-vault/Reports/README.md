# Vault Reports

This folder stores local Markdown and JSON reports written by automation and agent workflows.

Only this `README.md` is intended to stay tracked in Git. Generated report files are local automation output and are ignored by default so each user can keep their own run history outside the shared repo.

## Report Areas

- `Daily/` — scheduled or manual full-regression summaries
- `Incidents/` — incident router and recovery result records
- `Healing/` — self-healing and real-agent run notes, including `ObsidianMemoryAgent` output
- `Workspace/` — session/workspace-state handoff notes from `ObsidianMemoryAgent` and closeout guard reports from `ObsidianCloseoutAgent`
- `Bug Reports/` — local-only confirmed bug records and indexes

## Expected Naming

Create one file per run or event, for example:

- `2026-04-10 Daily Regression Report.md`
- `2026-04-11 Daily Regression Report.md`
- `2026-04-24-real-agent-proof-<timestamp>.md`
- `2026-04-24-real-agent-session-<timestamp>.md`

## What Each Report Should Include

- date and time of the run
- markdown files that were read for context
- commands that were executed
- test summary
- failures and likely causes
- artifact locations
- next steps
- agent decisions, backend labels, and validation results when a real-agent workflow is involved
- changed files plus README, task-note, and memory-update status when a workspace-state report is involved
- missing required documentation when a closeout guard report is involved

## Default Validation Command

- `npm run test:e2e`
