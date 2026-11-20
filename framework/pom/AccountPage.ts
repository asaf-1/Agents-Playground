// The sign-in status page (/app/account): the bank account card, and the
// back-office session with its sign-in form and Sign out (the original demo
// site's /login page, moved here on 2026-11-20).

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { accountPageProfile } from "../agents/recovery/pageProfiles/accountPageProfile";
import { accountPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class AccountPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly backOffice: Locator;
  readonly signedInAs: Locator;
  readonly guest: Locator;
  readonly expired: Locator;
  readonly signInForm: Locator;
  readonly signInError: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, accountPageProfile.pageLabel);
    this.backOffice = page.getByTestId("account-backoffice");
    this.signedInAs = page.getByTestId("account-user");
    this.guest = page.getByTestId("account-anon");
    this.expired = page.getByTestId("account-expired");
    this.signInForm = page.getByTestId("backoffice-form");
    this.signInError = page.getByTestId("backoffice-error");
  }

  // Opens the page, under a test's own runKey when one is given.
  async goto(runKey?: string) {
    await this.page.goto(
      runKey
        ? `/app/account?runKey=${encodeURIComponent(runKey)}`
        : "/app/account",
    );
    await this.backOffice.waitFor({ state: "visible" });
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(accountPageContract);
  }

  // Signs in to the back office with the form, each step through the healing
  // fill or click of the base page.
  async signIn(email: string, password: string) {
    await this.fillAction(accountPageProfile.actions.email, email);
    await this.fillAction(accountPageProfile.actions.password, password);
    return this.clickAction(accountPageProfile.actions.signIn);
  }

  async signOut() {
    return this.clickAction(accountPageProfile.actions.signOut);
  }
}
