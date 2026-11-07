// The landing page's actions, for the healing page object in pom/HomePage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type HomePageActionKey =
  "checkHealth" | "dashboardNav" | "inspectProduct" | "joinNow" | "triageInput";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const homePageProfile: PageProfile<HomePageActionKey> = {
  pageLabel: "Landing Page",
  actions: {
    // Calls the API's health check.
    checkHealth: {
      description: "API health check button",
      intentTokens: ["check", "health", "api"],
      primary: {
        kind: "testId",
        value: "check-health",
      },
      targetType: "button",
    },
    // The Dashboard link in the top navigation, found by its role and name.
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
    // Opens the product demo.
    inspectProduct: {
      description: "Inspect Product Demo button",
      intentTokens: ["inspect", "product", "demo"],
      primary: {
        kind: "testId",
        value: "inspect-product",
      },
      targetType: "button",
    },
    // The hero's call to action, renamed from "Sign Up" on purpose.
    joinNow: {
      description: "Join Now CTA",
      intentTokens: ["join", "dashboard", "start"],
      primary: {
        kind: "testId",
        value: "join-now",
      },
      targetType: "button",
    },
    // The quick triage text box.
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
