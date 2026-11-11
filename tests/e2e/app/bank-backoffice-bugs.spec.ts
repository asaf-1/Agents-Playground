// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: people, money, the shop and its back office.
import {
  DEMO,
  balanceOf,
  buy,
  moveOrder,
  refundOrder,
  setStock,
  signIn,
  signUpCustomer,
  uniqueRunKey,
  type ShopOrder,
} from "../../../framework/helpers/bank";

// The back office's three planted bugs, each armed for one run key only.
// Without the flag each one is refused, which api-bank-backoffice.spec.ts
// checks. The products used here: sku-039, 040 and 041.

test.describe("The shop back office's planted bugs", () => {
  // The refund never asks whether it already happened.
  test("bankShopRefundTwice: the same order is refunded twice", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankShopRefundTwice armed: two refunds of sku-039's order both 200; refundedCents twice the total; the balance up by the total once too many",
    );
    const runKey = uniqueRunKey("shop-refund-twice");
    await armFlags(request, runKey, { bankShopRefundTwice: true });
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-039", 5);
    await signUpCustomer(request, "Double Refund Customer");
    const { order, account } = await buy(request, "sku-039");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const refunded = await refundOrder(admin, order.id, { runKey });
      expect(refunded.status(), await refunded.text()).toBe(200);
    }
    const after = (
      await (await admin.get(`/api/bank/admin/shop/orders/${order.id}`)).json()
    ).order as ShopOrder;
    fact("refundedCents", after.refundedCents);
    expect(after.refundedCents).toBe(2 * order.totalCents);
    expect(await balanceOf(request, account.id)).toBe(
      account.balanceCents + order.totalCents,
    );
    await admin.dispose();
  });

  // Any step from any step.
  test("bankShopStatusSkip: an order jumps to delivered and back to packed", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankShopStatusSkip armed: placed -> delivered 200, then delivered -> packed 200",
    );
    const runKey = uniqueRunKey("shop-status-skip");
    await armFlags(request, runKey, { bankShopStatusSkip: true });
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-040", 5);
    await signUpCustomer(request, "Skipped Customer");
    const { order } = await buy(request, "sku-040");

    const jumped = await moveOrder(admin, order.id, "delivered", runKey);
    expect(jumped.status(), await jumped.text()).toBe(200);
    expect((await jumped.json()).order.status).toBe("delivered");
    const back = await moveOrder(admin, order.id, "packed", runKey);
    expect(back.status(), await back.text()).toBe(200);
    expect((await back.json()).order.status).toBe("packed");
    await admin.dispose();
  });

  // The refund asks "staff?" instead of "Admin?".
  test("bankShopSupportRefund: read-only Support refunds an order", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankShopSupportRefund armed: Support's refund of sku-041's order is 200 and the order is refunded; moving it is still 403",
    );
    const runKey = uniqueRunKey("shop-support-refund");
    await armFlags(request, runKey, { bankShopSupportRefund: true });
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-041", 5);
    await signUpCustomer(request, "Support Refund Customer");
    const { order } = await buy(request, "sku-041");

    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    expect(
      (await moveOrder(support, order.id, "packed", runKey)).status(),
    ).toBe(403);
    const refunded = await refundOrder(support, order.id, { runKey });
    expect(refunded.status(), await refunded.text()).toBe(200);
    expect((await refunded.json()).order.status).toBe("refunded");
    await support.dispose();
    await admin.dispose();
  });
});
