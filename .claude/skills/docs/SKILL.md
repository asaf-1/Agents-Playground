---
name: docs
description: Save where this session got to, so the next session can pick it up cold. Rewrites obsidian-vault/STATUS.md (the single "latest status" file that /recall reads) and archives a dated copy in obsidian-vault/Snapshots/. Use when the user says "docs", "save status", "write it down", "we're stopping", or before a long pause, a risky operation, or a Claude/Codex handoff.
allowed-tools: Read Write Edit Bash Glob Grep
---

Save the session status. User passed: $ARGUMENTS (optional title or focus).

All paths are relative to the repository root. Do not hard-code an absolute path.

## 1. Gather the facts (parallel)

- `git rev-parse --abbrev-ref HEAD`
- `git log -5 --oneline`
- `git status --short`
- `git log --oneline origin/main..HEAD` (local commits not on main yet)
- `gh pr list --state open --json number,title,headRefName` (skip quietly if `gh` fails)
- Read the current `obsidian-vault/STATUS.md` if it exists: carry forward anything
  still true, drop what this session finished.

The session itself is the main source: what was asked, what was built, what was
decided and why, and what the user still has to decide. Git only confirms it.

## 2. Rewrite `obsidian-vault/STATUS.md`

Overwrite the whole file. It always describes **now**, never history. Use exactly
these sections:

```markdown
---
type: status
updated: <YYYY-MM-DD HH:MM local>
agent: Claude | Codex
---

# Status

**Updated:** <date time> · **Branch:** `<branch>` · **Last commit:** `<sha> <subject>`

## Where we are

Two or three sentences: the goal being worked on and how far it got.

## Done this session

- <what was finished, with file paths>

## In flight

- Uncommitted or unpushed work, and what state it is in. "Nothing" is a valid answer.

## Decisions (and why)

- <decision> — <why>. Only ones not already recorded in code or AGENT_MEMORY.md.

## Next step

> The single concrete action to resume with: file, command, or question.

## Waiting on the user

- Approvals or choices still open (push, merge, design calls). Empty if none.

## Watch out

- Traps the next session could fall into: things that look wrong but are
  deliberate, gotchas found, rules the user set this session.
```

Quality bar:

- **Next step** is one action someone can start without reading the chat. Vague
  entries ("continue the work") defeat the purpose.
- Write in plain English, briefly. Link files as repo-relative paths.
- Never record secrets, tokens, or passwords.
- Never describe the app's deliberate bugs as things to fix.

## 3. Archive a dated copy

Write the same content to `obsidian-vault/Snapshots/YYYY-MM-DD-HHMM-<slug>.md`
(slug from $ARGUMENTS or the goal, lower-case, hyphenated), with the frontmatter
`type: snapshot`. Add a line for it at the top of the `## Recent Snapshots` list
in `obsidian-vault/00 Home.md`.

## 4. Long-term memory

If the session changed something durable about the project (a new workflow, a
new skill, a policy flag flipped, a feature shipped), update the `Current State`
section of `obsidian-vault/AGENT_MEMORY.md` with one dated bullet. Session
progress alone does not belong there; STATUS.md holds it.

## 5. Keep agent memory in step with Obsidian

Obsidian is the shared memory every agent reads; an agent's private memory
(Claude's auto-memory, if present) holds how this user likes to work. Keep them
consistent:

- If the user gave a lasting preference or rule this session ("always...",
  "don't...", "teach me as we go"), save it to the agent's own memory as well
  as listing it under **Watch out** in STATUS.md.
- If a saved agent memory contradicts what Obsidian now says, fix the stale one.
- Agents without a private memory (Codex) skip this step; STATUS.md and
  AGENT_MEMORY.md carry everything they need.

## 6. Report

Tell the user, in two or three lines: the path written, the **Next step** line,
and anything waiting on them. Do not commit or push; that is the user's call.
