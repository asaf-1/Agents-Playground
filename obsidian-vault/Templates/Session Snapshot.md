---
type: snapshot
status: open
tags:
  - snapshot
  - resume
---

# Session Snapshot — <Title>

**Date:** <YYYY-MM-DD HH:MM local>
**Agent:** Claude | Codex
**Branch:** <git branch>
**Last commit:** <short SHA + subject>

## Active Phase

What broader phase or task this session belongs to (link to the relevant `Tasks/` note or roadmap section if any).

## What Was In Flight

Concrete work that was being done at the moment of the snapshot. One short paragraph.

## Last Decisions

Bullet list of the meaningful decisions made in this conversation that are not yet captured in code or in `AGENT_MEMORY.md`. Include the _why_ so the next agent can judge edge cases.

- Decision:
- Decision:

## Workspace State

- Changed files (uncommitted): `<paths>`
- Mid-edit files (saved but not finished): `<paths>`
- Validation status: `<command + result>` (e.g. `npm run test:e2e` → 41/41 green)
- Open dev servers / containers: `<list or none>`
- Linked artifacts: `<paths under .artifacts/ or vault Reports/>`

## Resume Entry Point

The single concrete next action. The next agent should be able to read this line and start working immediately.

> Example: "Open `framework/agents/diagnosis/NarrativeEnricher.ts:39`, switch the URL to `/v1/chat/completions`, then update the assertion in `tests/e2e/scenarios/narrative-enricher.spec.ts:127` and rerun the spec."

## Blockers / Open Questions

Anything that would stop the next agent from making the resume entry point work — missing access, undecided design call, waiting on user input.

## Notes For The Next Agent

Optional context that does not fit elsewhere.
