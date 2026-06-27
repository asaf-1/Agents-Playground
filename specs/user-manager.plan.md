# User Manager Test Plan

_Authored from source analysis of `public/user-manager.html` + `public/user-manager.js` (the live-browser planner agent runs in the interactive Claude Code session; this plan matches its output format so `playwright-test-generator` can consume it directly). Seed: `tests/e2e/seed.spec.ts`. All generated files target `tests/e2e/generated/`._

## Application Overview

The User Manager page (`/user-manager`) is a user directory backed by the local API. On load it
fetches `GET /api/users` and renders the seeded users (USR-001 Alice Northwind / Admin / Active,
USR-002 Bob Harbor / Editor / Active, USR-003 Carol Cedar / Viewer / Inactive) into a table.

Interactive features:

- **Search** (`data-testid=user-search`) — client-side filter over name, role, and status (case-insensitive).
- **Role filter** (`data-testid=role-filter`) — All / Admin / Editor / Viewer.
- **Add User** (`data-testid=add-user-btn`) — fires **two native `window.prompt()` dialogs** in order
  (name, then role), POSTs `/api/users`, and prepends the new user. Empty name cancels; empty role defaults to "Viewer".
- **Refresh** (`data-testid=refresh-users`) — reloads the directory.
- **Bulk Actions** (`data-testid=bulk-actions-btn`) — toggles a menu (`data-testid=bulk-actions-menu`)
  containing **Invite User** (`data-testid=open-invite-modal`) and **Refresh Directory** (`data-testid=refresh-directory`); closes on outside click.
- **Invite modal** (`data-testid=invite-dialog`) — email field (`data-testid=invite-email`),
  **Send Invite** (`data-testid=confirm-invite`), **Close** (`data-testid=close-invite`); backdrop click closes.
- **View** (`data-testid=view-user-action`) on each row writes the selection to `data-testid=selected-user-output`.
- A **user count** (`data-testid=user-count`) reflects the filtered row total.

Determinism notes for generation:

- **Add User mutates server state** (`runtimeState.managedUsers`). Any add-user test must first
  `POST /api/test/reset-users` (the only reset hook) so it is repeatable across reruns.
- The two Add-User prompts are native dialogs — register `page.on('dialog', d => d.accept(value))`
  handlers **before** clicking, answering name first, then role.
- Do not confuse the prompt-based Add User with the modal-based Invite flow.

## Test Scenarios

### 1. User Manager

**Seed:** `tests/e2e/seed.spec.ts`

#### 1.1. Directory loads the seeded users

**File:** `tests/e2e/generated/user-manager-directory-loads.spec.ts`

**Steps:**

1. Navigate to /user-manager

   - expect: The heading "User Manager" is visible

2. Wait for the directory to finish loading

   - expect: Three user rows are visible
   - expect: The user count shows 3
   - expect: The names Alice Northwind, Bob Harbor, and Carol Cedar are each visible
   - expect: Carol Cedar's status reads Inactive

#### 1.2. Search filters the directory by name

**File:** `tests/e2e/generated/user-manager-search-by-name.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load

   - expect: The user count shows 3

2. Type "alice" into the search box

   - expect: Exactly one user row is visible
   - expect: That row shows Alice Northwind
   - expect: The user count shows 1

#### 1.3. Searching with no matches shows the empty state

**File:** `tests/e2e/generated/user-manager-search-no-results.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load
2. Type "zzz" into the search box

   - expect: The text "No users found." is visible
   - expect: No user rows are visible
   - expect: The user count shows 0

#### 1.4. Role filter narrows the directory

**File:** `tests/e2e/generated/user-manager-role-filter.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load
2. Select the role filter value "Admin"

   - expect: Exactly one row is visible showing Alice Northwind
   - expect: The user count shows 1

3. Select the role filter value "Viewer"

   - expect: Exactly one row is visible showing Carol Cedar
   - expect: The user count shows 1

4. Select the role filter value "All roles"

   - expect: Three rows are visible
   - expect: The user count shows 3

#### 1.5. Combined search and role filter

**File:** `tests/e2e/generated/user-manager-search-and-role-filter.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load
2. Select the role filter value "Editor"

   - expect: Exactly one row is visible showing Bob Harbor

3. Type "bob" into the search box

   - expect: Exactly one row is visible showing Bob Harbor
   - expect: The user count shows 1

4. Type "alice" into the search box (replacing "bob")

   - expect: No user rows are visible (Alice is Admin, filtered out by the Editor role)
   - expect: The user count shows 0

#### 1.6. Add a new user via the Add User dialog

**File:** `tests/e2e/generated/user-manager-add-user.spec.ts`

**Steps:**

1. Reset managed users by sending POST /api/test/reset-users, then navigate to /user-manager and wait for the three rows to load

   - expect: The user count shows 3

2. Register dialog handlers that accept "Dana Spruce" for the name prompt and "Editor" for the role prompt, then click Add User

   - expect: A new row showing Dana Spruce with role Editor is visible
   - expect: The user count shows 4
   - expect: The selection output reads "Added Dana Spruce as Editor."

#### 1.7. Cancelling Add User leaves the directory unchanged

**File:** `tests/e2e/generated/user-manager-add-user-cancel.spec.ts`

**Steps:**

1. Reset managed users by sending POST /api/test/reset-users, then navigate to /user-manager and wait for the three rows to load

   - expect: The user count shows 3

2. Register a dialog handler that dismisses (cancels) the name prompt, then click Add User

   - expect: Still exactly three user rows are visible
   - expect: The user count still shows 3

#### 1.8. Viewing a user shows their details

**File:** `tests/e2e/generated/user-manager-view-user.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load

   - expect: The selection output reads "No user selected yet."

2. Click the View action on Alice Northwind's row

   - expect: The selection output reads "Viewing Alice Northwind (Admin)."

#### 1.9. Bulk Actions menu opens and closes

**File:** `tests/e2e/generated/user-manager-bulk-actions-menu.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load
2. Click the Bulk Actions button

   - expect: The bulk actions menu is visible
   - expect: The Bulk Actions button has aria-expanded set to "true"
   - expect: The "Invite User" and "Refresh Directory" menu items are visible

3. Click on the page heading (outside the menu)

   - expect: The bulk actions menu is hidden
   - expect: The Bulk Actions button has aria-expanded set to "false"

#### 1.10. Invite a teammate via the invite modal

**File:** `tests/e2e/generated/user-manager-invite-user.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load
2. Click Bulk Actions, then click Invite User

   - expect: The bulk actions menu is hidden
   - expect: The invite dialog is visible

3. Type "teammate@company.com" into the work email field and click Send Invite

   - expect: The invite dialog is hidden
   - expect: The selection output reads "Prepared invite for teammate@company.com."

#### 1.11. Closing the invite modal sends nothing

**File:** `tests/e2e/generated/user-manager-invite-close.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load
2. Click Bulk Actions, then click Invite User

   - expect: The invite dialog is visible

3. Click the Close button

   - expect: The invite dialog is hidden
   - expect: The selection output still reads "No user selected yet."

#### 1.12. Refreshing the directory reloads users

**File:** `tests/e2e/generated/user-manager-refresh.spec.ts`

**Steps:**

1. Navigate to /user-manager and wait for the three rows to load
2. Click the Refresh button

   - expect: Three user rows are still visible
   - expect: The user count shows 3
   - expect: The selection output reads "User directory refreshed."
