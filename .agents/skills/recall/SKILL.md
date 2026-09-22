---
name: recall
description: Load where the last session left off. Reads obsidian-vault/STATUS.md (written by /docs), checks it against live git and GitHub state, and reports where we are and what to do next. Use at the start of a session, or when the user says "recall", "where were we", "what's the status", or "resume".
allowed-tools: Read Bash Glob Grep
---

Resume from the last saved status. User passed: $ARGUMENTS (optional focus).

All paths are relative to the repository root. This skill only reads; it changes
no files.

## 1. Read the saved status

- Read `obsidian-vault/STATUS.md`.
- If it is missing, fall back to the newest file in `obsidian-vault/Snapshots/`
  (by the `YYYY-MM-DD-HHMM` prefix, not modification time) and say so.
- Both are private and gitignored, so a fresh clone or another machine has
  neither. In that case, say there is no saved status on this machine, and work
  from `AGENT_MEMORY.md` and git alone.
- Skim the `Current State` section of `obsidian-vault/AGENT_MEMORY.md` for
  project-wide context. Do not read the whole file.
- If the agent has its own memory (Claude's auto-memory), apply it alongside
  STATUS.md: Obsidian says where the work is, agent memory says how the user
  wants it done. If they conflict on a fact, trust the newer one and say so.

## 2. Check it against reality (parallel)

The status was true when written. Confirm it still is:

- `git rev-parse --abbrev-ref HEAD` and `git status --short`
- `git fetch -q origin` then `git log --oneline -5 origin/main`
- `git log --oneline origin/main..HEAD` (unpushed local commits)
- `gh pr list --state all --limit 5 --json number,title,state,headRefName,mergedAt`
  (skip quietly if `gh` fails)

Look for drift: a PR the status calls open that has since merged, a branch that
no longer exists, commits on main the status does not mention, uncommitted files
it does not explain. When the status and live state disagree, trust live state
and say what changed.

## 3. Report briefly

```
Last saved: <date> by <agent>
Where we are: <one or two sentences>
Changed since: <drift found, or "nothing">
Next step: <the Next step line, adjusted for any drift>
Waiting on you: <open approvals/choices, or "nothing">
```

Mention any **Watch out** items that bear on the next step.

Then stop and let the user confirm before starting the next step. Recall
restores context; it does not authorize the work.
