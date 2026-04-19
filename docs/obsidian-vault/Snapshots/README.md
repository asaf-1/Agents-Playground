# Session Snapshots

Point-in-time session-state files written before stopping work, so the next agent (or future-you) can resume cold without replaying the chat.

## When to write one

- The user signals end of session ("we're done", "stop here", "let's pick this up tomorrow").
- A long task is paused mid-flight (token cap approaching, blocked on external input, machine reboot).
- Before a risky operation that could lose context (force push, repo restructure, branch swap).
- After any handoff between Claude and Codex where the conversation thread will not survive.

## How

Use the `/snapshot <short-title>` skill or copy `Templates/Session Snapshot.md` and fill it in. File path:

```
docs/obsidian-vault/Snapshots/YYYY-MM-DD-HHMM-<slug>.md
```

## Difference from other memory layers

| Layer | Scope | Lives in |
|---|---|---|
| Snapshot | Point-in-time session state for resume | `Snapshots/` |
| `AGENT_MEMORY.md` | Long-term project state (what's built, what's pending) | vault root |
| `Tasks/` | Structured per-work-item notes with acceptance criteria | `Tasks/` |
| `Reports/` | Incident, healing, and daily regression artifacts | `Reports/` |
| `Inbox/Agents/` | Cross-agent handoff drops | `Inbox/Agents/` |
| Git history | Source-of-truth for code state | `.git` |

A snapshot is the **session-state** layer — it answers "what was I about to do next, and why" rather than "what does the project look like overall."

## Lifecycle

Snapshots are append-only. Old ones are kept for traceability. They can be summarized into `AGENT_MEMORY.md` stop-point entries when they describe substantive work.
