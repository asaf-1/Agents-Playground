// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people and password, sign in, sign up, a new email.
import {
  DEMO,
  DEMO_PASSWORD,
  signIn,
  signUpCustomer,
  uniqueEmail,
} from "../../../framework/helpers/bank";

// Playground Bank, phase 2a: sign-up, log-in, profile, settings and the staff
// page, through the browser. Tests that change data use their own new account.
test.describe("Playground Bank accounts (/app)", () => {
  // Signing up through the form makes the account and lands on its profile, signed in.
  test("signing up creates an account and signs you in", async ({ page }) => {
    expected(
      "lands on /app/profile showing Noa Tester, the email, Customer, and Noa in the account menu",
    );
    // Fill the sign-up form with a new email.
    const email = uniqueEmail("signup");
    fact("email", email);
    await page.goto("/app/signup");
    await page.getByTestId("signup-fullName").fill("Noa Tester");
    await page.getByTestId("signup-email").fill(email);
    await page.getByTestId("signup-password").fill("practice123");
    await page.getByTestId("signup-confirmPassword").fill("practice123");
    await page.getByTestId("signup-acceptTerms").check();
    await page.getByTestId("signup-submit").click();

    // The profile shows the new customer.
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByTestId("profile-welcome")).toContainText("Noa");
    await expect(page.getByTestId("profile-name")).toHaveText("Noa Tester");
    await expect(page.getByTestId("profile-email")).toHaveText(email);
    await expect(page.getByTestId("profile-role")).toHaveText("Customer");
    await expect(page.getByTestId("account-menu-trigger")).toContainText("Noa");
  });

  // The sign-up form shows each field's error before sending anything, and
  // catches a mismatched password confirmation.
  test("sign-up checks the form before sending it", async ({ page }) => {
    expected(
      "an empty submit shows the name, email, password and terms errors; a mismatched confirmation shows 'The passwords don't match.' and stays on /app/signup",
    );
    // Submit the empty form.
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

  // Signing up with an email already in use shows the server's message.
  test("sign-up refuses an email that already has an account", async ({
    page,
  }) => {
    expected("'An account with this email already exists.'");
    // Sign up with the demo customer's email.
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

  // A wrong password on the log-in form shows an error.
  test("a wrong password shows an error", async ({ page }) => {
    expected("'Wrong email or password.'");
    await page.goto("/app/login");
    await page.getByTestId("login-email").fill(DEMO.customer);
    await page.getByTestId("login-password").fill("not-the-password1");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toHaveText(
      "Wrong email or password.",
    );
  });

  // Opening a page that needs an account asks to log in, and logging in goes
  // back to that page.
  test("a page that needs an account asks you to log in, then takes you back", async ({
    page,
  }) => {
    expected(
      "the sign-in prompt on /app/settings; login?next=/settings; after logging in, the settings form on /app/settings",
    );
    // Settings while signed out: the prompt, then the log-in page.
    await page.goto("/app/settings");
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
    await page.getByTestId("signin-prompt-login").click();
    await expect(page).toHaveURL(/\/app\/login\?next=%2Fsettings$/);

    // Log in as the demo customer: back on Settings.
    await page.getByTestId("login-email").fill(DEMO.customer);
    await page.getByTestId("login-password").fill(DEMO_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByTestId("settings-form")).toBeVisible();
  });

  // A profile edit is saved and shown on the profile.
  test("editing your profile saves the changes", async ({ page }) => {
    expected(
      "back on /app/profile with 'saved', phone +44 20 7946 0958, city London, country United Kingdom",
    );
    // A new customer edits their phone, city and country.
    await signUpCustomer(page.request, "Rina Editor");
    await page.goto("/app/profile/edit");
    await page.getByTestId("edit-profile-phone").fill("+44 20 7946 0958");
    await page.getByTestId("edit-profile-city").fill("London");
    await page
      .getByTestId("edit-profile-country")
      .selectOption("United Kingdom");
    await page.getByTestId("edit-profile-save").click();

    // The profile shows the new details.
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

  // A phone number that isn't one is refused on the form.
  test("the profile form rejects a bad phone number", async ({ page }) => {
    expected("a phone error, and the page stays on /app/profile/edit");
    await signUpCustomer(page.request);
    await page.goto("/app/profile/edit");
    await page.getByTestId("edit-profile-phone").fill("call me maybe");
    await page.getByTestId("edit-profile-save").click();
    await expect(page.getByTestId("edit-profile-phone-error")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/profile\/edit$/);
  });

  // The demo customer's profile can't be changed.
  test("demo accounts are read-only", async ({ page }) => {
    expected("saving shows 'Demo accounts are read-only'");
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/profile/edit");
    await page.getByTestId("edit-profile-city").fill("Oakland");
    await page.getByTestId("edit-profile-save").click();
    await expect(page.getByTestId("edit-profile-error")).toContainText(
      "Demo accounts are read-only",
    );
  });

  // Settings are saved and still there after a reload.
  test("settings are saved and shown again after a reload", async ({
    page,
  }) => {
    expected(
      "the preview shows €; saved; after a reload EUR, de-DE and email alerts off",
    );
    // A new customer picks euros, German formatting, and no email alerts.
    await signUpCustomer(page.request);
    await page.goto("/app/settings");
    await page.getByTestId("settings-currency").selectOption("EUR");
    await page.getByTestId("settings-locale").selectOption("de-DE");
    await expect(page.getByTestId("settings-preview")).toContainText("€");
    await page.getByTestId("settings-email-alerts").uncheck();
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("settings-saved")).toBeVisible();

    // A reload shows the same choices.
    await page.reload();
    await expect(page.getByTestId("settings-currency")).toHaveValue("EUR");
    await expect(page.getByTestId("settings-locale")).toHaveValue("de-DE");
    await expect(page.getByTestId("settings-email-alerts")).not.toBeChecked();
  });

  // A customer is refused the staff user page and has no link to it.
  test("customers can't open Bank users", async ({ page }) => {
    expected("admin-forbidden visible; no Bank users link in the sidebar");
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/admin/users");
    await expect(page.getByTestId("admin-forbidden")).toBeVisible();
    await expect(page.getByTestId("nav-link-bank-users")).toHaveCount(0);
  });

  // Support sees the user list with a read-only note and no change buttons.
  test("Support sees Bank users, read-only", async ({ page }) => {
    expected(
      "the users table, the read-only note, no toggle buttons, and the Bank users link",
    );
    await signIn(page.request, DEMO.support);
    await page.goto("/app/admin/users");
    await expect(page.getByTestId("admin-users-table")).toBeVisible();
    await expect(page.getByTestId("admin-readonly-note")).toBeVisible();
    await expect(page.locator('[data-testid^="admin-toggle-"]')).toHaveCount(0);
    await expect(page.getByTestId("nav-link-bank-users")).toBeVisible();
  });

  // An Admin locks a customer from the staff page, and that customer's log-in is refused.
  test("an Admin can lock an account, which then can't log in", async ({
    page,
    request,
  }) => {
    expected("the customer's status reads Locked; their log-in answers 403");
    // A new customer, and the demo Admin on the staff page.
    const victim = await signUpCustomer(request, "Lockable Customer");
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/users");
    // Find the customer and lock them.
    await page.getByTestId("admin-search").fill(victim.email);
    await page.getByTestId(`admin-actions-${victim.id}`).click();
    await page.getByTestId(`admin-toggle-${victim.id}`).click();
    await expect(page.getByTestId(`admin-status-${victim.id}`)).toHaveText(
      "Locked",
    );

    // Their log-in is now refused.
    const login = await request.post("/api/bank/login", {
      data: { email: victim.email, password: "practice123" },
    });
    expect(login.status()).toBe(403);
  });

  // An Admin's account menu has the staff link, and Edit profile is enabled.
  test("the account menu shows staff links only to staff", async ({ page }) => {
    expected(
      "the Bank users entry in the account menu; Edit profile not disabled",
    );
    await signIn(page.request, DEMO.admin);
    await page.goto("/app");
    await page.getByTestId("account-menu-trigger").click();
    await expect(page.getByTestId("account-menu-bank-users")).toBeVisible();
    await expect(
      page.getByTestId("account-menu-edit-profile"),
    ).not.toHaveAttribute("aria-disabled", "true");
  });
});
