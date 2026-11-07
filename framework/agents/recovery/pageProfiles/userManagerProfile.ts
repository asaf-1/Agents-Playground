// The User Manager page's actions, for the healing page object in
// pom/UserManagerPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type UserManagerActionKey = "addUser" | "refreshUsers" | "searchUsers";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const userManagerProfile: PageProfile<UserManagerActionKey> = {
  pageLabel: "User Manager",
  actions: {
    // Opens the form for a new user.
    addUser: {
      description: "Add new user button",
      intentTokens: ["add", "user", "create", "new"],
      primary: {
        kind: "testId",
        value: "add-user-btn",
      },
      targetType: "button",
    },
    // Loads the user list again.
    refreshUsers: {
      description: "Refresh users list button",
      intentTokens: ["refresh", "reload", "users"],
      primary: {
        kind: "testId",
        value: "refresh-users",
      },
      targetType: "button",
    },
    // The search box above the table.
    searchUsers: {
      description: "Search users input",
      intentTokens: ["search", "filter", "find", "user"],
      primary: {
        kind: "testId",
        value: "user-search",
      },
      targetType: "input",
    },
  },
};
