import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  DEMO,
  moneyAccounts,
  sendMoney,
  signIn,
  signUpCustomer,
} from "./_bank";

// Playground Bank connected flows in the React app: two people (or a customer
// and staff), each in their own browser, and what one does appears on the
// other's screens. The other side reloads instead of waiting for the 15-second
// refresh, so the tests stay quick and deterministic.

test.describe("Playground Bank connected flows (/app)", () => {
  test("money from another customer lights the bell, which leads to the history", async ({
    page,
    request,
  }) => {
    await signUpCustomer(page.request, "Bell Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await signUpCustomer(request, "Bell Sender");
    const [theirs] = (await moneyAccounts(request)).accounts;

    await page.goto("/app/bank");
    await expect(page.getByTestId("notif-bell")).toBeVisible();
    await expect(page.getByTestId("notif-count")).toHaveCount(0);

    await sendMoney(request, {
      fromAccountId: theirs.id,
      toAccountNumber: checking.number,
      amountCents: 4_200,
      memo: "Lunch",
    });
    await page.reload();
    await expect(page.getByTestId("notif-count")).toHaveText("1");
    await page.getByTestId("notif-bell").click();
    const item = page.locator('[data-testid^="notif-item-"]').first();
    await expect(item).toContainText("Money received");
    await expect(item).toContainText("$42.00");
    await item.click();

    await expect(page).toHaveURL(
      new RegExp(`/app/bank/accounts/${checking.id}$`),
    );
    await expect(page.getByTestId("history-table")).toContainText("Lunch");
    await expect(page.getByTestId("notif-count")).toHaveCount(0);
  });

  test("ask for money, the other customer pays it, and both screens agree", async ({
    page,
    browser,
    baseURL,
  }) => {
    await signUpCustomer(page.request, "Request Asker");
    const payerContext = await browser.newContext({ baseURL });
    const payer = await payerContext.newPage();
    await signUpCustomer(payer.request, "Request Payer");
    const [theirs] = (await moneyAccounts(payer.request)).accounts;

    await page.goto("/app/bank/requests");
    await page.getByTestId("request-from").fill(theirs.number);
    await page.getByTestId("request-amount").fill("25");
    await page.getByTestId("request-memo").fill("Concert tickets");
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-sent")).toContainText("$25.00");
    const outgoing = page.locator('[data-testid^="outgoing-row-"]');
    await expect(outgoing).toContainText("Waiting");

    await payer.goto("/app/bank/requests");
    await expect(payer.getByTestId("notif-count")).toHaveText("1");
    const incoming = payer.locator('[data-testid^="incoming-row-"]');
    await expect(incoming).toContainText("Request Asker");
    await expect(incoming).toContainText("Concert tickets");
    await incoming.locator('[data-testid^="request-pay-"]').click();
    await payer.getByTestId("request-pay-confirm").click();
    await expect(payer.getByTestId("request-pay-dialog")).toHaveCount(0);
    await expect(incoming).toContainText("Paid");

    await page.reload();
    await expect(outgoing).toContainText("Paid");
    await expect(page.getByTestId("notif-count")).toHaveText("1");
    await page.getByTestId("notif-bell").click();
    await expect(
      page.locator('[data-testid^="notif-item-"]').first(),
    ).toContainText("Your request was paid");
    await payerContext.close();
  });

  test("a declined request shows as Declined for the one who asked", async ({
    page,
    browser,
    baseURL,
  }) => {
    await signUpCustomer(page.request, "Declined Asker");
    const [mine] = (await moneyAccounts(page.request)).accounts;
    const payerContext = await browser.newContext({ baseURL });
    const payer = await payerContext.newPage();
    await signUpCustomer(payer.request, "Declining Payer");
    const [theirs] = (await moneyAccounts(payer.request)).accounts;
    const created = await page.request.post("/api/bank/requests", {
      data: {
        toAccountId: mine.id,
        fromAccountNumber: theirs.number,
        amountCents: 999,
      },
    });
    const { request: asked } = await created.json();

    await payer.goto("/app/bank/requests");
    await payer.getByTestId(`request-decline-${asked.id}`).click();
    await expect(payer.getByTestId(`incoming-status-${asked.id}`)).toHaveText(
      "Declined",
    );

    await page.goto("/app/bank/requests");
    await expect(page.getByTestId(`outgoing-status-${asked.id}`)).toHaveText(
      "Declined",
    );
    await payerContext.close();
  });

  test("report a problem on a transaction, staff answer, the customer sees it", async ({
    page,
    browser,
    baseURL,
  }) => {
    await signUpCustomer(page.request, "Reporting Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await page.goto(`/app/bank/accounts/${checking.id}`);
    await page.locator('[data-testid^="history-actions-"]').first().click();
    await page.locator('[data-testid^="history-report-"]').first().click();
    await expect(page.getByTestId("ticket-about")).toContainText(
      "Opening deposit",
    );
    await page
      .getByTestId("ticket-body")
      .fill("Where does this money come from?");
    await page.getByTestId("ticket-submit").click();
    await expect(page.getByTestId("ticket-transaction")).toContainText(
      "Opening deposit",
    );
    await expect(page.getByTestId("ticket-status")).toHaveText("Open");
    const ticketUrl = page.url();
    const ticketId = ticketUrl.split("/support/")[1];

    const staffContext = await browser.newContext({ baseURL });
    const staff = await staffContext.newPage();
    await signIn(staff.request, DEMO.admin);
    await staff.goto("/app/admin/support");
    await expect(staff.getByTestId(`inbox-status-${ticketId}`)).toHaveText(
      "Open",
    );
    await staff.getByTestId(`inbox-open-${ticketId}`).click();
    await staff
      .getByTestId("ticket-reply")
      .fill("It's the $25,000 every customer starts with.");
    await staff.getByTestId("ticket-reply-send").click();
    await expect(staff.getByTestId("ticket-status")).toHaveText("Answered");
    await staff.getByTestId("ticket-solve").click();
    await expect(staff.getByTestId("ticket-status")).toHaveText("Solved");

    await page.reload();
    await expect(page.getByTestId("ticket-thread")).toContainText(
      "every customer starts with",
    );
    await expect(page.getByTestId("ticket-status")).toHaveText("Solved");
    await expect(page.getByTestId("notif-count")).toHaveText("2");
    await staffContext.close();
  });

  test("the demo customer reads a solved ticket and a welcome note", async ({
    page,
  }) => {
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/notifications");
    await expect(page.getByTestId("notifications-list")).toContainText(
      "Welcome to Playground Bank",
    );
    await page.goto("/app/support");
    await expect(page.getByTestId("support-demo-note")).toBeVisible();
    await expect(page.getByTestId("ticket-form")).toHaveCount(0);
    await page.locator('[data-testid^="ticket-link-"]').first().click();
    await expect(page.getByTestId("ticket-status")).toHaveText("Solved");
    await expect(page.locator('[data-testid^="ticket-message-"]')).toHaveCount(
      3,
    );
    await expect(page.getByTestId("ticket-readonly")).toBeVisible();
  });

  test("customers can't open the Support inbox", async ({ page }) => {
    await signUpCustomer(page.request, "Inbox Customer");
    await page.goto("/app/admin/support");
    await expect(page.getByTestId("support-inbox-forbidden")).toBeVisible();
    await expect(page.getByTestId("nav-link-support-inbox")).toHaveCount(0);
    await expect(page.getByTestId("nav-link-support")).toBeVisible();
  });

  test("the connected pages pass an accessibility scan", async ({ page }) => {
    await signUpCustomer(page.request, "Accessible Connected Customer");
    const { ticket } = await (
      await page.request.post("/api/bank/support", {
        data: { subject: "A question", body: "Just checking." },
      })
    ).json();
    for (const path of [
      "/app/bank/requests",
      "/app/notifications",
      "/app/support",
      `/app/support/${ticket.id}`,
    ]) {
      await page.goto(path);
      await expect(page.getByTestId("app-heading")).toBeVisible();
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .include('[data-testid="app-main"]')
        .analyze();
      expect(
        results.violations,
        `${path}: ${JSON.stringify(results.violations.map((v) => v.id))}`,
      ).toEqual([]);
    }
  });
});
