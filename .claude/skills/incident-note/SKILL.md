---
name: incident-note
description: Write a structured incident or healing note to the Obsidian vault. Use after a test failure, recovery attempt, or diagnosis session.
allowed-tools: Read Write Bash
---

Write a structured vault note. User passed: $ARGUMENTS (use as title/summary).

Vault: C:\Users\asafn\Desktop\GenAI+AgenticAI-Demo\obsidian-vault

Note type from context:

- failure or recovery → Reports/Incidents/
- healing attempt → Reports/Healing/
- test run or regression → Reports/Daily/
- task or planned work → Tasks/

File name: YYYY-MM-DD-<slug>.md

```markdown
# <Title>

**Date:** <today>
**Type:** incident | healing | regression | task
**Status:** open | mitigated | resolved

## Summary

## Evidence

- Page:
- Failing locator or endpoint:
- Error message:
- Classification:
- Confidence:

## Recovery Attempted

- Strategy:
- Result:

## Patch Proposal

- Fix area:
- Target files:
- Validation steps:

## Next Action
```

After writing:

1. Confirm file path to user
2. Append one-line link to obsidian-vault/00 Home.md
3. Update obsidian-vault/AGENT_MEMORY.md Known Issues table if new issue
