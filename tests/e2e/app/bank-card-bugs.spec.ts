// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: balances, accounts, sign up, a unique runKey.
import {
  balanceOf,
  moneyAccounts,
  signUpCustomer,
  uniqueRunKey,
} from "../../../framework/helpers/bank";

// The cards' planted bug, armed for one run key only. Without the flag the
// second purchase is declined, which api-bank-cards.spec.ts checks.

// With the bug armed, the daily limit is checked against each purchase alone,
// so two purchases under the limit go over it together.
test("bankCardLimitPerCharge: many small purchases walk past the daily limit", async ({
  request,
}) => {
  expected(
    "with bankCardLimitPerCharge armed: two $60 purchases on a $100 limit both approved; spent today 12000; Checking -12000",
  );
  // Arm the bug for this runKey.
  const runKey = uniqueRunKey("card-limit-per-charge");
  await armFlags(request, runKey, { bankCardLimitPerCharge: true });

  // A new customer with a card limited to $100 a day.
  await signUpCustomer(request, "Limit Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  const created = await request.post("/api/bank/cards", {
    data: { accountId: checking.id },
  });
  const card = (await created.json()).card as { id: string };
  fact("checking", checking.id);
  fact("cardId", card.id);
  await request.patch(`/api/bank/cards/${card.id}`, {
    data: { limitCents: 10_000 },
  });

  // Each one is under the $100 limit; together they are $120.
  for (const amountCents of [6_000, 6_000]) {
    const response = await request.post(
      `/api/bank/cards/${card.id}/charges?runKey=${runKey}`,
      { data: { merchant: "Night Market", amountCents } },
    );
    expect(response.status()).toBe(201);
    const { charge } = await response.json();
    expect(charge.status).toBe("approved");
  }

  // $120 spent against a $100 limit, and the money left the account.
  const list = await (await request.get("/api/bank/cards")).json();
  expect(list.cards[0].spentTodayCents).toBe(12_000);
  expect(list.cards[0].limitCents).toBe(10_000);
  expect(await balanceOf(request, checking.id)).toBe(
    checking.balanceCents - 12_000,
  );
});
