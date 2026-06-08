---
name: next-phase
description: Build the next multi-agent orchestration phase per the roadmap. Use when the user wants to advance the framework toward real orchestrated recovery.
allowed-tools: Read Write Edit Bash Glob Grep
---

Read these two files first as sources of truth:
- md/NEXT_PHASE_MULTI_AGENT_ROADMAP.md
- obsidian-vault/AGENT_MEMORY.md

User passed: $ARGUMENTS
Project: C:\Users\asafn\Desktop\GenAI+AgenticAI-Demo

## Default: Build Phase 1 — First Orchestration Slice

### Step 1 — Read current state
- obsidian-vault/AGENT_MEMORY.md (current phase + pending tasks)
- framework/agents/recovery/RecoveryRouter.ts
- framework/agents/diagnosis/FailureClassifier.ts
- framework/agents/validation/PageValidationAgent.ts

### Step 2 — Build orchestrator layer
Create:
- framework/orchestrator/IncidentRouter.ts
  Receives failure → looks up agents from AgentRegistry → runs: classify → evidence → recover → validate
  Returns: { classified, recoveryAttempted, recovered, evidence, patchProposal }
- framework/orchestrator/AgentRegistry.ts
  Maps failure categories to agent sets:
  ui-missing-locator → [FailureClassifier, GenericLocatorHealer, PageValidationAgent]
  api-contract-drift → [FailureClassifier, ApiDiagnosisAgent, PatchProposalAgent]
  ui-loading-or-network → [FailureClassifier, NetworkRecoveryAgent, PageValidationAgent]
  unknown → [FailureClassifier, PatchProposalAgent]

### Step 3 — Add UserManagerPage end to end
- framework/pom/UserManagerPage.ts
- framework/agents/recovery/pageProfiles/userManagerProfile.ts
- userManagerPageContract in framework/agents/validation/contracts.ts
- wire into framework/fixtures/baseTest.ts
- add route in server.js + public/user-manager.html

### Step 4 — Write proof test
Create tests/e2e/scenarios/orchestrated-recovery.spec.ts
Must: trigger real failure → route through IncidentRouter → assert recovery via PageValidationAgent → write result to obsidian-vault/Reports/Incidents/

### Step 5 — Update memory + report
1. Run: npx playwright test tests/e2e/scenarios/orchestrated-recovery.spec.ts --reporter=list
2. Update obsidian-vault/AGENT_MEMORY.md — mark Phase 1 complete, set Phase 2 as current
3. Write obsidian-vault/Inbox/Agents/phase1-handoff.md for Codex pickup
4. Write obsidian-vault/Reports/Incidents/phase1-result.json
