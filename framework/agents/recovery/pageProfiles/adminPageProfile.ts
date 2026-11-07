// The Admin page's actions, for the healing page object in pom/AdminPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type AdminActionKey = "refreshLog" | "clearLog";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const adminPageProfile: PageProfile<AdminActionKey> = {
  pageLabel: "Admin",
  actions: {
    // Reloads the audit log.
    refreshLog: {
      description: "Refresh admin log button",
      intentTokens: ["refresh", "reload", "log"],
      primary: { kind: "testId", value: "refresh-admin-log-btn" },
      targetType: "button",
    },
    // Empties the audit log.
    clearLog: {
      description: "Clear admin log button",
      intentTokens: ["clear", "reset", "log"],
      primary: { kind: "testId", value: "clear-admin-log-btn" },
      targetType: "button",
    },
  },
};
