import { expect, test } from "@playwright/test";

// Phase 0 smoke coverage for the new Vite + React surface served at /app.
// Proves the toolchain end to end: the built SPA renders, client-side routing
// works, and the server SPA fallback serves index.html for deep /app routes.
test.describe("React SPA shell (/app)", () => {
  test("renders the React home surface and navigates client-side", async ({
    page,
  }) => {
    await page.goto("/app");

    await expect(page.getByTestId("app-root")).toBeVisible();
    await expect(page.getByTestId("app-heading")).toHaveText(
      "Agents Playground React surface",
    );

    await page.getByTestId("nav-about").click();
    await expect(page).toHaveURL(/\/app\/about$/);
    await expect(page.getByTestId("app-about")).toBeVisible();
  });

  test("serves the SPA index on a deep client route (server fallback)", async ({
    page,
  }) => {
    await page.goto("/app/about");

    await expect(page.getByTestId("app-about")).toBeVisible();
    await expect(page.getByTestId("app-heading")).toHaveText(
      "About this surface",
    );
  });
});
