// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: people, money, the shop, its back office and GraphQL.
import {
  DEMO,
  balanceOf,
  buy,
  graphql,
  historyOf,
  moneyAccounts,
  refundOrder,
  sendMoney,
  setStock,
  signIn,
  signUpCustomer,
  uniqueRunKey,
} from "../../../framework/helpers/bank";

// Bank rules' three planted bugs, each armed for one run key only. Without
// the flag each one behaves, which api-bank-rules.spec.ts checks. The product
// used here: sku-044.

test.describe("Bank rules' planted bugs", () => {
  // A reused key with a different request is answered with the first result.
  test("bankIdempotencyMismatch: a reused key hides a different transfer", async ({
    request,
  }) => {
    expected(
      "with bankIdempotencyMismatch armed: $10 then $90 with one key; the second answers 200 replayed with the $10 transfer; only $10 moved",
    );
    const runKey = uniqueRunKey("idempotency-mismatch");
    await armFlags(request, runKey, { bankIdempotencyMismatch: true });
    await signUpCustomer(request, "Mismatch Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const key = `mismatch-${Date.now()}`;
    const send = (amountCents: number) =>
      sendMoney(
        request,
        {
          fromAccountId: checking.id,
          toAccountNumber: savings.number,
          amountCents,
        },
        { key, runKey },
      );

    expect((await send(1_000)).status()).toBe(201);
    const second = await send(9_000);
    expect(second.status()).toBe(200);
    const body = await second.json();
    fact("second answer", body.transfer);
    expect(body.replayed).toBe(true);
    expect(body.transfer.amountCents).toBe(1_000);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 1_000,
    );
  });

  // GraphQL changes are never written to the log.
  test("bankAuditGraphqlGap: a GraphQL transfer leaves no line in the audit log", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankAuditGraphqlGap armed: a REST and a GraphQL transfer both go through, but the log holds only the REST one",
    );
    const runKey = uniqueRunKey("audit-graphql-gap");
    await armFlags(request, runKey, { bankAuditGraphqlGap: true });
    const me = await signUpCustomer(request, "Untraced Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const rest = await sendMoney(
      request,
      {
        fromAccountId: checking.id,
        toAccountNumber: savings.number,
        amountCents: 500,
      },
      { runKey },
    );
    expect(rest.status()).toBe(201);
    const gql = await graphql(
      request,
      "mutation($f: ID!, $t: String!) { transfer(fromAccountId: $f, toAccountNumber: $t, amountCents: 700) { replayed } }",
      { f: checking.id, t: savings.number },
      runKey,
    );
    expect(gql.errors).toBeUndefined();
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 1_200,
    );

    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    const entries = (
      await (
        await admin.get(
          `/api/bank/admin/audit?action=money.transfer&actor=${encodeURIComponent(me.email)}`,
        )
      ).json()
    ).entries as { door: string }[];
    fact(
      "doors",
      entries.map((entry) => entry.door),
    );
    expect(entries.map((entry) => entry.door)).toEqual(["rest"]);
    await admin.dispose();
  });

  // A refund with no history row: the books catch it.
  test("bankRefundNoEntry: a refund the statement never shows, caught by the books", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankRefundNoEntry armed: the refund puts the money back but writes no shop_refund row; the books list the account, out by the order's total",
    );
    const runKey = uniqueRunKey("refund-no-entry");
    await armFlags(request, runKey, { bankRefundNoEntry: true });
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    await setStock(admin, "sku-044", 5);
    await signUpCustomer(request, "Unrecorded Customer");
    const { order, account } = await buy(request, "sku-044");

    expect((await refundOrder(admin, order.id, { runKey })).status()).toBe(200);
    expect(await balanceOf(request, account.id)).toBe(account.balanceCents);
    const rows = await historyOf(request, account.id);
    expect(rows.some((row) => row.kind === "shop_refund")).toBe(false);

    const books = await (await admin.get("/api/bank/admin/books")).json();
    const mine = books.outOfBalance.find(
      (row: { accountNumber: string }) => row.accountNumber === account.number,
    );
    fact("out of balance", mine);
    expect(books.balanced).toBe(false);
    expect(mine.differenceCents).toBe(order.totalCents);
    await admin.dispose();
  });
});
