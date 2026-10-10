import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  balanceOf,
  DEMO,
  moneyAccounts,
  requestLoan,
  sendMoney,
  signIn,
  signUpCustomer,
  STARTER_CENTS,
} from "./_bank";

// Playground Bank connected flows (phase 2c): what one person does shows up for
// another. Each test signs up its own customers in separate request contexts;
// staff actions use the demo Support or Admin.
const openApiSpec = JSON.parse(readFileSync("openapi.json", "utf8"));
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(openApiSpec, "openapi.json");

function expectSchema(schemaName: string, body: unknown) {
  const validate = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  expect(validate(body), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

async function notes(request: APIRequestContext) {
  const response = await request.get("/api/bank/notifications");
  expect(response.status()).toBe(200);
  return response.json();
}

test.describe("Playground Bank notifications API", () => {
  test("money from someone else notifies the recipient; your own moves don't", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Notified Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const sender = await playwright.request.newContext({ baseURL });
    await signUpCustomer(sender, "Sending Customer");
    const [theirs] = (await moneyAccounts(sender)).accounts;

    await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 100,
    });
    expect((await notes(request)).notifications).toEqual([]);

    await sendMoney(sender, {
      fromAccountId: theirs.id,
      toAccountNumber: checking.number,
      amountCents: 4_200,
      memo: "Lunch",
    });
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
    expect((await notes(sender)).notifications).toEqual([]);
    await sender.dispose();
  });

  test("mark one read, mark all read, and nobody else's", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Reading Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const sender = await playwright.request.newContext({ baseURL });
    await signUpCustomer(sender, "Busy Sender");
    const [theirs] = (await moneyAccounts(sender)).accounts;
    for (const amountCents of [100, 200, 300]) {
      await sendMoney(sender, {
        fromAccountId: theirs.id,
        toAccountNumber: checking.number,
        amountCents,
      });
    }
    const before = await notes(request);
    expect(before.unread).toBe(3);

    const id = before.notifications[0].id;
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

    const all = await request.post("/api/bank/notifications/read-all", {
      data: {},
    });
    expect(await all.json()).toEqual({ marked: 2 });
    expect((await notes(request)).unread).toBe(0);
    await sender.dispose();
  });

  test("loan decisions and role changes notify the customer", async ({
    request,
    playwright,
    baseURL,
  }) => {
    const customer = await signUpCustomer(request, "Deciding Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await admin.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "approve", note: "Welcome aboard." },
    });
    await admin.patch(`/api/bank/admin/users/${customer.id}`, {
      data: { role: "support" },
    });

    const kinds = (await notes(request)).notifications.map(
      (note: { kind: string; title: string }) => `${note.kind}: ${note.title}`,
    );
    expect(kinds).toEqual([
      "account_changed: Your role is now Support",
      "loan_decided: Your loan was approved",
    ]);
    await admin.dispose();
  });
});

test.describe("Playground Bank money requests API", () => {
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
    return { mine, payer, theirs };
  }

  test("ask, and the other customer pays: a real transfer, both sides told", async ({
    request,
    playwright,
    baseURL,
  }) => {
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
    expect(asked).toMatchObject({
      status: "pending",
      requesterName: "Asking Customer",
    });

    const theirList = await (await payer.get("/api/bank/requests")).json();
    expectSchema("BankMoneyRequestsResponse", theirList);
    expect(theirList.incoming[0].id).toBe(asked.id);
    expect((await notes(payer)).notifications[0]).toMatchObject({
      kind: "request_received",
      title: "Asking Customer asked you for money",
      amountCents: 2_500,
    });

    const paid = await payer.post(`/api/bank/requests/${asked.id}/pay`, {
      data: { fromAccountId: theirs.id },
    });
    expect(paid.status(), await paid.text()).toBe(200);
    const result = await paid.json();
    expectSchema("BankRequestPaidResponse", result);
    expect(result.request.status).toBe("paid");
    expect(await balanceOf(request, mine.id)).toBe(
      STARTER_CENTS.checking + 2_500,
    );
    expect(await balanceOf(payer, theirs.id)).toBe(
      STARTER_CENTS.checking - 2_500,
    );

    const mineNow = await (await request.get("/api/bank/requests")).json();
    expect(mineNow.outgoing[0]).toMatchObject({
      status: "paid",
      transferId: result.transfer.id,
    });
    const told = (await notes(request)).notifications;
    expect(told.map((note: { kind: string }) => note.kind)).toEqual([
      "request_answered",
    ]);

    const again = await payer.post(`/api/bank/requests/${asked.id}/pay`, {
      data: { fromAccountId: theirs.id },
    });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("REQUEST_NOT_PENDING");
    expect(await balanceOf(request, mine.id)).toBe(
      STARTER_CENTS.checking + 2_500,
    );
    await payer.dispose();
  });

  test("decline and cancel, and only the right side can answer", async ({
    request,
    playwright,
    baseURL,
  }) => {
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

    const first = await ask();
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
    const declined = await payer.post(
      `/api/bank/requests/${first.id}/decline`,
      { data: {} },
    );
    expect((await declined.json()).request.status).toBe("declined");
    expect((await notes(request)).notifications[0].title).toBe(
      "Your request was declined",
    );

    const second = await ask();
    const cancelled = await request.post(
      `/api/bank/requests/${second.id}/cancel`,
      { data: {} },
    );
    expect((await cancelled.json()).request.status).toBe("cancelled");
    const late = await payer.post(`/api/bank/requests/${second.id}/pay`, {
      data: { fromAccountId: theirs.id },
    });
    expect(late.status()).toBe(409);
    expect(await balanceOf(payer, theirs.id)).toBe(STARTER_CENTS.checking);
    await payer.dispose();
  });

  test("a request needs a real payer and amount; paying needs the money", async ({
    request,
    playwright,
    baseURL,
  }) => {
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
    const big = (
      await (
        await request.post("/api/bank/requests", {
          data: {
            toAccountId: mine.id,
            fromAccountNumber: theirs.number,
            amountCents: STARTER_CENTS.checking + 1,
          },
        })
      ).json()
    ).request;
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

test.describe("Playground Bank support API", () => {
  test("a customer's ticket goes to the inbox, staff answer, it gets solved", async ({
    request,
    playwright,
    baseURL,
  }) => {
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
    expect(ticket).toMatchObject({
      status: "open",
      transactionDescription: "Opening deposit",
    });

    const staff = await playwright.request.newContext({ baseURL });
    await signIn(staff, DEMO.support);
    const inbox = await (
      await staff.get("/api/bank/admin/support?status=open")
    ).json();
    expectSchema("BankTicketsResponse", inbox);
    expect(
      inbox.tickets.some((item: { id: string }) => item.id === ticket.id),
    ).toBe(true);

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

    const back = await request.post(`/api/bank/support/${ticket.id}/messages`, {
      data: { body: "Thanks!" },
    });
    expect((await back.json()).ticket.status).toBe("open");

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

  test("tickets are private, and transactions must be your own", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Private Ticket Customer");
    const { ticket } = await (
      await request.post("/api/bank/support", {
        data: { subject: "Private matter", body: "Only for the bank." },
      })
    ).json();
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

  test("demo tickets are read-only, for the customer and for staff", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signIn(request, DEMO.customer);
    const { tickets } = await (await request.get("/api/bank/support")).json();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toBe("solved");
    const thread = await (
      await request.get(`/api/bank/support/${tickets[0].id}`)
    ).json();
    expect(thread.messages).toHaveLength(3);
    expect(
      (
        await request.post("/api/bank/support", {
          data: { subject: "Hello there", body: "Hi bank" },
        })
      ).status(),
    ).toBe(403);

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
