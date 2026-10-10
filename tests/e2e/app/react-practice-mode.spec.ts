import { expect, test, type Page } from "@playwright/test";

// The practice switch in the top bar, and the Practice page at /app/practice.
//
// Toggling reloads the page on purpose: most of these bugs change what the
// server answers, and the pages hold cached answers from before the switch.

// Clicking reloads the page, so waiting on a load state races the reload --
// it can resolve against the load that already happened. Waiting for the
// switch itself to report the new state is the thing actually being waited on.
async function toggle(page: Page) {
  const before =
    (await page.getByTestId("practice-switch").getAttribute("aria-checked")) ===
    "true";
  await page.getByTestId("practice-switch").click();
  await expect(page.getByTestId("practice-switch")).toHaveAttribute(
    "aria-checked",
    String(!before),
  );
}

test.describe("Practice mode (/app/practice)", () => {
  test("the switch is in the top bar, off, on every page", async ({ page }) => {
    for (const path of ["/app", "/app/markets", "/app/bank"]) {
      await page.goto(path);
      await expect(page.getByTestId("practice-switch")).toHaveAttribute(
        "aria-checked",
        "false",
      );
    }
  });

  test("the page lists every planted bug with where to look", async ({
    page,
  }) => {
    await page.goto("/app/practice");
    await expect(page.getByTestId("app-heading")).toHaveText(
      "What to look for",
    );

    const cards = page.locator(".bug-card");
    // Each bug is a card with a verdict, a place, and a hint.
    await expect(page.getByTestId("bug-bankNegativeTransfer")).toBeVisible();
    await expect(
      page.getByTestId("bug-verdict-bankNegativeTransfer"),
    ).toHaveText("REPORT");
    await expect(page.getByTestId("bug-bankNegativeTransfer")).toContainText(
      "/app/bank/transfer",
    );

    // The one HEAL case is marked differently, because the right answer there
    // is to fix the test, not the site.
    await expect(page.getByTestId("bug-verdict-ordersRefreshLabel")).toHaveText(
      "HEAL",
    );
    expect(await cards.count()).toBeGreaterThan(20);
  });

  test("an answer stays hidden until you ask for it", async ({ page }) => {
    await page.goto("/app/practice");
    const answer = page.getByTestId("bug-answer-bankTransferRace");
    await expect(answer).toHaveCount(0);

    await page.getByTestId("bug-reveal-bankTransferRace").click();
    await expect(answer).toBeVisible();
    await expect(answer).toContainText("Check-then-act");

    await page.getByTestId("bug-reveal-bankTransferRace").click();
    await expect(answer).toHaveCount(0);
  });

  test("turning it on makes the site buggy, and off makes it clean", async ({
    page,
  }) => {
    await page.goto("/app/practice");
    await expect(page.getByTestId("practice-state")).toContainText(
      "Practice mode is off",
    );

    await toggle(page);
    await expect(page.getByTestId("practice-switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByTestId("practice-state")).toContainText(
      "Practice mode is on",
    );

    // A planted fault is live now: the Orders refresh button reads "Reload".
    await page.goto("/app/orders");
    await expect(page.getByTestId("orders-refresh")).toHaveText("Reload");

    await toggle(page);
    await expect(page.getByTestId("orders-refresh")).toHaveText("Refresh");
  });

  test("the mode follows you from page to page", async ({ page }) => {
    await page.goto("/app/practice");
    await toggle(page);

    // No run key in any URL: the cookie carries it.
    for (const path of ["/app/markets", "/app/bank", "/app/orders"]) {
      await page.goto(path);
      await expect(page.getByTestId("practice-switch")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(page.url()).not.toContain("runKey");
    }
  });

  test("another visitor still sees the clean site", async ({
    page,
    browser,
  }) => {
    await page.goto("/app/practice");
    await toggle(page);
    await page.goto("/app/orders");
    await expect(page.getByTestId("orders-refresh")).toHaveText("Reload");

    // A second browser, with its own cookies.
    const other = await browser.newContext();
    const theirPage = await other.newPage();
    await theirPage.goto("/app/orders");
    await expect(theirPage.getByTestId("orders-refresh")).toHaveText("Refresh");
    await expect(theirPage.getByTestId("practice-switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await other.close();
  });

  test("the page is reachable from the sidebar", async ({ page }) => {
    await page.goto("/app");
    await page.getByTestId("nav-link-practice").click();
    await expect(page.getByTestId("app-heading")).toHaveText(
      "What to look for",
    );
  });
});
