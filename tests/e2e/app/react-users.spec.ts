/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  test,
} from "../../../framework/fixtures/resultBlock";
/** Arms a planted bug for one runKey. */
import { armFlags } from "../../../framework/helpers/flags";

/** The React Users page: search, creating a user, and three planted bugs. */
test.describe("React Users (search, create, drift)", () => {
  // A search with no match shows the empty state.
  test("client-side search filters the list by name", async ({ page }) => {
    expected("searching 'zzz-no-such-user' shows users-no-results");
    await page.goto("/app/users?runKey=users-search");
    await expect(page.getByTestId("users-table")).toBeVisible();
    await page.getByTestId("users-search").fill("zzz-no-such-user");
    await expect(page.getByTestId("users-no-results")).toBeVisible();
  });

  // With the bug armed, the search applies the previous (empty) text, so a
  // no-match search still shows every row.
  test("REPORT: usersSearchStale applies the previous query (stale closure)", async ({
    page,
    request,
  }) => {
    expected(
      "with usersSearchStale armed: after a no-match search the table still shows and there is no empty state",
    );
    await armFlags(request, "users-stale", { usersSearchStale: true });
    await page.goto("/app/users?runKey=users-stale");
    await expect(page.getByTestId("users-table")).toBeVisible();
    await page.getByTestId("users-search").fill("zzz-no-such-user");
    // BUG: the stale debounce applies the prior (empty) query, so a no-match
    // search still shows every row instead of the empty state.
    await expect(page.getByTestId("users-table")).toBeVisible();
    await expect(page.getByTestId("users-no-results")).toHaveCount(0);
  });

  // With the bug armed, the "as of" date is written the German way.
  test("REPORT: usersLocaleBug renders a de-DE date instead of en-US", async ({
    page,
    request,
  }) => {
    expected(
      "with usersLocaleBug armed: the as-of date has dots and no slashes",
    );
    await armFlags(request, "users-locale", { usersLocaleBug: true });
    await page.goto("/app/users?runKey=users-locale");
    const asOf = page.getByTestId("users-asof");
    // de-DE short date uses dot separators (15.01.26); en-US uses slashes.
    await expect(asOf).toContainText(".");
    await expect(asOf).not.toContainText("/");
  });

  // With the bug armed, creating a user is refused (409) and the row added
  // ahead of time is taken back.
  test("REPORT: userCreateConflict rolls back the optimistic row", async ({
    page,
    request,
  }) => {
    expected(
      "with userCreateConflict armed: a server error shows and 'Conflicting User' is not on the page",
    );
    await armFlags(request, "users-conflict", { userCreateConflict: true });
    await page.goto("/app/users?runKey=users-conflict");
    // Create "Conflicting User".
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
