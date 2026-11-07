// Playwright's test tools, with the [RESULT] block printed after every test.
import { expect, expected, test } from "../../framework/fixtures/resultBlock";
// The admin account, a signed-out start, and the plain user's saved session.
import { ADMIN, SIGNED_OUT, USER_STATE } from "../../framework/helpers/runner";

// The front door: sign in, see where runs go, sign out. And the one thing a
// plain user must not see.

test.describe("Signing in", () => {
  // These tests start signed out.
  test.use({ storageState: SIGNED_OUT });

  // A wrong password shows an error and keeps the runner closed.
  test("refuses a wrong password in plain words", async ({ page }) => {
    expected(
      "the sign-in screen titled 'Run the tests, without GitHub'; a wrong password shows an error and no runner",
    );
    await page.goto("/");
    await expect(page.getByTestId("auth-screen")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Run the tests, without GitHub",
    );

    // The admin's name with the wrong password.
    await page.getByTestId("signin-username").fill(ADMIN.username);
    await page.getByTestId("signin-password").fill("not-the-password");
    await page.getByTestId("signin-submit").click();

    await expect(page.getByTestId("signin-error")).not.toBeEmpty();
    await expect(page.getByTestId("runner-screen")).toBeHidden();
  });

  // The admin signs in, sees the target repository and that it is a stub,
  // has the Users tab, and signs out.
  test("signs in, says the pipeline is a stub, and signs out", async ({
    page,
  }) => {
    expected(
      "runner-admin, role admin, repo asaf-1/Agents-Playground marked Stub, a Users tab; signed out with 'Signed out.'",
    );
    // Sign in as the admin.
    await page.goto("/");
    await page.getByTestId("signin-username").fill(ADMIN.username);
    await page.getByTestId("signin-password").fill(ADMIN.password);
    await page.getByTestId("signin-submit").click();

    // Who is signed in, and where runs go.
    await expect(page.getByTestId("runner-screen")).toBeVisible();
    await expect(page.getByTestId("session-username")).toHaveText(
      ADMIN.username,
    );
    await expect(page.getByTestId("session-role")).toHaveText("admin");
    await expect(page.getByTestId("dispatch-repo")).toHaveText(
      "asaf-1/Agents-Playground",
    );
    // A pretend pipeline says so where the target is named.
    await expect(page.getByTestId("dispatch-stub")).toBeVisible();
    await expect(page.getByTestId("dispatch-stub")).toContainText("Stub");
    await expect(page.getByTestId("tab-users")).toBeVisible();

    // Sign out.
    await page.getByTestId("signout-button").click();
    await expect(page.getByTestId("auth-screen")).toBeVisible();
    await expect(page.getByTestId("auth-note")).toHaveText("Signed out.");
  });
});

test.describe("A plain user", () => {
  // These tests start as the plain user.
  test.use({ storageState: USER_STATE });

  // A plain user has the Run tab but no Users tab.
  test("has no Users tab at all", async ({ page }) => {
    expected("role user, a Run tab, no Users tab");
    await page.goto("/");
    await expect(page.getByTestId("runner-screen")).toBeVisible();
    await expect(page.getByTestId("session-role")).toHaveText("user");
    await expect(page.getByTestId("tab-run")).toBeVisible();
    await expect(page.getByTestId("tab-users")).toHaveCount(0);
  });
});
