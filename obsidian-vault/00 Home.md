# Agents-Playground Vault

This vault is the shared memory layer for all agents and humans working in this project.

> **Project renamed to Agents-Playground** (package name `agents-playground`; GitHub `asaf-1/Agents-Playground`, still PRIVATE).
> **The vault now lives at the repo root** (`obsidian-vault/`, moved from `docs/obsidian-vault/`). **Open the REPO ROOT as the Obsidian vault** to catch everything (including the root `md/` guides referenced below).

---

## Agent Memory (Read This First)

- [[AGENT_MEMORY]] — shared memory index for Claude, Codex, and all future agents.
  **Every agent reads this at session start. Every agent updates it when work completes.**

---

## Start Here

- [[01 Project Map]]
- [[02 Test Map]]
- [[03 Agent and Obsidian Workflow]]
- [[04 Daily Regression Automation]]
- [[05 Enterprise Infrastructure Rules]]
- [[06 Reliable Agentic QA Demo Guide]]
- [[Reports/README]]
- [[Templates/Task Note]]
- [[Tasks/007 Real Agent Proof]]
- [[Tasks/008 Agents Playground Auth RBAC and Agent Roster]]

---

## Adoption Guides (repo-root `md/`, NOT in the vault)

These live at the repository root under `md/` (outside `obsidian-vault/`):

- `md/PORTABLE_AGENT_ADOPTION_GUIDE.md` — workspace-agnostic adoption guide (terminology, installation, seed, storageState, flag store, RBAC, full agent definitions).
- `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md` — this-repo adoption plan.
- `md/PLAYGROUND_EXPANSION_DESIGN.md` — the auth / RBAC / drift / flows design and guardrails (Phase 2 lab GUI and Phase 4 richer flows DESIGNED but DEFERRED).

---

## Quick Commands

- `npm run start`
- `npm run test:sanity`
- `npm run test:functional:positive`
- `npm run test:functional:negative`
- `npm run test:nonfunctional`
- `npm run test:contract`
- `npm run test:e2e`
- `npm run test:e2e:ui`
- `npm run test:ui-heal`
- `npm run test:flaky`
- `npm run test:api`
- `npm run test:dynamic`
- `npm run test:generic-healing`
- `npm run test:page-contracts`
- `npm run test:classification`
- `npm run test:real-agent`
- `npm run obsidian:closeout -- --title <title> --summary <summary>`
- `docker build -t ai-agentic-project-prepush .`

---

## Vault Structure

The vault lives at the **repo root** as `obsidian-vault/` (moved from `docs/obsidian-vault/`). Open the repo root as the Obsidian vault.

```
<repo root: Agents-Playground>/
  obsidian-vault/
    AGENT_MEMORY.md        ← shared agent memory (start here)
    00 Home.md
    01-06 Project notes
    Reports/
      Daily/               ← scheduled regression reports
      Incidents/           ← failure + recovery notes
      Healing/             ← healing attempt logs
      Workspace/           ← session/workspace-state handoff logs
    Snapshots/             ← point-in-time session snapshots for cold resume
    Tasks/                 ← structured work items
    Templates/             ← task + report templates
    Inbox/
      Agents/              ← handoff drop zone between Claude and Codex
  md/                      ← adoption guides (see above), NOT part of the vault
```

---

## Agent Workflow

1. Agent reads `AGENT_MEMORY.md` at session start
2. Picks highest-priority pending task
3. Builds it
4. Updates `AGENT_MEMORY.md` — marks done, adds new tasks
5. Drops handoff note in `Inbox/Agents/` if passing to other agent

**Resume trigger:** _"read agent memory and continue"_
