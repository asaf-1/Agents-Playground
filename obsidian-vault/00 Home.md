# Agents-Playground Vault

This vault is the shared **second brain** for every agent and human on this project — the single source of truth for how the system works, what depends on what, and how to ship safely.

> **Project: Agents-Playground** (package `agents-playground`; GitHub `asaf-1/Agents-Playground`, PRIVATE).
> **The repo ROOT is the Obsidian vault.** Open the repo root (not `obsidian-vault/`) so the root `md/` guides and `docs/` runbooks are also in scope.

---

## Read This First

- [[AGENT_MEMORY]] — shared memory index + current-state snapshot for every agent.
  **Every agent reads this at session start and updates it when work completes.**
- **Resume trigger:** _"read agent memory and continue"_

---

## Maps (canonical — start here for "how does X work?")

| Note | Answers |
| --- | --- |
| [[07 Architecture Overview]] | How the app + framework + tests + CI fit together (with the architecture diagram) |
| [[08 Vault Dependency Map]] | What breaks if `obsidian-vault/` disappears — the verified HARD / SOFT / NONE model |
| [[09 Infrastructure and CI Map]] | The pipeline, every workflow, the canary contract, and the **authoritative** GitHub-first / Jenkins-out-of-scope policy |
| [[10 Agent Roster]] | Every framework agent, its inputs/outputs, and its vault touchpoint |

---

## Project Notes

- [[01 Project Map]] — canonical code layout
- [[02 Test Map]] — canonical test inventory (62 tests: 60 pass / 2 skip) + per-suite commands
- [[03 Agent and Obsidian Workflow]] — how agents and the vault work together
- [[04 Daily Regression Automation]] — scheduled regression _(CI/merge policy superseded by [[09 Infrastructure and CI Map]])_
- [[05 Enterprise Infrastructure Rules]] — infra rules _(merge-gate policy superseded by [[09 Infrastructure and CI Map]])_
- [[06 Agents Playground Guide]] — the operator narrative guide

---

## Tasks

- [[Tasks/003 Reliable Agentic QA Demo]]
- [[Tasks/004 Generic Self-Healing Layer]]
- [[Tasks/005 Page-Level Self-Healing Adoption]]
- [[Tasks/006 Local Bug Reporting]]
- [[Tasks/007 Real Agent Proof]]
- [[Tasks/008 Agents Playground Auth RBAC and Agent Roster]]
- [[Tasks/009 GitHub Pre-Merge Review and Canary]]
- [[Tasks/010 CSS Polish]]

**Current active task:** the GitHub-first automation + second-brain consolidation slice — see the live pointer in [[AGENT_MEMORY]].

---

## External References (linked, never duplicated)

- **`docs/` operator runbooks:** `docs/pre-merge-review-and-canary.md` (pre-push → review → canary; promoted into [[09 Infrastructure and CI Map]]), `docs/claude-review-handoff.md`, `docs/github-premerge-canary-plan.md`, `docs/css-polish-plan.md`.
- **`md/` portable guides** (outside the vault, by design): `md/PORTABLE_AGENT_ADOPTION_GUIDE.md`, `md/PLAYWRIGHT_AGENTS_ADOPTION_PLAN.md`, `md/PLAYGROUND_EXPANSION_DESIGN.md`, `md/PAGE_LEVEL_SELF_HEALING_PATTERN.md`, `md/BUG_REPORTING_GUIDE.md`.
- ⚠️ **Historical / superseded:** `md/WORKSPACE_OVERVIEW.md` and `md/PLAN.md` are stale (old project name, port 3000, pre-auth/RBAC) — superseded by [[07 Architecture Overview]] + [[01 Project Map]]. Do not treat as truth.

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
- `npm run review:claude:pull -- --pr <number>`
- `docker build -t ai-agentic-project-prepush .`

---

## Vault Structure

Open the **repo root** as the Obsidian vault.

```
<repo root: Agents-Playground>/        ← open THIS as the vault
  obsidian-vault/
    AGENT_MEMORY.md                    ← shared memory + current state (read first)
    00 Home.md                         ← this index
    01–06 Project notes
    07 Architecture Overview.md        ┐
    08 Vault Dependency Map.md         │ canonical maps
    09 Infrastructure and CI Map.md    │
    10 Agent Roster.md                 ┘
    Tasks/        ← 003–010 work items (git-tracked)
    Templates/    ← task + report templates
    Snapshots/    ← cold-resume session snapshots
    Inbox/Agents/ ← agent-to-agent handoffs
    Reports/      ← run-generated, gitignored: Daily/ Incidents/ Healing/ Workspace/ Bug Reports/
  docs/           ← operator runbooks (CI, review handoff)
  md/             ← portable adoption guides (NOT part of the vault)
```

---

## Agent Workflow

1. Read [[AGENT_MEMORY]] at session start
2. Pick the highest-priority pending task
3. Build it
4. Update [[AGENT_MEMORY]] — mark done, add new tasks
5. Drop a handoff note in `Inbox/Agents/` if passing to another agent

**Resume trigger:** _"read agent memory and continue"_
