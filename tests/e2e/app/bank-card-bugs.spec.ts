import { expect, test } from "@playwright/test";
import { armFlags } from "./_helpers";
import {
  balanceOf,
  moneyAccounts,
  signUpCustomer,
  uniqueRunKey,
} from "./_bank";

// The cards' planted bug, armed for one run key only. Without the flag the
// second purchase is declined, which api-bank-cards.spec.ts checks.

test("bankCardLimitPerCharge: many small purchases walk past the daily limit", async ({
  request,
}) => {
  const runKey = uniqueRunKey("card-limit-per-charge");
  await armFlags(request, runKey, { bankCardLimitPerCharge: true });

  await signUpCustomer(request, "Limit Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  const created = await request.post("/api/bank/cards", {
    data: { accountId: checking.id },
  });
  const card = (await created.json()).card as { id: string };
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

  const list = await (await request.get("/api/bank/cards")).json();
  expect(list.cards[0].spentTodayCents).toBe(12_000);
  expect(list.cards[0].limitCents).toBe(10_000);
  expect(await balanceOf(request, checking.id)).toBe(
    checking.balanceCents - 12_000,
  );
});
