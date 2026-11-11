// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: people, money, the shop, its back office and GraphQL.
import {
  DEMO,
  balanceOf,
  buy,
  errorCode,
  graphql,
  historyOf,
  moveOrder,
  refundOrder,
  setStock,
  shopProduct,
  signIn,
  signUpCustomer,
  type ShopOrder,
} from "../../../framework/helpers/bank";

// The shop's back office through the API ("a more real back end", phase 3):
// staff see every order; an Admin moves one placed -> packed -> shipped ->
// delivered, one step at a time, or refunds it before delivery, and never
// their own; Support can only look; an Admin restocks. The products used here:
// sku-028 to sku-034 (each test owns its own).

test.describe("The shop's back office (API)", () => {
  // The happy path: every step, the history, and a notification each time.
  test("an Admin moves an order one step at a time and the customer is told", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "placed -> packed -> shipped -> delivered, each 200; four steps in the history by the right people; three shop_order_status notifications; a delivered order can't be refunded (409 ALREADY_DELIVERED)",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-028", 5);
    await signUpCustomer(request, "Stepping Customer");
    const { order } = await buy(request, "sku-028");

    // Each next step in turn.
    for (const status of ["packed", "shipped", "delivered"]) {
      const moved = await moveOrder(admin, order.id, status);
      expect(moved.status(), await moved.text()).toBe(200);
      expect((await moved.json()).order.status).toBe(status);
    }

    // The customer sees the whole history, and was told three times.
    const mine = (
      await (await request.get(`/api/bank/shop/orders/${order.id}`)).json()
    ).order as ShopOrder;
    fact("events", mine.events);
    expect(mine.status).toBe("delivered");
    expect(mine.nextStatus).toBeNull();
    expect(mine.events?.map((event) => event.status)).toEqual([
      "placed",
      "packed",
      "shipped",
      "delivered",
    ]);
    expect(mine.events?.[1].actorName).toBe("Alex Morgan");
    const notes = await (await request.get("/api/bank/notifications")).json();
    const told = notes.notifications.filter(
      (note: { kind: string }) => note.kind === "shop_order_status",
    );
    expect(told).toHaveLength(3);

    // Delivered is the end: no refund.
    const refused = await refundOrder(admin, order.id);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("ALREADY_DELIVERED");
    await admin.dispose();
  });

  // The order of steps is enforced.
  test("a step can't be skipped or undone", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "placed -> delivered 409 STATUS_MOVE_NOT_ALLOWED; placed -> packed 200; packed -> placed 409; a bad status 400",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-029", 5);
    await signUpCustomer(request, "Skipping Customer");
    const { order } = await buy(request, "sku-029");

    const skip = await moveOrder(admin, order.id, "delivered");
    expect(skip.status()).toBe(409);
    expect(await skip.json()).toMatchObject({
      code: "STATUS_MOVE_NOT_ALLOWED",
      from: "placed",
      to: "delivered",
    });
    expect((await moveOrder(admin, order.id, "packed")).status()).toBe(200);
    const back = await moveOrder(admin, order.id, "placed");
    expect(back.status()).toBe(409);
    expect((await moveOrder(admin, order.id, "lost")).status()).toBe(400);
    await admin.dispose();
  });

  // A refund: money back with its row, stock back, once only.
  test("a refund pays the total back with a history row and restocks, once", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "2 x sku-030: refund 200, status refunded, refundedCents = total, the balance back where it started, a shop_refund row, stock 10 again; a second refund 409 ALREADY_REFUNDED; no step after a refund",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-030", 10);
    await signUpCustomer(request, "Refund Customer");
    const { order, account } = await buy(request, "sku-030", 2);
    expect((await shopProduct(request, "sku-030")).product.stock).toBe(8);

    const refunded = await refundOrder(admin, order.id);
    expect(refunded.status(), await refunded.text()).toBe(200);
    const after = (await refunded.json()).order as ShopOrder;
    fact("refunded", after);
    expect(after.status).toBe("refunded");
    expect(after.refundedCents).toBe(order.totalCents);

    // The money is back, the row explains it, the stock is back.
    expect(await balanceOf(request, account.id)).toBe(account.balanceCents);
    const rows = await historyOf(request, account.id);
    expect(rows[0]).toMatchObject({
      kind: "shop_refund",
      amountCents: order.totalCents,
    });
    expect((await shopProduct(request, "sku-030")).product.stock).toBe(10);

    // Once only, and the order goes nowhere after it.
    const again = await refundOrder(admin, order.id);
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("ALREADY_REFUNDED");
    expect((await moveOrder(admin, order.id, "packed")).status()).toBe(409);
    await admin.dispose();
  });

  // Support reads; only an Admin acts. A customer sees none of it.
  test("Support can look but not act, and a customer can't look", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "Support: the list and the order 200, a move 403, a refund 403; a customer: the staff list 403",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-031", 5);
    await signUpCustomer(request, "Watched Customer");
    const { order } = await buy(request, "sku-031");

    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    const list = await support.get("/api/bank/admin/shop/orders?status=placed");
    expect(list.status()).toBe(200);
    expect(
      (await list.json()).orders.some(
        (item: ShopOrder) => item.id === order.id,
      ),
    ).toBe(true);
    expect(
      (await support.get(`/api/bank/admin/shop/orders/${order.id}`)).status(),
    ).toBe(200);
    expect((await moveOrder(support, order.id, "packed")).status()).toBe(403);
    expect((await refundOrder(support, order.id)).status()).toBe(403);

    expect((await request.get("/api/bank/admin/shop/orders")).status()).toBe(
      403,
    );
    await support.dispose();
    await admin.dispose();
  });

  // Nobody handles their own order.
  test("an Admin can't move or refund their own order", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "a customer made Admin buys sku-032, then moving or refunding their own order is 403 OWN_ORDER",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-032", 5);
    const me = await signUpCustomer(request, "Admin Shopper");
    const promoted = await admin.patch(`/api/bank/admin/users/${me.id}`, {
      data: { role: "admin" },
    });
    expect(promoted.status(), await promoted.text()).toBe(200);
    const { order } = await buy(request, "sku-032");

    const move = await moveOrder(request, order.id, "packed");
    expect(move.status()).toBe(403);
    expect((await move.json()).code).toBe("OWN_ORDER");
    const refund = await refundOrder(request, order.id);
    expect(refund.status()).toBe(403);
    expect((await refund.json()).code).toBe("OWN_ORDER");
    await admin.dispose();
  });

  // Restocking: Admin only, within its limits, seen everywhere.
  test("only an Admin restocks, from 0 to 9999", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "a customer and Support 403; 10000 is 400; 5 is 200 and both product APIs say 5",
    );
    await signUpCustomer(request, "Restock Customer");
    const path = "/api/bank/admin/shop/products/sku-033";
    expect((await request.patch(path, { data: { stock: 5 } })).status()).toBe(
      403,
    );
    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    expect((await support.patch(path, { data: { stock: 5 } })).status()).toBe(
      403,
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    expect((await admin.patch(path, { data: { stock: 10000 } })).status()).toBe(
      400,
    );
    expect((await setStock(admin, "sku-033", 5)).stock).toBe(5);
    expect((await shopProduct(request, "sku-033")).product.stock).toBe(5);
    const classic = await (await request.get("/api/products/sku-033")).json();
    expect(classic.product.stock).toBe(5);
    await support.dispose();
    await admin.dispose();
  });

  // Every door: the same back office through GraphQL.
  test("GraphQL: staff list, a step, a refund and a restock", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "staffShopOrders(PLACED) holds the order; advanceShopOrder PACKED; a skip refused; refundShopOrder REFUNDED; a customer's staffShopOrders FORBIDDEN",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-034", 5);
    await signUpCustomer(request, "GraphQL Staff Customer");
    const { order } = await buy(request, "sku-034");

    const list = await graphql<{ staffShopOrders: { id: string }[] }>(
      admin,
      "{ staffShopOrders(status: PLACED) { id } }",
    );
    expect(list.data!.staffShopOrders.map((item) => item.id)).toContain(
      order.id,
    );
    const moved = await graphql<{ advanceShopOrder: { status: string } }>(
      admin,
      "mutation($id: ID!) { advanceShopOrder(id: $id, status: PACKED) { status } }",
      { id: order.id },
    );
    expect(moved.data!.advanceShopOrder.status).toBe("PACKED");
    const skipped = await graphql(
      admin,
      "mutation($id: ID!) { advanceShopOrder(id: $id, status: DELIVERED) { status } }",
      { id: order.id },
    );
    expect(errorCode(skipped)).toBe("STATUS_MOVE_NOT_ALLOWED");
    const refunded = await graphql<{
      refundShopOrder: { status: string; refundedCents: number };
    }>(
      admin,
      "mutation($id: ID!) { refundShopOrder(id: $id) { status refundedCents } }",
      { id: order.id },
    );
    expect(refunded.data!.refundShopOrder).toEqual({
      status: "REFUNDED",
      refundedCents: order.totalCents,
    });
    const restocked = await graphql<{ restockProduct: { stock: number } }>(
      admin,
      'mutation { restockProduct(id: "sku-034", stock: 3) { stock } }',
    );
    expect(restocked.data!.restockProduct.stock).toBe(3);

    const customer = await graphql(request, "{ staffShopOrders { id } }");
    expect(errorCode(customer)).toBe("FORBIDDEN");
    await admin.dispose();
  });
});
