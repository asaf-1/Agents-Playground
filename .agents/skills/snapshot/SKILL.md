---
name: snapshot
description: Write a point-in-time session snapshot to obsidian-vault/Snapshots/ so the next agent can resume cold without the chat thread. Use when stopping work, on token-cap risk, before risky operations, or on any cross-agent handoff.
allowed-tools: Read Write Bash
---

Write a session-state snapshot. User passed: $ARGUMENTS (use as title/slug seed).

Vault: C:\Users\asafn\Desktop\GenAI+AgenticAI-Demo\obsidian-vault

Steps:

1. Gather state with parallel Bash calls:
   - `git rev-parse --abbrev-ref HEAD` (branch)
   - `git log -1 --pretty=format:"%h %s"` (last commit)
   - `git status --short` (changed files)
2. Read `obsidian-vault/AGENT_MEMORY.md` to confirm current Phase / Status / Next.
3. Read `obsidian-vault/Templates/Session Snapshot.md` for the structure.
4. Write to `obsidian-vault/Snapshots/YYYY-MM-DD-HHMM-<slug>.md` filling every section. Slug derived from $ARGUMENTS, lower-case, hyphenated.

Required content quality:

- **Resume Entry Point** must be a single concrete next action with file paths and line numbers when possible. Vague entries defeat the purpose.
- **Last Decisions** must include the _why_, not just the what.
- **Workspace State** must include the validation command + result that was last run.

After writing:

1. Confirm the file path to the user.
2. Append a one-line link to `obsidian-vault/00 Home.md` under a `## Recent Snapshots` section (create the section if missing).
3. If the snapshot describes substantive work that is now done, also propose a stop-point entry for `AGENT_MEMORY.md` and ask the user before adding it.
