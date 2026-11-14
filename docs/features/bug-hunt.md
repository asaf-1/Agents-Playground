# Bug hunt

[← Back to the README](../../README.md)

A hunt for bugs nobody wrote a test for, two ways, with the same rules and the
same score. Five walkers go through Playground Bank side by side, open every
page they can reach, press the buttons on their own account, and write down
everything that breaks. Or Claude explores it like a tester
([With Claude](#with-claude-bug-hunt)). Then, and only then, the hunt scores
itself against the bugs planted on purpose. It runs on your PC only, and only
when you ask.

```bash
npm run bug-hunt
```

About a minute and a half, with no AI. At the end it prints where its report
is: `.artifacts/bug-hunt/<time>/report.md`.

## The five walkers

| Walker                 | Signed in as                                                      | Presses buttons         |
| ---------------------- | ----------------------------------------------------------------- | ----------------------- |
| customer, practice off | a fresh customer                                                  | yes, on its own account |
| customer, practice on  | another fresh customer, with practice mode on for its own session | yes, on its own account |
| admin, looking only    | the demo Admin                                                    | no                      |
| support, looking only  | the demo Support                                                  | no                      |
| signed out             | nobody                                                            | no                      |

Each starts at `/app` and at every page in the app's own route table
(`web/src/App.tsx`, read like a sitemap), then follows every link inside the
app. Detail pages (an account, a coin, a product) are found through links, at
most two of each kind. It never presses a button that would sign it out,
delete, remove, revoke, lock, reset or cancel something, switch practice mode,
or make the server fail or stall on purpose (the Orders page's "flaky" and
"slow" demo modes).

## What it notices

- an answer of 500 or more from the site;
- an uncaught error in the page, and errors the page writes to its console;
- a crashed tab, a page that renders nothing, a link to a page the app does not
  have;
- a request that gets no answer, and an answer slower than 2 seconds.

Each finding is checked once more (the page opened again, a failing GET asked
again): seen twice earns high confidence.

## Honest about what it finds

Every finding gets the honesty labels of Debbie O'Brien's `site-bug-hunt`
skill, made our own in `framework/helpers/bugHunt/honesty.json`:

- **classification:** `bug`, `env` or `inconclusive` (only a person or Claude
  can call something `expected-bad-ux` or a `test-gap`);
- **confidence:** high (seen again), medium (seen once), low (suspicious only);
- **severity:** blocker, major, minor or nit;
- **fingerprint:** `local|<page or endpoint>|<symptom>`, so the same problem on
  ten pages is one finding.

Only bugs are counted. A lone console error stays inconclusive: noise is worse
than silence.

## The score

The hunt never looks at the planted-bug list while it walks. Only at the end
does it read it (`GET /api/practice`) and compare:

- **new:** it also happens with practice mode off, so no planted bug caused it;
- **found:** it happens only with practice mode on, where a planted bug lives
  (its endpoint, its page, or the same area, like the page `/app/bank/transfer`
  and the API `/api/bank/transfers`), and it tells the same story: the
  finding's words against the bug's title and hint, with a rare word counting
  more than a common one. That bug must also be clearly ahead of every other
  one there;
- **maybe:** close but not clear (two bugs fit almost equally, or the story
  fits somewhere else), never counted as found;
- **unmatched:** only with practice mode on, but like no planted bug.

Each finding finds one planted bug at most, and the report says on the line
under each finding why it matched: the place and the words in common. One
GraphQL finding can no longer count as every GraphQL bug.

**The walk today: found 0 of 44, 0 new.** No page crashes, gives a server error or has a
dead link, even with every planted bug switched on. That is the honest limit of
a walk with no AI: the planted bugs are quiet. The server answers 200 OK and
the page loads, but the answer is wrong (someone else's payee deleted, money
moved the wrong way, a day missing from a filter). Catching those needs to know
what the right answer is: the test suite does that for each planted bug, and
so can Claude.

## With Claude (`/bug-hunt`)

The `/bug-hunt` skill, in Claude Code, makes Claude the tester. It explores the
bank like a person, as one fresh customer in the browser and a second one
through the API (to check whether one can see or change the other's things),
and looks for the quiet bugs: money that doesn't add up, someone else's data,
a limit not kept, a date range a day short. Each finding is repeated, and tried
once more with practice mode off to tell new from planted. It writes
`.artifacts/bug-hunt/claude-<time>/findings.json` and scores it with the same
scorer:

```bash
npm run bug-hunt:score -- .artifacts/bug-hunt/claude-<time>
```

The score file is refused if a finding breaks the honesty rules (a label that
isn't in `honesty.json`, or high confidence without being seen again).

- **Blind:** until it scores, it may read only its own skill, `honesty.json`
  and what the site shows (the pages, the API docs, the GraphQL explorer). Never
  the code, the tests or the planted-bug list. It must run in a fresh session.
- **Capped:** at most 25 page visits and 60 requests sent by hand (10 and 25
  with `quick`). It runs on your Claude Code plan, not an API key, so every page
  uses some of that plan; the cap keeps a run short. One run sees part of the
  bank's 40 pages, like one tester's session; `/bug-hunt shop` or
  `/bug-hunt markets` spends it on one area.
- **Its browser:** the Chrome DevTools tools, in a page of its own. Never the
  Playwright test tools' set-up, which writes a file into the repository.
- **It never reaches 44:** one planted bug is on the classic site, which the
  hunt never visits, and up to six need staff to refund or change an order
  first, while its staff only look. About 37 are within reach.

**Its first run: found 17 of 44, 3 maybe, and 2 real bugs** that were not
planted (both still there with practice mode off): with euros and German
number settings, the transfer form refused "250,00" although it wrote money
that way itself, and the price ticker and the shop showed dollars while the
rest of the site showed euros. Both are fixed, with tests.

## No upkeep

A new page is opened on the next run, because the hunt reads the route table
each time. New links and buttons are found as it walks, and a new planted bug
is counted, because the list is read fresh at the end. The report names the
pages no walker could reach (today three detail pages a fresh account has no
link to: a support ticket, a shop order, a staff order).

## Proof that a clean report means something

Before any walker starts, a probe (`tests/bug-hunt/hunt-probe.spec.ts`) breaks a
real page on purpose: a console error, an uncaught error, a 503 from the Orders
API's flaky mode, an answer held past 2 seconds, and an address the app does not
have. The hunt only goes on once each one was seen.

## What it never does

It never runs in CI or on a schedule, never touches the live site on Render,
never reads the planted-bug list before the end, never fixes a bug (the planted
ones stay), never files a GitHub issue, and never writes a key, token or
password into a finding. With Claude, it also changes no file outside its run
folder. A new, high-confidence bug is handed to the local `/bug-report` skill:
the report gives the command, and a person adds what the page should show.

## Files

| File                                     | What it does                                          |
| ---------------------------------------- | ----------------------------------------------------- |
| `playwright.bughunt.config.ts`           | Three projects in order: rules, walks, score          |
| `tests/bug-hunt/hunt-logic.spec.ts`      | The hunt's own rules, checked first                   |
| `tests/bug-hunt/hunt-probe.spec.ts`      | Proves the watcher sees each kind of failure          |
| `tests/bug-hunt/walk.spec.ts`            | The five walkers                                      |
| `tests/bug-hunt/score.spec.ts`           | Reads the planted-bug list, scores, writes the report |
| `framework/helpers/bugHunt/walk.ts`      | The watcher and the walk                              |
| `framework/helpers/bugHunt/findings.ts`  | Labels, fingerprints, merging, masking                |
| `framework/helpers/bugHunt/score.ts`     | The score and the report                              |
| `framework/helpers/bugHunt/honesty.json` | The honesty rules                                     |
| `.claude/skills/bug-hunt/SKILL.md`       | The `/bug-hunt` skill, with its journeys and template |
| `scripts/bug-hunt/score.js`              | `npm run bug-hunt:score`: checks and scores a run     |
