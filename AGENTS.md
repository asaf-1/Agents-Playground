# Repository Workflow

## Obsidian Task Flow

- The project vault lives in `docs/obsidian-vault`.
- When the user points to a task note under `docs/obsidian-vault/Tasks`, treat that note as the source of truth for scope, acceptance criteria, and validation.
- Prefer updating the task note `Result` section before finishing substantial implementation work.

## Validation Rules

- If changes touch `public/`, `server.js`, `framework/`, or `tests/`, run relevant Playwright coverage before finishing.
- Prefer the smallest relevant command first, then expand if needed.
- Report the exact validation command you ran and whether it passed.
- Before a push from a local clone, require the local pre-push gate to pass: `npm run test:e2e` and a Docker build for the current repo.
- For code that is pushed to GitHub and intended for merge, treat Jenkins validation on the pushed revision as the required gate before merge.
- The merge rule for this repo is: local validation passed, local Docker validation passed, and Jenkins validation passed on the pushed code before merge.
- For merge candidates, Jenkins should run Docker validation before the Playwright validation on the pushed revision.
- For broader infrastructure or company-scale work, also follow `docs/obsidian-vault/05 Enterprise Infrastructure Rules.md`.
- For multi-platform or multi-product work, also follow `docs/obsidian-vault/05 Enterprise Infrastructure Rules.md` and keep scope explicit in the task note.

## Editing Rules

- Keep the demo local-only.
- Preserve existing `data-testid` hooks unless the task explicitly changes them.
- Keep the Obsidian vault content aligned with the current codebase when adding or changing product flows.
- For multi-platform or multi-product work, keep scope explicit in the task note and do not assume settings from one platform apply to another.
- Keep the project Obsidian vault project-specific only. Personal Codex usage notes and personal workflow guides should stay outside the vault.

## Documentation Rules

- When a change adds, removes, or renames a feature, page, agent, test category, skill, or workflow, update **both** `README.md` (root) and `docs/obsidian-vault/AGENT_MEMORY.md` in the same change set. Memory-only updates are not enough — `README.md` is the public-facing entry point and must stay accurate.
- Bump the test count in `README.md` whenever the spec count changes (search for the current number, update both occurrences).
- A change is not "done" until README, memory, and the relevant vault note (`Tasks/`, `Reports/`, or `Snapshots/`) all reflect the new state.

## Session Continuity Rules

- Before stopping a long session, on token-cap risk, or before any cross-agent handoff, write a session snapshot via the `/snapshot <title>` skill. Snapshots live in `docs/obsidian-vault/Snapshots/` and exist so the next agent can resume cold without the chat thread.
- A snapshot is not a replacement for `AGENT_MEMORY.md` updates — it is the point-in-time session-state layer on top of long-term project memory. See `docs/obsidian-vault/Snapshots/README.md` for the layering.

## Automation Rules

- Automation runs must stay inside this repository only.
- Do not inspect, modify, validate, or report on any other repository or folder unless the user explicitly asks for it.
- Treat the scheduled daily automation as the daily regression run for this repository.
- For the daily regression run, default to reading the key Markdown context files, running the full project test suite, and writing a report.
- For the daily regression run, do not modify product code unless a task note explicitly requests a code change.
- The default full-suite validation command for this repo is `npm run test:e2e`.
- Write daily automation reports under `docs/obsidian-vault/Reports/`.
