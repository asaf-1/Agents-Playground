// The type of a browser page.
import { type Page } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

// The practice switch in the top bar, and the Practice page at /app/practice.
//
// Toggling reloads the page on purpose: most of these bugs change what the
// server answers, and the pages hold cached answers from before the switch.

// Clicking reloads the page, so waiting on a load state races the reload --
// it can resolve against the load that already happened. Waiting for the
// switch itself to report the new state is the thing actually being waited on.
async function toggle(page: Page) {
  // Which way the switch is now.
  const before =
    (await page.getByTestId("practice-switch").getAttribute("aria-checked")) ===
    "true";
  fact("practice", before ? "on -> off" : "off -> on");
  // Click it, and wait until it reports the other way.
  await page.getByTestId("practice-switch").click();
  await expect(page.getByTestId("practice-switch")).toHaveAttribute(
    "aria-checked",
    String(!before),
  );
}

test.describe("Practice mode (/app/practice)", () => {
  // The switch is in the top bar of every page, and starts off.
  test("the switch is in the top bar, off, on every page", async ({ page }) => {
    expected("the switch reads off on /app, /app/markets and /app/bank");
    for (const path of ["/app", "/app/markets", "/app/bank"]) {
      await page.goto(path);
      await expect(page.getByTestId("practice-switch")).toHaveAttribute(
        "aria-checked",
        "false",
      );
    }
  });

  // The Practice page lists the planted bugs, each with its verdict and where to look.
  test("the page lists every planted bug with where to look", async ({
    page,
  }) => {
    expected(
      "heading 'What to look for'; bankNegativeTransfer REPORT on /app/bank/transfer; ordersRefreshLabel HEAL; more than 20 cards",
    );
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

  // A bug's answer is hidden until its button is pressed, and hides again.
  test("an answer stays hidden until you ask for it", async ({ page }) => {
    expected(
      "the bankTransferRace answer hidden; shown with 'Check-then-act' after a click; hidden after another",
    );
    await page.goto("/app/practice");
    const answer = page.getByTestId("bug-answer-bankTransferRace");
    await expect(answer).toHaveCount(0);

    // Show it.
    await page.getByTestId("bug-reveal-bankTransferRace").click();
    await expect(answer).toBeVisible();
    await expect(answer).toContainText("Check-then-act");

    // Hide it again.
    await page.getByTestId("bug-reveal-bankTransferRace").click();
    await expect(answer).toHaveCount(0);
  });

  // On, a planted fault is live (Orders' button reads Reload); off, it is clean again.
  test("turning it on makes the site buggy, and off makes it clean", async ({
    page,
  }) => {
    expected(
      "'Practice mode is off', then on; Orders refresh reads Reload; after switching off, Refresh",
    );
    await page.goto("/app/practice");
    await expect(page.getByTestId("practice-state")).toContainText(
      "Practice mode is off",
    );

    // Switch it on.
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

    // Switch it off: clean again.
    await toggle(page);
    await expect(page.getByTestId("orders-refresh")).toHaveText("Refresh");
  });

  // Once on, the switch stays on across pages, with no runKey in any URL.
  test("the mode follows you from page to page", async ({ page }) => {
    expected(
      "the switch reads on at /app/markets, /app/bank and /app/orders, none with runKey in the URL",
    );
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

  // Practice mode in one browser doesn't reach a second browser.
  test("another visitor still sees the clean site", async ({
    page,
    browser,
  }) => {
    expected(
      "this browser's Orders reads Reload; a second browser's reads Refresh with the switch off",
    );
    // Switch on in this browser.
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

  // The sidebar's Practice link opens the page.
  test("the page is reachable from the sidebar", async ({ page }) => {
    expected("the Practice link opens 'What to look for'");
    await page.goto("/app");
    await page.getByTestId("nav-link-practice").click();
    await expect(page.getByTestId("app-heading")).toHaveText(
      "What to look for",
    );
  });
});
