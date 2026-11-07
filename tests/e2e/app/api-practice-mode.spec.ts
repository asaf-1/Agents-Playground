// The type of a request context.
import { type APIRequestContext } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

// Practice mode (phase 4): one switch that arms every planted bug for the
// visitor who flipped it, and nobody else.
//
// The isolation is the whole point. If turning it on could reach another
// visitor — or the shared defaults every other test reads — the site would be
// unusable by two people at once, and this suite would start failing at
// random. Several of these tests exist only to prove that cannot happen.

// The visitor's practice-mode state: on or off, their runKey, and the bug list.
async function practice(request: APIRequestContext) {
  const response = await request.get("/api/practice");
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

// Turns practice mode on or off for this visitor.
async function setMode(request: APIRequestContext, on: boolean) {
  fact("practice", on ? "on" : "off");
  const response = await request.post("/api/practice", { data: { on } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test.describe("Practice mode", () => {
  // A new visitor starts with practice mode off and no runKey.
  test("is off for a visitor who has not asked for it", async ({ request }) => {
    expected("off, runKey null, more than 20 bugs in the catalogue");
    const state = await practice(request);
    fact("bugs", state.total);
    expect(state.on).toBe(false);
    expect(state.runKey).toBeNull();
    expect(state.total).toBeGreaterThan(20);
  });

  // Every planted bug in the catalogue is fully described, once, and never
  // shows the value its flag is set to.
  test("the catalogue describes every bug it arms", async ({ request }) => {
    expected(
      "each bug has a flag name, REPORT or HEAL, a kind, a where, and a real title, hint and reveal; no value; each flag once",
    );
    const state = await practice(request);
    fact("bugs", state.total);
    expect(state.bugs).toHaveLength(state.total);

    for (const bug of state.bugs) {
      expect(bug.flag, "flag").toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
      expect(["REPORT", "HEAL"]).toContain(bug.verdict);
      // Every field is filled in: no placeholders, no empty strings. A kind
      // and a path are short by nature; a hint and a reveal are real prose.
      expect(String(bug.kind).length, `${bug.flag}.kind`).toBeGreaterThan(3);
      expect(String(bug.where).length, `${bug.flag}.where`).toBeGreaterThan(5);
      for (const field of ["title", "hint", "reveal"]) {
        expect(
          String(bug[field]).length,
          `${bug.flag}.${field}`,
        ).toBeGreaterThan(25);
      }
      // The value a flag is set to is an implementation detail; the page that
      // reads this should not be able to leak it.
      expect(bug).not.toHaveProperty("value");
    }

    // Every flag appears once.
    const flags = state.bugs.map((bug: { flag: string }) => bug.flag);
    expect(new Set(flags).size).toBe(flags.length);
  });

  // On, the site serves its planted faults (a price as a string); off, it is
  // clean again.
  test("turning it on makes the site buggy, and off makes it clean again", async ({
    request,
  }) => {
    expected(
      "price a number; on with a practice- runKey, price a string; off, price a number again",
    );
    // Clean to begin with: a price is a number.
    const before = await (await request.get("/api/products")).json();
    expect(typeof before.products[0].price).toBe("number");

    // Turn it on: this visitor gets a practice runKey.
    const armed = await setMode(request, true);
    fact("runKey", armed.runKey);
    expect(armed.on).toBe(true);
    expect(armed.runKey).toMatch(/^practice-/);
    expect((await practice(request)).on).toBe(true);

    // The same endpoint now answers with the planted fault, because the cookie
    // carries this visitor's run key.
    const during = await (await request.get("/api/products")).json();
    expect(typeof during.products[0].price).toBe("string");

    // Turn it off: clean again.
    await setMode(request, false);
    expect((await practice(request)).on).toBe(false);
    const after = await (await request.get("/api/products")).json();
    expect(typeof after.products[0].price).toBe("number");
  });

  // Practice mode for one visitor doesn't touch another visitor.
  test("one visitor's practice mode leaves everybody else alone", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "this visitor sees a string price; a second visitor is off and sees a number",
    );
    // This visitor turns it on and sees the fault.
    await setMode(request, true);
    expect(
      typeof (await (await request.get("/api/products")).json()).products[0]
        .price,
    ).toBe("string");

    // A second visitor, with no cookie of their own.
    const other = await playwright.request.newContext({ baseURL });
    expect((await practice(other)).on).toBe(false);
    const theirs = await (await other.get("/api/products")).json();
    expect(typeof theirs.products[0].price).toBe("number");
    await other.dispose();
  });

  // Practice mode never changes the flags that everyone without a runKey reads.
  test("it never arms the shared defaults", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "the global flags keep productSchemaDrift and bankNegativeTransfer false",
    );
    await setMode(request, true);

    // The global flag store is what every caller without a run key reads. If
    // practice mode ever wrote to it, the whole site would turn buggy for
    // everyone — and this suite would fail in a hundred places at once.
    const anonymous = await playwright.request.newContext({ baseURL });
    const globalFlags = await (
      await anonymous.get("/api/test/flags?runKey=global")
    ).json();
    expect(globalFlags.flags.productSchemaDrift).toBe(false);
    expect(globalFlags.flags.bankNegativeTransfer).toBe(false);
    await anonymous.dispose();
  });

  // The visitor's runKey travels in a cookie, so other parts of the site are
  // armed too.
  test("the mode follows the visitor across the site", async ({ request }) => {
    expected(
      "the market answers a string price; the flag store has bankCryptoPriceType true for the runKey",
    );
    const { runKey } = await setMode(request, true);
    fact("runKey", runKey);

    // The cookie carries the run key, so a different endpoint is armed too,
    // with nothing in the URL saying so.
    const market = await (await request.get("/api/bank/market")).json();
    expect(typeof market.coins[0].priceMicros).toBe("string");

    // And it is the same key the flag store knows.
    const flags = await (
      await request.get(`/api/test/flags?runKey=${runKey}`)
    ).json();
    expect(flags.flags.bankCryptoPriceType).toBe(true);
  });

  // Turning it on twice keeps the same runKey.
  test("asking for it twice is harmless", async ({ request }) => {
    expected("the same runKey both times, and still on");
    const first = await setMode(request, true);
    const second = await setMode(request, true);
    fact("runKey", first.runKey);
    // The same visitor keeps the same key rather than collecting new ones.
    expect(second.runKey).toBe(first.runKey);
    expect((await practice(request)).on).toBe(true);
  });

  // Posting without "on" turns it off.
  test("a body without `on` is treated as off", async ({ request }) => {
    expected("200 with on false, and the state reads off");
    await setMode(request, true);
    const response = await request.post("/api/practice", { data: {} });
    expect(response.status()).toBe(200);
    expect((await response.json()).on).toBe(false);
    expect((await practice(request)).on).toBe(false);
  });
});
