---
name: new-page
description: Scaffold a new self-healing page for this project. Creates the page object, page profile, contract, and fixture wiring. Use when the user wants to add a new page to the framework.
allowed-tools: Read Write Edit Bash Glob
---

The user wants to scaffold a new self-healing page. Page name: $ARGUMENTS

The page is one of Playground Bank's pages under `web/src/pages/` (served at
`/app/...`). The original demo site's pages were removed on 2026-11-20.

Before writing anything, read these files to understand the exact pattern:

- framework/pom/OrdersPage.ts
- framework/pom/SelfHealingPage.ts
- framework/agents/recovery/pageProfiles/homePageProfile.ts
- framework/agents/validation/contracts.ts
- framework/fixtures/baseTest.ts

Then create all four required files:

## 1. framework/pom/<PageName>Page.ts

Extend SelfHealingPage. Define locators using data-testid selectors. Add typed helper methods, and a goto(runKey?) that opens `/app/...?runKey=` the way OrdersPage.ts does. Mirror OrdersPage.ts style exactly.

## 2. framework/agents/recovery/pageProfiles/<pageName>Profile.ts

Define action catalog with intent tokens per interactive element. Each action: primary locator + intentTokens array.

## 3. Add to framework/agents/validation/contracts.ts

New PageContract: requiredTestIds, requiredHeadings, requiredTextTokens, forbiddenTokens ["NaN","undefined","null"], numericFields, overlapPairs.

## 4. Edit framework/fixtures/baseTest.ts

Add new page as typed fixture. Import at top.

After creating all files report: what was created + what testIds the page's React component in `web/src/pages/` needs.
