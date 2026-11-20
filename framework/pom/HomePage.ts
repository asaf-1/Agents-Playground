// The bank's home page (/app): the hero, the four area cards, and the links
// into the back office.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { homePageProfile } from "../agents/recovery/pageProfiles/homePageProfile";
import { homePageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class HomePage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly backOfficeCard: Locator;
  readonly ordersLink: Locator;
  readonly usersLink: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, homePageProfile.pageLabel);
    this.heading = page.getByTestId("app-heading");
    this.backOfficeCard = page.getByTestId("hub-card-backoffice");
    this.ordersLink = page.getByTestId("hub-link-orders");
    this.usersLink = page.getByTestId("hub-link-users");
  }

  // Opens the home page, and waits for its heading.
  async goto() {
    await this.page.goto("/app");
    await this.heading.waitFor({ state: "visible" });
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(homePageContract);
  }

  // Each action below goes through the healing click of the base page.
  async openOrders() {
    return this.clickAction(homePageProfile.actions.openOrders);
  }

  async openUsers() {
    return this.clickAction(homePageProfile.actions.openUsers);
  }

  async startPracticing() {
    return this.clickAction(homePageProfile.actions.startPracticing);
  }
}
