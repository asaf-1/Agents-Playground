// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: people, the shop and its back office.
import {
  DEMO,
  buy,
  moveOrder,
  setStock,
  signIn,
  signUpCustomer,
  usd,
} from "../../../framework/helpers/bank";

// The shop's back office in the browser ("a more real back end", phase 3):
// the Shop orders list, the staff order page with its two actions, Support's
// read-only view, the customer told in the bell, and the Admin's restock. The
// products used here: sku-035, 037, 038 and 048 (each test owns its own).

test.describe("The shop's back office (browser)", () => {
  // An Admin packs an order, then refunds it.
  test("an Admin packs and refunds an order from Shop orders", async ({
    page,
    playwright,
    baseURL,
  }) => {
    expected(
      "the order in 'To pack'; its page names the customer; Mark packed -> Packed; Refund -> Refunded with the total refunded; three steps; no actions left",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-035", 5);
    const customer = await playwright.request.newContext({ baseURL });
    await signUpCustomer(customer, "Backoffice Customer");
    const { order } = await buy(customer, "sku-035");

    // The Admin finds the order waiting to be packed and opens it.
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/shop-orders");
    await expect(page.getByTestId("staff-shop-filter-placed")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByTestId(`staff-shop-order-link-${order.id}`).click();
    await expect(page.getByTestId("shop-order-customer")).toContainText(
      "Backoffice Customer",
    );

    // Pack it.
    await page.getByTestId("staff-shop-order-advance").click();
    await expect(page.getByTestId("staff-shop-order-dialog")).toBeVisible();
    await page.getByTestId("staff-shop-order-confirm").click();
    await expect(page.getByTestId("shop-order-status")).toHaveText("Packed");

    // Refund it.
    await page.getByTestId("staff-shop-order-refund").click();
    await page.getByTestId("staff-shop-order-confirm").click();
    await expect(page.getByTestId("shop-order-status")).toHaveText("Refunded");
    await expect(page.getByTestId("shop-order-refunded")).toHaveText(
      usd(order.totalCents),
    );
    await expect(page.getByTestId("shop-order-event")).toHaveCount(3);
    await expect(page.getByTestId("staff-shop-order-note")).toHaveText(
      "This order was refunded.",
    );
    await customer.dispose();
    await admin.dispose();
  });

  // Support looks; the actions aren't there.
  test("Support sees the order read-only", async ({
    page,
    playwright,
    baseURL,
  }) => {
    expected(
      "Support: the read-only note on the list; on the order, 'Only an Admin can move or refund an order.' and no action buttons",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-037", 5);
    const customer = await playwright.request.newContext({ baseURL });
    await signUpCustomer(customer, "Watched Browser Customer");
    const { order } = await buy(customer, "sku-037");

    await signIn(page.request, DEMO.support);
    await page.goto("/app/admin/shop-orders");
    await expect(page.getByTestId("staff-shop-orders-readonly")).toBeVisible();
    await page.goto(`/app/admin/shop-orders/${order.id}`);
    await expect(page.getByTestId("staff-shop-order-note")).toHaveText(
      "Only an Admin can move or refund an order.",
    );
    await expect(page.getByTestId("staff-shop-order-advance")).toHaveCount(0);
    await expect(page.getByTestId("staff-shop-order-refund")).toHaveCount(0);
    await customer.dispose();
    await admin.dispose();
  });

  // A customer has no back office.
  test("a customer has no Shop orders page and no link to it", async ({
    page,
  }) => {
    expected("a customer: the no-access card, and no Shop orders link");
    await signUpCustomer(page.request, "Nosy Customer");
    await page.goto("/app/admin/shop-orders");
    await expect(page.getByTestId("staff-shop-orders-forbidden")).toBeVisible();
    await expect(page.getByTestId("nav-link-staff-shop-orders")).toHaveCount(0);
  });

  // The customer hears about each step.
  test("the customer is told in the bell when their order moves", async ({
    page,
    playwright,
    baseURL,
  }) => {
    expected(
      "after the Admin packs it, the customer's notifications show 'Order SO-… packed' and the receipt",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-048", 5);
    await signUpCustomer(page.request, "Told Customer");
    const { order } = await buy(page.request, "sku-048");
    expect((await moveOrder(admin, order.id, "packed")).status()).toBe(200);

    await page.goto("/app/notifications");
    await expect(page.getByText(`Order ${order.number} packed`)).toBeVisible();
    await expect(page.getByText(`Order ${order.number} placed`)).toBeVisible();
    await page.getByTestId("notif-bell").click();
    await expect(page.getByTestId("notif-menu")).toContainText(
      `Order ${order.number} packed`,
    );
    await admin.dispose();
  });

  // An Admin restocks from the product page.
  test("an Admin sets a product's stock from its page", async ({ page }) => {
    expected("sku-038: set to 7, 'Stock set to 7.', the page says 7 in stock");
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/products/sku-038");
    await page.getByTestId("restock-stock").fill("7");
    await page.getByTestId("restock-save").click();
    await expect(page.getByTestId("restock-saved")).toHaveText(
      "Stock set to 7.",
    );
    await expect(page.getByTestId("product-stock")).toHaveText("7 in stock");
    fact("stock", 7);
  });
});
