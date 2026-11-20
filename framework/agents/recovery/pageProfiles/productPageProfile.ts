// A gear-shop product page's actions (/app/products/:id), for the healing page
// object in pom/ProductPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type ProductPageActionKey = "backToProducts";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const productPageProfile: PageProfile<ProductPageActionKey> = {
  pageLabel: "Product",
  actions: {
    // The breadcrumb's way back to every product.
    backToProducts: {
      description: "Products breadcrumb link",
      intentTokens: ["products", "back"],
      primary: {
        kind: "testId",
        value: "product-back",
      },
      targetType: "link",
    },
  },
};
