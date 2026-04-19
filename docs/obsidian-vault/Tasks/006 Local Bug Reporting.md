---
type: task
status: validated
tags:
  - task
  - qa-demo
  - bug-reporting
  - reporting-agent
  - skill
---

# Local Bug Reporting

## Outcome

Add a local-only bug reporting workflow that can confirm real website or API defects from scenario artifacts or manual page checks, then create or update a local tracked bug record with evidence and confirmation history.

## Context

The workspace already had scenario artifacts, diagnosis agents, healing flows, and vault reporting folders, but it did not have a dedicated bug reporting agent or a reusable command that could turn confirmed defects into local tracked bug records. The new layer needs to stay additive: no external ticket APIs, no edits to existing tests, and no changes to product runtime behavior.

## Target Files

- `framework/agents/reporting/*.ts`
- `scripts/bug-reporting/*`
- `.claude/skills/bug-report/SKILL.md`
- `README.md`
- `docs/obsidian-vault/AGENT_MEMORY.md`
- `docs/obsidian-vault/Reports/README.md`

## Acceptance Criteria

- A dedicated `BugReportingAgent` exists under `framework/agents/reporting/`.
- A standalone runner exists under `scripts/bug-reporting/`.
- A `/bug-report` skill exists under `.claude/skills/bug-report/`.
- The tracker creates local Markdown and JSON bug records only.
- The tracker confirms defects with the initial detection plus 3 reruns before opening a local bug.
- Self-healed scenarios can still become tracked local bugs when the underlying website defect still reproduces.
- Existing tests and product/runtime behavior remain unchanged.

## Validation

- `npx.cmd tsc --noEmit`
- `node scripts/bug-reporting/validate-local-bug-reporting.js`
- `npm.cmd run test:e2e`

## Notes For The Agent

- Keep all generated bug records local-only under ignored folders.
- Do not edit existing Playwright specs or product/runtime files.
- Keep the tracker boundary generic enough for a future Jira adapter without enabling any network-based tracker in v1.

## Result

- Added rollback markers before implementation:
  - git tag `snapshot/pre-bug-reporting-2026-04-20-0114`
  - snapshot note `docs/obsidian-vault/Snapshots/2026-04-20-0114-pre-bug-reporting.md`
- Added `framework/agents/reporting/BugReportingAgent.ts` plus a local tracker adapter, scenario bug catalog, and reporting types.
- Added `scripts/bug-reporting/run-local-bug-report.js` as the standalone runner and `scripts/bug-reporting/validate-local-bug-reporting.js` as additive validation coverage outside `tests/e2e/`.
- Added `.claude/skills/bug-report/SKILL.md` exposing the `/bug-report` command.
- Kept the workflow local-only:
  - no Jira, Azure, GitHub Issues, Slack, or email integration
  - no edits to existing tests
  - no edits to product/runtime behavior
- Validation run and outcome:
  - `npx.cmd tsc --noEmit` passed
  - `node scripts/bug-reporting/validate-local-bug-reporting.js` passed
  - `npm.cmd run test:e2e` passed with `41/41` tests green
