---
name: bug-hunt
description: Exploratory bug hunt on the local Playground Bank with Claude as the tester. Explores like a person, looks for quiet logic bugs (wrong amounts, someone else's data, a check that is missing) as well as crashes, labels each finding with the shared honesty rules, and only at the end scores itself against the planted faults. Use when the user says "/bug-hunt", "bug hunt with Claude", "hunt for bugs" or "exploratory test the bank". On demand only, capped, black box. Never fixes a bug and never files a GitHub issue.
---

# Bug hunt with Claude (Playground Bank)

You are an exploratory tester. Find the bugs a person using Playground Bank
would hit, write each one down honestly, and score yourself only at the end.
Change no code. This is phase 4 of the bug hunt; `npm run bug-hunt` (phase 3)
is the same idea with no AI, and both share the rules in
`framework/helpers/bugHunt/honesty.json` and the score in
`framework/helpers/bugHunt/score.ts`.

User passed: $ARGUMENTS (optional: an area to focus on, such as `bank`,
`shop` or `markets`, and/or `quick` for a 10-page run).

## 0. Black box (mandatory, read first)

The score means something only if you hunt blind, the way a tester meets a new
site.

- **You may read:** this skill (this file and `references/`),
  `framework/helpers/bugHunt/honesty.json`, and what the running site shows
  you: its pages, its answers (the browser's network panel), its API docs at
  `http://127.0.0.1:4173/api/docs` and the GraphQL explorer at `/app/graphql`.
- **You may not read, until step 7:** the planted-fault list
  (`GET /api/practice`) and the Practice page (`/app/practice`; only press the
  practice switch in the top bar); and in the repository `practice.js`,
  `server.js`, `bank/`, `web/`, `tests/`, `docs/`, `framework/` (except
  `honesty.json`), `CHANGELOG.md`, `md/`, `obsidian-vault/`, the agent's
  memory, and any earlier hunt's report. No searching the repository at all.
- **If this conversation has already shown you where the planted faults are**
  (their names, code or tests), stop before step 1 and say so: the hunt must
  run in a fresh session.

## 1. The site, the browser, the run folder

1. The target is `http://127.0.0.1:4173` only, never the live site on Render.
   Check it: `curl -s http://127.0.0.1:4173/api/health`. If nothing answers,
   build and start it in the background (`npm run build`, then
   `node server.js 4173`) and remember that you started it.
2. Use the Chrome DevTools tools (`mcp__chrome-devtools__*`), loaded with
   ToolSearch first: `new_page` (with `isolatedContext` set, so the hunt's
   cookies stay apart from anything else open), `navigate_page`,
   `take_snapshot` (prefer it to screenshots for reading), `click`, `fill`,
   `fill_form`, `list_network_requests` and `get_network_request` (for a
   request's endpoint, its answer and its `X-Request-Id`),
   `list_console_messages`, `take_screenshot`. Close the page at the end.
   **Never use the Playwright test tools' `planner_setup_page` or
   `generator_setup_page`:** they write `tests/e2e/seed.spec.ts` in the
   repository, and the hunt changes no file outside its run folder. If the
   Chrome DevTools tools are not there, say so and stop; do not fall back.
3. Make the run folder `.artifacts/bug-hunt/claude-<YYYY-MM-DDTHH-MM-SS>/`
   with a `screenshots/` folder inside. It is gitignored.

## 2. Accounts

- **Customer A** (you, in the browser): sign up on `/app/signup` with a fresh
  email such as `claude-hunt-<time>@example.test` and a password of your own.
- **Customer B**, for checks across customers: a second fresh customer made
  through the API with curl and its own cookie jar
  (`POST /api/bank/register` with `fullName`, `email`, `password`,
  `acceptTerms: true`). Use B's ids (accounts, payees, requests, tickets) to
  test whether A can see or change what is B's.
- **Staff, looking only:** the demo Admin (`alex@playgroundbank.test`) and
  Support (`sam@playgroundbank.test`), password `demo1234`. Never approve,
  refund, lock, move or delete anything as staff.
- **Practice mode:** press the practice switch in the top bar of A's
  browser. It arms the planted faults for that browser's session only.

## 3. The cap

- At most **25 page visits** (navigations) per run, **10** with `quick`.
- At most **60 API requests sent by hand** (curl, or a script run in the
  page) per run, **25** with `quick`. Two requests sent at the same instant
  for a race count as two. The requests the site sends itself while you click
  do not count. Reading `/api/docs` once counts as one.
- Count both as you go, and write them in `findings.json` (step 6).
- Follow the journeys in `references/journeys.md` (or the area asked for),
  not a crawl. When either budget is spent, stop where you are and write up
  what you have. The first hunt (2026-11-14) kept to the page cap but sent a
  few hundred requests; the request cap is why.

## 4. How to hunt

Look for what a person would notice is wrong, not only errors
(`references/journeys.md` lists the questions to ask on each kind of page):
money that does not add up, a balance that does not move, another customer's
data, an action allowed that should be refused, a limit not kept, a date range
one day short, a count that never goes down, an error that shows the server's
insides, the same action done twice. Compare what the page shows with what the
API answered, and note the endpoint (`POST /api/bank/...`) and the
`X-Request-Id`.

## 5. Each finding, before writing it down

1. **Label it** by `honesty.json`: classification, confidence, severity.
   Prefer `inconclusive` to a guess. `expected-bad-ux` and `test-gap` are
   yours to use too.
2. **Repeat it.** Do the steps again. Seen again: `reproduced: true`, and
   only then may confidence be `high`.
3. **New or planted?** Switch practice mode off, repeat once, switch it back
   on. Still there: it is new, and `passes` gets `"customer, practice off"`.
   Gone: `passes` is `["customer, practice on"]`.
4. **Fingerprint:** `local|<page, or METHOD endpoint, with ids as :id>|<short
symptom slug>`, for example
   `local|POST /api/bank/transfers|amount-taken-twice`.
5. **Evidence:** a screenshot in `screenshots/`, the endpoint, the request id.
   Mask any key, token or password (`pbk_***`, `Bearer ***`).
6. Add it to `findings.json` in the shape of
   `references/finding-template.md`.

## 6. Write findings.json

In the run folder:

```json
{
  "walks": [
    {
      "pass": "customer, practice on",
      "pages": 25,
      "pressed": 40,
      "requests": 60
    }
  ],
  "findings": []
}
```

One `walks` entry per way you walked (`"admin, looking only"` when you looked
as staff, and so on), with page visits, actions and the requests you sent by
hand. The report shows the requests too.

## 7. Score (only now)

```bash
npm run bug-hunt:score -- .artifacts/bug-hunt/claude-<time>
```

It refuses a file that breaks the honesty rules (an unknown label, `high`
without `reproduced`). Fix the finding, never the rules, and run it again. It
reads the planted-fault list only now and writes `report.md`. From this point
you may read `/api/practice` and the Practice page to understand the score.

A fault counts as found only when a finding happened where it lives (the
endpoint, the page, or the same area) and tells its story in the same words;
each finding finds one fault at most, and the report says why each matched.
So write the title and `actual` plainly, the way a person would describe
what went wrong: the scorer reads words, not meaning.

## 8. Report and clean up

- Tell the user in a few lines: the score line, each planted fault found in
  one line, the new bugs, and the report's path.
- **Hand-off:** each new, high-confidence bug has a `/bug-report` command in
  the report (local records only). Do not run them unless the user asks.
- Close the browser. Stop the server only if you started it. Keep the run
  folder.

## Rules

- Never invent a bug. Noise is worse than silence.
- Never fix code (the planted bugs stay) and never file a GitHub issue.
- The local site only, your own accounts, practice mode for your own session.
- Never read the planted-fault list, or anything that names the planted
  faults, before step 7.
- Never write a secret into a finding, including the passwords you chose.
- Stay inside both caps: page visits and requests sent by hand.
- Change no file outside the run folder (no seed file, no test, no code).

## Done means

- The cap spent or the journeys walked.
- `findings.json` written and scored, `report.md` in the run folder.
- A short summary given to the user.
