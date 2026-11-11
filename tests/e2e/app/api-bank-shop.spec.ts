// Reads openapi.json from disk, so answers can be checked against the contract.
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema; ajv-formats adds formats like
// date-time and uuid.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: people, money, the shop and GraphQL.
import {
  DEMO,
  addToCart,
  balanceOf,
  buy,
  cart,
  checkout,
  errorCode,
  graphql,
  historyOf,
  moneyAccounts,
  setStock,
  shopProduct,
  signIn,
  signUpCustomer,
  type ShopOrder,
} from "../../../framework/helpers/bank";

// The gear shop through the API ("a more real back end", phase 2): products
// with real stock, a cart, a checkout that pays from a bank account in one
// database transaction, the loyalty discount, and a retry-safe key.
//
// Stock is shared, so each test owns its own product and sets that product's
// stock first, as an Admin (framework/helpers/bank.ts explains why). The
// products used here: sku-001, 002, 003, 009, 010, 011, 012, 013, 014, 015, 016,
// 017, 023 and 043. No other spec touches them.

// A product's list price in cents, from the catalogue's own rule: $100 plus
// $15 for each step of the sku number. Used only to name the price in a test's
// expectation; every assertion reads the real price from the API.
const priceOf = (n: number) => (100 + n * 15) * 100;

// The OpenAPI document's schemas, taught to Ajv once, and a check of one
// answer against one schema.
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync("openapi.json", "utf8")), "openapi.json");
function matches(schemaName: string, body: unknown) {
  const check = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  const valid = check(body);
  return { valid, errors: check.errors };
}

test.describe("The gear shop (API)", () => {
  // The products now come from the database, in the shape they always had.
  test("the catalogue lists 48 products from the database, with stock", async ({
    request,
  }) => {
    expected(
      "48 products on both APIs; sku-001 is $115 / 11500 cents, Available, with a whole number in stock",
    );
    // The classic API, as the pages and the contract test read it.
    const classic = await (await request.get("/api/products")).json();
    expect(classic.total).toBe(48);
    const first = classic.products[0];
    fact("sku-001", first);
    expect(first).toMatchObject({
      id: "sku-001",
      price: priceOf(1) / 100,
      currency: "USD",
      status: "Available",
    });
    expect(Number.isInteger(first.stock)).toBe(true);

    // The bank's own shop API: the same products, the price in cents.
    const bank = await (await request.get("/api/bank/shop/products")).json();
    expect(bank.total).toBe(48);
    expect(bank.products[0]).toMatchObject({
      id: "sku-001",
      listPriceCents: priceOf(1),
    });
    expect(bank.loyalty).toBeNull();
  });

  // Signed out: the product, but no personal price and no cart.
  test("a signed-out visitor sees the product but no price of their own", async ({
    request,
  }) => {
    expected("sku-002 answers with the product only; adding to cart is 401");
    const detail = await shopProduct(request, "sku-002");
    fact("detail", detail);
    expect(detail.product.listPriceCents).toBe(priceOf(2));
    expect(detail.yourPriceCents).toBeUndefined();

    const added = await addToCart(request, "sku-002");
    expect(added.status()).toBe(401);
  });

  // The whole purchase: cart, checkout, the money, the stock, the order, the
  // history row, the receipt, and privacy.
  test("a customer buys: money and stock go down, the order and its receipt appear", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "3 x sku-010 at its list price: 201; balance down by the total; a shop_purchase row; stock 20 -> 17 on both APIs; cart empty; the order placed with one step; a shop_order notification; another customer gets 404",
    );
    // The Admin stocks the product; the customer signs up.
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-010", 20);
    await signUpCustomer(request, "Shop Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    // Three in the cart, priced at the list price (no discount yet).
    const added = await addToCart(request, "sku-010", 3);
    expect(added.status()).toBe(201);
    const priced = await cart(request);
    fact("cart", priced);
    expect(priced.itemCount).toBe(3);
    expect(priced.subtotalCents).toBe(3 * priceOf(10));
    expect(priced.discountCents).toBe(0);
    expect(priced.totalCents).toBe(priced.subtotalCents);

    // Pay.
    const paid = await checkout(request, checking.id, priced.totalCents);
    expect(paid.status(), await paid.text()).toBe(201);
    const { order, account } = (await paid.json()) as {
      order: ShopOrder;
      account: { balanceCents: number };
    };
    fact("order", order);
    expect(order).toMatchObject({
      status: "placed",
      nextStatus: "packed",
      itemCount: 3,
      totalCents: priced.totalCents,
      accountId: checking.id,
      refundedCents: 0,
    });
    expect(order.lines).toEqual([
      expect.objectContaining({
        productId: "sku-010",
        quantity: 3,
        unitPriceCents: priceOf(10),
      }),
    ]);
    expect(order.events?.map((event) => event.status)).toEqual(["placed"]);

    // The money left the account, with its history row.
    expect(account.balanceCents).toBe(
      checking.balanceCents - priced.totalCents,
    );
    expect(await balanceOf(request, checking.id)).toBe(account.balanceCents);
    const rows = await historyOf(request, checking.id);
    expect(rows[0]).toMatchObject({
      kind: "shop_purchase",
      amountCents: -priced.totalCents,
      description: `Shop order ${order.number}`,
    });

    // The stock went down on both APIs, and the cart is empty.
    expect((await shopProduct(request, "sku-010")).product.stock).toBe(17);
    const classic = await (await request.get("/api/products/sku-010")).json();
    expect(classic.product.stock).toBe(17);
    expect((await cart(request)).itemCount).toBe(0);

    // The order is listed, readable in full, and the receipt arrived.
    const mine = await (await request.get("/api/bank/shop/orders")).json();
    expect(mine.orders.map((item: ShopOrder) => item.id)).toEqual([order.id]);
    const one = await request.get(`/api/bank/shop/orders/${order.id}`);
    expect(one.status()).toBe(200);
    const notes = await (await request.get("/api/bank/notifications")).json();
    expect(
      notes.notifications.some(
        (note: { kind: string; title: string }) =>
          note.kind === "shop_order" && note.title.includes(order.number),
      ),
    ).toBe(true);

    // Someone else's order answers as if it did not exist.
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Other Customer");
    const theirs = await other.get(`/api/bank/shop/orders/${order.id}`);
    expect(theirs.status()).toBe(404);
    expect((await theirs.json()).code).toBe("ORDER_NOT_FOUND");
    await other.dispose();
    await admin.dispose();
  });

  // The total the customer was shown is a check: a different one charges
  // nothing and says the real total.
  test("a total that doesn't match charges nothing and says the real one", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "checkout with $1 against sku-011's real total: 409 PRICE_CHANGED with totalCents; balance, stock and cart unchanged; no order",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-011", 10);
    await signUpCustomer(request, "Price Check Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addToCart(request, "sku-011", 1);

    const refused = await checkout(request, checking.id, 100);
    expect(refused.status()).toBe(409);
    const body = await refused.json();
    fact("answer", body);
    expect(body).toMatchObject({
      code: "PRICE_CHANGED",
      totalCents: priceOf(11),
    });

    // Nothing moved.
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
    expect((await shopProduct(request, "sku-011")).product.stock).toBe(10);
    expect((await cart(request)).itemCount).toBe(1);
    const mine = await (await request.get("/api/bank/shop/orders")).json();
    expect(mine.total).toBe(0);
    await admin.dispose();
  });

  // A Backordered product can't go in the cart.
  test("a backordered product can't be added to the cart", async ({
    request,
  }) => {
    expected("sku-009 is Backordered: 409 BACKORDERED and an empty cart");
    await signUpCustomer(request, "Backorder Customer");
    expect((await shopProduct(request, "sku-009")).product.status).toBe(
      "Backordered",
    );
    const refused = await addToCart(request, "sku-009");
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("BACKORDERED");
    expect((await cart(request)).itemCount).toBe(0);
  });

  // More than there is: refused when adding, with how many there are.
  test("asking for more than is in stock is refused", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "sku-012 with 2 in stock: 3 is 409 OUT_OF_STOCK available 2; 2 is 201; quantity 0 or 100 is 400",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-012", 2);
    await signUpCustomer(request, "Stock Customer");

    const tooMany = await addToCart(request, "sku-012", 3);
    expect(tooMany.status()).toBe(409);
    expect(await tooMany.json()).toMatchObject({
      code: "OUT_OF_STOCK",
      available: 2,
    });
    expect((await addToCart(request, "sku-012", 2)).status()).toBe(201);
    expect((await addToCart(request, "sku-012", 0)).status()).toBe(400);
    expect((await addToCart(request, "sku-012", 100)).status()).toBe(400);
    await admin.dispose();
  });

  // Nothing in the cart: nothing to pay.
  test("checking out an empty cart is refused", async ({ request }) => {
    expected("409 CART_EMPTY and the balance unchanged");
    await signUpCustomer(request, "Empty Cart Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const refused = await checkout(request, checking.id, 1);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("CART_EMPTY");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
  });

  // Not enough in the account: the whole checkout rolls back.
  test("not enough money: nothing is charged and nothing leaves the shelf", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "a cart of sku-043 worth more than Checking holds: 409 INSUFFICIENT_FUNDS; balance, stock and cart unchanged",
    );
    await signUpCustomer(request, "Short Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    // Just enough of the product to cost more than the account holds.
    const quantity = Math.floor(checking.balanceCents / priceOf(43)) + 1;
    fact("quantity", quantity);
    expect(quantity).toBeLessThanOrEqual(99);
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-043", quantity);
    await addToCart(request, "sku-043", quantity);
    const { totalCents } = await cart(request);
    expect(totalCents).toBeGreaterThan(checking.balanceCents);

    const refused = await checkout(request, checking.id, totalCents);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("INSUFFICIENT_FUNDS");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
    expect((await shopProduct(request, "sku-043")).product.stock).toBe(
      quantity,
    );
    expect((await cart(request)).itemCount).toBe(quantity);
    await admin.dispose();
  });

  // Spending in the shop earns the next tier: 2% off from $1,000.
  test("after $1,000 in the shop the next cart is 2% off", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "4 x sku-014 ($1,240) earns 200 basis points; 1 x sku-015 then costs its price less 2% (rounded down), on the cart, the product page and the order",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-014", 10);
    await setStock(admin, "sku-015", 10);
    await signUpCustomer(request, "Loyal Customer");

    // The first order, at full price.
    const first = await buy(request, "sku-014", 4);
    expect(first.order.discountCents).toBe(0);
    expect(first.order.totalCents).toBe(4 * priceOf(14));

    // The next one, at 2% off.
    const discount = Math.floor((priceOf(15) * 200) / 10000);
    const detail = await shopProduct(request, "sku-015");
    expect(detail.yourPriceCents).toBe(priceOf(15) - discount);
    await addToCart(request, "sku-015", 1);
    const priced = await cart(request);
    fact("cart", priced);
    expect(priced.discountBasisPoints).toBe(200);
    expect(priced.discountCents).toBe(discount);
    expect(priced.totalCents).toBe(priceOf(15) - discount);
    const paid = await checkout(request, first.account.id, priced.totalCents);
    expect(paid.status()).toBe(201);
    const { order } = await paid.json();
    expect(order).toMatchObject({
      subtotalCents: priceOf(15),
      discountBasisPoints: 200,
      discountCents: discount,
      totalCents: priceOf(15) - discount,
    });
    await admin.dispose();
  });

  // A retried checkout with the same Idempotency-Key pays once.
  test("the same Idempotency-Key twice pays once and replays the first answer", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "201, then 200 with Idempotent-Replayed: true and the same order; one order, one payment, stock down by one",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-016", 5);
    await signUpCustomer(request, "Retry Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addToCart(request, "sku-016", 1);
    const { totalCents } = await cart(request);
    const key = `shop-retry-${Date.now()}`;

    const first = await checkout(request, checking.id, totalCents, { key });
    expect(first.status()).toBe(201);
    const second = await checkout(request, checking.id, totalCents, { key });
    expect(second.status()).toBe(200);
    expect(second.headers()["idempotent-replayed"]).toBe("true");
    const a = (await first.json()).order;
    const b = (await second.json()).order;
    fact("orders", [a.number, b.number]);
    expect(b.id).toBe(a.id);

    const mine = await (await request.get("/api/bank/shop/orders")).json();
    expect(mine.total).toBe(1);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - totalCents,
    );
    expect((await shopProduct(request, "sku-016")).product.stock).toBe(4);
    await admin.dispose();
  });

  // Two customers race for the last one: exactly one gets it.
  test("two checkouts for the last item: one order, the other is out of stock", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "sku-023 with 1 in stock, two customers pay at once: one 201 and one 409 OUT_OF_STOCK; stock 0",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-023", 1);
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(request, "Racer One");
    await signUpCustomer(other, "Racer Two");
    const [mine] = (await moneyAccounts(request)).accounts;
    const [theirs] = (await moneyAccounts(other)).accounts;
    await addToCart(request, "sku-023", 1);
    await addToCart(other, "sku-023", 1);

    const answers = await Promise.all([
      checkout(request, mine.id, priceOf(23)),
      checkout(other, theirs.id, priceOf(23)),
    ]);
    const statuses = answers.map((answer) => answer.status()).sort();
    fact("statuses", statuses);
    expect(statuses).toEqual([201, 409]);
    const loser = answers.find((answer) => answer.status() === 409)!;
    expect((await loser.json()).code).toBe("OUT_OF_STOCK");
    expect((await shopProduct(request, "sku-023")).product.stock).toBe(0);
    await other.dispose();
    await admin.dispose();
  });

  // Demo accounts can look but not buy.
  test("a demo account can't put anything in a cart", async ({ request }) => {
    expected("maya@ adding sku-003: 403 DEMO_READ_ONLY");
    await signIn(request, DEMO.customer);
    const refused = await addToCart(request, "sku-003");
    expect(refused.status()).toBe(403);
    expect((await refused.json()).code).toBe("DEMO_READ_ONLY");
  });

  // Every door: the same purchase through GraphQL.
  test("GraphQL buys the same way: cart, checkout, the order and the money", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "addToCart, cart and checkout through GraphQL: the order PLACED with sku-017, the balance down by the total, the same order on REST",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-017", 5);
    await signUpCustomer(request, "GraphQL Shopper");
    const [checking] = (await moneyAccounts(request)).accounts;

    const added = await graphql<{ addToCart: { itemCount: number } }>(
      request,
      'mutation { addToCart(productId: "sku-017", quantity: 2) { itemCount } }',
    );
    expect(added.data?.addToCart.itemCount).toBe(2);
    const priced = await graphql<{ cart: { totalCents: number } }>(
      request,
      "{ cart { totalCents } }",
    );
    const totalCents = priced.data!.cart.totalCents;
    expect(totalCents).toBe(2 * priceOf(17));

    const paid = await graphql<{
      checkout: {
        order: { id: string; status: string; lines: { productId: string }[] };
        account: { balanceCents: number };
      };
    }>(
      request,
      "mutation($a: ID!, $t: Cents!) { checkout(accountId: $a, expectedTotalCents: $t) { order { id status lines { productId } } account { balanceCents } } }",
      { a: checking.id, t: totalCents },
    );
    fact("answer", paid);
    expect(paid.errors).toBeUndefined();
    expect(paid.data!.checkout.order.status).toBe("PLACED");
    expect(paid.data!.checkout.order.lines[0].productId).toBe("sku-017");
    expect(paid.data!.checkout.account.balanceCents).toBe(
      checking.balanceCents - totalCents,
    );

    // A wrong total is refused the same way as REST.
    await graphql(
      request,
      'mutation { addToCart(productId: "sku-017") { itemCount } }',
    );
    const refused = await graphql(
      request,
      "mutation($a: ID!) { checkout(accountId: $a, expectedTotalCents: 100) { order { id } } }",
      { a: checking.id },
    );
    expect(errorCode(refused)).toBe("PRICE_CHANGED");

    const rest = await (await request.get("/api/bank/shop/orders")).json();
    expect(rest.orders.map((order: ShopOrder) => order.id)).toEqual([
      paid.data!.checkout.order.id,
    ]);
    await admin.dispose();
  });

  // The REST docs describe what the shop, the back office, the audit log and
  // the books really answer.
  test("every new answer matches its schema in openapi.json", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "products, one product, the cart, a checkout, my orders, one order, the staff list, the audit page and the books all match their OpenAPI schemas",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-013", 5);
    await signUpCustomer(request, "Contract Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addToCart(request, "sku-013", 1);
    const cartBody = await (await request.get("/api/bank/shop/cart")).json();
    const paid = await checkout(request, checking.id, cartBody.totalCents);
    const paidBody = await paid.json();

    // Each answer and the schema it must match.
    const cases: [string, unknown][] = [
      [
        "BankShopProductsResponse",
        await (await request.get("/api/bank/shop/products")).json(),
      ],
      [
        "BankShopProductDetail",
        await (await request.get("/api/bank/shop/products/sku-013")).json(),
      ],
      ["BankCart", cartBody],
      ["BankCheckoutResponse", paidBody],
      [
        "BankShopOrdersResponse",
        await (await request.get("/api/bank/shop/orders")).json(),
      ],
      [
        "BankShopOrderResponse",
        await (
          await request.get(`/api/bank/shop/orders/${paidBody.order.id}`)
        ).json(),
      ],
      [
        "BankShopOrdersResponse",
        await (await admin.get("/api/bank/admin/shop/orders")).json(),
      ],
      [
        "BankAuditPage",
        await (await admin.get("/api/bank/admin/audit?first=5")).json(),
      ],
      ["BankBooks", await (await admin.get("/api/bank/admin/books")).json()],
    ];
    for (const [schema, body] of cases) {
      const result = matches(schema, body);
      fact(schema, result.valid ? "valid" : result.errors);
      expect(result.valid, `${schema}: ${JSON.stringify(result.errors)}`).toBe(
        true,
      );
    }
    await admin.dispose();
  });
});
