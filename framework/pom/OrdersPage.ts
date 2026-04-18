import type { Locator, Page } from "@playwright/test";
import { ordersPageProfile } from "../agents/recovery/pageProfiles/ordersPageProfile";
import { ordersPageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class OrdersPage extends SelfHealingPage {
  readonly heading: Locator;
  readonly ordersList: Locator;
  readonly ordersCount: Locator;
  readonly refreshBtn: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    super(page, ordersPageProfile.pageLabel);
    this.heading = page.getByTestId("orders-heading");
    this.ordersList = page.getByTestId("orders-list");
    this.ordersCount = page.getByTestId("orders-count");
    this.refreshBtn = page.getByTestId("refresh-orders-btn");
    this.statusFilter = page.getByTestId("orders-filter-status");
  }

  async goto() {
    await this.page.goto("/orders");
  }

  async expectLoaded() {
    return this.validateContractOrThrow(ordersPageContract);
  }

  async refreshOrders() {
    return this.clickAction(ordersPageProfile.actions.refreshOrders);
  }
}
