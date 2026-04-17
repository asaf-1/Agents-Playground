# Daily Regression Automation

This note prepares the daily scheduled Codex regression run for this repository.

## Goal

Every day at `08:00`, Codex should run the daily regression for this repository:

1. work only inside this repository
2. read the main Markdown files for context
3. run the full test suite
4. write a detailed Markdown regression report into the Obsidian vault

## Scope Lock

This automation should work only on:

the current local clone of this repository that is already open as a Codex thread

It should not inspect or act on any other repository.

## Recommended Schedule

- Time: `08:00`
- Time zone: the local time zone of the machine running the Codex app

In the current environment, that appears to be:

- `Asia/Jerusalem`

## Ready-To-Paste Automation Prompt

Paste this into the Codex app Automation instructions:

```text
Use the current Codex thread for this repository.

Work only inside this repository. Do not inspect, modify, validate, or report on any other repository or folder.

Read these Markdown files for context:
- AGENTS.md
- README.md
- docs/obsidian-vault/00 Home.md
- docs/obsidian-vault/01 Project Map.md
- docs/obsidian-vault/02 Test Map.md
- docs/obsidian-vault/03 Agent and Obsidian Workflow.md
- docs/obsidian-vault/04 Daily Regression Automation.md
- docs/obsidian-vault/06 Reliable Agentic QA Demo Guide.md
- relevant task notes under docs/obsidian-vault/Tasks/

This is the daily regression run for this repository.
It is a test-and-report automation, not a product-change automation.
Do not modify product code unless a task note explicitly says to do so.

Run the full project test suite using:
- npm run test:e2e

After the run, create a new Markdown report in:
- docs/obsidian-vault/Reports/

Use this file name format:
- YYYY-MM-DD Daily Regression Report.md

Use docs/obsidian-vault/Templates/Daily Regression Report.md as the structure.

The report must include:
- date and time
- markdown files read
- command(s) run
- overall pass/fail status
- total tests, passed tests, failed tests, skipped tests if available
- failing tests with short error summaries
- artifact paths such as Playwright report, trace, screenshot, and video when available
- short next steps

Do not push, merge, or change git settings.
If tests fail, stop after diagnosis and write the report.
If all tests pass, write the report and finish.
```

## Docker And Playwright

- The default daily automation is Playwright-first: `npm run test:e2e`
- If you want an unattended run that mirrors the local pre-push gate, use `scripts/pre-push-check.ps1` instead
- That script runs:
  - `npm run test:e2e`
  - `docker build -t ai-agentic-project-prepush .`
- Keep the default daily report focused on regression results, and use the Docker gate when you specifically want local merge-gate parity

## What You Still Need To Do In The Codex App

I cannot click these app settings from this chat. You still need to create the schedule in the Codex app UI.

Use this flow:

1. Open the Codex app
2. Open the thread for your local clone of this repository
3. Create a new Automation
4. Paste the prompt from this note
5. Set the schedule to `Daily`
6. Set the time to `08:00`
7. Confirm the local time zone shown by the app
8. Save the Automation

Each contributor should create this automation in their own Codex app using their own local clone and thread.

## Output Location

The daily regression report should be written here:

- `docs/obsidian-vault/Reports/`

## Recommended Result

After each run, you should expect:

- one new Markdown report in `docs/obsidian-vault/Reports/`
- the Playwright artifacts in `.artifacts/`
- a pass/fail summary in the Codex app review queue

Generated daily report files are local run output and should stay out of Git by default.

## GitHub Actions Daily Regression

The repository also includes a scheduled GitHub Actions workflow:

- `.github/workflows/daily-regression.yml`

That workflow is different from the local Codex automation in this note:

- schedule: fixed UTC cron (`05:00 UTC`)
- command: `npm run test:e2e`
- report retention: GitHub Actions artifacts only
- no repo commits for generated daily reports
- no Docker build in the scheduled workflow
