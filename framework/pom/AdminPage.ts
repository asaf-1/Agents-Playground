import type { Locator, Page } from "@playwright/test";
import { adminPageProfile } from "../agents/recovery/pageProfiles/adminPageProfile";
import { adminPageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class AdminPage extends SelfHealingPage {
  readonly heading: Locator;
  readonly log: Locator;
  readonly actionCount: Locator;
  readonly refreshBtn: Locator;
  readonly clearBtn: Locator;

  constructor(page: Page) {
    super(page, adminPageProfile.pageLabel);
    this.heading = page.getByTestId("admin-heading");
    this.log = page.getByTestId("admin-log");
    this.actionCount = page.getByTestId("admin-action-count");
    this.refreshBtn = page.getByTestId("refresh-admin-log-btn");
    this.clearBtn = page.getByTestId("clear-admin-log-btn");
  }

  async goto() {
    await this.page.goto("/admin");
  }

  async expectLoaded() {
    return this.validateContractOrThrow(adminPageContract);
  }

  async clearLog() {
    return this.clickAction(adminPageProfile.actions.clearLog);
  }

  async refreshLog() {
    return this.clickAction(adminPageProfile.actions.refreshLog);
  }
}
