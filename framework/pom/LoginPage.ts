import type { Locator, Page } from "@playwright/test";
import { loginPageProfile } from "../agents/recovery/pageProfiles/loginPageProfile";
import { loginPageContract } from "../agents/validation/contracts";
import { SelfHealingPage } from "./SelfHealingPage";

export class LoginPage extends SelfHealingPage {
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitBtn: Locator;
  readonly error: Locator;
  readonly status: Locator;

  constructor(page: Page) {
    super(page, loginPageProfile.pageLabel);
    this.heading = page.getByTestId("login-heading");
    this.emailInput = page.getByTestId("login-email");
    this.passwordInput = page.getByTestId("login-password");
    this.submitBtn = page.getByTestId("login-submit");
    this.error = page.getByTestId("login-error");
    this.status = page.getByTestId("login-status");
  }

  async goto(next?: string) {
    await this.page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }

  async expectLoaded() {
    return this.validateContractOrThrow(loginPageContract);
  }

  async login(email: string, password: string) {
    await this.fillAction(loginPageProfile.actions.email, email);
    await this.fillAction(loginPageProfile.actions.password, password);
    return this.clickAction(loginPageProfile.actions.submit);
  }
}
