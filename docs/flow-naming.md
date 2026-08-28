# Flow naming: what shipped and why

Status: **applied.** Every name below is live in `scripts/test-runner/flow-groups.json`
and in the generator in `scripts/test-runner/discover-flows.js`. `npm run flows:check`
reports the catalog current at 63 flows and 142 E2E tests, and the flow **ids are
unchanged** — 0 added, 0 removed, order identical — because ids are referenced from
`.github/workflows/`, from docs and from people's bookmarks.

This file is kept as the record of the reasoning, not as a to-do. Do not re-apply it.

## Why

The runner board currently shows cards reading "Sanity smoke / group-sanity",
"Non-functional quality / group-nonfunctional" and "React surface / group-app". Every one of those
names is insider vocabulary: it tells a colleague which folder the file lives in, not what pressing
RUN will check. The user's words: "the names doesnt make sense to me. what is group sanity ?"

## Hard constraints

- **Flow ids never change.** They appear in `.github/workflows/`, in docs, in bookmarks and in run
  titles. Only the `name` and `description` fields change. Ids are generated from
  `idSource(specPath)` before any naming rule runs, so nothing here can move them.
- Names render on cards. Keep them under 40 characters; 38 is the working cap.
- Do not name the tool (Playwright, Vitest) unless the tool is the thing being tested.
- Every description answers the question that always comes next: how long will this take.
- `name` and `description` are display-only. `grep`, `specs`, `path`, `runner` and `maxShards` are
  the fields the executor reads, and nothing asserts on names. Verified by grepping `flow.name`
  usage across `scripts/test-runner/`, `test-runner/` and `.github/workflows/`.

## Shared vocabulary

Four lookup tables drive both parts, so the whole board speaks one language.

`ABBREVIATIONS` (casing only): `api` to API, `openapi` to OpenAPI, `ui` to UI, `spa` to SPA,
`cta` to CTA, `rbac` to RBAC, `rhf` to React Hook Form, `a11y` to accessibility, `e2e` to browser.

`PLAIN_WORDS` (jargon to plain English): `smoke` and `sanity` to quick check, `regression` to full
sweep, `surface` to app, `non-functional` to page speed and rendering, `contract governance` to API
shape, `healing` to repair, `enricher` to rewriter, `drift` to unexpected change, `parametrized` to
every item.

`AREA_LABELS` (folder to card prefix): `sanity` to "Quick check", `functional` to "Journeys",
`contracts` to "API contract", `app` to "React app", `scenarios` to "Self-repair",
`non-functional` to "Quality", `generated` to "Generated", `visual` and `root` to "Screenshots".

`COMPOUNDS` (survive the hyphen split): non-functional, sign-up, self-healing, self-repair,
single-page, end-to-end.

---

## Part 1 - the 10 curated groups

Ids unchanged. Character counts in brackets.

| id (unchanged)        | before                           | after                                        |
| --------------------- | -------------------------------- | -------------------------------------------- |
| `group-sanity`        | Sanity smoke                     | **Quick check: home, orders, product** [34]  |
| `group-sanity-all`    | Sanity (all)                     | **Quick check: all 7 pages** [24]            |
| `group-regression`    | Full E2E regression              | **Everything: all browser tests** [29]       |
| `group-functional`    | Functional (positive + negative) | **Sign-up, orders, and error messages** [35] |
| `group-contract`      | API contract governance          | **API replies match the API docs** [30]      |
| `group-app`           | React surface                    | **React app at /app: every screen** [31]     |
| `group-scenarios`     | Agent scenarios                  | **Self-repair and failure triage** [30]      |
| `group-nonfunctional` | Non-functional quality           | **Page speed and broken layouts** [29]       |
| `group-visual`        | Visual regression                | **Screenshot comparison** [21]               |
| `group-unit`          | Unit (Vitest)                    | **React component logic (no browser)** [34]  |

### How the menu reads

The two quick checks are a deliberate pair, so the ladder is obvious at a glance: three pages, then
all seven, then everything. `group-app` is the only card that names `/app`, because it is the only
one aimed at the React surface rather than the classic pages. `group-functional` earns its place
next to the quick checks by advertising what it uniquely checks, the error messages.
`group-scenarios` and `group-nonfunctional` no longer describe themselves by what they are not.

### New descriptions

- `group-sanity` - One browser pass over the landing page, the orders dashboard and a healthy
  product page: content draws, the health button really reaches `/api/health`, and three order rows
  arrive. 1 check, a few seconds once the app is built.
- `group-sanity-all` - The quick check plus the four newer pages (orders, admin, profile,
  settings): each draws its content, reacts to its main button, and prints no "undefined" or "NaN".
  5 checks, well under a minute.
- `group-regression` - Every browser test under `tests/e2e` in one run: quick checks, journeys, API
  shapes, the React app and the self-repair scenarios. 142 checks, the slowest choice: minutes even
  split across 8 machines.
- `group-functional` - Sign-up, the orders list and the product page when everything is healthy,
  and, when the data is wrong or the orders service is down, a clear error naming the field at
  fault instead of a blank screen or "NaN". 3 checks, seconds.
- `group-contract` - Calls the data endpoints with no browser and checks every reply still carries
  the fields, names and types the screens read and `openapi.json` promises, including that the one
  known-bad request still fails in the documented way. 10 checks, a couple of seconds.
- `group-app` - Clicks through every screen of the React app at `/app` (products, orders, users,
  account), checking each shows the right data, rejects bad input, recovers from a failed request,
  and passes an accessibility scan. 81 checks, about a minute locally, several on CI.
- `group-scenarios` - Breaks the app on purpose (renames buttons, sends a bad request, expires a
  login, fails a data load), then checks the repair and triage tools notice, fix or correctly
  explain each one and never act on a low-confidence guess or in production. 48 checks, the slowest
  single area: several minutes, much of it deliberate waiting.
- `group-nonfunctional` - Times the health endpoint and the orders dashboard against fixed budgets,
  confirms the product page still renders at phone width with no overlapping Buy button or garbled
  price, and proves the broken-page detector still fails on a broken page. 2 checks, 20-30 seconds,
  most of it a deliberate delay.
- `group-visual` - Photographs `/app/orders` and compares it pixel-for-pixel with the committed
  reference image. 1 check, seconds, but run it only on the machine that made the references: a
  Windows baseline fails on the Linux runner.
- `group-unit` - React component and formatting-helper tests, straight in Node with no browser and
  no app server. 4 tests in 2 files, a couple of seconds, the cheapest thing on the board.

### One tag correction to apply with the rename

`group-nonfunctional` carries the tag `a11y` and its old description claimed "Accessibility and
quality checks", but `tests/e2e/non-functional/non-functional-quality.spec.ts` contains no
accessibility assertion at all. The real axe scans live in `tests/e2e/app/react-a11y.spec.ts`,
which belongs to `group-app`. Proposal: `group-nonfunctional` tags become `["quality", "fast"]` and
`group-app` tags become `["ui", "react", "a11y"]`. Tags feed the board's search text and up to four
chips per card; no workflow filters on them.

### Ready to apply

```json
{ "id": "group-sanity",        "name": "Quick check: home, orders, product" }
{ "id": "group-sanity-all",    "name": "Quick check: all 7 pages" }
{ "id": "group-regression",    "name": "Everything: all browser tests" }
{ "id": "group-functional",    "name": "Sign-up, orders, and error messages" }
{ "id": "group-contract",      "name": "API replies match the API docs" }
{ "id": "group-app",           "name": "React app at /app: every screen" }
{ "id": "group-scenarios",     "name": "Self-repair and failure triage" }
{ "id": "group-nonfunctional", "name": "Page speed and broken layouts" }
{ "id": "group-visual",        "name": "Screenshot comparison" }
{ "id": "group-unit",          "name": "React component logic (no browser)" }
```

Editing `flow-groups.json` makes the committed catalog stale, so
`node scripts/test-runner/discover-flows.js` has to run in the same commit or the `--check` job in
`.github/workflows/flow-catalog.yml` fails.

---

## Part 2 - rules for the 53 auto-generated flows

### What the code does today

`discover-flows.js` builds two auto tiers:

- spec flows (36): `name: humanize(file.specPath)` takes the last path segment, strips `.spec.ts`,
  turns `[-_]+` into spaces and uppercases the first letter only. Produces "Api openapi contract",
  "Rbac", "Ui change healing", "Non functional quality", "Visual".
- suite flows (17): `name: describe.title` verbatim. Produces "non-functional quality gates"
  (lowercase), "NarrativeEnricher" (camelCase), "React surface visual snapshots" (jargon).

Both descriptions are templates that say nothing useful: `Every test in <path>.` and
`The "<title>" block in <path>.`

The 12 rules below replace `humanize()`. Note that the shipped code names the helper
`renderName()`, not the `displayName()` this plan proposed. The rules below replace the
two description templates with a generated one. `idSource()` and `makeId()` are not touched, so
every id in `flow-catalog.json` stays byte-identical.

### The rules

**R1 - Expand abbreviations from `ABBREVIATIONS` before any casing.**
`spec-app-api-openapi-contract`: "Api openapi contract" -> "API: OpenAPI contract"

**R2 - Split camelCase and PascalCase describe titles into words.**
`suite-scenarios-narrative-enricher-narrativeenricher`: "NarrativeEnricher" -> "Narrative rewriter"

**R3 - Collapse tokens repeated between area, file name and describe title (case-insensitive).**
Needed because R6 adds an area prefix that would otherwise duplicate the file name.
`suite-visual-visual-react-surface-visual-snapshots`: "React surface visual snapshots" ->
"Screenshots: /app/orders" (both `visual` tokens and `snapshots` collapse into the area label)
`spec-visual-visual`: "Visual" -> "Screenshots: /app/orders" (then R10 disambiguates the pair)

**R4 - Sentence case with small-word and dictionary exceptions**, instead of uppercasing only the
first character. Small words stay lowercase (a, an, and, the, of, in, to, for, with); dictionary
casing wins (API, UI, SPA, RBAC, OpenAPI, axe).
`suite-non-functional-non-functional-quality-non-functional-quality-gates`:
"non-functional quality gates" -> "Page speed and rendering gates"

**R5 - Keep `COMPOUNDS` hyphenated** instead of turning every hyphen into a space.
`spec-non-functional-non-functional-quality`: "Non functional quality" -> "Non-functional quality"
(R8 then rewrites the phrase; the point of R5 is that the hyphen survives the split)

**R6 - Prefix the area label from `AREA_LABELS`** so related cards sort and scan together, skipping
the prefix when the name already starts with that word.
`spec-scenarios-policy-engine`: "Policy engine" -> "Self-repair: policy engine"
`spec-app-react-orders`: "React orders" -> "React app: orders screen"
`spec-sanity-new-pages`: "New pages" -> "Quick check: the four newer pages"

**R7 - Prefer the describe title over the path for a spec flow when the file has exactly one
describe block and that title is more informative** (longer, or containing a word the path lacks),
then run R1 to R6 on it. Files with two or more describes keep the path-derived name.
`spec-app-react-shell`: "React shell" -> "React app: single-page shell"
Guard cases: `spec-app-react-products` has two describes so it stays path-derived, and
`spec-scenarios-rbac`'s only describe is "RBAC", no more informative than the path, so it stays too.

**R8 - Substitute `PLAIN_WORDS` in any segment**, using the same table as the curated 10.
`spec-app-react-a11y`: "React a11y" -> "React app: accessibility scan"
`spec-scenarios-ui-change-healing`: "Ui change healing" -> "Self-repair: UI change repair"
`spec-functional-negative-functional-negative`: "Functional negative" -> "Journeys: error paths"

**R9 - Cap the rendered name at 38 characters**, shedding in this order: drop the area prefix (the
board already groups by area), drop a trailing parenthetical, then trim at a word boundary. Never
truncate mid-word.
`suite-app-react-products-react-product-detail-parametrized-across-the-catalog`:
"React Product detail (parametrized across the catalog)" [53] -> "Product detail, every catalog item" [34]
`spec-scenarios-failure-classification-and-patch-proposal`:
"Failure classification and patch proposal" [41] -> "Failure sorting and patch proposal" [34]

**R10 - Disambiguate names that would render identically.** A spec flow and its single describe
block currently produce two cards with the same text; suffix the suite one with "(one block)".
Real collisions in today's catalog: "Auth session", "Seed", and "Rbac" against "RBAC".
`spec-scenarios-auth-session` -> "Self-repair: sign-in and session"
`suite-scenarios-auth-session-auth-session` -> "Sign-in and session (one block)"

**R11 - Generate descriptions that carry the count and the cost, and keep the file path in the
description, never in the name.** Shape: `<n> checks in <path>. <cost hint>.` The cost hint comes
from `testCount` and `runner`: 1-3 gives "seconds", 4-20 "under a minute", 21-60 "1-2 minutes
locally, longer on CI", 60+ "several minutes"; `playwright-visual` appends the existing baseline
warning and `vitest` gives "no browser, seconds".
`spec-app-react-products`: "Every test in tests/e2e/app/react-products.spec.ts." -> "57 checks in
tests/e2e/app/react-products.spec.ts, the catalog plus all 48 product pages. 1-2 minutes locally,
longer on CI."

**R12 - Ids are computed before naming and are never derived from the display name.** `makeId()`
keeps consuming `idSource(specPath)` and the raw describe title, so the ugly-but-stable strings
survive intact.
`spec-scenarios-rbac`: id stays `spec-scenarios-rbac`, name "Rbac" -> "Self-repair: role permissions"

### Sample of the result

| id (unchanged)             | before       | after                             |
| -------------------------- | ------------ | --------------------------------- |
| `spec-sanity-sanity-smoke` | Sanity smoke | Quick check: the three main pages |

> This one deliberately differs from `group-sanity`'s "Quick check: home, orders,
> product", even though the group runs this exact file. Two cards reading the same
> words help nobody, so the spec-level card names the shape and the group names the
> pages. The generator comment says the same thing at the point of decision.
> | `spec-sanity-new-pages` | New pages | Quick check: the four newer pages |
> | `spec-functional-positive-functional-positive` | Functional positive | Journeys: healthy paths |
> | `spec-functional-negative-functional-negative` | Functional negative | Journeys: error paths |
> | `spec-contracts-api-contract-governance` | Api contract governance | API contract: reply shapes |
> | `spec-app-api-openapi-contract` | Api openapi contract | API: OpenAPI contract |
> | `spec-app-react-a11y` | React a11y | React app: accessibility scan |
> | `spec-app-react-orders` | React orders | React app: orders screen |
> | `spec-app-react-products` | React products | React app: catalog and 48 items |
> | `spec-app-react-shell` | React shell | React app: single-page shell |
> | `spec-app-react-users` | React users | React app: users screen |
> | `spec-scenarios-rbac` | Rbac | Self-repair: role permissions |
> | `spec-scenarios-ui-change-healing` | Ui change healing | Self-repair: UI change repair |
> | `spec-scenarios-narrative-enricher` | Narrative enricher | Self-repair: failure text rewriter |
> | `spec-non-functional-non-functional-quality` | Non functional quality | Quality: speed and layout |
> | `spec-visual-visual` | Visual | Screenshots: /app/orders |
> | `suite-visual-visual-react-surface-visual-snapshots` | React surface visual snapshots | Screenshots: /app/orders (one block) |
> | `suite-scenarios-auth-session-auth-session` | Auth session | Sign-in and session (one block) |

### Where it actually lives

The plan in this file proposed a `displayName()` helper. That is **not** what was
built, and no `displayName` exists in the codebase — chasing that name will waste
your time. The shipped implementation in `scripts/test-runner/discover-flows.js`
uses `renderName()`, `cardParts()` and `toPhrase()` instead, and the file grew by
roughly 646 lines, so any line number this document once quoted is meaningless now.

Read the functions by name. The hand-written group names live in
`scripts/test-runner/flow-groups.json`; everything else is generated.
