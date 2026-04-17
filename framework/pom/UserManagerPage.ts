import type { Locator, Page } from "@playwright/test";
import { userManagerProfile } from "../agents/recovery/pageProfiles/userManagerProfile";
import { userManagerPageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class UserManagerPage extends SelfHealingPage {
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

  async goto() {
    await this.page.goto("/user-manager");
  }

  async expectLoaded() {
    return this.validateContractOrThrow(userManagerPageContract);
  }

  async addUser() {
    return this.clickAction(userManagerProfile.actions.addUser);
  }

  async searchUsers(query: string) {
    return this.fillAction(userManagerProfile.actions.searchUsers, query);
  }

  async refreshUsers() {
    return this.clickAction(userManagerProfile.actions.refreshUsers);
  }

  async waitForUsersLoaded(timeoutMs = 5000) {
    await this.userRows.first().waitFor({ state: "visible", timeout: timeoutMs });
  }
}
