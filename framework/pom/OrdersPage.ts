// The classic site's Orders page (/orders): the list, its count, the status
// filter and the refresh button.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { ordersPageProfile } from "../agents/recovery/pageProfiles/ordersPageProfile";
import { ordersPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class OrdersPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly ordersList: Locator;
  readonly ordersCount: Locator;
  readonly refreshBtn: Locator;
  readonly statusFilter: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, ordersPageProfile.pageLabel);
    this.heading = page.getByTestId("orders-heading");
    this.ordersList = page.getByTestId("orders-list");
    this.ordersCount = page.getByTestId("orders-count");
    this.refreshBtn = page.getByTestId("refresh-orders-btn");
    this.statusFilter = page.getByTestId("orders-filter-status");
  }

  // Opens the Orders page.
  async goto() {
    await this.page.goto("/orders");
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(ordersPageContract);
  }

  // Presses refresh, with healing.
  async refreshOrders() {
    return this.clickAction(ordersPageProfile.actions.refreshOrders);
  }
}
