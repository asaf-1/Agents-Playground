# GenAI+AgenticAI Demo Vault

This vault is the shared memory layer for all agents and humans working in this project.

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

```
docs/obsidian-vault/
  AGENT_MEMORY.md          ← shared agent memory (start here)
  00 Home.md
  01-06 Project notes
  Reports/
    Daily/                 ← scheduled regression reports
    Incidents/             ← failure + recovery notes
    Healing/               ← healing attempt logs
    Workspace/             ← session/workspace-state handoff logs
  Tasks/                   ← structured work items
  Templates/               ← task + report templates
  Inbox/
    Agents/                ← handoff drop zone between Claude and Codex
```

---

## Agent Workflow

1. Agent reads `AGENT_MEMORY.md` at session start
2. Picks highest-priority pending task
3. Builds it
4. Updates `AGENT_MEMORY.md` — marks done, adds new tasks
5. Drops handoff note in `Inbox/Agents/` if passing to other agent

**Resume trigger:** _"read agent memory and continue"_
