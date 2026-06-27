# Handoff: GitHub Pre-Merge Claude Review and Post-Merge Canary

Date: 2026-06-08

## User Request

The user wants an enterprise automation infrastructure plan for:

- free-first Claude AI code review before merge
- post-merge canary validation
- GitHub pipeline focus only
- Jenkins explicitly left out for now

The user also requested a status report so Claude can continue if Codex runs out of daily tokens.

## Current Repo

Repository path:

```text
C:\Users\asafn\Desktop\Agents-Playground
```

Relevant existing files:

- `.github/workflows/pr-validation.yml`
- `.github/workflows/main-validation.yml`
- `.github/workflows/daily-regression.yml`
- `.github/workflows/publish-playwright-runner.yml`
- `Dockerfile`
- `Dockerfile.e2e`
- `docker-compose.yml`
- `package.json`
- `playwright.config.ts`
- `server.js`
- `AGENTS.md`

Important note:

- Jenkins is present through `Jenkinsfile`, but it is out of scope for this request.

## What Codex Confirmed

- `Agents-Playground` is accessible.
- Git originally failed with dubious ownership because Codex runs as `CodexSandboxOffline`.
- Codex added Git safe directory:

```powershell
git config --global --add safe.directory C:/Users/asafn/Desktop/Agents-Playground
```

- Existing PR validation already runs Playwright test slices in GitHub Actions.
- Existing main validation runs full regression on push to `main`.
- The app has a health endpoint:

```text
GET /api/health
```

- `package.json` has useful canary scripts:

```text
npm run test:sanity
npm run test:contract
```

## Plan File Created

Codex created:

```text
docs/github-premerge-canary-plan.md
```

The plan is GitHub-only and covers:

- manual free-first Claude review with `@claude review`
- optional automated Claude review later with `ANTHROPIC_API_KEY`
- root `CLAUDE.md` guidance
- post-merge canary workflow design
- branch protection recommendations
- rollout phases
- risks and mitigations

## Recommended Next Steps

1. Create root `CLAUDE.md` with project-specific review instructions.
2. Update `README.md` with the GitHub PR and post-merge automation flow.
3. Add `.github/workflows/post-merge-canary.yml`.
4. Do not modify Jenkins in this phase.
5. Keep Claude review advisory until the user explicitly accepts API secret/cost setup.

## Suggested `post-merge-canary.yml` Behavior

Trigger:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

Job behavior:

- checkout
- build app image from `Dockerfile`
- run app on `127.0.0.1:4173`
- probe `/api/health`
- run `npm run test:sanity`
- run `npm run test:contract`
- upload `.artifacts/` and `test-results/`

## Key Decision Still Needed

Ask the user before implementing automated Claude review:

- Manual free-first `@claude review` only?
- Or automated Claude GitHub Action using `ANTHROPIC_API_KEY`?

Default recommendation:

- Start manual/free-first.
- Add automated Claude review only after the user accepts the API key and usage-cost tradeoff.

## Implementation Added By Codex

Codex implemented the GitHub-first pieces:

- `CLAUDE.md`
- `.github/workflows/post-merge-canary.yml`
- `README.md` merge/CI rule updates
- `obsidian-vault/AGENT_MEMORY.md` pipeline memory update
- `server.js` support for `HOST=0.0.0.0` in the canary container
- `playwright.config.ts` support for `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`

Jenkins was not modified.

## Latest Recommended Next Steps

1. Review the new `post-merge-canary.yml` syntax.
2. Run the smallest relevant local validation: `npm run test:sanity`.
3. Optionally run `npm run test:contract`.
4. Keep Claude review advisory until the user explicitly accepts API secret/cost setup.

## Scoped Task Note

- obsidian-vault/Tasks/009 GitHub Pre-Merge Review and Canary.md`r

## Docker Canary Verification

After Docker Desktop was activated, Codex verified the local canary path:

- `docker build -t agents-playground-canary-local .` passed.
- `docker run --rm -d --name agents-playground-canary-local -e HOST=0.0.0.0 -p 4173:4173 agents-playground-canary-local` started the app.
- `GET http://127.0.0.1:4173/api/health` returned `status: ok`.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 PLAYWRIGHT_REUSE_EXISTING_SERVER=true npm.cmd run test:sanity` passed, 1/1.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 PLAYWRIGHT_REUSE_EXISTING_SERVER=true npm.cmd run test:contract` passed, 1/1.
- The local container was stopped after verification.

Note: Docker build reported one high-severity `npm audit` advisory from dependencies. This was not addressed in the canary workflow slice.
