// The classic site's landing page (/classic): its hero, health check, quick
// triage box and links to the dashboard and the product demo.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The landing page's actions (with their intent words) and its contract.
import { homePageProfile } from "../agents/recovery/pageProfiles/homePageProfile";
import { homePageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class HomePage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly dashboardLink: Locator;
  readonly healthOutput: Locator;
  readonly heroHeading: Locator;
  readonly inspectProductButton: Locator;
  readonly joinNowButton: Locator;
  readonly triageInput: Locator;
  readonly triageOutput: Locator;

  // Finds each part by its role or its data-testid.
  constructor(page: Page) {
    super(page, homePageProfile.pageLabel);
    this.dashboardLink = page.getByRole("link", { name: "Dashboard" });
    this.healthOutput = page.getByTestId("health-output");
    this.heroHeading = page.getByTestId("hero-heading");
    this.inspectProductButton = page.getByTestId("inspect-product");
    this.joinNowButton = page.getByTestId("join-now");
    this.triageInput = page.getByTestId("triage-input");
    this.triageOutput = page.getByTestId("triage-output");
  }

  // Opens the landing page.
  async goto() {
    await this.page.goto("/classic");
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(homePageContract);
  }

  // Each action below goes through the healing click or fill of the base page.
  async checkHealth() {
    return this.clickAction(homePageProfile.actions.checkHealth);
  }

  async fillQuickTriage(value: string) {
    return this.fillAction(homePageProfile.actions.triageInput, value);
  }

  async goToDashboardFromHero() {
    return this.clickAction(homePageProfile.actions.joinNow);
  }

  async goToDashboardFromNav() {
    return this.clickAction(homePageProfile.actions.dashboardNav);
  }

  async openProductDemo() {
    return this.clickAction(homePageProfile.actions.inspectProduct);
  }
}
