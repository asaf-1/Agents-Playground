// The classic site's Settings page (/settings): theme, notifications, and the
// save button.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { settingsPageProfile } from "../agents/recovery/pageProfiles/settingsPageProfile";
import { settingsPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class SettingsPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly themeSelect: Locator;
  readonly notificationsToggle: Locator;
  readonly saveBtn: Locator;
  readonly status: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, settingsPageProfile.pageLabel);
    this.heading = page.getByTestId("settings-heading");
    this.themeSelect = page.getByTestId("settings-theme");
    this.notificationsToggle = page.getByTestId("settings-notifications");
    this.saveBtn = page.getByTestId("save-settings-btn");
    this.status = page.getByTestId("settings-status");
  }

  // Opens the Settings page.
  async goto() {
    await this.page.goto("/settings");
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(settingsPageContract);
  }

  // Presses save, with healing.
  async save() {
    return this.clickAction(settingsPageProfile.actions.saveSettings);
  }
}
