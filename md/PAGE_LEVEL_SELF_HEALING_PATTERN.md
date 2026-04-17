# Page-Level Self-Healing Pattern

Use this file when you want all tests for a page to benefit from the same self-healing behavior.

## Goal

Do not let each test own raw UI locators for a page.

Instead, every page should have:

- one page object
- one page profile
- one page contract
- shared fixture access
- tests that call page methods instead of raw interactive locators

That is how one healing improvement can fix many tests at once.

## Current Repo Pattern

The current demo now uses this structure for the existing pages:

- `framework/pom/SelfHealingPage.ts`
  - shared click and fill helpers with recovery-router fallback
- `framework/agents/recovery/pageProfiles/`
  - page-specific action intents
- `framework/pom/HomePage.ts`
- `framework/pom/DashboardPage.ts`
- `framework/pom/ProductPage.ts`
- `framework/fixtures/baseTest.ts`
  - injects the page objects into tests

Current page profiles:

- `homePageProfile.ts`
- `dashboardPageProfile.ts`
- `productPageProfile.ts`

## Rule For New Pages

For every important page, create four things.

### 1. Page object

Example:

- `framework/pom/UserManagerPage.ts`

It should expose business actions, not raw locator strings:

- `goto()`
- `expectLoaded()`
- `openCreateUser()`
- `searchUser(value)`
- `openUserRow(email)`
- `assignRole(role)`
- `saveChanges()`

### 2. Page profile

Example:

- `framework/agents/recovery/pageProfiles/userManagerPageProfile.ts`

This should define action intents for the page:

- create user button
- search input
- role dropdown
- save button
- invite button
- delete button

Each action should include:

- target type
- primary locator
- intent tokens
- human description

### 3. Page contract

Add a contract in:

- `framework/agents/validation/contracts.ts`

Use it for:

- required headings
- required roles
- stable text signals
- forbidden text signals
- numeric or render checks when needed

The contract should prove the page is the correct page before tests keep going.

### 4. Fixture access

Expose the page object from:

- `framework/fixtures/baseTest.ts`

That lets tests do this:

```ts
test("user manager flow", async ({ userManagerPage }) => {
  await userManagerPage.goto();
  await userManagerPage.expectLoaded();
  await userManagerPage.openCreateUser();
});
```

## How The Healing Works

For every page action:

1. Try the primary locator first.
2. If it works, continue normally.
3. If it fails, send the failure to `RecoveryRouter`.
4. Let `GenericLocatorHealer` score live candidates by:
   - text
   - role
   - `data-testid`
   - label
   - placeholder
   - class hints
   - position
5. Use the recovered element if confidence is good enough.
6. Keep the permanent fix suggestion in the artifacts and reports.

## What This Solves Well

- `data-testid` renames when the element meaning is still clear
- button text changes
- link text changes
- input placeholder or label changes
- small DOM refactors
- component-library churn

## What Should Still Fail

- removed functionality
- changed business logic
- changed permissions
- broken backend behavior
- flows that are no longer semantically the same

If the page meaning changed, diagnose it instead of healing it.

## Rules For Tests

- Tests should use page objects for UI actions.
- Tests may still use raw stale locators in dedicated healing scenarios.
- Assertions should prefer page methods and page contracts for page-level confidence.
- Raw direct interactive locators should be treated as exceptions, not the default style.

## User Manager Example

If a dev changes:

- `data-testid="create-user-button"` to `data-testid="add-user-button"`

and the control still behaves like the same Create User action, then:

- `UserManagerPage.openCreateUser()` should still work
- all tests that call `openCreateUser()` should benefit
- only the page profile or page object may need updating later for the permanent fix

## Implementation Checklist For A New Page

1. Create the page object.
2. Create the page profile.
3. Add the page contract.
4. Add the fixture in `baseTest.ts`.
5. Refactor tests to use the page object methods.
6. Add one stale-locator scenario for the page.
7. Add one page-contract validation.
8. Run the focused tests first.
9. Run `npm run test:e2e`.

## Ready-To-Paste Prompt

```text
Implement page-level self-healing for this page. Create a page object, a page profile with action intents, and a page contract. Expose the page object through framework/fixtures/baseTest.ts and refactor the current UI-facing tests to use page methods instead of owning raw interactive locators. Keep dedicated stale-locator scenarios as explicit exceptions. Then run focused Playwright validation and the full suite.
```
