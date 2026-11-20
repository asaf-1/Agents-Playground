// The back office's Orders page (/app/orders): the answer modes (stable, slow,
// flaky), Refresh, the loading line, the error with Retry, and the table.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { ordersPageProfile } from "../agents/recovery/pageProfiles/ordersPageProfile";
import { ordersPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

// The answer modes the page offers.
export type OrdersMode = "stable" | "slow" | "flaky";

export class OrdersPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly table: Locator;
  readonly rows: Locator;
  readonly loading: Locator;
  readonly error: Locator;
  readonly retryButton: Locator;
  readonly refreshButton: Locator;

  // Finds each part by its role or data-testid.
  constructor(page: Page) {
    super(page, ordersPageProfile.pageLabel);
    this.heading = page.getByRole("heading", { name: "Orders" });
    this.table = page.getByTestId("orders-table");
    this.rows = page.locator("[data-testid^='order-row-']");
    this.loading = page.getByTestId("orders-loading");
    this.error = page.getByTestId("orders-error");
    this.retryButton = page.getByTestId("orders-retry");
    this.refreshButton = page.getByTestId("orders-refresh");
  }

  // Opens the page, under a test's own runKey when one is given (its armed
  // flags and its flaky-mode failure are its own).
  async goto(runKey?: string) {
    await this.page.goto(
      runKey
        ? `/app/orders?runKey=${encodeURIComponent(runKey)}`
        : "/app/orders",
    );
    await this.heading.waitFor({ state: "visible" });
  }

  // Picks an answer mode with its button.
  async chooseMode(mode: OrdersMode) {
    await this.page.getByTestId(`orders-mode-${mode}`).click();
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(ordersPageContract);
  }

  // Each action below goes through the healing click of the base page.
  async refresh() {
    return this.clickAction(ordersPageProfile.actions.refresh);
  }

  async retry() {
    return this.clickAction(ordersPageProfile.actions.retry);
  }

  // Waits for the first order row, then fails unless there are exactly the
  // expected number of rows.
  async waitForOrdersLoaded(expectedCount = 3, timeoutMs = 5000) {
    await this.rows.first().waitFor({ state: "visible", timeout: timeoutMs });
    const count = await this.rows.count();

    if (count !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} order rows but found ${count}.`,
      );
    }
  }
}
