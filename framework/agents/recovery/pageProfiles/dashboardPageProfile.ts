import type { PageProfile } from "./types";

export type DashboardPageActionKey = "openBrokenProduct" | "refreshOrders";

export const dashboardPageProfile: PageProfile<DashboardPageActionKey> = {
  pageLabel: "Orders Recovery Console",
  actions: {
    openBrokenProduct: {
      description: "Open Broken Product Profile button",
      intentTokens: ["broken", "product", "profile"],
      primary: {
        kind: "testId",
        value: "open-broken-product",
      },
      targetType: "button",
    },
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
