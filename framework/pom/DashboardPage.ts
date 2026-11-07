// The classic site's dashboard (/dashboard): the orders list, its status, error
// and spinner, and the refresh button.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The dashboard's actions (with their intent words) and its contract.
import { dashboardPageProfile } from "../agents/recovery/pageProfiles/dashboardPageProfile";
import { dashboardPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class DashboardPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly ordersError: Locator;
  readonly ordersRows: Locator;
  readonly ordersStatus: Locator;
  readonly refreshButton: Locator;
  readonly spinner: Locator;

  // Finds each part by its role, data-testid or CSS selector.
  constructor(page: Page) {
    super(page, dashboardPageProfile.pageLabel);
    this.heading = page.getByRole("heading", {
      name: "Orders Recovery Console",
    });
    this.ordersError = page.getByTestId("orders-error");
    this.ordersRows = page.locator("[data-testid='orders-row']");
    this.ordersStatus = page.getByTestId("orders-status");
    this.refreshButton = page.getByTestId("refresh-orders");
    this.spinner = page.getByTestId("orders-spinner");
  }

  // Opens the dashboard in a mode ("stable", "flaky"...), with an optional
  // delay for the orders request.
  async goto(mode = "stable", delayMs?: number) {
    const params = new URLSearchParams({ mode });

    if (typeof delayMs === "number") {
      params.set("delayMs", String(delayMs));
    }

    await this.page.goto(`/dashboard?${params.toString()}`);
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(dashboardPageContract);
  }

  // Each action below goes through the healing click of the base page.
  async openBrokenProductProfile() {
    return this.clickAction(dashboardPageProfile.actions.openBrokenProduct);
  }

  async refreshOrders() {
    return this.clickAction(dashboardPageProfile.actions.refreshOrders);
  }

  // Waits for the first order row, then fails unless there are exactly the
  // expected number of rows.
  async waitForOrdersLoaded(expectedCount = 3, timeoutMs = 5000) {
    await this.ordersRows
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
    const count = await this.ordersRows.count();

    if (count !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} orders rows but found ${count}.`,
      );
    }
  }
}
