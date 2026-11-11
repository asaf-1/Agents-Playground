// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: people, money, the shop and GraphQL.
import {
  DEMO,
  addToCart,
  balanceOf,
  cart,
  checkout,
  graphql,
  moneyAccounts,
  setStock,
  shopProduct,
  signIn,
  signUpCustomer,
  uniqueRunKey,
  type ShopOrder,
} from "../../../framework/helpers/bank";

// The gear shop's three planted bugs, each armed for one run key only. Without
// the flag each one is refused, which api-bank-shop.spec.ts checks. The
// products used here: sku-022, 024, 025 and 027 (each test owns its own).

// A product's list price in cents ($100 plus $15 per step of the sku number).
const priceOf = (n: number) => (100 + n * 15) * 100;

test.describe("The gear shop's planted bugs", () => {
  // Two checkouts read the last one at the same time and both win.
  test("bankShopOversell: two customers both buy the last item", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankShopOversell armed, sku-022 with 1 in stock and two checkouts at once: both 201, two orders, stock 0",
    );
    const runKey = uniqueRunKey("shop-oversell");
    await armFlags(request, runKey, { bankShopOversell: true });
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-022", 1);

    // Two customers, each with the last one in the cart.
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(request, "Oversell One");
    await signUpCustomer(other, "Oversell Two");
    const [mine] = (await moneyAccounts(request)).accounts;
    const [theirs] = (await moneyAccounts(other)).accounts;
    await addToCart(request, "sku-022", 1);
    await addToCart(other, "sku-022", 1);

    // Both pay at the same moment.
    const answers = await Promise.all([
      checkout(request, mine.id, priceOf(22), { runKey }),
      checkout(other, theirs.id, priceOf(22), { runKey }),
    ]);
    const statuses = answers.map((answer) => answer.status());
    fact("statuses", statuses);
    expect(statuses).toEqual([201, 201]);
    const orders = await Promise.all(
      answers.map(async (answer) => (await answer.json()).order as ShopOrder),
    );
    fact(
      "orders",
      orders.map((order) => order.number),
    );
    expect(orders[0].id).not.toBe(orders[1].id);

    // One item, two orders, and the stock still reads 0.
    expect((await shopProduct(request, "sku-022")).product.stock).toBe(0);
    await other.dispose();
    await admin.dispose();
  });

  // The account is charged the total the browser sent.
  test("bankShopClientPrice: checkout charges whatever total is sent", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankShopClientPrice armed, sku-024 for $1: 201, totalCents 100, the line still at its list price, the balance down by $1",
    );
    const runKey = uniqueRunKey("shop-client-price");
    await armFlags(request, runKey, { bankShopClientPrice: true });
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-024", 5);
    await signUpCustomer(request, "Bargain Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addToCart(request, "sku-024", 1);
    expect((await cart(request)).totalCents).toBe(priceOf(24));

    const paid = await checkout(request, checking.id, 100, { runKey });
    expect(paid.status(), await paid.text()).toBe(201);
    const { order } = (await paid.json()) as { order: ShopOrder };
    fact("order", order);
    expect(order.totalCents).toBe(100);
    expect(order.lines?.[0].unitPriceCents).toBe(priceOf(24));
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 100,
    );
    await admin.dispose();
  });

  // The same bug through the other door.
  test("bankShopClientPrice: the same $1 checkout works through GraphQL", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankShopClientPrice armed, GraphQL checkout of sku-025 for $1: no error, totalCents 100",
    );
    const runKey = uniqueRunKey("shop-client-price-graphql");
    await armFlags(request, runKey, { bankShopClientPrice: true });
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-025", 5);
    await signUpCustomer(request, "GraphQL Bargain Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addToCart(request, "sku-025", 1);

    const paid = await graphql<{ checkout: { order: { totalCents: number } } }>(
      request,
      "mutation($a: ID!) { checkout(accountId: $a, expectedTotalCents: 100) { order { totalCents } } }",
      { a: checking.id },
      runKey,
    );
    expect(paid.errors).toBeUndefined();
    expect(paid.data!.checkout.order.totalCents).toBe(100);
    await admin.dispose();
  });

  // The server never checks Backordered, so the API sells it.
  test("bankShopBackorderBuyable: a backordered product goes in the cart and sells", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankShopBackorderBuyable armed, sku-027 (Backordered): add 201, checkout 201, the order holds it",
    );
    const runKey = uniqueRunKey("shop-backorder");
    await armFlags(request, runKey, { bankShopBackorderBuyable: true });
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-027", 5);
    await signUpCustomer(request, "Backorder Buyer");
    const [checking] = (await moneyAccounts(request)).accounts;
    expect((await shopProduct(request, "sku-027")).product.status).toBe(
      "Backordered",
    );

    const added = await addToCart(request, "sku-027", 1, runKey);
    expect(added.status(), await added.text()).toBe(201);
    const paid = await checkout(request, checking.id, priceOf(27), { runKey });
    expect(paid.status(), await paid.text()).toBe(201);
    const { order } = (await paid.json()) as { order: ShopOrder };
    expect(order.lines?.[0].productId).toBe("sku-027");
    await admin.dispose();
  });
});
