import type { PageProfile } from "./types";

export type AdminActionKey = "refreshLog" | "clearLog";

export const adminPageProfile: PageProfile<AdminActionKey> = {
  pageLabel: "Admin",
  actions: {
    refreshLog: {
      description: "Refresh admin log button",
      intentTokens: ["refresh", "reload", "log"],
      primary: { kind: "testId", value: "refresh-admin-log-btn" },
      targetType: "button",
    },
    clearLog: {
      description: "Clear admin log button",
      intentTokens: ["clear", "reset", "log"],
      primary: { kind: "testId", value: "clear-admin-log-btn" },
      targetType: "button",
    },
  },
};
