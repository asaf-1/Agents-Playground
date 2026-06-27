import type { PageProfile } from "./types";

export type HomePageActionKey =
  | "checkHealth"
  | "dashboardNav"
  | "inspectProduct"
  | "joinNow"
  | "triageInput";

export const homePageProfile: PageProfile<HomePageActionKey> = {
  pageLabel: "Landing Page",
  actions: {
    checkHealth: {
      description: "API health check button",
      intentTokens: ["check", "health", "api"],
      primary: {
        kind: "testId",
        value: "check-health",
      },
      targetType: "button",
    },
    dashboardNav: {
      description: "Dashboard navigation link",
      intentTokens: ["dashboard", "orders", "console"],
      primary: {
        kind: "role",
        name: "Dashboard",
        role: "link",
      },
      targetType: "link",
    },
    inspectProduct: {
      description: "Inspect Product Demo button",
      intentTokens: ["inspect", "product", "demo"],
      primary: {
        kind: "testId",
        value: "inspect-product",
      },
      targetType: "button",
    },
    joinNow: {
      description: "Join Now CTA",
      intentTokens: ["join", "dashboard", "start"],
      primary: {
        kind: "testId",
        value: "join-now",
      },
      targetType: "button",
    },
    triageInput: {
      description: "Quick triage input",
      intentTokens: ["triage", "issue", "summary", "incident"],
      primary: {
        kind: "testId",
        value: "triage-input",
      },
      targetType: "input",
    },
  },
};
