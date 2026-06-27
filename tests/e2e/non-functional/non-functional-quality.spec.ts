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
