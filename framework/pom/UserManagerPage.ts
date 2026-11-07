// The classic site's User Manager page (/user-manager): the user table, search,
// role filter, invite dialog and the actions on each row.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { userManagerProfile } from "../agents/recovery/pageProfiles/userManagerProfile";
import { userManagerPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class UserManagerPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly addUserBtn: Locator;
  readonly bulkActionsButton: Locator;
  readonly heading: Locator;
  readonly inviteDialog: Locator;
  readonly inviteEmailInput: Locator;
  readonly refreshBtn: Locator;
  readonly roleFilter: Locator;
  readonly searchInput: Locator;
  readonly selectedUserOutput: Locator;
  readonly userCount: Locator;
  readonly userError: Locator;
  readonly userRows: Locator;
  readonly userTable: Locator;
  readonly viewUserActions: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, userManagerProfile.pageLabel);
    this.heading = page.getByTestId("user-manager-heading");
    this.userTable = page.getByTestId("user-table");
    this.addUserBtn = page.getByTestId("add-user-btn");
    this.bulkActionsButton = page.getByTestId("bulk-actions-btn");
    this.inviteDialog = page.getByTestId("invite-dialog");
    this.inviteEmailInput = page.getByTestId("invite-email");
    this.searchInput = page.getByTestId("user-search");
    this.roleFilter = page.getByTestId("role-filter");
    this.selectedUserOutput = page.getByTestId("selected-user-output");
    this.userCount = page.getByTestId("user-count");
    this.userError = page.getByTestId("user-error");
    this.refreshBtn = page.getByTestId("refresh-users");
    this.userRows = page.locator("[data-testid='user-row']");
    this.viewUserActions = page.locator("[data-testid='view-user-action']");
  }

  // Opens User Manager.
  async goto() {
    await this.page.goto("/user-manager");
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(userManagerPageContract);
  }

  // Each action below goes through the healing click or fill of the base page.
  async addUser() {
    return this.clickAction(userManagerProfile.actions.addUser);
  }

  async searchUsers(query: string) {
    return this.fillAction(userManagerProfile.actions.searchUsers, query);
  }

  async refreshUsers() {
    return this.clickAction(userManagerProfile.actions.refreshUsers);
  }

  // Waits until the first user row is on screen.
  async waitForUsersLoaded(timeoutMs = 5000) {
    await this.userRows
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  }
}
