// Reads openapi.json from disk, so answers can be checked against the contract.
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema; ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// The type of a request context.
import { type APIRequestContext } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: sign up, sign in, accounts, balances, transfers, loans.
import {
  balanceOf,
  DEMO,
  moneyAccounts,
  requestLoan,
  sendMoney,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";

// Playground Bank connected flows (phase 2c): what one person does shows up for
// another. Each test signs up its own customers in separate request contexts;
// staff actions use the demo Support or Admin.

// Load the OpenAPI document once and teach Ajv its schemas.
const openApiSpec = JSON.parse(readFileSync("openapi.json", "utf8"));
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(openApiSpec, "openapi.json");

// Checks one answer against a named schema in openapi.json, and prints Ajv's
// errors when it does not match.
function expectSchema(schemaName: string, body: unknown) {
  const validate = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  expect(validate(body), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

// The signed-in person's notifications, and how many are unread.
async function notes(request: APIRequestContext) {
  const response = await request.get("/api/bank/notifications");
  expect(response.status()).toBe(200);
  return response.json();
}

// Notifications: who gets told, and marking them read.
test.describe("Playground Bank notifications API", () => {
  // Money from another customer makes a notification; moving your own money doesn't.
  test("money from someone else notifies the recipient; your own moves don't", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "no notification for an own transfer; one unread money_received for 4200 from the sender; none for the sender",
    );
    // Customer one, and a sender in their own request context.
    await signUpCustomer(request, "Notified Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const sender = await playwright.request.newContext({ baseURL });
    await signUpCustomer(sender, "Sending Customer");
    const [theirs] = (await moneyAccounts(sender)).accounts;
    fact("checking", checking.id);
    fact("savings", savings.id);
    fact("sender acct", theirs.number);

    // Checking to Savings, between the customer's own accounts: nothing to tell.
    await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 100,
    });
    expect((await notes(request)).notifications).toEqual([]);

    // The sender pays $42 into the customer's Checking with a memo.
    await sendMoney(sender, {
      fromAccountId: theirs.id,
      toAccountNumber: checking.number,
      amountCents: 4_200,
      memo: "Lunch",
    });
    // One unread notification, saying who from, how much, and linking the account.
    const body = await notes(request);
    expectSchema("BankNotificationsResponse", body);
    expect(body.unread).toBe(1);
    expect(body.notifications[0]).toMatchObject({
      kind: "money_received",
      amountCents: 4_200,
      body: `From ${theirs.number} · Lunch`,
      link: `/bank/accounts/${checking.id}`,
      read: false,
    });
    // The sender is not told about their own payment.
    expect((await notes(sender)).notifications).toEqual([]);
    await sender.dispose();
  });

  // One notification can be marked read, then all of them; another customer can't touch them.
  test("mark one read, mark all read, and nobody else's", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "3 unread; 404 for the sender marking one; 200 and 2 unread after one; marked 2 and 0 unread after all",
    );
    // A customer gets three payments from a sender: three notifications.
    await signUpCustomer(request, "Reading Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const sender = await playwright.request.newContext({ baseURL });
    await signUpCustomer(sender, "Busy Sender");
    const [theirs] = (await moneyAccounts(sender)).accounts;
    fact("checking", checking.id);
    for (const amountCents of [100, 200, 300]) {
      await sendMoney(sender, {
        fromAccountId: theirs.id,
        toAccountNumber: checking.number,
        amountCents,
      });
    }
    const before = await notes(request);
    expect(before.unread).toBe(3);

    // The sender can't mark the customer's notification (404); the customer can.
    const id = before.notifications[0].id;
    fact("notification", id);
    expect(
      (
        await sender.post(`/api/bank/notifications/${id}/read`, { data: {} })
      ).status(),
    ).toBe(404);
    const read = await request.post(`/api/bank/notifications/${id}/read`, {
      data: {},
    });
    expect(read.status()).toBe(200);
    expectSchema("BankNotificationResponse", await read.json());
    expect((await notes(request)).unread).toBe(2);

    // "Mark all" marks the other two.
    const all = await request.post("/api/bank/notifications/read-all", {
      data: {},
    });
    expect(await all.json()).toEqual({ marked: 2 });
    expect((await notes(request)).unread).toBe(0);
    await sender.dispose();
  });

  // An approved loan and a new role each reach the customer as a notification.
  test("loan decisions and role changes notify the customer", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "two notifications, newest first: 'Your role is now Support', 'Your loan was approved'",
    );
    // A new customer asks for a loan.
    const customer = await signUpCustomer(request, "Deciding Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    fact("loanId", loan.id);
    // The demo Admin approves it, then makes the customer Support staff.
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await admin.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "approve", note: "Welcome aboard." },
    });
    await admin.patch(`/api/bank/admin/users/${customer.id}`, {
      data: { role: "support" },
    });

    // Both changes reached the customer, the newest first.
    const kinds = (await notes(request)).notifications.map(
      (note: { kind: string; title: string }) => `${note.kind}: ${note.title}`,
    );
    fact("told", kinds);
    expect(kinds).toEqual([
      "account_changed: Your role is now Support",
      "loan_decided: Your loan was approved",
    ]);
    await admin.dispose();
  });
});

// Asking another customer for money, and how they answer.
test.describe("Playground Bank money requests API", () => {
  // Two new customers: the one asking (this test's `request`) and the payer
  // (their own context), each with their first account.
  async function pair(
    playwright: {
      request: { newContext(o: object): Promise<APIRequestContext> };
    },
    baseURL: string | undefined,
    request: APIRequestContext,
  ) {
    await signUpCustomer(request, "Asking Customer");
    const [mine] = (await moneyAccounts(request)).accounts;
    const payer = await playwright.request.newContext({ baseURL });
    await signUpCustomer(payer, "Asked Customer");
    const [theirs] = (await moneyAccounts(payer)).accounts;
    fact("mine", mine.id);
    fact("theirs", theirs.id);
    return { mine, payer, theirs };
  }

  // A request the other side pays becomes a real transfer, and both are told.
  test("ask, and the other customer pays: a real transfer, both sides told", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "201 pending; payer told and pays 200; balances move by 2500; asker told; a second pay 409 REQUEST_NOT_PENDING",
    );
    // Ask the payer for $25 for a concert.
    const { mine, payer, theirs } = await pair(playwright, baseURL, request);
    const created = await request.post("/api/bank/requests", {
      data: {
        toAccountId: mine.id,
        fromAccountNumber: theirs.number,
        amountCents: 2_500,
        memo: "Concert",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { request: asked } = await created.json();
    expectSchema("BankMoneyRequestResponse", { request: asked });
    fact("requestId", asked.id);
    expect(asked).toMatchObject({
      status: "pending",
      requesterName: "Asking Customer",
    });

    // The payer sees it in their incoming list and was told.
    const theirList = await (await payer.get("/api/bank/requests")).json();
    expectSchema("BankMoneyRequestsResponse", theirList);
    expect(theirList.incoming[0].id).toBe(asked.id);
    expect((await notes(payer)).notifications[0]).toMatchObject({
      kind: "request_received",
      title: "Asking Customer asked you for money",
      amountCents: 2_500,
    });

    // The payer pays it: paid, and the money moved both ways.
    const paid = await payer.post(`/api/bank/requests/${asked.id}/pay`, {
      data: { fromAccountId: theirs.id },
    });
    expect(paid.status(), await paid.text()).toBe(200);
    const result = await paid.json();
    expectSchema("BankRequestPaidResponse", result);
    fact("transferId", result.transfer.id);
    expect(result.request.status).toBe("paid");
    expect(await balanceOf(request, mine.id)).toBe(mine.balanceCents + 2_500);
    expect(await balanceOf(payer, theirs.id)).toBe(theirs.balanceCents - 2_500);

    // The asker's list links the transfer, and the asker was told.
    const mineNow = await (await request.get("/api/bank/requests")).json();
    expect(mineNow.outgoing[0]).toMatchObject({
      status: "paid",
      transferId: result.transfer.id,
    });
    const told = (await notes(request)).notifications;
    expect(told.map((note: { kind: string }) => note.kind)).toEqual([
      "request_answered",
    ]);

    // Paying again is refused, and no second payment happens.
    const again = await payer.post(`/api/bank/requests/${asked.id}/pay`, {
      data: { fromAccountId: theirs.id },
    });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("REQUEST_NOT_PENDING");
    expect(await balanceOf(request, mine.id)).toBe(mine.balanceCents + 2_500);
    await payer.dispose();
  });

  // The payer can decline, the asker can cancel, and neither can do the other's part.
  test("decline and cancel, and only the right side can answer", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "asker can't pay (404), payer can't cancel (404); payer declines, asker told; asker cancels; a late pay 409, no money moved",
    );
    // A fresh request for $10, each time it is called.
    const { mine, payer, theirs } = await pair(playwright, baseURL, request);
    const ask = async () =>
      (
        await (
          await request.post("/api/bank/requests", {
            data: {
              toAccountId: mine.id,
              fromAccountNumber: theirs.number,
              amountCents: 1_000,
            },
          })
        ).json()
      ).request;

    // The asker can't pay their own request, and the payer can't cancel it.
    const first = await ask();
    fact("first", first.id);
    expect(
      (
        await request.post(`/api/bank/requests/${first.id}/pay`, {
          data: { fromAccountId: mine.id },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await payer.post(`/api/bank/requests/${first.id}/cancel`, { data: {} })
      ).status(),
    ).toBe(404);
    // The payer declines it, and the asker is told.
    const declined = await payer.post(
      `/api/bank/requests/${first.id}/decline`,
      { data: {} },
    );
    expect((await declined.json()).request.status).toBe("declined");
    expect((await notes(request)).notifications[0].title).toBe(
      "Your request was declined",
    );

    // A second request, cancelled by the asker: paying it late is refused.
    const second = await ask();
    fact("second", second.id);
    const cancelled = await request.post(
      `/api/bank/requests/${second.id}/cancel`,
      { data: {} },
    );
    expect((await cancelled.json()).request.status).toBe("cancelled");
    const late = await payer.post(`/api/bank/requests/${second.id}/pay`, {
      data: { fromAccountId: theirs.id },
    });
    expect(late.status()).toBe(409);
    expect(await balanceOf(payer, theirs.id)).toBe(theirs.balanceCents);
    await payer.dispose();
  });

  // A request must name a real other customer and a sane amount, and paying
  // needs the money.
  test("a request needs a real payer and amount; paying needs the money", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "own account 400, demo account 403, unknown account 404, 0 and over the cap 400; paying more than the balance 409 INSUFFICIENT_FUNDS, still pending",
    );
    // Each bad request, with the status it must get.
    const { mine, payer, theirs } = await pair(playwright, baseURL, request);
    const cases: [object, number][] = [
      [
        {
          toAccountId: mine.id,
          fromAccountNumber: mine.number,
          amountCents: 100,
        },
        400,
      ],
      [
        {
          toAccountId: mine.id,
          fromAccountNumber: "PB-1000-0001",
          amountCents: 100,
        },
        403,
      ],
      [
        {
          toAccountId: mine.id,
          fromAccountNumber: "PB-0000-0000",
          amountCents: 100,
        },
        404,
      ],
      [
        {
          toAccountId: mine.id,
          fromAccountNumber: theirs.number,
          amountCents: 0,
        },
        400,
      ],
      [
        {
          toAccountId: mine.id,
          fromAccountNumber: theirs.number,
          amountCents: 100_000_001,
        },
        400,
      ],
    ];
    for (const [data, status] of cases) {
      const response = await request.post("/api/bank/requests", { data });
      expect(response.status(), JSON.stringify(data)).toBe(status);
    }
    // A request for a cent more than the payer has: paying it is refused and
    // it stays pending.
    const big = (
      await (
        await request.post("/api/bank/requests", {
          data: {
            toAccountId: mine.id,
            fromAccountNumber: theirs.number,
            amountCents: theirs.balanceCents + 1,
          },
        })
      ).json()
    ).request;
    fact("big", big.id);
    const tooMuch = await payer.post(`/api/bank/requests/${big.id}/pay`, {
      data: { fromAccountId: theirs.id },
    });
    expect(tooMuch.status()).toBe(409);
    expect((await tooMuch.json()).code).toBe("INSUFFICIENT_FUNDS");
    const stillWaiting = await (await payer.get("/api/bank/requests")).json();
    expect(stillWaiting.incoming[0].status).toBe("pending");
    await payer.dispose();
  });
});

// Support tickets between customers and staff.
test.describe("Playground Bank support API", () => {
  // A ticket about a transaction reaches the staff inbox, staff answer, the
  // customer replies, and only staff can mark it solved.
  test("a customer's ticket goes to the inbox, staff answer, it gets solved", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "201 open ticket about the opening deposit; in the staff inbox; answered with a notification; open again on reply; customer 403 on solve; staff solve with a notification",
    );
    // A new customer asks about their first transaction (the opening deposit).
    await signUpCustomer(request, "Asking Support Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const history = await (
      await request.get(`/api/bank/accounts/${checking.id}/transactions`)
    ).json();
    const created = await request.post("/api/bank/support", {
      data: {
        subject: "Opening deposit?",
        body: "Where did this money come from?",
        transactionId: history.transactions[0].id,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { ticket } = await created.json();
    expectSchema("BankTicketResponse", { ticket });
    fact("ticketId", ticket.id);
    expect(ticket).toMatchObject({
      status: "open",
      transactionDescription: "Opening deposit",
    });

    // The demo Support person sees it in the open inbox.
    const staff = await playwright.request.newContext({ baseURL });
    await signIn(staff, DEMO.support);
    const inbox = await (
      await staff.get("/api/bank/admin/support?status=open")
    ).json();
    expectSchema("BankTicketsResponse", inbox);
    expect(
      inbox.tickets.some((item: { id: string }) => item.id === ticket.id),
    ).toBe(true);

    // Staff answer: the ticket is answered, and the customer is told.
    const answered = await staff.post(
      `/api/bank/support/${ticket.id}/messages`,
      {
        data: { body: "It's the $25,000 every customer starts with." },
      },
    );
    expect(answered.status()).toBe(201);
    const thread = await answered.json();
    expectSchema("BankTicketThreadResponse", thread);
    expect(thread.ticket.status).toBe("answered");
    expect(
      thread.messages.map((m: { fromStaff: boolean }) => m.fromStaff),
    ).toEqual([false, true]);
    expect((await notes(request)).notifications[0]).toMatchObject({
      kind: "support_reply",
      link: `/support/${ticket.id}`,
    });

    // The customer replies: open again.
    const back = await request.post(`/api/bank/support/${ticket.id}/messages`, {
      data: { body: "Thanks!" },
    });
    expect((await back.json()).ticket.status).toBe("open");

    // The customer can't mark it solved; staff can, and the customer is told.
    expect(
      (
        await request.patch(`/api/bank/support/${ticket.id}`, {
          data: { status: "solved" },
        })
      ).status(),
    ).toBe(403);
    const solved = await staff.patch(`/api/bank/support/${ticket.id}`, {
      data: { status: "solved" },
    });
    expect((await solved.json()).ticket.status).toBe("solved");
    expect((await notes(request)).notifications[0].kind).toBe("support_solved");
    await staff.dispose();
  });

  // Another customer can't read or answer a ticket, and a ticket can't point
  // at someone else's transaction.
  test("tickets are private, and transactions must be your own", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "another customer 404 on read and reply, 403 on the staff inbox; a ticket about their transaction 400 on transactionId",
    );
    // Customer one opens a ticket.
    await signUpCustomer(request, "Private Ticket Customer");
    const { ticket } = await (
      await request.post("/api/bank/support", {
        data: { subject: "Private matter", body: "Only for the bank." },
      })
    ).json();
    fact("ticketId", ticket.id);
    // Customer two can't read it, answer it, or see the staff inbox.
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Nosy Ticket Customer");
    expect((await other.get(`/api/bank/support/${ticket.id}`)).status()).toBe(
      404,
    );
    expect(
      (
        await other.post(`/api/bank/support/${ticket.id}/messages`, {
          data: { body: "Hi" },
        })
      ).status(),
    ).toBe(404);
    expect((await other.get("/api/bank/admin/support")).status()).toBe(403);

    // Customer one asks about customer two's transaction: refused.
    const [theirs] = (await moneyAccounts(other)).accounts;
    const theirHistory = await (
      await other.get(`/api/bank/accounts/${theirs.id}/transactions`)
    ).json();
    const foreign = await request.post("/api/bank/support", {
      data: {
        subject: "Not mine",
        body: "About someone else's row.",
        transactionId: theirHistory.transactions[0].id,
      },
    });
    expect(foreign.status()).toBe(400);
    expect((await foreign.json()).errors.transactionId).toBeTruthy();
    await other.dispose();
  });

  // The demo customer's solved ticket can be read but not added to, by them or by staff.
  test("demo tickets are read-only, for the customer and for staff", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "one solved demo ticket with 3 messages; 403 on a new ticket; Admin reply 403 DEMO_READ_ONLY",
    );
    // The demo customer has one solved ticket with three messages.
    await signIn(request, DEMO.customer);
    const { tickets } = await (await request.get("/api/bank/support")).json();
    expect(tickets).toHaveLength(1);
    fact("ticketId", tickets[0].id);
    expect(tickets[0].status).toBe("solved");
    const thread = await (
      await request.get(`/api/bank/support/${tickets[0].id}`)
    ).json();
    expect(thread.messages).toHaveLength(3);
    // They can't open a new one.
    expect(
      (
        await request.post("/api/bank/support", {
          data: { subject: "Hello there", body: "Hi bank" },
        })
      ).status(),
    ).toBe(403);

    // The demo Admin can't reply to it either.
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    const reply = await admin.post(
      `/api/bank/support/${tickets[0].id}/messages`,
      {
        data: { body: "Anything else?" },
      },
    );
    expect(reply.status()).toBe(403);
    expect((await reply.json()).code).toBe("DEMO_READ_ONLY");
    await admin.dispose();
  });
});
