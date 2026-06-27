---
name: bug-report
description: Confirm a website or API defect from scenario artifacts or a manual page check, then create or update a local-only bug record with evidence. Never open external tickets in this repo.
allowed-tools: Read Write Bash
---

Run the local bug reporting flow for this project.

User passed: $ARGUMENTS

Repository: C:\Users\asafn\Desktop\GenAI+AgenticAI-Demo

Rules:

- Only create local bug records.
- Never call Jira, Azure, GitHub Issues, Slack, email, or any external service.
- A bug must reproduce on the initial detection plus 3 confirmation reruns before it becomes tracked.
- Healed automation scenarios may still create a local bug if the underlying website defect still reproduces.

Command entrypoint:

```powershell
node scripts/bug-reporting/run-local-bug-report.js $ARGUMENTS
```

Supported examples:

- `/bug-report --scenario flaky-network-recovery`
- `/bug-report --scan-artifacts`
- `/bug-report --manual-url /product/sku-123?state=broken --expect-text "Dynamic product output backed by the local validation API."`
- `/bug-report --manual-url /dashboard?mode=flaky --expect-testid orders-row`
- `/bug-report --manual-url /user-manager --expect-role heading --expect-name "User Manager"`

Report back:

1. outcome (`created`, `updated`, `unconfirmed`, `skipped`, or `no-issue-detected`)
2. local bug ID when one exists
3. markdown/json output paths
4. short explanation of why the bug was or was not tracked
