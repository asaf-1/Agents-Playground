import type { Locator, Page } from "@playwright/test";
import { dashboardPageProfile } from "../agents/recovery/pageProfiles/dashboardPageProfile";
import { dashboardPageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class DashboardPage extends SelfHealingPage {
  readonly heading: Locator;
  readonly ordersError: Locator;
  readonly ordersRows: Locator;
  readonly ordersStatus: Locator;
  readonly refreshButton: Locator;
  readonly spinner: Locator;

  constructor(page: Page) {
    super(page, dashboardPageProfile.pageLabel);
    this.heading = page.getByRole("heading", { name: "Orders Recovery Console" });
    this.ordersError = page.getByTestId("orders-error");
    this.ordersRows = page.locator("[data-testid='orders-row']");
    this.ordersStatus = page.getByTestId("orders-status");
    this.refreshButton = page.getByTestId("refresh-orders");
    this.spinner = page.getByTestId("orders-spinner");
  }

  async goto(mode = "stable", delayMs?: number) {
    const params = new URLSearchParams({ mode });

    if (typeof delayMs === "number") {
      params.set("delayMs", String(delayMs));
    }

    await this.page.goto(`/dashboard?${params.toString()}`);
  }

  async expectLoaded() {
    return this.validateContractOrThrow(dashboardPageContract);
  }

  async openBrokenProductProfile() {
    return this.clickAction(dashboardPageProfile.actions.openBrokenProduct);
  }

  async refreshOrders() {
    return this.clickAction(dashboardPageProfile.actions.refreshOrders);
  }

  async waitForOrdersLoaded(expectedCount = 3, timeoutMs = 5000) {
    await this.ordersRows.first().waitFor({ state: "visible", timeout: timeoutMs });
    const count = await this.ordersRows.count();

    if (count !== expectedCount) {
      throw new Error(`Expected ${expectedCount} orders rows but found ${count}.`);
    }
  }
}
