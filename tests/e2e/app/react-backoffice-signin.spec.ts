// The back-office sign-in on /app/account (moved there from the original demo
// site's /login page on 2026-11-20): the demo staff sign in and out, a wrong
// password and the inactive account are refused under the form. Each test has
// its own browser context, so its session is its own.

/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

test.describe("Back-office sign-in", () => {
  // Alice signs in with the form, the page says who she is, and Sign out
  // makes her a guest again.
  test("a demo staff member signs in with the form and signs out again", async ({
    page,
  }) => {
    expected(
      "a guest with the form and the three demo staff; 'Signed in as Alice Northwind (Admin)' after signing in; a guest again after Sign out",
    );
    await page.goto("/app/account?runKey=backoffice-signin");

    await test.step("a guest sees the form and the demo staff", async () => {
      await expect(page.getByTestId("account-anon"), "a guest").toHaveText(
        "You are not signed in.",
      );
      const staff = page.getByTestId("backoffice-demo-accounts");
      for (const email of [
        "alice@demo.local",
        "bob@demo.local",
        "carol@demo.local",
      ]) {
        await expect(staff, `${email} is listed`).toContainText(email);
      }
      await expect(staff, "with the shared password").toContainText("demo1234");
    });

    await test.step("Alice signs in", async () => {
      await page.getByTestId("backoffice-email").fill("alice@demo.local");
      await page.getByTestId("backoffice-password").fill("demo1234");
      await page.getByTestId("backoffice-submit").click();
      await expect(
        page.getByTestId("account-user"),
        "who is signed in",
      ).toHaveText("Signed in as Alice Northwind (Admin)");
      await expect(
        page.getByTestId("backoffice-form"),
        "the form is gone",
      ).toBeHidden();
    });

    await test.step("Sign out makes her a guest again", async () => {
      await page.getByTestId("backoffice-signout").click();
      await expect(
        page.getByTestId("account-anon"),
        "a guest again",
      ).toBeVisible();
      await expect(
        page.getByTestId("backoffice-form"),
        "and the form is back",
      ).toBeVisible();
    });
  });

  // A wrong password, and Carol's inactive account, are refused with the
  // server's own words under the form.
  test("a wrong password and the inactive account are refused under the form", async ({
    page,
  }) => {
    expected(
      "'Invalid email or password.' for a wrong password; 'This account is inactive.' for carol@demo.local; still a guest",
    );
    await page.goto("/app/account?runKey=backoffice-refused");

    await test.step("a wrong password", async () => {
      await page.getByTestId("backoffice-email").fill("bob@demo.local");
      await page.getByTestId("backoffice-password").fill("not-the-password");
      await page.getByTestId("backoffice-submit").click();
      await expect(page.getByTestId("backoffice-error"), "refused").toHaveText(
        "Invalid email or password.",
      );
    });

    await test.step("the inactive account", async () => {
      await page.getByTestId("backoffice-email").fill("carol@demo.local");
      await page.getByTestId("backoffice-password").fill("demo1234");
      await page.getByTestId("backoffice-submit").click();
      await expect(page.getByTestId("backoffice-error"), "refused").toHaveText(
        "This account is inactive.",
      );
      await expect(
        page.getByTestId("account-anon"),
        "still a guest",
      ).toBeVisible();
      fact("refused", "wrong password, inactive account");
    });
  });
});
