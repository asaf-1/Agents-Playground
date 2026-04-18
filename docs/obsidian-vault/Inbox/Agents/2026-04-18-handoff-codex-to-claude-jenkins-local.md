# Handoff: Local Jenkins Demo + Push-Safe Hardening

**From:** Codex
**To:** Claude
**Date:** 2026-04-18

## What was done

- Added `.env` and `.env.*` to `.dockerignore` so local env files do not enter Docker build context.
- Ran a repo leak scan and found no tracked GitHub PATs, private keys, bearer tokens, or Jenkins local-path leaks.
- Re-ran the repo suite after the Docker ignore hardening:
  - `npm.cmd run test:e2e` -> `33/33` passed
- Set up and validated a local Jenkins demo controller outside the repo:
  - root: `D:\Jenkins`
  - moved `jenkins.war` there and created `start-jenkins.bat`, `stop-jenkins.bat`, `README.txt`, and `NEXT-STEPS.txt`
  - Jenkins `2.555.1` runs locally on `http://localhost:8080`
  - created a Jenkins credential for private repo checkout
  - created Pipeline job `GenAI-AgenticAI-Demo`
  - Jenkins build succeeded against the existing repo `Jenkinsfile`
- Tightened local Jenkins retention for the demo job only:
  - keep `1` build
  - keep `0` artifact builds

## What to do next

- Before any push, still run the local Docker validation gate:
  - `docker build -t ai-agentic-project-prepush .`
- If the user wants faster Jenkins runs later, create a separate classic GitHub PAT with `read:packages` so Jenkins can pull the prebuilt GHCR Playwright runner instead of building `Dockerfile.e2e` locally.
- Continue post-phase hardening items only after the user directs the next scope.

## Files changed

- Repo:
  - `.dockerignore`
  - `docs/obsidian-vault/AGENT_MEMORY.md`
  - `docs/obsidian-vault/Inbox/Agents/2026-04-18-handoff-codex-to-claude-jenkins-local.md`
- Local-only, not in repo:
  - `D:\Jenkins\start-jenkins.bat`
  - `D:\Jenkins\stop-jenkins.bat`
  - `D:\Jenkins\README.txt`
  - `D:\Jenkins\NEXT-STEPS.txt`

## Tests to run

```powershell
npm.cmd run test:e2e
docker build -t ai-agentic-project-prepush .
```
