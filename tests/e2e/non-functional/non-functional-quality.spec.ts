// Speed and look on the bank: how fast things answer and render, and whether
// a page holds together on a phone-sized screen. (Until 2026-11-20 this
// checked the original demo site.)

/** The framework's page checker: is the product page whole and readable? */
import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";
/** A runKey of the test's own. */
import { uniqueRunKey } from "../../../framework/helpers/bank";

test.describe("non-functional quality gates", () => {
  // The live check answers in under a second, the orders load in under four,
  // and a product page passes the checker at phone size.
  test("positive non-functional checks meet local latency and responsive quality expectations", async ({
    ordersPage,
    page,
    productPage,
    request,
  }) => {
    expected(
      "the live check 200 in under 1000 ms; /app/orders with 3 orders in under 4000 ms; the first product's page valid at 390x844",
    );

    await test.step("the live check is quick", async () => {
      const start = Date.now();
      const live = await request.get("/api/bank/health/live");
      const ms = Date.now() - start;
      fact("live ms", ms);
      expect(live.status(), "the live check answers 200").toBe(200);
      expect(ms, "in under a second").toBeLessThan(1000);
    });

    await test.step("the orders load quickly", async () => {
      const start = Date.now();
      await ordersPage.goto(uniqueRunKey("nonfunctional-orders"));
      await ordersPage.waitForOrdersLoaded(3);
      const ms = Date.now() - start;
      fact("orders ms", ms);
      expect(ms, "in under four seconds").toBeLessThan(4000);
    });

    await test.step("a product page holds together at phone size", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const catalogue = await (await request.get("/api/products")).json();
      await productPage.goto(catalogue.products[0].id);
      const validation = await new PageValidationAgent(
        page,
      ).validateProductPage();
      fact("valid", validation.valid);
      expect(validation.valid, validation.explanation).toBe(true);
    });
  });

  // Slow mode has no rows after 2.5 seconds and shows its loading line, and
  // the broken product page fails the checker for its NaN price.
  test("negative non-functional checks surface latency degradation and broken render quality", async ({
    ordersPage,
    page,
    productPage,
    request,
  }) => {
    expected(
      "in slow mode (7 s) no order rows after 2500 ms and 'Loading orders…' shown; with productRenderBroken armed, the product page is not valid, naming a NaN token and a non-finite number",
    );

    await test.step("slow mode is still loading after 2.5 seconds", async () => {
      await ordersPage.goto(uniqueRunKey("nonfunctional-slow"));
      // Let the stable answer land, then switch to slow and give it 2.5 s.
      await ordersPage.waitForOrdersLoaded(3);
      await ordersPage.chooseMode("slow");
      let timedOut = false;
      try {
        await ordersPage.rows
          .first()
          .waitFor({ state: "visible", timeout: 2500 });
      } catch {
        timedOut = true;
      }
      fact("timed out", timedOut);
      expect(timedOut, "no rows within 2.5 seconds").toBe(true);
      await expect(ordersPage.loading, "the loading line shows").toBeVisible();
    });

    await test.step("the broken product page fails the checker", async () => {
      const runKey = uniqueRunKey("nonfunctional-broken");
      await request.post("/api/test/flags", {
        data: { runKey, flags: { productRenderBroken: true } },
      });
      try {
        const catalogue = await (await request.get("/api/products")).json();
        await productPage.goto(catalogue.products[0].id, runKey);
        const validation = await new PageValidationAgent(
          page,
        ).validateProductPage();
        fact("issues", validation.issues);
        expect(validation.valid, "not valid").toBe(false);
        expect(
          validation.issues.some((issue) => issue.includes("NaN token")),
          "the NaN on the page",
        ).toBe(true);
        expect(
          validation.issues.some((issue) =>
            issue.includes("not a finite number"),
          ),
          "the price that is not a number",
        ).toBe(true);
      } finally {
        await request.delete(
          `/api/test/flags?runKey=${encodeURIComponent(runKey)}`,
        );
      }
    });
  });
});
