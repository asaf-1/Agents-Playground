// The quickest proof the bank's main pages work: the bank is ready, its home
// page passes its contract, the back office's orders load, and a gear-shop
// product passes the page checker. (Until 2026-11-20 this checked the
// original demo site; it moved to the bank with everything else.)

/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

test("sanity smoke covers the bank's home, the orders, and a product page", async ({
  homePage,
  ordersPage,
  productPage,
  request,
}) => {
  expected(
    "the ready check says ready; the home page passes its contract; /app/orders shows 3 orders with no error; the first product passes its contract with a $ price",
  );

  await test.step("the bank is ready", async () => {
    const ready = await request.get("/api/bank/health/ready");
    expect(ready.status(), "the ready check answers 200").toBe(200);
    expect((await ready.json()).status, "and says ready").toBe("ready");
  });

  await test.step("the home page passes its contract", async () => {
    await homePage.goto();
    const validation = await homePage.expectLoaded();
    fact("home", validation.valid);
  });

  await test.step("the orders load", async () => {
    await ordersPage.goto("sanity-orders");
    await ordersPage.waitForOrdersLoaded(3);
    await expect(ordersPage.error, "no error on the orders page").toBeHidden();
  });

  await test.step("a product page passes its contract", async () => {
    // The first product the shop lists, not a name written into the test.
    const catalogue = await (await request.get("/api/products")).json();
    const product = catalogue.products[0];
    fact("product", product.id);
    await productPage.goto(product.id);
    await productPage.expectLoaded();
    await expect(productPage.title, "the product's own name").toHaveText(
      product.name,
    );
    await expect(productPage.price, "a dollar price").toContainText("$");
  });
});
