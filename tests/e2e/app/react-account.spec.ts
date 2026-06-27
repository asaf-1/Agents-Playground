import { expect, test } from "@playwright/test";
import { armFlags } from "./_helpers";

test.describe("React Account (auth/session)", () => {
  test("shows the anonymous state by default", async ({ page }) => {
    await page.goto("/app/account?runKey=account-anon");
    await expect(page.getByTestId("account-anon")).toBeVisible();
  });

  test("REPORT: authRequired surfaces the 401 session-expired state", async ({
    page,
    request,
  }) => {
    await armFlags(request, "account-401", { authRequired: true });
    await page.goto("/app/account?runKey=account-401");
    await expect(page.getByTestId("account-expired")).toBeVisible();
  });
});
