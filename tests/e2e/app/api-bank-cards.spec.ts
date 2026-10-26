import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  DEMO,
  balanceOf,
  moneyAccounts,
  signIn,
  signUpCustomer,
} from "./_bank";
import { addDays, advanceClockTo, readClock } from "./_schedule";

// Cards (phase A3): one virtual debit card per account, a daily limit counted
// on the customer's own day, freeze by the customer or by the bank, and
// simulated purchases that land in the account's history.
//
// Safe in the fully parallel suite: every test signs up its own customer.

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

// The same check digit real cards carry: a mistyped number fails it.
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

interface Card {
  id: string;
  accountId: string;
  last4: string;
  expires: string;
  status: "active" | "frozen";
  frozenBy: "customer" | "admin" | null;
  limitCents: number;
  spentTodayCents: number;
}

async function issueCard(request: APIRequestContext, accountId: string) {
  const response = await request.post("/api/bank/cards", {
    data: { accountId },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).card as Card;
}

async function setLimit(
  request: APIRequestContext,
  id: string,
  limitCents: number,
) {
  const response = await request.patch(`/api/bank/cards/${id}`, {
    data: { limitCents },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).card as Card;
}

async function pay(
  request: APIRequestContext,
  id: string,
  amountCents: number,
  merchant = "Corner Grocery",
) {
  const response = await request.post(`/api/bank/cards/${id}/charges`, {
    data: { merchant, amountCents },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as {
    charge: { status: string; reason: string | null; amountCents: number };
    card: Card;
  };
}

async function setUp(request: APIRequestContext) {
  const customer = await signUpCustomer(request, "Card Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  return { customer, checking };
}

test.describe("Cards (/api/bank/cards)", () => {
  test("one card per account, a limit from the balance, details on request", async ({
    request,
    browser,
  }) => {
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    expect(card.accountId).toBe(checking.id);
    expect(card.status).toBe("active");
    expect(card.spentTodayCents).toBe(0);
    expect(card.last4).toMatch(/^\d{4}$/);
    // A tenth of the balance, in whole dollars: not a number pulled from the air.
    expect(card.limitCents).toBe(
      Math.floor(checking.balanceCents / 10 / 100) * 100,
    );

    const list = await (await request.get("/api/bank/cards")).json();
    expectSchema("BankCardsResponse", list);
    expect(list.cards).toHaveLength(1);

    // The same account cannot get a second card.
    const again = await request.post("/api/bank/cards", {
      data: { accountId: checking.id },
    });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("CARD_EXISTS");

    const details = await (
      await request.get(`/api/bank/cards/${card.id}/details`)
    ).json();
    expectSchema("BankCardDetails", details);
    const digits = details.number.replace(/ /g, "");
    expect(digits).toMatch(/^9\d{15}$/);
    expect(luhnValid(digits)).toBe(true);
    expect(digits.endsWith(card.last4)).toBe(true);
    expect(details.cvv).toMatch(/^\d{3}$/);
    expect(details.expires).toMatch(/^(0[1-9]|1[0-2])\/\d{2}$/);

    // Another customer's details are nobody's business.
    const other = await browser.newContext();
    await signUpCustomer(other.request, "Other Customer");
    expect(
      (await other.request.get(`/api/bank/cards/${card.id}/details`)).status(),
    ).toBe(404);
    await other.close();
  });

  test("a purchase within the limit is approved and lands in the history", async ({
    request,
  }) => {
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    const amount = Math.floor(card.limitCents / 2);

    const paid = await pay(request, card.id, amount, "Cloud Coffee");
    expectSchema("BankCardChargeResponse", paid);
    expect(paid.charge.status).toBe("approved");
    expect(paid.charge.reason).toBeNull();
    expect(paid.card.spentTodayCents).toBe(amount);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - amount,
    );

    const history = await (
      await request.get(`/api/bank/accounts/${checking.id}/transactions`)
    ).json();
    const row = history.transactions.find(
      (t: { kind: string }) => t.kind === "card_purchase",
    );
    expect(row, JSON.stringify(history).slice(0, 300)).toBeDefined();
    expect(row.amountCents).toBe(-amount);
    expect(row.description).toContain("Cloud Coffee");

    const charges = await (
      await request.get(`/api/bank/cards/${card.id}/charges`)
    ).json();
    expectSchema("BankCardChargesResponse", charges);
    expect(charges.charges[0].status).toBe("approved");
  });

  test("the daily limit is a daily total, and resets with the customer's day", async ({
    request,
  }) => {
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    await setLimit(request, card.id, 10_000);

    expect((await pay(request, card.id, 6_000)).charge.status).toBe("approved");
    const second = await pay(request, card.id, 6_000, "Metro Transit");
    expect(second.charge.status).toBe("declined");
    expect(second.charge.reason).toBe("over_limit");
    expect(second.card.spentTodayCents).toBe(6_000);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 6_000,
    );
    const { notifications } = await (
      await request.get("/api/bank/notifications")
    ).json();
    const declined = notifications.find(
      (n: { kind: string }) => n.kind === "card_declined",
    );
    expect(declined).toBeDefined();
    expect(declined.title).toContain("Metro Transit");

    // Tomorrow is a new day for the limit.
    const { today } = await readClock(request);
    await advanceClockTo(request, addDays(today, 1));
    const third = await pay(request, card.id, 6_000, "Metro Transit");
    expect(third.charge.status).toBe("approved");
    expect(third.card.spentTodayCents).toBe(6_000);
  });

  test("a frozen card declines, and the customer can unfreeze their own", async ({
    request,
  }) => {
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);

    const frozen = await request.patch(`/api/bank/cards/${card.id}`, {
      data: { status: "frozen" },
    });
    expect(frozen.status()).toBe(200);
    expect((await frozen.json()).card).toMatchObject({
      status: "frozen",
      frozenBy: "customer",
    });
    const declined = await pay(request, card.id, 1_000);
    expect(declined.charge.status).toBe("declined");
    expect(declined.charge.reason).toBe("frozen");

    const active = await request.patch(`/api/bank/cards/${card.id}`, {
      data: { status: "active" },
    });
    expect((await active.json()).card).toMatchObject({
      status: "active",
      frozenBy: null,
    });
    expect((await pay(request, card.id, 1_000)).charge.status).toBe("approved");
  });

  test("not enough money declines with its own reason", async ({ request }) => {
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    await setLimit(request, card.id, 100_000_000);
    const declined = await pay(request, card.id, checking.balanceCents + 100);
    expect(declined.charge.status).toBe("declined");
    expect(declined.charge.reason).toBe("insufficient_funds");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
  });

  test("the bank's freeze beats the customer's, and staff see the cards", async ({
    request,
    browser,
  }) => {
    const { customer, checking } = await setUp(request);
    const card = await issueCard(request, checking.id);

    const admin = await browser.newContext();
    await signIn(admin.request, DEMO.admin);
    const frozen = await admin.request.patch(
      `/api/bank/admin/cards/${card.id}`,
      {
        data: { status: "frozen" },
      },
    );
    expect(frozen.status(), await frozen.text()).toBe(200);
    expect((await frozen.json()).card).toMatchObject({
      status: "frozen",
      frozenBy: "admin",
    });

    // The customer cannot undo a bank freeze, and is told about it.
    const tried = await request.patch(`/api/bank/cards/${card.id}`, {
      data: { status: "active" },
    });
    expect(tried.status()).toBe(403);
    expect((await tried.json()).code).toBe("CARD_FROZEN_BY_BANK");
    const { notifications } = await (
      await request.get("/api/bank/notifications")
    ).json();
    expect(
      notifications.some((n: { title: string }) =>
        n.title.includes("frozen by the bank"),
      ),
    ).toBe(true);

    // Staff see the cards on the customer's profile.
    const detail = await (
      await admin.request.get(`/api/bank/admin/users/${customer.id}`)
    ).json();
    expectSchema("BankUserDetailResponse", detail);
    expect(detail.cards).toHaveLength(1);
    expect(detail.cards[0].status).toBe("frozen");

    const thawed = await admin.request.patch(
      `/api/bank/admin/cards/${card.id}`,
      {
        data: { status: "active" },
      },
    );
    expect((await thawed.json()).card.frozenBy).toBeNull();
    await admin.close();

    // Support reads, but does not freeze.
    const support = await browser.newContext();
    await signIn(support.request, DEMO.support);
    expect(
      (
        await support.request.patch(`/api/bank/admin/cards/${card.id}`, {
          data: { status: "frozen" },
        })
      ).status(),
    ).toBe(403);
    await support.close();
  });

  test("validation and access", async ({ request, browser }) => {
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);

    for (const [data, field] of [
      [{ limitCents: 50 }, "limitCents"],
      [{ limitCents: "lots" }, "limitCents"],
      [{ status: "lost" }, "status"],
      [{}, "status"],
    ] as [Record<string, unknown>, string][]) {
      const response = await request.patch(`/api/bank/cards/${card.id}`, {
        data,
      });
      expect(response.status(), JSON.stringify(data)).toBe(400);
      expect(Object.keys((await response.json()).errors)).toContain(field);
    }
    for (const [data, field] of [
      [{ merchant: "A", amountCents: 100 }, "merchant"],
      [{ merchant: "Corner Grocery", amountCents: 0 }, "amountCents"],
    ] as [Record<string, unknown>, string][]) {
      const response = await request.post(
        `/api/bank/cards/${card.id}/charges`,
        {
          data,
        },
      );
      expect(response.status(), JSON.stringify(data)).toBe(400);
      expect(Object.keys((await response.json()).errors)).toContain(field);
    }

    const other = await browser.newContext();
    await signUpCustomer(other.request, "Other Customer");
    expect(
      (
        await other.request.patch(`/api/bank/cards/${card.id}`, {
          data: { status: "frozen" },
        })
      ).status(),
    ).toBe(404);
    await other.close();

    const demo = await browser.newContext();
    await signIn(demo.request, DEMO.customer);
    expect(
      (
        await demo.request.post("/api/bank/cards", {
          data: { accountId: checking.id },
        })
      ).status(),
    ).toBe(403);
    expect((await demo.request.get("/api/bank/cards")).status()).toBe(200);
    await demo.close();

    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/cards")).status()).toBe(401);
    await visitor.close();
  });
});
