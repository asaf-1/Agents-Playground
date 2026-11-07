/** The framework's page checker: is the product page whole and readable? */
import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

/**
 * Speed and look: how fast things answer and render, and whether a page holds
 * together on a phone-sized screen.
 */
test.describe("non-functional quality gates", () => {
  // Health answers in under a second, the dashboard loads in under four, and
  // the product page passes the checker at phone size.
  test("positive non-functional checks meet local latency and responsive quality expectations", async ({
    dashboardPage,
    page,
    productPage,
    request,
  }) => {
    expected(
      "health 200 in under 1000 ms; dashboard with 3 orders in under 4000 ms; the product page valid at 390x844",
    );
    // Time the health call.
    const healthStart = Date.now();
    const healthResponse = await request.get("/api/health");
    const healthDurationMs = Date.now() - healthStart;
    fact("health ms", healthDurationMs);

    expect(healthResponse.status()).toBe(200);
    expect(healthDurationMs).toBeLessThan(1000);

    // Time the dashboard until its three orders are in.
    const dashboardStart = Date.now();
    await dashboardPage.goto("stable");
    await dashboardPage.waitForOrdersLoaded(3);
    const dashboardDurationMs = Date.now() - dashboardStart;
    fact("dashboard ms", dashboardDurationMs);

    expect(dashboardDurationMs).toBeLessThan(4000);

    // A phone-sized screen, and the product page checker.
    await page.setViewportSize({ width: 390, height: 844 });
    await productPage.goto("sku-123", "valid");
    await productPage.expectLoaded();
    const validation = await new PageValidationAgent(
      page,
    ).validateProductPage();
    fact("valid", validation.valid);

    expect(validation.valid).toBeTruthy();
  });

  // The slow dashboard hasn't loaded rows in 2.5 seconds and shows its spinner,
  // and the broken product page fails the checker for NaN and undefined.
  test("negative non-functional checks surface latency degradation and broken render quality", async ({
    dashboardPage,
    page,
    productPage,
  }) => {
    expected(
      "the slow dashboard has no rows after 2500 ms and shows the spinner; the broken product page is not valid, naming NaN and undefined tokens",
    );
    // Open the dashboard in slow mode (5.5 s) and wait only 2.5 s for rows.
    let slowLoadTimedOut = false;

    await dashboardPage.goto("slow", 5500);

    try {
      await page.waitForSelector("[data-testid='orders-row']", {
        timeout: 2500,
      });
    } catch (error) {
      slowLoadTimedOut = true;
    }
    fact("timed out", slowLoadTimedOut);

    // No rows in time, and the spinner is up.
    expect(slowLoadTimedOut).toBeTruthy();
    await expect(dashboardPage.spinner).toBeVisible();

    await productPage.goto("sku-123", "broken");

    // Wait for the broken render before judging it. product.js fetches and
    // then paints, so validating straight after goto can read a page that has
    // not been filled in yet: the NaN and undefined tokens are simply not
    // there to find, and the failure reads as "the broken page looks fine".
    // Rare on an idle machine, seen once in 1159 runs under parallel load.
    // The positive test above waits via expectLoaded(); this state cannot use
    // that - the contract is meant to fail here - so it waits on the marker
    // the broken render sets.
    await productPage.expectStateText("Broken state");

    // The checker finds both problems.
    const validation = await new PageValidationAgent(
      page,
    ).validateProductPage();
    fact("issues", validation.issues);

    expect(validation.valid).toBeFalsy();
    expect(
      validation.issues.some((issue) => issue.includes("NaN token")),
    ).toBeTruthy();
    expect(
      validation.issues.some((issue) => issue.includes("undefined token")),
    ).toBeTruthy();
  });
});
