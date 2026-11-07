// The product page's action, for the healing page object in pom/ProductPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The name of the page's one action.
export type ProductPageActionKey = "manualReview";

// The action: its first locator, and the words the healer looks for when that
// locator fails.
export const productPageProfile: PageProfile<ProductPageActionKey> = {
  pageLabel: "Product Page",
  actions: {
    // The button that opens manual review (its test id is still "buy-button").
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
