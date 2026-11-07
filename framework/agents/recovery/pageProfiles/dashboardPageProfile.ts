// The dashboard's actions, for the healing page object in pom/DashboardPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type DashboardPageActionKey = "openBrokenProduct" | "refreshOrders";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const dashboardPageProfile: PageProfile<DashboardPageActionKey> = {
  pageLabel: "Orders Recovery Console",
  actions: {
    // Opens the product page in its broken state.
    openBrokenProduct: {
      description: "Open Broken Product Profile button",
      intentTokens: ["broken", "product", "profile"],
      primary: {
        kind: "testId",
        value: "open-broken-product",
      },
      targetType: "button",
    },
    // Loads the orders again.
    refreshOrders: {
      description: "Refresh data button",
      intentTokens: ["refresh", "orders", "data"],
      primary: {
        kind: "testId",
        value: "refresh-orders",
      },
      targetType: "button",
    },
  },
};
