// The Orders page's actions, for the healing page object in pom/OrdersPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type OrdersActionKey = "refreshOrders" | "filterStatus";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const ordersPageProfile: PageProfile<OrdersActionKey> = {
  pageLabel: "Orders",
  actions: {
    // Loads the orders again.
    refreshOrders: {
      description: "Refresh orders button",
      intentTokens: ["refresh", "reload", "orders"],
      primary: { kind: "testId", value: "refresh-orders-btn" },
      targetType: "button",
    },
    // The status filter.
    filterStatus: {
      description: "Order status filter select",
      intentTokens: ["status", "filter", "orders"],
      primary: { kind: "testId", value: "orders-filter-status" },
      targetType: "select",
    },
  },
};
