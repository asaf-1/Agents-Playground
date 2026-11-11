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
  addFunds,
  addToCart,
  balanceOf,
  buy,
  cart,
  checkout,
  errorCode,
  graphql,
  moneyAccounts,
  refundOrder,
  sendMoney,
  setStock,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";

// Bank rules through the API ("a more real back end", phase 4): retry-safe
// money requests (Idempotency-Key), a request id on every answer, the audit
// log, and the books check. The products used here: sku-042, 046 and 047.

// One line of the audit log, as the API returns it.
interface AuditEntry {
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  door: string;
  auth: string;
  requestId: string;
  details: { request?: Record<string, unknown>; replayed?: boolean };
}

test.describe("Bank rules (API)", () => {
  // A card charge sent twice with one key charges once.
  test("the same Idempotency-Key charges a card once and replays the answer", async ({
    request,
  }) => {
    expected(
      "201, then 200 with Idempotent-Replayed: true and the same charge; one charge on the card; Checking down once",
    );
    await signUpCustomer(request, "Card Retry Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const card = (
      await (
        await request.post("/api/bank/cards", {
          data: { accountId: checking.id },
        })
      ).json()
    ).card as { id: string };
    const key = `charge-${Date.now()}`;
    const send = () =>
      request.post(`/api/bank/cards/${card.id}/charges`, {
        data: { merchant: "Corner Cafe", amountCents: 450 },
        headers: { "Idempotency-Key": key },
      });

    const first = await send();
    expect(first.status()).toBe(201);
    const second = await send();
    expect(second.status()).toBe(200);
    expect(second.headers()["idempotent-replayed"]).toBe("true");
    const a = (await first.json()).charge;
    const b = (await second.json()).charge;
    fact("charges", [a.id, b.id]);
    expect(b.id).toBe(a.id);

    const charges = await (
      await request.get(`/api/bank/cards/${card.id}/charges`)
    ).json();
    expect(charges.charges).toHaveLength(1);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 450,
    );
  });

  // Add funds and a loan ask are retry-safe too.
  test("add funds and a loan ask happen once per key", async ({ request }) => {
    expected(
      "two deposits with one key: 201 then 200, the balance up once; two loan asks with one key: one loan",
    );
    await signUpCustomer(request, "Deposit Retry Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const depositKey = `deposit-${Date.now()}`;
    const deposit = () =>
      request.post(`/api/bank/accounts/${checking.id}/deposits`, {
        data: { amountCents: 2_500 },
        headers: { "Idempotency-Key": depositKey },
      });
    expect((await deposit()).status()).toBe(201);
    expect((await deposit()).status()).toBe(200);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents + 2_500,
    );

    const loanKey = `loan-${Date.now()}`;
    const ask = () =>
      request.post("/api/bank/loans", {
        data: {
          accountId: checking.id,
          amountCents: 500_000,
          termMonths: 12,
          purpose: "Bike",
        },
        headers: { "Idempotency-Key": loanKey },
      });
    expect((await ask()).status()).toBe(201);
    expect((await ask()).status()).toBe(200);
    const loans = await (await request.get("/api/bank/loans")).json();
    expect(loans.loans).toHaveLength(1);
  });

  // One key, a different request: refused, through every money door.
  test("a key reused for a different request is refused with 422", async ({
    request,
  }) => {
    expected(
      "a transfer, then the same key with another amount: 422 IDEMPOTENCY_KEY_REUSED and money moved once; the same through a card charge and GraphQL",
    );
    await signUpCustomer(request, "Key Reuse Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const key = `transfer-${Date.now()}`;
    const first = await sendMoney(
      request,
      {
        fromAccountId: checking.id,
        toAccountNumber: savings.number,
        amountCents: 1_000,
      },
      { key },
    );
    expect(first.status()).toBe(201);
    const reused = await sendMoney(
      request,
      {
        fromAccountId: checking.id,
        toAccountNumber: savings.number,
        amountCents: 9_000,
      },
      { key },
    );
    expect(reused.status()).toBe(422);
    expect((await reused.json()).code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 1_000,
    );

    // The generic layer (a card charge) refuses the same way.
    const card = (
      await (
        await request.post("/api/bank/cards", {
          data: { accountId: checking.id },
        })
      ).json()
    ).card as { id: string };
    const chargeKey = `charge-reuse-${Date.now()}`;
    const charge = (amountCents: number) =>
      request.post(`/api/bank/cards/${card.id}/charges`, {
        data: { merchant: "Kiosk", amountCents },
        headers: { "Idempotency-Key": chargeKey },
      });
    expect((await charge(300)).status()).toBe(201);
    const reusedCharge = await charge(700);
    expect(reusedCharge.status()).toBe(422);

    // GraphQL: the same transfer key, another amount.
    const gql = await graphql(
      request,
      "mutation($f: ID!, $t: String!, $k: String) { transfer(fromAccountId: $f, toAccountNumber: $t, amountCents: 5000, idempotencyKey: $k) { replayed } }",
      { f: checking.id, t: savings.number, k: key },
    );
    expect(errorCode(gql)).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  // A request that failed lets go of its key.
  test("a refused checkout frees its key for the corrected request", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "checkout with a key and a wrong total: 409 PRICE_CHANGED; the same key with the right total: 201",
    );
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-042", 5);
    await signUpCustomer(request, "Corrected Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addToCart(request, "sku-042", 1);
    const { totalCents } = await cart(request);
    const key = `corrected-${Date.now()}`;

    const wrong = await checkout(request, checking.id, totalCents - 1, { key });
    expect(wrong.status()).toBe(409);
    const right = await checkout(request, checking.id, totalCents, { key });
    expect(right.status(), await right.text()).toBe(201);
    await admin.dispose();
  });

  // Every bank answer carries a request id.
  test("every answer has an X-Request-Id; a sensible one sent is kept", async ({
    request,
  }) => {
    expected(
      "no id sent: a new UUID back; 'trace-abcdef12' sent: the same back; a bad one replaced",
    );
    const fresh = await request.get("/api/bank/status");
    fact("fresh", fresh.headers()["x-request-id"]);
    expect(fresh.headers()["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const kept = await request.get("/api/bank/status", {
      headers: { "X-Request-Id": "trace-abcdef12" },
    });
    expect(kept.headers()["x-request-id"]).toBe("trace-abcdef12");
    const replaced = await request.get("/api/bank/status", {
      headers: { "X-Request-Id": "bad id <script>" },
    });
    expect(replaced.headers()["x-request-id"]).not.toBe("bad id <script>");
  });

  // The log records the same action through both doors.
  test("the audit log records a transfer through REST and through GraphQL", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "two money.transfer lines for this customer: one rest, one graphql, both session, each with its transfer id; the REST line's request id is the answer's X-Request-Id",
    );
    const me = await signUpCustomer(request, "Audited Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const rest = await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 1_234,
    });
    expect(rest.status()).toBe(201);
    const restId = (await rest.json()).transfer.id;
    const restRequestId = rest.headers()["x-request-id"];
    const gql = await graphql<{ transfer: { transfer: { id: string } } }>(
      request,
      "mutation($f: ID!, $t: String!) { transfer(fromAccountId: $f, toAccountNumber: $t, amountCents: 4321) { transfer { id } } }",
      { f: checking.id, t: savings.number },
    );
    const gqlId = gql.data!.transfer.transfer.id;

    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    const log = await admin.get(
      `/api/bank/admin/audit?action=money.transfer&actor=${encodeURIComponent(me.email)}`,
    );
    expect(log.status()).toBe(200);
    const entries = (await log.json()).entries as AuditEntry[];
    fact("entries", entries);
    expect(entries).toHaveLength(2);
    const byDoor = Object.fromEntries(
      entries.map((entry) => [entry.door, entry]),
    );
    expect(byDoor.rest).toMatchObject({
      actorEmail: me.email,
      actorRole: "customer",
      targetType: "transfer",
      targetId: restId,
      auth: "session",
      requestId: restRequestId,
    });
    expect(byDoor.rest.details.request).toMatchObject({ amountCents: 1_234 });
    expect(byDoor.graphql).toMatchObject({ targetId: gqlId, auth: "session" });
    await admin.dispose();
  });

  // A change made with an API key says so, and staff actions are logged too.
  test("the log marks API-key changes and records staff actions", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "a deposit made with a write key logs auth api_key; the Admin's refund logs staff.order_refund by the Admin",
    );
    const me = await signUpCustomer(request, "Key Audited Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const made = await request.post("/api/bank/keys", {
      data: { name: "audit test", scope: "write" },
    });
    expect(made.status(), await made.text()).toBe(201);
    const { token } = await made.json();
    const viaKey = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await addFunds(viaKey, checking.id, 999);

    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-046", 5);
    const { order } = await buy(request, "sku-046");
    expect((await refundOrder(admin, order.id)).status()).toBe(200);

    const deposits = (
      await (
        await admin.get(
          `/api/bank/admin/audit?action=money.add_funds&actor=${encodeURIComponent(me.email)}`,
        )
      ).json()
    ).entries as AuditEntry[];
    expect(deposits).toHaveLength(1);
    expect(deposits[0].auth).toBe("api_key");
    const refunds = (
      await (
        await admin.get(
          `/api/bank/admin/audit?action=staff.order_refund&actor=${encodeURIComponent(DEMO.admin)}`,
        )
      ).json()
    ).entries as AuditEntry[];
    expect(refunds.map((entry) => entry.targetId)).toContain(order.id);
    await viaKey.dispose();
    await admin.dispose();
  });

  // The log pages with a cursor, and downloads as CSV.
  test("the log pages with a cursor and downloads as CSV", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "three deposits: pages of 1 hand over a cursor, three different lines in all, no fourth page; the CSV has a header and three lines",
    );
    const me = await signUpCustomer(request, "Paged Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    for (const amount of [101, 202, 303]) {
      await addFunds(request, checking.id, amount);
    }
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    const actor = encodeURIComponent(me.email);

    // Page by page, one line at a time.
    const seen: string[] = [];
    let after: string | null = null;
    for (let page = 0; page < 3; page += 1) {
      const query: string = `/api/bank/admin/audit?actor=${actor}&first=1${after ? `&after=${after}` : ""}`;
      const body = await (await admin.get(query)).json();
      expect(body.total).toBe(3);
      seen.push(body.entries[0].id);
      after = body.nextCursor;
      expect(body.hasNextPage).toBe(page < 2);
    }
    fact("ids", seen);
    expect(new Set(seen).size).toBe(3);

    // The CSV.
    const csv = await admin.get(`/api/bank/admin/audit.csv?actor=${actor}`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const lines = (await csv.text()).trim().split("\r\n");
    expect(lines[0]).toBe(
      "When (UTC),Who,Role,Action,Record,Door,Signed in with,Request id",
    );
    expect(lines).toHaveLength(4);
    await admin.dispose();
  });

  // The books: a busy customer's accounts still add up.
  test("the books check a customer's accounts after a purchase and a refund", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "after transfers, a deposit, a purchase and its refund, neither of the customer's accounts is out of balance; demo accounts counted as sample data",
    );
    await signUpCustomer(request, "Books Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 7_777,
    });
    await addFunds(request, savings.id, 1_111);
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-047", 5);
    const { order } = await buy(request, "sku-047");
    expect((await refundOrder(admin, order.id)).status()).toBe(200);

    const books = await (await admin.get("/api/bank/admin/books")).json();
    fact("books", {
      checked: books.checkedAccounts,
      sample: books.sampleAccounts,
      out: books.outOfBalance.length,
    });
    expect(books.checkedAccounts).toBeGreaterThanOrEqual(2);
    expect(books.sampleAccounts).toBeGreaterThanOrEqual(1);
    const outNumbers = books.outOfBalance.map(
      (row: { accountNumber: string }) => row.accountNumber,
    );
    expect(outNumbers).not.toContain(checking.number);
    expect(outNumbers).not.toContain(savings.number);
    await admin.dispose();
  });

  // Admin only: the log, its CSV and the books.
  test("only an Admin reads the log, the CSV and the books", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "a customer and Support get 403 on all three; GraphQL books FORBIDDEN",
    );
    await signUpCustomer(request, "Curious Customer");
    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    for (const caller of [request, support]) {
      for (const path of [
        "/api/bank/admin/audit",
        "/api/bank/admin/audit.csv",
        "/api/bank/admin/books",
      ]) {
        expect((await caller.get(path)).status(), path).toBe(403);
      }
    }
    expect(errorCode(await graphql(request, "{ books { balanced } }"))).toBe(
      "FORBIDDEN",
    );
    await support.dispose();
  });

  // Every door: the log and the books through GraphQL.
  test("GraphQL reads the log and the books for an Admin", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "auditLog filtered to this customer holds their deposit as REST; books answers with balanced and the counts",
    );
    const me = await signUpCustomer(request, "GraphQL Audited Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addFunds(request, checking.id, 555);
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);

    const log = await graphql<{
      auditLog: { total: number; nodes: { action: string; door: string }[] };
    }>(
      admin,
      "query($e: String) { auditLog(actorEmail: $e, first: 5) { total nodes { action door } } }",
      { e: me.email },
    );
    expect(log.data!.auditLog.total).toBe(1);
    expect(log.data!.auditLog.nodes[0]).toEqual({
      action: "money.add_funds",
      door: "REST",
    });
    const books = await graphql<{
      books: { checkedAccounts: number; sampleAccounts: number };
    }>(admin, "{ books { checkedAccounts sampleAccounts } }");
    expect(books.data!.books.checkedAccounts).toBeGreaterThanOrEqual(2);
    await admin.dispose();
  });
});
