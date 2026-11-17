// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// A unique email.
import { uniqueEmail } from "../../../framework/helpers/bank";

// The sign-up limit on the Sign up page (md/plans/feedback-fixes-plan.md,
// Part 2; web/src/pages/SignUpPage.tsx). The page states the limit from the
// bank's own numbers (GET /api/bank/status), and past it the form says how long
// to wait. The suite's server has no limit, so the first and last tests give
// the page the answer a limited bank (like Render's) would send.

test("the Sign up page states the address limit in the bank's own numbers", async ({
  page,
}) => {
  expected("status says 10 at once, one every 60 s: the page says so in words");

  // The status answer of a bank with Render's limit.
  await test.step("answer the page's status request as a limited bank", async () => {
    await page.route("**/api/bank/status", (route) =>
      route.fulfill({
        json: {
          database: "pglite",
          migrations: 16,
          limits: { signup: { burst: 10, everySeconds: 60 } },
        },
      }),
    );
  });

  await test.step("open the Sign up page", async () => {
    await page.goto("/app/signup");
  });

  await test.step("read the limit under the heading", async () => {
    await expect(
      page.getByTestId("signup-limit"),
      "the page states the limit in words, from the bank's numbers",
    ).toHaveText(
      "One address can open 10 accounts at once, then one more every minute.",
    );
  });
});

test("the Sign up page says nothing about a limit when the bank has none", async ({
  page,
}) => {
  expected("the suite's bank has no limit: no limit line on the page");

  // Waiting starts before the page opens, so the answer can't be missed.
  await test.step("open the Sign up page and wait for the bank's status", async () => {
    const status = page.waitForResponse("**/api/bank/status");
    await page.goto("/app/signup");
    await status;
    await expect(
      page.getByTestId("signup-form"),
      "the sign-up form is shown",
    ).toBeVisible();
  });

  // The status answer is in; with no limit there is nothing to state.
  await test.step("look for a limit line", async () => {
    await expect(
      page.getByTestId("signup-limit"),
      "no limit line, because this bank has no limit",
    ).toHaveCount(0);
  });
});

test("past the address limit, the Sign up form says how long to wait", async ({
  page,
}) => {
  expected(
    "register answers 429 TOO_MANY_SIGNUPS: the form shows the bank's message with the wait",
  );
  // What a limited bank answers past the limit.
  const refusal =
    "Too many new accounts from your address. Try again in 45 seconds.";
  fact("refusal", refusal);

  await test.step("answer the sign-up as a bank past its limit", async () => {
    await page.route("**/api/bank/register", (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "45" },
        json: {
          code: "TOO_MANY_SIGNUPS",
          message: refusal,
          retryAfterSeconds: 45,
        },
      }),
    );
  });

  await test.step("fill in the form and press Create account", async () => {
    await page.goto("/app/signup");
    await page.getByTestId("signup-fullName").fill("Limit Tester");
    await page.getByTestId("signup-email").fill(uniqueEmail("limit-page"));
    await page.getByTestId("signup-password").fill("practice123");
    await page.getByTestId("signup-confirmPassword").fill("practice123");
    await page.getByTestId("signup-acceptTerms").check();
    await page.getByTestId("signup-submit").click();
  });

  await test.step("read what the form says", async () => {
    await expect(
      page.getByTestId("signup-error"),
      "the form shows the bank's refusal with how long to wait",
    ).toHaveText(refusal);
  });
});
