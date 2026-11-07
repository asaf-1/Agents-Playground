// Reads openapi.json from disk, so answers can be checked against the contract.
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema; ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// The type of a request context (the `request` fixture or a context's request).
import { type APIRequestContext } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: sign up, sign in, read accounts and balances.
import {
  DEMO,
  balanceOf,
  moneyAccounts,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";
// The customer's own clock: read it, add days, move it forward.
import {
  addDays,
  advanceClockTo,
  readClock,
} from "../../../framework/helpers/schedule";

// Cards (phase A3): one virtual debit card per account, a daily limit counted
// on the customer's own day, freeze by the customer or by the bank, and
// simulated purchases that land in the account's history.
//
// Safe in the fully parallel suite: every test signs up its own customer.

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

// The same check digit real cards carry: a mistyped number fails it.
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  // From the last digit back: every second digit is doubled, and a two-digit
  // result counts as the sum of its digits.
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  // A real card number adds up to a multiple of ten.
  return sum % 10 === 0;
}

// One card, as the API returns it (never the full number or the CVV).
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

// Issues a card for one account, and checks it was made (201).
async function issueCard(request: APIRequestContext, accountId: string) {
  fact("card for", accountId);
  const response = await request.post("/api/bank/cards", {
    data: { accountId },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).card as Card;
}

// Sets a card's daily limit, and checks it was taken (200).
async function setLimit(
  request: APIRequestContext,
  id: string,
  limitCents: number,
) {
  fact("limit", `${limitCents} cents on card ${id}`);
  const response = await request.patch(`/api/bank/cards/${id}`, {
    data: { limitCents },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).card as Card;
}

// Makes a simulated purchase. The answer is always 201; whether the bank
// approved or declined it is in charge.status.
async function pay(
  request: APIRequestContext,
  id: string,
  amountCents: number,
  merchant = "Corner Grocery",
) {
  fact("charge", `${amountCents} cents at ${merchant} on card ${id}`);
  const response = await request.post(`/api/bank/cards/${id}/charges`, {
    data: { merchant, amountCents },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as {
    charge: { status: string; reason: string | null; amountCents: number };
    card: Card;
  };
}

// A new customer and their Checking account.
async function setUp(request: APIRequestContext) {
  const customer = await signUpCustomer(request, "Card Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  fact("checking", checking.id);
  fact("balance", checking.balanceCents);
  return { customer, checking };
}

// The card API: issuing, limits, purchases, freezing, and who may do what.
test.describe("Cards (/api/bank/cards)", () => {
  // A card is issued once per account with a limit taken from the balance, and
  // its full details are shown only to its owner.
  test("one card per account, a limit from the balance, details on request", async ({
    request,
    browser,
  }) => {
    expected(
      "201 active card, limit a tenth of the balance, 409 CARD_EXISTS on a second, valid details, 404 for another customer",
    );
    // A new customer gets a card on Checking.
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    fact("cardId", card.id);
    fact("last4", card.last4);
    fact("limitCents", card.limitCents);
    expect(card.accountId).toBe(checking.id);
    expect(card.status).toBe("active");
    expect(card.spentTodayCents).toBe(0);
    expect(card.last4).toMatch(/^\d{4}$/);
    // A tenth of the balance, in whole dollars: not a number pulled from the air.
    expect(card.limitCents).toBe(
      Math.floor(checking.balanceCents / 10 / 100) * 100,
    );

    // The customer's card list has exactly that card.
    const list = await (await request.get("/api/bank/cards")).json();
    expectSchema("BankCardsResponse", list);
    expect(list.cards).toHaveLength(1);

    // The same account cannot get a second card.
    const again = await request.post("/api/bank/cards", {
      data: { accountId: checking.id },
    });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("CARD_EXISTS");

    // The details: a 16-digit number starting with 9 that passes the check
    // digit and ends in last4, a 3-digit CVV, and an MM/YY expiry.
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

  // A purchase inside the limit is approved, the money leaves, and the history shows it.
  test("a purchase within the limit is approved and lands in the history", async ({
    request,
  }) => {
    expected(
      "approved, spentToday = amount, balance down by amount, a card_purchase line naming Cloud Coffee",
    );
    // A new customer with a card spends half the limit.
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    const amount = Math.floor(card.limitCents / 2);
    fact("cardId", card.id);
    fact("amount", amount);

    // Approved, counted against today, and taken from the balance.
    const paid = await pay(request, card.id, amount, "Cloud Coffee");
    expectSchema("BankCardChargeResponse", paid);
    expect(paid.charge.status).toBe("approved");
    expect(paid.charge.reason).toBeNull();
    expect(paid.card.spentTodayCents).toBe(amount);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - amount,
    );

    // The account history has a card_purchase line for it.
    const history = await (
      await request.get(`/api/bank/accounts/${checking.id}/transactions`)
    ).json();
    const row = history.transactions.find(
      (t: { kind: string }) => t.kind === "card_purchase",
    );
    expect(row, JSON.stringify(history).slice(0, 300)).toBeDefined();
    expect(row.amountCents).toBe(-amount);
    expect(row.description).toContain("Cloud Coffee");

    // And the card's own list of charges has it, approved.
    const charges = await (
      await request.get(`/api/bank/cards/${card.id}/charges`)
    ).json();
    expectSchema("BankCardChargesResponse", charges);
    expect(charges.charges[0].status).toBe("approved");
  });

  // The limit counts the whole day's spending, and starts again the next day
  // on the customer's own clock.
  test("the daily limit is a daily total, and resets with the customer's day", async ({
    request,
  }) => {
    expected(
      "6000 approved, a second 6000 declined over_limit with a notification, approved again tomorrow",
    );
    // A new customer with a card limited to $100 a day.
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    fact("cardId", card.id);
    await setLimit(request, card.id, 10_000);

    // $60 is fine; another $60 the same day goes over $100 and is declined.
    expect((await pay(request, card.id, 6_000)).charge.status).toBe("approved");
    const second = await pay(request, card.id, 6_000, "Metro Transit");
    expect(second.charge.status).toBe("declined");
    expect(second.charge.reason).toBe("over_limit");
    expect(second.card.spentTodayCents).toBe(6_000);
    // Only the first $60 left the account.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 6_000,
    );
    // The customer is told about the decline, with the merchant's name.
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
    fact("today", today);
    await advanceClockTo(request, addDays(today, 1));
    const third = await pay(request, card.id, 6_000, "Metro Transit");
    expect(third.charge.status).toBe("approved");
    expect(third.card.spentTodayCents).toBe(6_000);
  });

  // A frozen card declines everything until its owner unfreezes it.
  test("a frozen card declines, and the customer can unfreeze their own", async ({
    request,
  }) => {
    expected(
      "frozen by customer, a purchase declined 'frozen', active again, the next purchase approved",
    );
    // A new customer with a card.
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    fact("cardId", card.id);

    // The customer freezes it; a purchase is declined for that reason.
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

    // They unfreeze it, and the next purchase goes through.
    const active = await request.patch(`/api/bank/cards/${card.id}`, {
      data: { status: "active" },
    });
    expect((await active.json()).card).toMatchObject({
      status: "active",
      frozenBy: null,
    });
    expect((await pay(request, card.id, 1_000)).charge.status).toBe("approved");
  });

  // Spending more than the account holds is declined with its own reason.
  test("not enough money declines with its own reason", async ({ request }) => {
    expected(
      "declined insufficient_funds for balance + 100, balance unchanged",
    );
    // A new customer with a card whose limit is far above the balance.
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    fact("cardId", card.id);
    await setLimit(request, card.id, 100_000_000);
    // A dollar more than the balance: declined, and nothing leaves.
    const declined = await pay(request, card.id, checking.balanceCents + 100);
    expect(declined.charge.status).toBe("declined");
    expect(declined.charge.reason).toBe("insufficient_funds");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
  });

  // A freeze by the bank can't be undone by the customer, and staff see the
  // customer's cards. Support can read but not freeze.
  test("the bank's freeze beats the customer's, and staff see the cards", async ({
    request,
    browser,
  }) => {
    expected(
      "Admin freeze 200 frozenBy admin, customer unfreeze 403 CARD_FROZEN_BY_BANK with a notification, Support freeze 403",
    );
    // A new customer with a card.
    const { customer, checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    fact("cardId", card.id);

    // The demo Admin, in their own browser context, freezes the card.
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

    // The Admin unfreezes it again.
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

  // Bad limits, statuses and purchases are refused with the field named, and
  // only the owner can change a card.
  test("validation and access", async ({ request, browser }) => {
    expected(
      "400 naming the field for each bad change and purchase; 404 for another customer, 403 for the demo, 401 signed out",
    );
    // A new customer with a card.
    const { checking } = await setUp(request);
    const card = await issueCard(request, checking.id);
    fact("cardId", card.id);

    // A limit too small or not a number, an unknown status, and an empty change.
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
    // A merchant name too short, and a purchase of nothing.
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

    // Another customer can't freeze it: not found.
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

    // The demo customer can read cards but not issue one.
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

    // Someone signed out gets 401.
    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/cards")).status()).toBe(401);
    await visitor.close();
  });
});
