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
  buy,
  moneyAccounts,
  refundOrder,
  sendMoney,
  setStock,
  signIn,
  signUpCustomer,
  uniqueRunKey,
  usd,
} from "../../../framework/helpers/bank";

// Bank rules in the browser ("a more real back end", phase 4): the Audit log
// and the Books pages, for an Admin only. The product used here: sku-026.

test.describe("Bank rules (browser)", () => {
  // An Admin finds one customer's transfer in the log.
  test("an Admin finds a customer's transfer in the Audit log", async ({
    page,
    playwright,
    baseURL,
  }) => {
    expected(
      "filtered to the customer: 1 line, money.transfer through REST; filtered to GraphQL: nothing; the CSV link carries the filter",
    );
    const customer = await playwright.request.newContext({ baseURL });
    const me = await signUpCustomer(customer, "Logged Customer");
    const [checking, savings] = (await moneyAccounts(customer)).accounts;
    const sent = await sendMoney(customer, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 2_222,
    });
    expect(sent.status()).toBe(201);

    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/audit");
    await page.getByTestId("audit-actor").fill(me.email);
    await page.getByTestId("audit-apply").click();
    await expect(page.getByTestId("audit-total")).toHaveText("1 line");
    await expect(page.getByTestId("audit-row-action")).toHaveText(
      "money.transfer",
    );
    await expect(page.getByTestId("audit-row-door")).toContainText("REST");
    await expect(page.getByTestId("audit-csv")).toHaveAttribute(
      "href",
      new RegExp(`actor=${encodeURIComponent(me.email)}`),
    );

    // Through GraphQL: nothing for this customer.
    await page.getByTestId("audit-door").selectOption("graphql");
    await expect(page.getByTestId("audit-empty")).toBeVisible();
    await customer.dispose();
  });

  // The Books page lists an account a refund left out of balance.
  test("the Books page lists an account a refund left out of balance (bankRefundNoEntry)", async ({
    page,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankRefundNoEntry armed for the refund: Books says Out of balance and lists the customer's account, out by the order's total",
    );
    const runKey = uniqueRunKey("books-browser");
    const admin = await playwright.request.newContext({ baseURL });
    await armFlags(admin, runKey, { bankRefundNoEntry: true });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-026", 5);
    const customer = await playwright.request.newContext({ baseURL });
    await signUpCustomer(customer, "Off Books Customer");
    const { order, account } = await buy(customer, "sku-026");
    expect((await refundOrder(admin, order.id, { runKey })).status()).toBe(200);
    fact("account", account.number);

    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/books");
    await expect(page.getByTestId("books-verdict")).toHaveText(
      "Out of balance",
    );
    const row = page.getByTestId(`books-row-${account.number}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(usd(order.totalCents));
    await customer.dispose();
    await admin.dispose();
  });

  // Customers see neither page, nor a link to one.
  test("a customer has no Audit log or Books, and no links to them", async ({
    page,
  }) => {
    expected(
      "both pages show their no-access card; neither link is in the menu",
    );
    await signUpCustomer(page.request, "Outsider Customer");
    await page.goto("/app/admin/audit");
    await expect(page.getByTestId("audit-forbidden")).toBeVisible();
    await page.goto("/app/admin/books");
    await expect(page.getByTestId("books-forbidden")).toBeVisible();
    await expect(page.getByTestId("nav-link-audit")).toHaveCount(0);
    await expect(page.getByTestId("nav-link-books")).toHaveCount(0);
  });
});
