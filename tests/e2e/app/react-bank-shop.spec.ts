// axe-core's Playwright runner, which checks a page for accessibility problems.
import AxeBuilder from "@axe-core/playwright";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: people, money and the shop.
import {
  DEMO,
  addToCart,
  balanceOf,
  moneyAccounts,
  setStock,
  signIn,
  signUpCustomer,
  usd,
} from "../../../framework/helpers/bank";

// The gear shop in the browser ("a more real back end", phase 2): the buy
// panel on a product page, the cart in the top bar, the Cart page, checkout,
// the order page and My orders. The products used here: sku-018 (Backordered),
// 019, 020 and 021 (each test owns its own).

// A product's list price in cents ($100 plus $15 per step of the sku number).
const priceOf = (n: number) => (100 + n * 15) * 100;

test.describe("The gear shop (browser)", () => {
  // The whole purchase, clicked through.
  test("a customer buys from the product page and follows the order", async ({
    page,
    playwright,
    baseURL,
  }) => {
    expected(
      "sku-020: your price, 2 added, the top bar says 2; the cart totals 2 x the price; Pay opens the order, Placed, one step; stock 10 -> 8; My orders lists it; the balance down by the total; no cart count left; no axe violations on the cart and the order",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-020", 10);
    await signUpCustomer(page.request, "Browser Shopper");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    const total = 2 * priceOf(20);
    fact("total", total);

    // The product page: the price, how many, Add to cart.
    await page.goto("/app/products/sku-020");
    await expect(page.getByTestId("buy-your-price")).toHaveText(
      usd(priceOf(20)),
    );
    await expect(page.getByTestId("buy-loyalty")).toContainText(
      "No loyalty discount yet.",
    );
    await page.getByTestId("buy-quantity").fill("2");
    await page.getByTestId("buy-add").click();
    await expect(page.getByTestId("buy-added")).toContainText("Added 2");
    await expect(page.getByTestId("cart-count")).toHaveText("2");

    // The cart, then Pay.
    await page.getByTestId("buy-go-cart").click();
    await expect(page.getByTestId("cart-page")).toBeVisible();
    await expect(page.getByTestId("cart-qty-sku-020")).toHaveText("2");
    await expect(page.getByTestId("cart-total")).toHaveText(usd(total));
    const cartScan = await new AxeBuilder({ page }).analyze();
    fact("cart violations", cartScan.violations.length);
    expect(cartScan.violations).toEqual([]);
    await page.getByTestId("cart-account").selectOption(checking.id);
    await page.getByTestId("cart-pay").click();

    // The order page.
    await expect(page).toHaveURL(/\/app\/shop\/orders\/[0-9a-f-]{36}/);
    await expect(page.getByTestId("shop-order-status")).toHaveText("Placed");
    await expect(page.getByTestId("shop-order-total")).toHaveText(usd(total));
    await expect(page.getByTestId("shop-order-line-sku-020")).toBeVisible();
    await expect(page.getByTestId("shop-order-event")).toHaveCount(1);
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
    const orderScan = await new AxeBuilder({ page }).analyze();
    fact("order violations", orderScan.violations.length);
    expect(orderScan.violations).toEqual([]);

    // The stock, My orders, and the money.
    await page.goto("/app/products/sku-020");
    await expect(page.getByTestId("product-stock")).toHaveText("8 in stock");
    await page.goto("/app/shop/orders");
    await expect(
      page.getByTestId("shop-orders-table").locator("tbody tr"),
    ).toHaveCount(1);
    expect(await balanceOf(page.request, checking.id)).toBe(
      checking.balanceCents - total,
    );
    await admin.dispose();
  });

  // The cart's own controls.
  test("the cart changes a quantity and removes a line", async ({
    page,
    playwright,
    baseURL,
  }) => {
    expected(
      "sku-021 x1 in the cart; + makes it 2 and the total 2 x the price; remove empties the cart",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-021", 10);
    await signUpCustomer(page.request, "Cart Tinkerer");
    expect((await addToCart(page.request, "sku-021", 1)).status()).toBe(201);

    await page.goto("/app/shop/cart");
    await expect(page.getByTestId("cart-qty-sku-021")).toHaveText("1");
    await page.getByTestId("cart-more-sku-021").click();
    await expect(page.getByTestId("cart-qty-sku-021")).toHaveText("2");
    await expect(page.getByTestId("cart-total")).toHaveText(
      usd(2 * priceOf(21)),
    );
    await page.getByTestId("cart-remove-sku-021").click();
    await expect(page.getByTestId("cart-empty")).toBeVisible();
    await admin.dispose();
  });

  // No dead button on a product that can't be bought.
  test("a backordered product says why instead of showing Add to cart", async ({
    page,
  }) => {
    expected("sku-018 signed in: 'Backordered' note, no Add to cart button");
    await signUpCustomer(page.request, "Backorder Browser");
    await page.goto("/app/products/sku-018");
    await expect(page.getByTestId("buy-backordered")).toBeVisible();
    await expect(page.getByTestId("buy-add")).toHaveCount(0);
  });

  // Signed out: a way in, not a broken form.
  test("signed out, the product page offers a log-in and there is no cart", async ({
    page,
  }) => {
    expected(
      "sku-019 signed out: the log-in card, no cart button, no Cart link",
    );
    await page.goto("/app/products/sku-019");
    await expect(page.getByTestId("buy-signed-out")).toBeVisible();
    await expect(page.getByTestId("cart-button")).toHaveCount(0);
    await expect(page.getByTestId("nav-link-cart")).toHaveCount(0);
  });

  // Demo accounts look but don't buy.
  test("a demo account sees its price but a read-only note", async ({
    page,
  }) => {
    expected("maya@ on sku-019: the read-only note, no Add to cart");
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/products/sku-019");
    await expect(page.getByTestId("buy-demo")).toBeVisible();
    await expect(page.getByTestId("buy-add")).toHaveCount(0);
  });
});
