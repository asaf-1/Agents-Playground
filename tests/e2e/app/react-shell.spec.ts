// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  test,
} from "../../../framework/fixtures/resultBlock";

// Phase 0 smoke coverage for the new Vite + React surface served at /app.
// Proves the toolchain end to end: the built SPA renders, client-side routing
// works, and the server SPA fallback serves index.html for deep /app routes.
test.describe("React SPA shell (/app)", () => {
  // The home page renders, and the About link moves to /app/about in the browser.
  test("renders the React home surface and navigates client-side", async ({
    page,
  }) => {
    expected(
      "app-root visible with its heading; About link goes to /app/about",
    );
    await page.goto("/app");

    // The app and its heading are there.
    await expect(page.getByTestId("app-root")).toBeVisible();
    await expect(page.getByTestId("app-heading")).toHaveText(
      "Agents Playground",
    );

    // Click About: the URL and the page change without a reload.
    await page.getByTestId("nav-about").click();
    await expect(page).toHaveURL(/\/app\/about$/);
    await expect(page.getByTestId("app-about")).toBeVisible();
  });

  // Opening /app/about directly still works: the server sends the app's page.
  test("serves the SPA index on a deep client route (server fallback)", async ({
    page,
  }) => {
    expected("app-about visible, heading 'About this surface'");
    await page.goto("/app/about");

    await expect(page.getByTestId("app-about")).toBeVisible();
    await expect(page.getByTestId("app-heading")).toHaveText(
      "About this surface",
    );
  });
});
