import { expect, test } from "@playwright/test";
import { armFlags } from "./_helpers";

test.describe("React Users (search, create, drift)", () => {
  test("client-side search filters the list by name", async ({ page }) => {
    await page.goto("/app/users?runKey=users-search");
    await expect(page.getByTestId("users-table")).toBeVisible();
    await page.getByTestId("users-search").fill("zzz-no-such-user");
    await expect(page.getByTestId("users-no-results")).toBeVisible();
  });

  test("REPORT: usersSearchStale applies the previous query (stale closure)", async ({
    page,
    request,
  }) => {
    await armFlags(request, "users-stale", { usersSearchStale: true });
    await page.goto("/app/users?runKey=users-stale");
    await expect(page.getByTestId("users-table")).toBeVisible();
    await page.getByTestId("users-search").fill("zzz-no-such-user");
    // BUG: the stale debounce applies the prior (empty) query, so a no-match
    // search still shows every row instead of the empty state.
    await expect(page.getByTestId("users-table")).toBeVisible();
    await expect(page.getByTestId("users-no-results")).toHaveCount(0);
  });

  test("REPORT: usersLocaleBug renders a de-DE date instead of en-US", async ({
    page,
    request,
  }) => {
    await armFlags(request, "users-locale", { usersLocaleBug: true });
    await page.goto("/app/users?runKey=users-locale");
    const asOf = page.getByTestId("users-asof");
    // de-DE short date uses dot separators (15.01.26); en-US uses slashes.
    await expect(asOf).toContainText(".");
    await expect(asOf).not.toContainText("/");
  });

  test("REPORT: userCreateConflict rolls back the optimistic row", async ({
    page,
    request,
  }) => {
    await armFlags(request, "users-conflict", { userCreateConflict: true });
    await page.goto("/app/users?runKey=users-conflict");
    await page.getByTestId("users-create-open").click();
    await page.getByTestId("users-create-name").fill("Conflicting User");
    await page.getByTestId("users-create-submit").click();
    // Server returns 409 -> the optimistic row is rolled back and an error shows.
    await expect(page.getByTestId("users-create-server-error")).toBeVisible();
    await expect(page.getByTestId("users-page")).not.toContainText(
      "Conflicting User",
    );
  });
});
