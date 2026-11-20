// The bank home page's actions (/app), for the healing page object in
// pom/HomePage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type HomePageActionKey = "openOrders" | "openUsers" | "startPracticing";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const homePageProfile: PageProfile<HomePageActionKey> = {
  pageLabel: "Home",
  actions: {
    // The back office's Orders link, on the Back office card.
    openOrders: {
      description: "Back office Orders link",
      intentTokens: ["orders", "back", "office"],
      primary: {
        kind: "testId",
        value: "hub-link-orders",
      },
      targetType: "link",
    },
    // The back office's Users link, on the same card.
    openUsers: {
      description: "Back office Users link",
      intentTokens: ["users", "back", "office"],
      primary: {
        kind: "testId",
        value: "hub-link-users",
      },
      targetType: "link",
    },
    // The hero's call to action, which opens the Practice page.
    startPracticing: {
      description: "Start practicing call to action",
      intentTokens: ["start", "practicing", "practice"],
      primary: {
        kind: "role",
        name: "Start practicing",
        role: "link",
      },
      targetType: "link",
    },
  },
};
