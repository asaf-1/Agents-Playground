// The classic site's login page (/login): email, password, the sign-in button,
// and the error and status lines.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The page's actions (with their intent words) and its contract.
import { loginPageProfile } from "../agents/recovery/pageProfiles/loginPageProfile";
import { loginPageContract } from "../agents/validation/contracts";
// The base page that heals a stale locator.
import { SelfHealingPage } from "./SelfHealingPage";

export class LoginPage extends SelfHealingPage {
  // The parts of the page the tests read directly.
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitBtn: Locator;
  readonly error: Locator;
  readonly status: Locator;

  // Finds each part by its data-testid.
  constructor(page: Page) {
    super(page, loginPageProfile.pageLabel);
    this.heading = page.getByTestId("login-heading");
    this.emailInput = page.getByTestId("login-email");
    this.passwordInput = page.getByTestId("login-password");
    this.submitBtn = page.getByTestId("login-submit");
    this.error = page.getByTestId("login-error");
    this.status = page.getByTestId("login-status");
  }

  // Opens the login page, with the page to return to after sign-in if given.
  async goto(next?: string) {
    await this.page.goto(
      next ? `/login?next=${encodeURIComponent(next)}` : "/login",
    );
  }

  // Fails the test unless the page matches its contract.
  async expectLoaded() {
    return this.validateContractOrThrow(loginPageContract);
  }

  // Types the email and password and presses sign in, each step with healing.
  async login(email: string, password: string) {
    await this.fillAction(loginPageProfile.actions.email, email);
    await this.fillAction(loginPageProfile.actions.password, password);
    return this.clickAction(loginPageProfile.actions.submit);
  }
}
