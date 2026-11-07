// The classic site's product page (/product/<id>): title, price, summary,
// notes, state and the buy button. A "broken" state is planted on purpose for
// the page checker to catch.

// Playwright's types for a locator and a page, and its expect.
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { productPageProfile } from "../agents/recovery/pageProfiles/productPageProfile";
import { productPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class ProductPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly buyButton: Locator;
  readonly notes: Locator;
  readonly price: Locator;
  readonly state: Locator;
  readonly status: Locator;
  readonly summary: Locator;
  readonly title: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, productPageProfile.pageLabel);
    this.buyButton = page.getByTestId("buy-button");
    this.notes = page.getByTestId("product-notes");
    this.price = page.getByTestId("product-price");
    this.state = page.getByTestId("product-state");
    this.status = page.getByTestId("product-status");
    this.summary = page.getByTestId("product-summary");
    this.title = page.getByTestId("product-title");
  }

  // Opens a product in a state: "valid" by default, or "broken".
  async goto(productId: string, state = "valid") {
    await this.page.goto(`/product/${productId}?state=${state}`);
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(productPageContract);
  }

  // Checks the text of the product's state line.
  async expectStateText(value: string) {
    await expect(this.state).toHaveText(value);
  }

  // Opens manual review, with healing.
  async openManualReview() {
    return this.clickAction(productPageProfile.actions.manualReview);
  }
}
