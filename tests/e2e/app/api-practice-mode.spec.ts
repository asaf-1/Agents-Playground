import { expect, test, type APIRequestContext } from "@playwright/test";

// Practice mode (phase 4): one switch that arms every planted bug for the
// visitor who flipped it, and nobody else.
//
// The isolation is the whole point. If turning it on could reach another
// visitor — or the shared defaults every other test reads — the site would be
// unusable by two people at once, and this suite would start failing at
// random. Several of these tests exist only to prove that cannot happen.

async function practice(request: APIRequestContext) {
  const response = await request.get("/api/practice");
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function setMode(request: APIRequestContext, on: boolean) {
  const response = await request.post("/api/practice", { data: { on } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test.describe("Practice mode", () => {
  test("is off for a visitor who has not asked for it", async ({ request }) => {
    const state = await practice(request);
    expect(state.on).toBe(false);
    expect(state.runKey).toBeNull();
    expect(state.total).toBeGreaterThan(20);
  });

  test("the catalogue describes every bug it arms", async ({ request }) => {
    const state = await practice(request);
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

  test("turning it on makes the site buggy, and off makes it clean again", async ({
    request,
  }) => {
    // Clean to begin with: a price is a number.
    const before = await (await request.get("/api/products")).json();
    expect(typeof before.products[0].price).toBe("number");

    const armed = await setMode(request, true);
    expect(armed.on).toBe(true);
    expect(armed.runKey).toMatch(/^practice-/);
    expect((await practice(request)).on).toBe(true);

    // The same endpoint now answers with the planted fault, because the cookie
    // carries this visitor's run key.
    const during = await (await request.get("/api/products")).json();
    expect(typeof during.products[0].price).toBe("string");

    await setMode(request, false);
    expect((await practice(request)).on).toBe(false);
    const after = await (await request.get("/api/products")).json();
    expect(typeof after.products[0].price).toBe("number");
  });

  test("one visitor's practice mode leaves everybody else alone", async ({
    request,
    playwright,
    baseURL,
  }) => {
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

  test("it never arms the shared defaults", async ({
    request,
    playwright,
    baseURL,
  }) => {
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

  test("the mode follows the visitor across the site", async ({ request }) => {
    const { runKey } = await setMode(request, true);

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

  test("asking for it twice is harmless", async ({ request }) => {
    const first = await setMode(request, true);
    const second = await setMode(request, true);
    // The same visitor keeps the same key rather than collecting new ones.
    expect(second.runKey).toBe(first.runKey);
    expect((await practice(request)).on).toBe(true);
  });

  test("a body without `on` is treated as off", async ({ request }) => {
    await setMode(request, true);
    const response = await request.post("/api/practice", { data: {} });
    expect(response.status()).toBe(200);
    expect((await response.json()).on).toBe(false);
    expect((await practice(request)).on).toBe(false);
  });
});
