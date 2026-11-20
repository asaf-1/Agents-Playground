// The back office's Users page actions (/app/users), for the healing page
// object in pom/UsersPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type UsersPageActionKey =
  "openCreate" | "createName" | "submitCreate" | "search";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const usersPageProfile: PageProfile<UsersPageActionKey> = {
  pageLabel: "Users",
  actions: {
    // New user, in the page heading: opens the Create user dialog.
    openCreate: {
      description: "New user button",
      intentTokens: ["new", "user", "create", "add"],
      primary: {
        kind: "testId",
        value: "users-create-open",
      },
      targetType: "button",
    },
    // The dialog's Name field.
    createName: {
      description: "Create user dialog name field",
      intentTokens: ["name", "user"],
      primary: {
        kind: "testId",
        value: "users-create-name",
      },
      targetType: "input",
    },
    // The dialog's Create button.
    submitCreate: {
      description: "Create user dialog submit button",
      intentTokens: ["create", "submit", "user"],
      primary: {
        kind: "testId",
        value: "users-create-submit",
      },
      targetType: "button",
    },
    // The search box above the table.
    search: {
      description: "Search users by name",
      intentTokens: ["search", "users", "name"],
      primary: {
        kind: "testId",
        value: "users-search",
      },
      targetType: "input",
    },
  },
};
