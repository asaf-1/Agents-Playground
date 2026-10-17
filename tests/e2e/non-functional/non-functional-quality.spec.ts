import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
import { expect, test } from "../../../framework/fixtures/baseTest";

test.describe("non-functional quality gates", () => {
  test("positive non-functional checks meet local latency and responsive quality expectations", async ({
    dashboardPage,
    page,
    productPage,
    request,
  }) => {
    const healthStart = Date.now();
    const healthResponse = await request.get("/api/health");
    const healthDurationMs = Date.now() - healthStart;

    expect(healthResponse.status()).toBe(200);
    expect(healthDurationMs).toBeLessThan(1000);

    const dashboardStart = Date.now();
    await dashboardPage.goto("stable");
    await dashboardPage.waitForOrdersLoaded(3);
    const dashboardDurationMs = Date.now() - dashboardStart;

    expect(dashboardDurationMs).toBeLessThan(4000);

    await page.setViewportSize({ width: 390, height: 844 });
    await productPage.goto("sku-123", "valid");
    await productPage.expectLoaded();
    const validation = await new PageValidationAgent(
      page,
    ).validateProductPage();

    expect(validation.valid).toBeTruthy();
  });

  test("negative non-functional checks surface latency degradation and broken render quality", async ({
    dashboardPage,
    page,
    productPage,
  }) => {
    let slowLoadTimedOut = false;

    await dashboardPage.goto("slow", 5500);

    try {
      await page.waitForSelector("[data-testid='orders-row']", {
        timeout: 2500,
      });
    } catch (error) {
      slowLoadTimedOut = true;
    }

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

    const validation = await new PageValidationAgent(
      page,
    ).validateProductPage();

    expect(validation.valid).toBeFalsy();
    expect(
      validation.issues.some((issue) => issue.includes("NaN token")),
    ).toBeTruthy();
    expect(
      validation.issues.some((issue) => issue.includes("undefined token")),
    ).toBeTruthy();
  });
});
