// The back office's Orders page actions (/app/orders), for the healing page
// object in pom/OrdersPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type OrdersPageActionKey = "refresh" | "retry";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const ordersPageProfile: PageProfile<OrdersPageActionKey> = {
  pageLabel: "Orders",
  actions: {
    // Refresh. Found by its words first on purpose: the planted HEAL fault
    // ordersRefreshLabel renames it Reload, and the healer must still find it.
    refresh: {
      description: "Refresh orders button",
      intentTokens: ["refresh", "reload", "orders"],
      primary: {
        kind: "role",
        name: "Refresh",
        role: "button",
      },
      targetType: "button",
    },
    // Retry, shown with the error when the orders could not be loaded.
    retry: {
      description: "Retry button on the orders error",
      intentTokens: ["retry", "orders"],
      primary: {
        kind: "testId",
        value: "orders-retry",
      },
      targetType: "button",
    },
  },
};
