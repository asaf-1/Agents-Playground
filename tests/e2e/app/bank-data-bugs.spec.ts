import { expect, test } from "@playwright/test";
import {
  addFunds,
  errorCode,
  graphql,
  moneyAccounts,
  sendMoney,
  signUpCustomer,
  uniqueRunKey,
} from "./_bank";
import { armFlags } from "./_helpers";

// The three planted bugs of plan 2, phase B (REPORT: by design, never "fixed").
// Each test arms one flag for its own runKey and shows the same request
// behaving correctly without it, so the rest of the parallel suite never sees
// the bug.

test("bankMemoNoLimit: nothing behind the app stops a 5,000-character memo", async ({
  request,
}) => {
  const runKey = uniqueRunKey("memo-no-limit");
  await armFlags(request, runKey, { bankMemoNoLimit: true });
  await signUpCustomer(request, "Memo Customer");
  const [checking, savings] = (await moneyAccounts(request)).accounts;
  const memo = "x".repeat(5000);
  const transfer = {
    fromAccountId: checking.id,
    toAccountNumber: savings.number,
    amountCents: 100,
    memo,
  };

  // Correct: the app refuses it, and that check is all there is.
  const refused = await sendMoney(request, transfer);
  expect(refused.status()).toBe(400);
  expect((await refused.json()).errors.memo).toContain("140");

  // Armed: the check is skipped, and the database keeps every character,
  // because the memo columns carry no length constraint of their own.
  const stored = await sendMoney(request, transfer, { runKey });
  expect(stored.status(), await stored.text()).toBe(201);
  const history = await (
    await request.get(`/api/bank/accounts/${checking.id}/transactions`)
  ).json();
  expect(history.transactions[0].memo.length).toBe(5000);
});

test("bankGraphqlKeyScope: a read-only key can charge a card through GraphQL", async ({
  request,
  browser,
}) => {
  const runKey = uniqueRunKey("gql-key-scope");
  await armFlags(request, runKey, { bankGraphqlKeyScope: true });
  await signUpCustomer(request, "Key Scope Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  const card = await (
    await request.post("/api/bank/cards", { data: { accountId: checking.id } })
  ).json();
  const made = await (
    await request.post("/api/bank/keys", {
      data: { name: "Read only", scope: "read" },
    })
  ).json();

  const api = await browser.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${made.token}` },
  });
  const pay = {
    query: `mutation Pay($id: ID!) {
      chargeCard(id: $id, merchant: "Corner Grocery", amountCents: 2500) {
        charge { status amountCents }
      }
    }`,
    variables: { id: card.card.id },
  };

  // Correct: a read key runs no mutation.
  const refused = await api.request.post("/api/bank/graphql", { data: pay });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).code).toBe("KEY_READ_ONLY");

  // Armed: the one mutation is let through, and money leaves the account...
  const spent = await api.request.post(`/api/bank/graphql?runKey=${runKey}`, {
    data: pay,
  });
  expect(spent.status()).toBe(200);
  const answer = await spent.json();
  expect(answer.errors).toBeUndefined();
  expect(answer.data.chargeCard.charge).toEqual({
    status: "approved",
    amountCents: 2500,
  });

  // ...while REST still refuses the very same charge with the same key.
  const rest = await api.request.post(
    `/api/bank/cards/${card.card.id}/charges?runKey=${runKey}`,
    { data: { merchant: "Corner Grocery", amountCents: 2500 } },
  );
  expect(rest.status()).toBe(403);
  await api.close();
});

test("bankCursorSkip: paging with cursors loses a row between pages", async ({
  request,
}) => {
  const runKey = uniqueRunKey("cursor-skip");
  await armFlags(request, runKey, { bankCursorSkip: true });
  await signUpCustomer(request, "Cursor Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  for (const amount of [1100, 2200, 3300, 4400, 5500]) {
    await addFunds(request, checking.id, amount);
  }

  const collect = async (key?: string) => {
    const ids: string[] = [];
    let after: string | null = null;
    let total = 0;
    for (let page = 0; page < 20; page += 1) {
      const answer = await graphql<{
        account: {
          history: {
            nodes: { id: string }[];
            pageInfo: { endCursor: string | null; hasNextPage: boolean };
            total: number;
          };
        };
      }>(
        request,
        `
          query H($id: ID!, $after: String) {
            account(id: $id) {
              history(first: 2, after: $after) {
                nodes {
                  id
                }
                pageInfo {
                  endCursor
                  hasNextPage
                }
                total
              }
            }
          }
        `,
        { id: checking.id, after },
        key,
      );
      expect(errorCode(answer)).toBeUndefined();
      const history = answer.data!.account.history;
      total = history.total;
      ids.push(...history.nodes.map((node) => node.id));
      if (!history.pageInfo.hasNextPage) break;
      after = history.pageInfo.endCursor;
    }
    return { ids, total };
  };

  // Correct: every row exactly once.
  const clean = await collect();
  expect(clean.ids.length).toBe(clean.total);
  expect(new Set(clean.ids).size).toBe(clean.total);

  // Armed: the total still says every row exists, but rows are on no page.
  const armed = await collect(runKey);
  expect(armed.total).toBe(clean.total);
  expect(armed.ids.length).toBeLessThan(clean.total);
  const missing = clean.ids.filter((id) => !armed.ids.includes(id));
  expect(missing.length).toBeGreaterThan(0);
});
