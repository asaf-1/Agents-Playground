// The classic site's Profile page (/profile): name, email, and the edit and
// save buttons.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { profilePageProfile } from "../agents/recovery/pageProfiles/profilePageProfile";
import { profilePageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class ProfilePage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly editBtn: Locator;
  readonly saveBtn: Locator;
  readonly status: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, profilePageProfile.pageLabel);
    this.heading = page.getByTestId("profile-heading");
    this.nameInput = page.getByTestId("profile-name");
    this.emailInput = page.getByTestId("profile-email");
    this.editBtn = page.getByTestId("edit-profile-btn");
    this.saveBtn = page.getByTestId("save-profile-btn");
    this.status = page.getByTestId("profile-status");
  }

  // Opens the Profile page.
  async goto() {
    await this.page.goto("/profile");
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(profilePageContract);
  }

  // Each action below goes through the healing click of the base page.
  async edit() {
    return this.clickAction(profilePageProfile.actions.editProfile);
  }

  async save() {
    return this.clickAction(profilePageProfile.actions.saveProfile);
  }
}
