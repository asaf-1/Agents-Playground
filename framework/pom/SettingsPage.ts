import type { Locator, Page } from "@playwright/test";
import { settingsPageProfile } from "../agents/recovery/pageProfiles/settingsPageProfile";
import { settingsPageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class SettingsPage extends SelfHealingPage {
  readonly heading: Locator;
  readonly themeSelect: Locator;
  readonly notificationsToggle: Locator;
  readonly saveBtn: Locator;
  readonly status: Locator;

  constructor(page: Page) {
    super(page, settingsPageProfile.pageLabel);
    this.heading = page.getByTestId("settings-heading");
    this.themeSelect = page.getByTestId("settings-theme");
    this.notificationsToggle = page.getByTestId("settings-notifications");
    this.saveBtn = page.getByTestId("save-settings-btn");
    this.status = page.getByTestId("settings-status");
  }

  async goto() {
    await this.page.goto("/settings");
  }

  async expectLoaded() {
    return this.validateContractOrThrow(settingsPageContract);
  }

  async save() {
    return this.clickAction(settingsPageProfile.actions.saveSettings);
  }
}
