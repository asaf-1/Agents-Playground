// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// A fresh in-memory bank, a customer in it, a balance, and a failing save.
import {
  balanceCents,
  failSaveOnce,
  freshBank,
  newCustomer,
  type BankDb,
} from "../../../framework/helpers/bankDb";
// The retry-safe runner, the rule for its one exception, and a deposit.
import {
  OVERSELL_RACE_FLAG,
  once,
  togetherFor,
} from "../../../bank/idempotency.js";
import { deposit } from "../../../bank/money.js";

// Retry safety (md/plans/feedback-fixes-plan.md, Part 1). A money action and
// the saving of its answer run in one transaction (bank/idempotency.js), so a
// save that fails can never let a retry with the same key pay a second time.
// Before the fix the deposit stayed and the key was let go, so the retry added
// the money again. A failing save can't be caused through the website, so
// these tests drive the bank's own modules on a fresh in-memory database.

// The database is closed when the test is done with it.
let db: BankDb | null = null;
test.afterEach(async () => {
  await db?.close?.();
  db = null;
});

test("a retried deposit with the same key adds the money once when saving its answer failed", async () => {
  expected(
    "first call fails and is undone (+0); the retry adds 500 (+500); a third call replays (+500)",
  );

  // A fresh bank with one customer, and the balance before.
  const { userId, accountId, before } =
    await test.step("open a fresh bank with one customer", async () => {
      db = await freshBank();
      const customer = await newCustomer(db);
      return {
        ...customer,
        before: await balanceCents(db, customer.userId, customer.accountId),
      };
    });
  // Each later read, as the change since the start.
  const added = async () =>
    (await balanceCents(db!, userId, accountId)) - before;

  // The same deposit every time: 500 cents, one key.
  const flaky = failSaveOnce(db!);
  const args = {
    userId,
    key: "retry-safety-key",
    scope: "money.add_funds",
    request: { accountId, amountCents: 500 },
  };
  // once() hands the work its transaction. The fallback is for the code before
  // the fix, which handed it nothing, so this test proves the bug there too.
  const work = (tx: BankDb = flaky.db) => deposit(tx, accountId, 500);
  fact("deposit", `500 cents into ${accountId}, key ${args.key}`);

  // The first call: the deposit runs, then saving its answer fails.
  await test.step("deposit 500 cents with a key while saving its answer fails", async () => {
    await expect(
      once(flaky.db, args, work),
      "the first deposit fails, because its answer could not be saved",
    ).rejects.toThrow("saving the answer failed");
    expect(flaky.state.fired, "the save really failed").toBe(true);
    expect(await added(), "the failed deposit was undone with it").toBe(0);
  });

  // The retry: nothing was kept, so it runs as new, and adds the money once.
  await test.step("send the same deposit again with the same key", async () => {
    const retry = await once(flaky.db, args, work);
    expect(
      retry.replayed,
      "the retry is a new deposit, the first was undone",
    ).toBe(false);
    expect(await added(), "the money was added once, not twice").toBe(500);
  });

  // A third call: the stored answer comes back, and nothing more is added.
  await test.step("send it a third time with the same key", async () => {
    const third = await once(flaky.db, args, work);
    expect(third.replayed, "the third call gets the stored answer back").toBe(
      true,
    );
    expect(await added(), "a replay adds nothing").toBe(500);
  });
});

test("an inner transaction that fails is undone on its own while the outer one still saves", async () => {
  expected("outer deposit of 100 kept, inner deposit of 200 undone: +100");

  // A fresh bank with one customer, and the balance before.
  const { userId, accountId, before } =
    await test.step("open a fresh bank with one customer", async () => {
      db = await freshBank();
      const customer = await newCustomer(db);
      return {
        ...customer,
        before: await balanceCents(db, customer.userId, customer.accountId),
      };
    });

  // One outer transaction: a deposit that stays, and an inner one that fails.
  await test.step("deposit 100, then fail an inner transaction that deposited 200", async () => {
    await db!.transaction(async (tx) => {
      await deposit(tx, accountId, 100);
      await expect(
        tx.transaction(async (inner) => {
          await deposit(inner, accountId, 200);
          throw new Error("the inner transaction fails on purpose");
        }),
        "the inner transaction fails",
      ).rejects.toThrow("fails on purpose");
    });
  });

  // Only the outer deposit is in the balance.
  await test.step("read the balance", async () => {
    const after = await balanceCents(db!, userId, accountId);
    fact("balance change", after - before);
    expect(after - before, "only the outer deposit of 100 was saved").toBe(100);
  });
});

test("a checkout keeps its two steps only while the planted oversell race is armed", async () => {
  expected(
    "checkout: together unless the oversell race is armed; every other action: always together",
  );
  // The flag by its exported name, so this spec is not credited with catching
  // the oversell bug (it only checks the exception).
  const raceArmed = { [OVERSELL_RACE_FLAG]: true };
  fact("race flag", OVERSELL_RACE_FLAG);

  // The planted race needs two checkouts to overlap, so only it is exempt.
  await test.step("ask the rule for a checkout, with and without the fault", async () => {
    expect(
      togetherFor("shop.checkout", {}),
      "a normal checkout runs in one transaction with its answer",
    ).toBe(true);
    expect(
      togetherFor("shop.checkout", raceArmed),
      "a checkout with the oversell race armed keeps its two steps",
    ).toBe(false);
  });

  // The fault exempts nothing else.
  await test.step("ask the rule for a deposit with the fault armed", async () => {
    expect(
      togetherFor("money.add_funds", raceArmed),
      "a deposit runs in one transaction even with the oversell fault armed",
    ).toBe(true);
  });
});
