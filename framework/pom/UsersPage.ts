// The back office's Users page (/app/users): the search, New user and its
// dialog, and the table with a ⋯ menu (View, Edit, and Delete for an Admin) on
// each row.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { usersPageProfile } from "../agents/recovery/pageProfiles/usersPageProfile";
import { usersPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class UsersPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly table: Locator;
  readonly rows: Locator;
  readonly search: Locator;
  readonly createDialog: Locator;
  readonly editDialog: Locator;
  readonly deleteError: Locator;

  // Finds each part by its role or data-testid.
  constructor(page: Page) {
    super(page, usersPageProfile.pageLabel);
    this.heading = page.getByRole("heading", { name: "Users" });
    this.table = page.getByTestId("users-table");
    this.rows = page.locator("[data-testid^='user-row-']");
    this.search = page.getByTestId("users-search");
    this.createDialog = page.getByTestId("users-create-dialog");
    this.editDialog = page.getByTestId("user-edit-dialog");
    this.deleteError = page.getByTestId("users-delete-error");
  }

  // Opens the page, under a test's own runKey when one is given.
  async goto(runKey?: string) {
    await this.page.goto(
      runKey ? `/app/users?runKey=${encodeURIComponent(runKey)}` : "/app/users",
    );
    await this.heading.waitFor({ state: "visible" });
  }

  // Waits until the table shows its users.
  async waitForUsersLoaded(timeoutMs = 5000) {
    await this.rows.first().waitFor({ state: "visible", timeout: timeoutMs });
  }

  // One user's row, and the ⋯ button on it, by the user's id.
  row(id: string): Locator {
    return this.page.getByTestId(`user-row-${id}`);
  }

  actionsButton(id: string): Locator {
    return this.page.getByTestId(`user-actions-${id}`);
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(usersPageContract);
  }

  // Each action below goes through the healing click or fill of the base page.
  async openCreate() {
    return this.clickAction(usersPageProfile.actions.openCreate);
  }

  async fillCreateName(name: string) {
    return this.fillAction(usersPageProfile.actions.createName, name);
  }

  async submitCreate() {
    return this.clickAction(usersPageProfile.actions.submitCreate);
  }

  async searchFor(text: string) {
    return this.fillAction(usersPageProfile.actions.search, text);
  }
}
