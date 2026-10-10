import { expect, test } from "@playwright/test";
import {
  DEMO,
  DEMO_PASSWORD,
  signIn,
  signUpCustomer,
  uniqueEmail,
} from "./_bank";

// Playground Bank, phase 2a: sign-up, log-in, profile, settings and the staff
// page, through the browser. Tests that change data use their own new account.
test.describe("Playground Bank accounts (/app)", () => {
  test("signing up creates an account and signs you in", async ({ page }) => {
    const email = uniqueEmail("signup");
    await page.goto("/app/signup");
    await page.getByTestId("signup-fullName").fill("Noa Tester");
    await page.getByTestId("signup-email").fill(email);
    await page.getByTestId("signup-password").fill("practice123");
    await page.getByTestId("signup-confirmPassword").fill("practice123");
    await page.getByTestId("signup-acceptTerms").check();
    await page.getByTestId("signup-submit").click();

    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByTestId("profile-welcome")).toContainText("Noa");
    await expect(page.getByTestId("profile-name")).toHaveText("Noa Tester");
    await expect(page.getByTestId("profile-email")).toHaveText(email);
    await expect(page.getByTestId("profile-role")).toHaveText("Customer");
    await expect(page.getByTestId("account-menu-trigger")).toContainText("Noa");
  });

  test("sign-up checks the form before sending it", async ({ page }) => {
    await page.goto("/app/signup");
    await page.getByTestId("signup-submit").click();
    await expect(page.getByTestId("signup-fullName-error")).toBeVisible();
    await expect(page.getByTestId("signup-email-error")).toBeVisible();
    await expect(page.getByTestId("signup-password-error")).toBeVisible();
    await expect(page.getByTestId("signup-acceptTerms-error")).toBeVisible();

    // Everything valid except the confirmation, so only that error remains.
    await page.getByTestId("signup-fullName").fill("Mismatch Tester");
    await page.getByTestId("signup-email").fill(uniqueEmail("mismatch"));
    await page.getByTestId("signup-password").fill("practice123");
    await page.getByTestId("signup-confirmPassword").fill("practice124");
    await page.getByTestId("signup-acceptTerms").check();
    await page.getByTestId("signup-submit").click();
    await expect(page.getByTestId("signup-confirmPassword-error")).toHaveText(
      "The passwords don't match.",
    );
    await expect(page).toHaveURL(/\/app\/signup$/);
  });

  test("sign-up refuses an email that already has an account", async ({
    page,
  }) => {
    await page.goto("/app/signup");
    await page.getByTestId("signup-fullName").fill("Copy Cat");
    await page.getByTestId("signup-email").fill(DEMO.customer);
    await page.getByTestId("signup-password").fill("practice123");
    await page.getByTestId("signup-confirmPassword").fill("practice123");
    await page.getByTestId("signup-acceptTerms").check();
    await page.getByTestId("signup-submit").click();
    await expect(page.getByTestId("signup-error")).toHaveText(
      "An account with this email already exists.",
    );
  });

  test("a wrong password shows an error", async ({ page }) => {
    await page.goto("/app/login");
    await page.getByTestId("login-email").fill(DEMO.customer);
    await page.getByTestId("login-password").fill("not-the-password1");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toHaveText(
      "Wrong email or password.",
    );
  });

  test("a page that needs an account asks you to log in, then takes you back", async ({
    page,
  }) => {
    await page.goto("/app/settings");
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
    await page.getByTestId("signin-prompt-login").click();
    await expect(page).toHaveURL(/\/app\/login\?next=%2Fsettings$/);

    await page.getByTestId("login-email").fill(DEMO.customer);
    await page.getByTestId("login-password").fill(DEMO_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByTestId("settings-form")).toBeVisible();
  });

  test("editing your profile saves the changes", async ({ page }) => {
    await signUpCustomer(page.request, "Rina Editor");
    await page.goto("/app/profile/edit");
    await page.getByTestId("edit-profile-phone").fill("+44 20 7946 0958");
    await page.getByTestId("edit-profile-city").fill("London");
    await page
      .getByTestId("edit-profile-country")
      .selectOption("United Kingdom");
    await page.getByTestId("edit-profile-save").click();

    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByTestId("profile-saved")).toBeVisible();
    await expect(page.getByTestId("profile-phone")).toHaveText(
      "+44 20 7946 0958",
    );
    await expect(page.getByTestId("profile-city")).toHaveText("London");
    await expect(page.getByTestId("profile-country")).toHaveText(
      "United Kingdom",
    );
  });

  test("the profile form rejects a bad phone number", async ({ page }) => {
    await signUpCustomer(page.request);
    await page.goto("/app/profile/edit");
    await page.getByTestId("edit-profile-phone").fill("call me maybe");
    await page.getByTestId("edit-profile-save").click();
    await expect(page.getByTestId("edit-profile-phone-error")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/profile\/edit$/);
  });

  test("demo accounts are read-only", async ({ page }) => {
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/profile/edit");
    await page.getByTestId("edit-profile-city").fill("Oakland");
    await page.getByTestId("edit-profile-save").click();
    await expect(page.getByTestId("edit-profile-error")).toContainText(
      "Demo accounts are read-only",
    );
  });

  test("settings are saved and shown again after a reload", async ({
    page,
  }) => {
    await signUpCustomer(page.request);
    await page.goto("/app/settings");
    await page.getByTestId("settings-currency").selectOption("EUR");
    await page.getByTestId("settings-locale").selectOption("de-DE");
    await expect(page.getByTestId("settings-preview")).toContainText("€");
    await page.getByTestId("settings-email-alerts").uncheck();
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("settings-saved")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("settings-currency")).toHaveValue("EUR");
    await expect(page.getByTestId("settings-locale")).toHaveValue("de-DE");
    await expect(page.getByTestId("settings-email-alerts")).not.toBeChecked();
  });

  test("customers can't open Bank users", async ({ page }) => {
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/admin/users");
    await expect(page.getByTestId("admin-forbidden")).toBeVisible();
    await expect(page.getByTestId("nav-link-bank-users")).toHaveCount(0);
  });

  test("Support sees Bank users, read-only", async ({ page }) => {
    await signIn(page.request, DEMO.support);
    await page.goto("/app/admin/users");
    await expect(page.getByTestId("admin-users-table")).toBeVisible();
    await expect(page.getByTestId("admin-readonly-note")).toBeVisible();
    await expect(page.locator('[data-testid^="admin-toggle-"]')).toHaveCount(0);
    await expect(page.getByTestId("nav-link-bank-users")).toBeVisible();
  });

  test("an Admin can lock an account, which then can't log in", async ({
    page,
    request,
  }) => {
    const victim = await signUpCustomer(request, "Lockable Customer");
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/users");
    await page.getByTestId("admin-search").fill(victim.email);
    await page.getByTestId(`admin-actions-${victim.id}`).click();
    await page.getByTestId(`admin-toggle-${victim.id}`).click();
    await expect(page.getByTestId(`admin-status-${victim.id}`)).toHaveText(
      "Locked",
    );

    const login = await request.post("/api/bank/login", {
      data: { email: victim.email, password: "practice123" },
    });
    expect(login.status()).toBe(403);
  });

  test("the account menu shows staff links only to staff", async ({ page }) => {
    await signIn(page.request, DEMO.admin);
    await page.goto("/app");
    await page.getByTestId("account-menu-trigger").click();
    await expect(page.getByTestId("account-menu-bank-users")).toBeVisible();
    await expect(
      page.getByTestId("account-menu-edit-profile"),
    ).not.toHaveAttribute("aria-disabled", "true");
  });
});
