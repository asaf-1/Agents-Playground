import type { PageProfile } from "./types";

export type OrdersActionKey = "refreshOrders" | "filterStatus";

export const ordersPageProfile: PageProfile<OrdersActionKey> = {
  pageLabel: "Orders",
  actions: {
    refreshOrders: {
      description: "Refresh orders button",
      intentTokens: ["refresh", "reload", "orders"],
      primary: { kind: "testId", value: "refresh-orders-btn" },
      targetType: "button",
    },
    filterStatus: {
      description: "Order status filter select",
      intentTokens: ["status", "filter", "orders"],
      primary: { kind: "testId", value: "orders-filter-status" },
      targetType: "select",
    },
  },
};
