// The type of a request context.
import { type APIRequestContext } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

// Practice mode, one fault at a time: POST /api/practice with a `flags` list
// arms exactly those faults for this visitor, GET says which are armed, and
// every fault has a level. The all-or-nothing switch (`on`) keeps working as
// before; api-practice-mode.spec.ts covers it.
//
// Safe in the fully parallel suite: each test's request context is its own
// visitor with its own run key, and nothing here touches the shared defaults.

// The visitor's practice state.
async function practice(request: APIRequestContext) {
  const response = await request.get("/api/practice");
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

// Arms exactly these faults for this visitor.
async function pick(request: APIRequestContext, flags: string[]) {
  fact("pick", flags.length ? flags : "(none)");
  const response = await request.post("/api/practice", { data: { flags } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

// The one fault this file checks the effect of: a product's price comes back
// as text.
const DRIFT = "productSchemaDrift";

// Whether a product's price comes back as text: the productSchemaDrift fault,
// live for this visitor when it is armed.
async function priceIsText(request: APIRequestContext) {
  const body = await (await request.get("/api/products")).json();
  return typeof body.products[0].price === "string";
}

// The catalogue's flags, in order, without DRIFT. The other faults a test
// picks come from here, never written into this file: the test-cases page and
// the runner's knowledge base list a spec under every fault it names, and
// these tests check the picking, not those faults.
async function otherFlags(request: APIRequestContext): Promise<string[]> {
  const state = await practice(request);
  return state.bugs
    .map((bug: { flag: string }) => bug.flag)
    .filter((flag: string) => flag !== DRIFT);
}

test.describe("Practice mode, a pick of faults (/api/practice)", () => {
  // A pick arms those faults and no others, and only they are live.
  test("a pick arms exactly those faults, and only they are live", async ({
    request,
  }) => {
    expected(
      "pick productSchemaDrift and one other: armed is those two in catalogue order, on false, the price is text; pick a third: only it is armed, the price is a number again",
    );
    const catalogue = (await practice(request)).bugs.map(
      (bug: { flag: string }) => bug.flag,
    );
    const [first, second] = await otherFlags(request);
    const inOrder = catalogue.filter(
      (flag: string) => flag === DRIFT || flag === first,
    );

    const picked = await pick(request, [DRIFT, first]);
    expect(picked.armed).toEqual(inOrder);
    expect(picked.on).toBe(false);
    expect(picked.runKey).toMatch(/^practice-/);
    const state = await practice(request);
    expect(state.armed).toEqual(inOrder);
    expect(state.on).toBe(false);
    expect(await priceIsText(request)).toBe(true);

    // A different pick: the first two are off, the new one is on.
    const other = await pick(request, [second]);
    expect(other.armed).toEqual([second]);
    expect(await priceIsText(request)).toBe(false);
    fact("armed at the end", other.armed);
  });

  // An empty pick switches everything off; on: true still arms every fault.
  test("an empty pick turns every fault off, and on: true still arms them all", async ({
    request,
  }) => {
    expected(
      "on: true arms all (on true, armed = total); an empty pick leaves none (on false, armed empty) and the price a number",
    );
    const all = await (
      await request.post("/api/practice", { data: { on: true } })
    ).json();
    fact("armed with on: true", all.armed.length);
    expect(all.on).toBe(true);
    expect(all.armed).toHaveLength(all.total);

    const none = await pick(request, []);
    expect(none.on).toBe(false);
    expect(none.armed).toEqual([]);
    expect((await practice(request)).armed).toEqual([]);
    expect(await priceIsText(request)).toBe(false);
  });

  // Anything but a list of the catalogue's flags is refused, and changes
  // nothing.
  test("a flag that is not a fault is refused, and nothing changes", async ({
    request,
  }) => {
    expected(
      "after picking one fault: a made-up flag, a number and a non-list are each 400, and that fault stays the only one armed",
    );
    const [one] = await otherFlags(request);
    await pick(request, [one]);
    for (const flags of [[one, "noSuchFault"], [42], one]) {
      const response = await request.post("/api/practice", {
        data: { flags },
      });
      fact(`flags ${JSON.stringify(flags)}`, response.status());
      expect(response.status()).toBe(400);
      expect((await response.json()).errors.flags).toBeTruthy();
    }
    expect((await practice(request)).armed).toEqual([one]);
  });

  // One visitor's pick never reaches another.
  test("a pick leaves every other visitor alone", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "this visitor picks productSchemaDrift; a second visitor has nothing armed and a numeric price",
    );
    await pick(request, ["productSchemaDrift"]);
    const other = await playwright.request.newContext({ baseURL });
    try {
      const theirs = await practice(other);
      expect(theirs.armed).toEqual([]);
      expect(theirs.on).toBe(false);
      expect(await priceIsText(other)).toBe(false);
    } finally {
      await other.dispose();
    }
  });

  // Every fault has a level, and every level has faults.
  test("every fault in the catalogue has a level", async ({ request }) => {
    expected(
      "each bug's level is easy, medium or hard; each level has at least one; together they are all the bugs",
    );
    const state = await practice(request);
    const counts: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    for (const bug of state.bugs) {
      expect(["easy", "medium", "hard"], bug.flag).toContain(bug.level);
      counts[bug.level] += 1;
    }
    fact("levels", counts);
    expect(counts.easy).toBeGreaterThan(0);
    expect(counts.medium).toBeGreaterThan(0);
    expect(counts.hard).toBeGreaterThan(0);
    expect(counts.easy + counts.medium + counts.hard).toBe(state.total);
  });
});
