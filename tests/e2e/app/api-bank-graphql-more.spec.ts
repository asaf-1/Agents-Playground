import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  addFunds,
  DEMO,
  errorCode,
  graphql,
  moneyAccounts,
  signIn,
  signUpCustomer,
} from "./_bank";

// GraphQL for everything v1.23.0 added in REST only (plan 2, phase B2):
// cards, limit orders, price alerts and API keys, with the same rules as REST;
// cursor pages on the long lists; and a cost limit beside the depth limit.
// Each test signs up its own customer, so the suite stays parallel-safe.

interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

interface Connection<T> {
  nodes: T[];
  pageInfo: PageInfo;
  total: number;
}

const CARD_FIELDS = `id accountId last4 status frozenBy limitCents spentTodayCents`;

async function getCard(request: APIRequestContext, accountId: string) {
  const answer = await graphql<{ getCard: { id: string; status: string } }>(
    request,
    `mutation Get($accountId: ID!) { getCard(accountId: $accountId) { ${CARD_FIELDS} } }`,
    { accountId },
  );
  expect(answer.errors).toBeUndefined();
  return answer.data!.getCard;
}

async function charge(
  request: APIRequestContext,
  id: string,
  amountCents: number,
) {
  const answer = await graphql<{
    chargeCard: {
      charge: { id: string; status: string; reason: string | null };
      card: { spentTodayCents: number };
    };
  }>(
    request,
    `
      mutation Pay($id: ID!, $amountCents: Cents!) {
        chargeCard(
          id: $id
          merchant: "Corner Grocery"
          amountCents: $amountCents
        ) {
          charge {
            id
            status
            reason
          }
          card {
            spentTodayCents
          }
        }
      }
    `,
    { id, amountCents },
  );
  expect(answer.errors).toBeUndefined();
  return answer.data!.chargeCard;
}

// Pages through a connection to the end, `first` rows at a time.
async function allPages<T>(
  fetchPage: (after: string | null) => Promise<Connection<T>>,
): Promise<{ rows: T[]; pages: number; total: number }> {
  const rows: T[] = [];
  let after: string | null = null;
  let pages = 0;
  let total = 0;
  for (;;) {
    const page = await fetchPage(after);
    pages += 1;
    total = page.total;
    rows.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
    expect(after, "a page with more after it gives a cursor").toBeTruthy();
    expect(pages, "paging must end").toBeLessThan(50);
  }
  return { rows, pages, total };
}

test.describe("Playground Bank GraphQL: cards, orders, alerts, keys, pages", () => {
  test("cards: get one, read its details, pay with it, page its charges", async ({
    request,
  }) => {
    await signUpCustomer(request, "GraphQL Card Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    const card = await getCard(request, checking.id);
    expect(card.status).toBe("ACTIVE");

    const details = await graphql<{
      card: { details: { number: string; cvv: string } };
    }>(
      request,
      `
        query One($id: ID!) {
          card(id: $id) {
            details {
              number
              expires
              cvv
            }
          }
        }
      `,
      { id: card.id },
    );
    const rest = await request.get(`/api/bank/cards/${card.id}/details`);
    expect(details.data?.card.details).toMatchObject(await rest.json());

    for (const amount of [125, 250, 375]) {
      const paid = await charge(request, card.id, amount);
      expect(paid.charge.status).toBe("approved");
    }

    const listed = await allPages<{ id: string; amountCents: number }>(
      async (after) => {
        const answer = await graphql<{
          card: { charges: Connection<{ id: string; amountCents: number }> };
        }>(
          request,
          `
            query Charges($id: ID!, $after: String) {
              card(id: $id) {
                charges(first: 2, after: $after) {
                  nodes {
                    id
                    amountCents
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
          { id: card.id, after },
        );
        expect(answer.errors).toBeUndefined();
        return answer.data!.card.charges;
      },
    );
    expect(listed.total).toBe(3);
    expect(listed.pages).toBe(2);
    expect(listed.rows.map((row) => row.amountCents)).toEqual([375, 250, 125]);

    const restCharges = await (
      await request.get(`/api/bank/cards/${card.id}/charges`)
    ).json();
    expect(listed.rows.map((row) => row.id)).toEqual(
      restCharges.charges.map((row: { id: string }) => row.id),
    );
  });

  test("a frozen card declines, and a limit outside the rules is refused", async ({
    request,
  }) => {
    await signUpCustomer(request, "GraphQL Freeze Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const card = await getCard(request, checking.id);

    const frozen = await graphql<{
      updateCard: { status: string; frozenBy: string };
    }>(
      request,
      `
        mutation Freeze($id: ID!) {
          updateCard(id: $id, status: FROZEN) {
            status
            frozenBy
          }
        }
      `,
      { id: card.id },
    );
    expect(frozen.data?.updateCard).toEqual({
      status: "FROZEN",
      frozenBy: "customer",
    });

    const declined = await charge(request, card.id, 500);
    expect(declined.charge).toMatchObject({
      status: "declined",
      reason: "frozen",
    });

    const tooLow = await graphql(
      request,
      `
        mutation Limit($id: ID!) {
          updateCard(id: $id, limitCents: 50) {
            limitCents
          }
        }
      `,
      { id: card.id },
    );
    expect(errorCode(tooLow)).toBe("VALIDATION_FAILED");

    const twice = await graphql(
      request,
      `
        mutation Again($accountId: ID!) {
          getCard(accountId: $accountId) {
            id
          }
        }
      `,
      { accountId: checking.id },
    );
    expect(errorCode(twice)).toBe("CARD_EXISTS");
  });

  test("someone else's card answers as not found", async ({
    request,
    browser,
  }) => {
    await signUpCustomer(request, "Card Owner");
    const [checking] = (await moneyAccounts(request)).accounts;
    const card = await getCard(request, checking.id);

    const other = await browser.newContext();
    await signUpCustomer(other.request, "Card Stranger");
    const answer = await graphql(
      other.request,
      `
        query One($id: ID!) {
          card(id: $id) {
            last4
            details {
              cvv
            }
          }
        }
      `,
      { id: card.id },
    );
    expect(errorCode(answer)).toBe("CARD_NOT_FOUND");
    await other.close();
  });

  test("orders and alerts: place, page, cancel, as REST sees them", async ({
    request,
  }) => {
    await signUpCustomer(request, "GraphQL Order Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    // A buy at one micro-dollar never fills, so the orders stay open.
    const placed: string[] = [];
    for (const spend of [1000, 2000, 3000]) {
      const answer = await graphql<{
        placeOrder: { id: string; status: string; side: string };
      }>(
        request,
        `
          mutation Place($accountId: ID!, $spend: Cents!) {
            placeOrder(
              symbol: "BTC"
              side: BUY
              accountId: $accountId
              spendCents: $spend
              limitMicros: 1
            ) {
              id
              status
              side
            }
          }
        `,
        { accountId: checking.id, spend },
      );
      expect(answer.errors).toBeUndefined();
      expect(answer.data?.placeOrder).toMatchObject({
        status: "open",
        side: "BUY",
      });
      placed.push(answer.data!.placeOrder.id);
    }

    const listed = await allPages<{ id: string }>(async (after) => {
      const answer = await graphql<{ orders: Connection<{ id: string }> }>(
        request,
        `
          query Orders($after: String) {
            orders(first: 2, after: $after) {
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
        `,
        { after },
      );
      expect(answer.errors).toBeUndefined();
      return answer.data!.orders;
    });
    expect(listed.total).toBe(3);
    expect(listed.rows.map((row) => row.id)).toEqual([...placed].reverse());

    const cancelled = await graphql<{ cancelOrder: { status: string } }>(
      request,
      `
        mutation Cancel($id: ID!) {
          cancelOrder(id: $id) {
            status
          }
        }
      `,
      { id: placed[0] },
    );
    expect(cancelled.data?.cancelOrder.status).toBe("cancelled");
    const restOrders = await (await request.get("/api/bank/orders")).json();
    expect(
      restOrders.orders.find((order: { id: string }) => order.id === placed[0])
        .status,
    ).toBe("cancelled");

    // An alert far above any price never fires.
    const alert = await graphql<{
      createPriceAlert: { id: string; status: string; direction: string };
    }>(
      request,
      `
        mutation Alert {
          createPriceAlert(
            symbol: "ETH"
            direction: ABOVE
            limitMicros: 999999999999999
          ) {
            id
            status
            direction
          }
        }
      `,
    );
    expect(alert.data?.createPriceAlert).toMatchObject({
      status: "armed",
      direction: "ABOVE",
    });
    const alerts = await graphql<{ priceAlerts: { id: string }[] }>(
      request,
      `
        {
          priceAlerts(symbol: "ETH") {
            id
            status
          }
        }
      `,
    );
    expect(alerts.data?.priceAlerts.map((row) => row.id)).toContain(
      alert.data!.createPriceAlert.id,
    );
    const gone = await graphql<{ cancelPriceAlert: { status: string } }>(
      request,
      `
        mutation Off($id: ID!) {
          cancelPriceAlert(id: $id) {
            status
          }
        }
      `,
      { id: alert.data!.createPriceAlert.id },
    );
    expect(gone.data?.cancelPriceAlert.status).toBe("cancelled");
  });

  test("API keys: made and listed with the session, never with a key", async ({
    request,
    browser,
  }) => {
    await signUpCustomer(request, "GraphQL Key Customer");
    const made = await graphql<{
      createApiKey: {
        token: string;
        key: { id: string; scope: string; prefix: string };
      };
    }>(
      request,
      `
        mutation Make {
          createApiKey(name: "Postman", scope: READ) {
            token
            key {
              id
              scope
              prefix
            }
          }
        }
      `,
    );
    expect(made.errors).toBeUndefined();
    const { token, key } = made.data!.createApiKey;
    expect(key.scope).toBe("READ");
    expect(token.startsWith(key.prefix)).toBe(true);

    const listed = await graphql<{
      apiKeys: { keys: { id: string }[]; rateLimitPerMinute: number };
    }>(
      request,
      `
        {
          apiKeys {
            keys {
              id
              prefix
            }
            rateLimitPerMinute
            maxActiveKeys
          }
        }
      `,
    );
    expect(listed.data?.apiKeys.keys.map((row) => row.id)).toContain(key.id);
    expect(listed.data?.apiKeys.rateLimitPerMinute).toBeGreaterThan(0);

    const api = await browser.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    // A key may read...
    const me = await graphql<{ me: { fullName: string } }>(
      api.request,
      "{ me { fullName } }",
    );
    expect(me.data?.me.fullName).toBe("GraphQL Key Customer");
    // ...but never see or manage keys, even with a query...
    const keysWithKey = await graphql(
      api.request,
      "{ apiKeys { keys { id } } }",
    );
    expect(errorCode(keysWithKey)).toBe("KEY_MANAGEMENT_NEEDS_SESSION");
    // ...and a read key runs no mutation at all, a card charge included.
    for (const query of [
      `mutation { createPriceAlert(symbol: "BTC", direction: ABOVE, limitMicros: 1) { id } }`,
      `mutation { chargeCard(id: "00000000-0000-4000-8000-000000000000", merchant: "Shop", amountCents: 100) { charge { id } } }`,
    ]) {
      const refused = await api.request.post("/api/bank/graphql", {
        data: { query },
      });
      expect(refused.status()).toBe(403);
      expect((await refused.json()).code).toBe("KEY_READ_ONLY");
    }

    const revoked = await graphql<{
      revokeApiKey: { revokedAt: string | null };
    }>(
      request,
      `
        mutation Revoke($id: ID!) {
          revokeApiKey(id: $id) {
            revokedAt
          }
        }
      `,
      { id: key.id },
    );
    expect(revoked.data?.revokeApiKey.revokedAt).toBeTruthy();
    const after = await api.request.post("/api/bank/graphql", {
      data: { query: "{ me { id } }" },
    });
    expect(after.status()).toBe(401);
    await api.close();
  });

  test("history a page at a time: every row once, newest first, as REST lists it", async ({
    request,
  }) => {
    await signUpCustomer(request, "GraphQL History Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    for (const amount of [1100, 2200, 3300, 4400, 5500, 6600]) {
      await addFunds(request, checking.id, amount);
    }

    const listed = await allPages<{ id: string }>(async (after) => {
      const answer = await graphql<{
        account: { history: Connection<{ id: string }> };
      }>(
        request,
        `
          query History($id: ID!, $after: String) {
            account(id: $id) {
              history(first: 3, after: $after) {
                nodes {
                  id
                  amountCents
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
      );
      expect(answer.errors).toBeUndefined();
      return answer.data!.account.history;
    });

    const rest = await (
      await request.get(
        `/api/bank/accounts/${checking.id}/transactions?pageSize=100`,
      )
    ).json();
    const restIds = rest.transactions.map((row: { id: string }) => row.id);
    expect(listed.total).toBe(restIds.length);
    expect(listed.rows.map((row) => row.id)).toEqual(restIds);
    expect(new Set(listed.rows.map((row) => row.id)).size).toBe(restIds.length);
    expect(listed.pages).toBe(Math.ceil(restIds.length / 3));
  });

  test("a cursor this API did not give out, or a page too big, is refused", async ({
    request,
  }) => {
    await signUpCustomer(request, "GraphQL Cursor Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const ask = (args: string) =>
      graphql(
        request,
        `query H($id: ID!) { account(id: $id) { history(${args}) { total } } }`,
        { id: checking.id },
      );

    expect(errorCode(await ask(`after: "not-a-cursor"`))).toBe("BAD_CURSOR");
    expect(
      errorCode(
        await ask(
          `after: "${Buffer.from('{"at":"x","seq":"1"}').toString("base64url")}"`,
        ),
      ),
    ).toBe("BAD_CURSOR");
    expect(errorCode(await ask("first: 0"))).toBe("VALIDATION_FAILED");
    expect(errorCode(await ask("first: 101"))).toBe("VALIDATION_FAILED");
  });

  test("a query too wide is refused by its cost; an ordinary one is not", async ({
    request,
  }) => {
    await signUpCustomer(request, "GraphQL Cost Customer");

    // Shallow enough for the depth limit, and still a million rows' worth.
    const wide = await graphql(
      request,
      `
        {
          accounts {
            history(first: 100) {
              nodes {
                transfer {
                  fromAccount {
                    history(first: 100) {
                      nodes {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
    );
    expect(errorCode(wide)).toBe("QUERY_TOO_COSTLY");
    expect(wide.errors?.[0].message).toContain("5000");

    const ordinary = await graphql(
      request,
      `
        {
          me {
            fullName
          }
          accounts {
            number
            balanceCents
            history(first: 20) {
              nodes {
                amountCents
                description
              }
              total
            }
          }
          cards {
            last4
            status
          }
          orders(first: 10) {
            nodes {
              symbol
              status
            }
          }
        }
      `,
    );
    expect(ordinary.errors).toBeUndefined();
  });

  test("demo accounts can read their cards but not get a new one", async ({
    request,
  }) => {
    await signIn(request, DEMO.customer);
    const read = await graphql(request, "{ cards { last4 } }");
    expect(read.errors).toBeUndefined();
    const [checking] = (await moneyAccounts(request)).accounts;
    const made = await graphql(
      request,
      `
        mutation Get($accountId: ID!) {
          getCard(accountId: $accountId) {
            id
          }
        }
      `,
      { accountId: checking.id },
    );
    expect(errorCode(made)).toBe("DEMO_READ_ONLY");
  });
});
