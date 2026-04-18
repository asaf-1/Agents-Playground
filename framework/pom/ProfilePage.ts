import type { Locator, Page } from "@playwright/test";
import { profilePageProfile } from "../agents/recovery/pageProfiles/profilePageProfile";
import { profilePageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class ProfilePage extends SelfHealingPage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly editBtn: Locator;
  readonly saveBtn: Locator;
  readonly status: Locator;

  constructor(page: Page) {
    super(page, profilePageProfile.pageLabel);
    this.heading = page.getByTestId("profile-heading");
    this.nameInput = page.getByTestId("profile-name");
    this.emailInput = page.getByTestId("profile-email");
    this.editBtn = page.getByTestId("edit-profile-btn");
    this.saveBtn = page.getByTestId("save-profile-btn");
    this.status = page.getByTestId("profile-status");
  }

  async goto() {
    await this.page.goto("/profile");
  }

  async expectLoaded() {
    return this.validateContractOrThrow(profilePageContract);
  }

  async edit() {
    return this.clickAction(profilePageProfile.actions.editProfile);
  }

  async save() {
    return this.clickAction(profilePageProfile.actions.saveProfile);
  }
}
