import type { PageProfile } from "./types";

export type UserManagerActionKey = "addUser" | "refreshUsers" | "searchUsers";

export const userManagerProfile: PageProfile<UserManagerActionKey> = {
  pageLabel: "User Manager",
  actions: {
    addUser: {
      description: "Add new user button",
      intentTokens: ["add", "user", "create", "new"],
      primary: {
        kind: "testId",
        value: "add-user-btn"
      },
      targetType: "button"
    },
    refreshUsers: {
      description: "Refresh users list button",
      intentTokens: ["refresh", "reload", "users"],
      primary: {
        kind: "testId",
        value: "refresh-users"
      },
      targetType: "button"
    },
    searchUsers: {
      description: "Search users input",
      intentTokens: ["search", "filter", "find", "user"],
      primary: {
        kind: "testId",
        value: "user-search"
      },
      targetType: "input"
    }
  }
};
