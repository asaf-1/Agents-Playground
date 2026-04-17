import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { productPageProfile } from "../agents/recovery/pageProfiles/productPageProfile";
import { productPageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class ProductPage extends SelfHealingPage {
  readonly buyButton: Locator;
  readonly notes: Locator;
  readonly price: Locator;
  readonly state: Locator;
  readonly status: Locator;
  readonly summary: Locator;
  readonly title: Locator;

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

  async goto(productId: string, state = "valid") {
    await this.page.goto(`/product/${productId}?state=${state}`);
  }

  async expectLoaded() {
    return this.validateContractOrThrow(productPageContract);
  }

  async expectStateText(value: string) {
    await expect(this.state).toHaveText(value);
  }

  async openManualReview() {
    return this.clickAction(productPageProfile.actions.manualReview);
  }
}
