---
name: new-page
description: Scaffold a new self-healing page for this project. Creates the page object, page profile, contract, and fixture wiring. Use when the user wants to add a new page to the framework.
allowed-tools: Read Write Edit Bash Glob
---

The user wants to scaffold a new self-healing page. Page name: $ARGUMENTS

Project: C:\Users\asafn\Desktop\GenAI+AgenticAI-Demo

Before writing anything, read these files to understand the exact pattern:

- framework/pom/DashboardPage.ts
- framework/pom/SelfHealingPage.ts
- framework/agents/recovery/pageProfiles/homePageProfile.ts
- framework/agents/validation/contracts.ts
- framework/fixtures/baseTest.ts

Then create all four required files:

## 1. framework/pom/<PageName>Page.ts

Extend SelfHealingPage. Define locators using data-testid selectors. Add typed helper methods. Mirror DashboardPage.ts style exactly.

## 2. framework/agents/recovery/pageProfiles/<pageName>Profile.ts

Define action catalog with intent tokens per interactive element. Each action: primary locator + intentTokens array.

## 3. Add to framework/agents/validation/contracts.ts

New PageContract: requiredTestIds, requiredHeadings, requiredTextTokens, forbiddenTokens ["NaN","undefined","null"], numericFields, overlapPairs.

## 4. Edit framework/fixtures/baseTest.ts

Add new page as typed fixture. Import at top.

After creating all files report: what was created + what testIds the HTML needs.
