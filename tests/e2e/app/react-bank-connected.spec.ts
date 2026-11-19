// axe-core's Playwright runner, which checks a page for accessibility problems.
import AxeBuilder from "@axe-core/playwright";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people, accounts, transfers, sign in, sign up.
import {
  DEMO,
  moneyAccounts,
  sendMoney,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";
// A sidebar link, with its group opened first if it is shut.
import { navLink } from "../../../framework/helpers/nav";

// Playground Bank connected flows in the React app: two people (or a customer
// and staff), each in their own browser, and what one does appears on the
// other's screens. The other side reloads instead of waiting for the 15-second
// refresh, so the tests stay quick and deterministic.

test.describe("Playground Bank connected flows (/app)", () => {
  // Money from another customer shows a count on the bell, and the
  // notification opens the account history with that payment.
  test("money from another customer lights the bell, which leads to the history", async ({
    page,
    request,
  }) => {
    expected(
      "no count; after $42 arrives the bell reads 1; the item says 'Money received' $42.00 and opens the account, where 'Lunch' is listed and the count is gone",
    );
    // The customer in the browser, and a sender through `request`.
    await signUpCustomer(page.request, "Bell Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await signUpCustomer(request, "Bell Sender");
    const [theirs] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);

    // No notifications yet.
    await page.goto("/app/bank");
    await expect(page.getByTestId("notif-bell")).toBeVisible();
    await expect(page.getByTestId("notif-count")).toHaveCount(0);

    // The sender pays $42 with the memo "Lunch"; the bell shows 1.
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

    // The notification opened the account, where the payment is listed.
    await expect(page).toHaveURL(
      new RegExp(`/app/bank/accounts/${checking.id}$`),
    );
    await expect(page.getByTestId("history-table")).toContainText("Lunch");
    await expect(page.getByTestId("notif-count")).toHaveCount(0);
  });

  // One customer asks for money; the other sees it, pays it, and both pages say Paid.
  test("ask for money, the other customer pays it, and both screens agree", async ({
    page,
    browser,
    baseURL,
  }) => {
    expected(
      "the asker's row says Waiting; the payer is told, sees the request and pays it; both rows say Paid; the asker is told 'Your request was paid'",
    );

    // The asker in this page, and the payer in a second browser.
    await signUpCustomer(page.request, "Request Asker");
    const payerContext = await browser.newContext({ baseURL });
    const payer = await payerContext.newPage();
    await signUpCustomer(payer.request, "Request Payer");
    const [theirs] = (await moneyAccounts(payer.request)).accounts;
    fact("payer acct", theirs.number);

    // Ask the payer for $25 for concert tickets.
    await page.goto("/app/bank/requests");
    await page.getByTestId("request-from").fill(theirs.number);
    await page.getByTestId("request-amount").fill("25");
    await page.getByTestId("request-memo").fill("Concert tickets");
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-sent")).toContainText("$25.00");
    const outgoing = page.locator('[data-testid^="outgoing-row-"]');
    await expect(outgoing).toContainText("Waiting");

    // The payer sees it, is told about it, and pays.
    await payer.goto("/app/bank/requests");
    await expect(payer.getByTestId("notif-count")).toHaveText("1");
    const incoming = payer.locator('[data-testid^="incoming-row-"]');
    await expect(incoming).toContainText("Request Asker");
    await expect(incoming).toContainText("Concert tickets");
    await incoming.locator('[data-testid^="request-pay-"]').click();
    await payer.getByTestId("request-pay-confirm").click();
    await expect(payer.getByTestId("request-pay-dialog")).toHaveCount(0);
    await expect(incoming).toContainText("Paid");

    // The asker's page agrees, and the asker is told.
    await page.reload();
    await expect(outgoing).toContainText("Paid");
    await expect(page.getByTestId("notif-count")).toHaveText("1");
    await page.getByTestId("notif-bell").click();
    await expect(
      page.locator('[data-testid^="notif-item-"]').first(),
    ).toContainText("Your request was paid");
    await payerContext.close();
  });

  // The Pay dialog when the payer's accounts list arrives after the requests
  // list, as on a busy PC. It used to keep "no account": Pay sent an empty
  // account, the server said "Pick the account to pay from" and the dialog
  // stayed open (2026-11-16). The list is held back 2 s so that order happens
  // every time, and Pay is pressed at once, before the accounts arrive.
  test("pay works when the accounts list arrives after the requests", async ({
    page,
    browser,
    baseURL,
  }) => {
    expected(
      "with the payer's accounts 2 s late, Pay now waits for an account, sends the payer's first account, closes the dialog, and the row says Paid",
    );
    // The asker asks the payer for $12.50 through the API.
    await signUpCustomer(page.request, "Late Asker");
    const [mine] = (await moneyAccounts(page.request)).accounts;
    const payerContext = await browser.newContext({ baseURL });
    const payer = await payerContext.newPage();
    await signUpCustomer(payer.request, "Late Payer");
    const [theirs] = (await moneyAccounts(payer.request)).accounts;
    const created = await page.request.post("/api/bank/requests", {
      data: {
        toAccountId: mine.id,
        fromAccountNumber: theirs.number,
        amountCents: 1_250,
      },
    });
    const { request: asked } = await created.json();
    fact("requestId", asked.id);

    // The payer's accounts list is held back 2 seconds.
    await payer.route("**/api/bank/accounts*", async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      await route.continue();
    });

    // The payer opens Pay at once; Pay now waits for the account, then the
    // payment goes from the payer's first account and goes through.
    await payer.goto("/app/bank/requests");
    await payer.getByTestId(`request-pay-${asked.id}`).click();
    const answered = payer.waitForResponse((response) =>
      response.url().includes(`/api/bank/requests/${asked.id}/pay`),
    );
    await payer.getByTestId("request-pay-confirm").click();
    const response = await answered;
    const sent = response.request().postDataJSON();
    fact("fromAccountId sent", sent.fromAccountId);
    fact("answer", response.status());
    expect(sent.fromAccountId).toBe(theirs.id);
    expect(response.ok()).toBe(true);
    await expect(payer.getByTestId("request-pay-dialog")).toHaveCount(0);
    await expect(payer.getByTestId(`incoming-status-${asked.id}`)).toHaveText(
      "Paid",
    );
    await payerContext.close();
  });

  // A request the payer declines shows as Declined on both sides.
  test("a declined request shows as Declined for the one who asked", async ({
    page,
    browser,
    baseURL,
  }) => {
    expected("Declined on the payer's row and on the asker's row");
    // The asker asks the payer for $9.99 through the API.
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
    fact("requestId", asked.id);

    // The payer declines it on their page.
    await payer.goto("/app/bank/requests");
    await payer.getByTestId(`request-decline-${asked.id}`).click();
    await expect(payer.getByTestId(`incoming-status-${asked.id}`)).toHaveText(
      "Declined",
    );

    // The asker's page says Declined too.
    await page.goto("/app/bank/requests");
    await expect(page.getByTestId(`outgoing-status-${asked.id}`)).toHaveText(
      "Declined",
    );
    await payerContext.close();
  });

  // A customer reports a transaction from the history, staff answer and
  // solve it, and the customer sees the answer.
  test("report a problem on a transaction, staff answer, the customer sees it", async ({
    page,
    browser,
    baseURL,
  }) => {
    expected(
      "a ticket about 'Opening deposit', Open; staff see it Open, answer (Answered) and solve (Solved); the customer sees the answer, Solved, and 2 notifications",
    );
    // The customer reports their first transaction from the account page.
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
    // The ticket's id is the last part of the page's address.
    const ticketUrl = page.url();
    const ticketId = ticketUrl.split("/support/")[1];
    fact("ticketId", ticketId);

    // The demo Admin, in their own browser, answers it and marks it solved.
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

    // The customer sees the answer, the Solved status, and two notifications.
    await page.reload();
    await expect(page.getByTestId("ticket-thread")).toContainText(
      "every customer starts with",
    );
    await expect(page.getByTestId("ticket-status")).toHaveText("Solved");
    await expect(page.getByTestId("notif-count")).toHaveText("2");
    await staffContext.close();
  });

  // The demo customer has a welcome notification and one solved, read-only ticket.
  test("the demo customer reads a solved ticket and a welcome note", async ({
    page,
  }) => {
    expected(
      "'Welcome to Playground Bank' in notifications; the support demo note, no form; the first ticket Solved with 3 messages, read-only",
    );
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/notifications");
    await expect(page.getByTestId("notifications-list")).toContainText(
      "Welcome to Playground Bank",
    );
    await page.goto("/app/support");
    await expect(page.getByTestId("support-demo-note")).toBeVisible();
    await expect(page.getByTestId("ticket-form")).toHaveCount(0);
    // Open the first ticket.
    await page.locator('[data-testid^="ticket-link-"]').first().click();
    await expect(page.getByTestId("ticket-status")).toHaveText("Solved");
    await expect(page.locator('[data-testid^="ticket-message-"]')).toHaveCount(
      3,
    );
    await expect(page.getByTestId("ticket-readonly")).toBeVisible();
  });

  // A customer is refused the staff Support inbox, and only has the Support link.
  test("customers can't open the Support inbox", async ({ page }) => {
    expected(
      "the forbidden panel; no Support inbox link; the customer's Support link",
    );
    await signUpCustomer(page.request, "Inbox Customer");
    await page.goto("/app/admin/support");
    await expect(page.getByTestId("support-inbox-forbidden")).toBeVisible();
    await expect(page.getByTestId("nav-link-support-inbox")).toHaveCount(0);
    await expect(await navLink(page, "nav-link-support")).toBeVisible();
  });

  // Requests, Notifications, Support and a ticket page pass axe.
  test("the connected pages pass an accessibility scan", async ({ page }) => {
    expected(
      "no axe violations in the main area of requests, notifications, support and the ticket page",
    );
    // A new customer with one ticket.
    await signUpCustomer(page.request, "Accessible Connected Customer");
    const { ticket } = await (
      await page.request.post("/api/bank/support", {
        data: { subject: "A question", body: "Just checking." },
      })
    ).json();
    fact("ticketId", ticket.id);
    // Scan each page's main area.
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
