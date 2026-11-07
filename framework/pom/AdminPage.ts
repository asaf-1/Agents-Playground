// The classic site's Admin page (/admin): the audit log, its count, and the
// refresh and clear buttons.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { adminPageProfile } from "../agents/recovery/pageProfiles/adminPageProfile";
import { adminPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class AdminPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly log: Locator;
  readonly actionCount: Locator;
  readonly refreshBtn: Locator;
  readonly clearBtn: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, adminPageProfile.pageLabel);
    this.heading = page.getByTestId("admin-heading");
    this.log = page.getByTestId("admin-log");
    this.actionCount = page.getByTestId("admin-action-count");
    this.refreshBtn = page.getByTestId("refresh-admin-log-btn");
    this.clearBtn = page.getByTestId("clear-admin-log-btn");
  }

  // Opens the Admin page.
  async goto() {
    await this.page.goto("/admin");
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(adminPageContract);
  }

  // Each action below goes through the healing click of the base page.
  async clearLog() {
    return this.clickAction(adminPageProfile.actions.clearLog);
  }

  async refreshLog() {
    return this.clickAction(adminPageProfile.actions.refreshLog);
  }
}
