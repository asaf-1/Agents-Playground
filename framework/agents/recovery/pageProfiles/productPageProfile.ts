import type { PageProfile } from "./types";

export type ProductPageActionKey = "manualReview";

export const productPageProfile: PageProfile<ProductPageActionKey> = {
  pageLabel: "Product Page",
  actions: {
    manualReview: {
      description: "Manual Review button",
      intentTokens: ["manual", "review", "buy", "validate"],
      primary: {
        kind: "testId",
        value: "buy-button",
      },
      targetType: "button",
    },
  },
};
