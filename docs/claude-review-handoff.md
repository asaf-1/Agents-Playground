# Claude Review Handoff

Use this workflow so Claude review output lives in GitHub and Codex can fetch it dynamically. Do not paste long Claude reviews into chat unless GitHub is unavailable.

## Standard PR Flow

1. Open a pull request.
2. Ask Claude for one review in a PR comment:

   ```text
   @claude review once
   ```

3. After Claude replies, pull the review into the repo workspace:

   ```powershell
   npm.cmd run review:claude:pull -- --pr <number>
   ```

4. Codex reads the generated note under:

   ```text
   obsidian-vault/Inbox/Agents/YYYY-MM-DD-claude-review-pr-<number>.md
   ```

## Debugging

If no Claude entries are found, capture all PR comments and reviews:

```powershell
npm.cmd run review:claude:pull -- --pr <number> --all
```

The script uses the authenticated GitHub CLI (`gh`). It reads:

- PR conversation comments
- PR review summaries
- inline PR review comments

It filters for Claude-looking entries by default. Use `--all` when checking bot names or permissions.

## Why This Exists

The goal is to avoid manual copy/paste handoffs. Claude writes to GitHub; Codex pulls the same GitHub review into Obsidian so the next agent can work from a stable local note.
