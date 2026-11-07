/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  test,
} from "../../../framework/fixtures/resultBlock";
/** Arms a planted bug for one runKey. */
import { armFlags } from "../../../framework/helpers/flags";

/** The React Account page: who is signed in, and what happens when the session is gone. */
test.describe("React Account (auth/session)", () => {
  // With nothing armed, the page shows the signed-out state.
  test("shows the anonymous state by default", async ({ page }) => {
    expected("the account-anon panel is visible");
    await page.goto("/app/account?runKey=account-anon");
    await expect(page.getByTestId("account-anon")).toBeVisible();
  });

  // With authRequired armed, the API answers 401 and the page says the session expired.
  test("REPORT: authRequired surfaces the 401 session-expired state", async ({
    page,
    request,
  }) => {
    expected("with authRequired armed: the account-expired panel is visible");
    await armFlags(request, "account-401", { authRequired: true });
    await page.goto("/app/account?runKey=account-401");
    await expect(page.getByTestId("account-expired")).toBeVisible();
  });
});
