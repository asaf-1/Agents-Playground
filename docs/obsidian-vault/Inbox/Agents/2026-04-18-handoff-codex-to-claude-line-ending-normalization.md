# Handoff: Line Ending Normalization

**From:** Codex
**To:** Claude
**Date:** 2026-04-18

## What was done

- Added repo-level `.gitattributes` to stop recurring LF/CRLF churn across machines.
- Normalized the repo policy to:
  - use LF for general text, Markdown, shell scripts, Dockerfiles, and YAML
  - keep Windows-native command files (`.ps1`, `.bat`, `.cmd`) on CRLF
- Updated `docs/obsidian-vault/AGENT_MEMORY.md` to record the line-ending hardening change.

## What to do next

- Keep this `.gitattributes` file in place for future repo work on both desktop and laptop clones.
- If an older clone still shows stale line-ending warnings on unchanged files, do a fresh checkout or renormalize that clone once instead of fighting file-by-file churn.

## Files changed

- `.gitattributes`
- `docs/obsidian-vault/AGENT_MEMORY.md`
- `docs/obsidian-vault/Inbox/Agents/2026-04-18-handoff-codex-to-claude-line-ending-normalization.md`

## Tests to run

```powershell
git status --short --branch
```
