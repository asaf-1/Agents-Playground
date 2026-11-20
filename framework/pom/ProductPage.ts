// A gear-shop product page (/app/products/:id): its name, SKU, price, stock,
// status and the buy area.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { productPageProfile } from "../agents/recovery/pageProfiles/productPageProfile";
import { productPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class ProductPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly detail: Locator;
  readonly title: Locator;
  readonly price: Locator;
  readonly buyArea: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, productPageProfile.pageLabel);
    this.detail = page.getByTestId("product-detail");
    this.title = page.getByTestId("app-heading");
    this.price = page.getByTestId("product-detail-price");
    this.buyArea = page.getByTestId("product-buy");
  }

  // Opens one product, under a test's own runKey when one is given (the AI
  // agents' broken state is armed per runKey), and waits until it has drawn.
  async goto(id: string, runKey?: string) {
    const query = runKey ? `?runKey=${encodeURIComponent(runKey)}` : "";
    await this.page.goto(`/app/products/${encodeURIComponent(id)}${query}`);
    await this.detail.waitFor({ state: "visible" });
    await this.buyArea.waitFor({ state: "visible" });
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(productPageContract);
  }

  // The healing click back to the product list.
  async backToProducts() {
    return this.clickAction(productPageProfile.actions.backToProducts);
  }
}
