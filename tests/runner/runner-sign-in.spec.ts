import { expect, test } from "@playwright/test";
import { ADMIN, SIGNED_OUT, USER_STATE } from "./_runner";

// The front door: sign in, see where runs go, sign out. And the one thing a
// plain user must not see.

test.describe("Signing in", () => {
  test.use({ storageState: SIGNED_OUT });

  test("refuses a wrong password in plain words", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("auth-screen")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Run the tests, without GitHub",
    );

    await page.getByTestId("signin-username").fill(ADMIN.username);
    await page.getByTestId("signin-password").fill("not-the-password");
    await page.getByTestId("signin-submit").click();

    await expect(page.getByTestId("signin-error")).not.toBeEmpty();
    await expect(page.getByTestId("runner-screen")).toBeHidden();
  });

  test("signs in, says the pipeline is a stub, and signs out", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("signin-username").fill(ADMIN.username);
    await page.getByTestId("signin-password").fill(ADMIN.password);
    await page.getByTestId("signin-submit").click();

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

    await page.getByTestId("signout-button").click();
    await expect(page.getByTestId("auth-screen")).toBeVisible();
    await expect(page.getByTestId("auth-note")).toHaveText("Signed out.");
  });
});

test.describe("A plain user", () => {
  test.use({ storageState: USER_STATE });

  test("has no Users tab at all", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("runner-screen")).toBeVisible();
    await expect(page.getByTestId("session-role")).toHaveText("user");
    await expect(page.getByTestId("tab-run")).toBeVisible();
    await expect(page.getByTestId("tab-users")).toHaveCount(0);
  });
});
