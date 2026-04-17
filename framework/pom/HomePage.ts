import type { Locator, Page } from "@playwright/test";
import { homePageProfile } from "../agents/recovery/pageProfiles/homePageProfile";
import { homePageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class HomePage extends SelfHealingPage {
  readonly dashboardLink: Locator;
  readonly healthOutput: Locator;
  readonly heroHeading: Locator;
  readonly inspectProductButton: Locator;
  readonly joinNowButton: Locator;
  readonly triageInput: Locator;
  readonly triageOutput: Locator;

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

  async goto() {
    await this.page.goto("/");
  }

  async expectLoaded() {
    return this.validateContractOrThrow(homePageContract);
  }

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
