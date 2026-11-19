// Reads openapi.json from disk, so answers can be checked against the contract.
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema; ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// The type of a request context.
import { type APIRequestContext } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people, signing in and signing up.
import { DEMO, signIn, signUpCustomer } from "../../../framework/helpers/bank";

// The Practice page's progress (/api/bank/practice/progress): which planted
// faults a signed-up customer has marked found, saved on their account. Demo
// accounts are shared by everyone, so they read none and may not write; a
// visitor who is not signed in gets a 401.
//
// Safe in the fully parallel suite: each test signs up its own customers,
// and the demo account is only read from or refused.

// The contract, for checking each answer's shape.
const openApiSpec = JSON.parse(readFileSync("bank/openapi.json", "utf8"));
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(openApiSpec, "openapi.json");

// Checks one answer against a named schema in openapi.json.
function expectSchema(schemaName: string, body: unknown) {
  const validate = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  expect(validate(body), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

// The progress address, for one fault or for all of them.
const PROGRESS = "/api/bank/practice/progress";
const one = (flag: string) => `${PROGRESS}/${flag}`;

// Reads the progress and checks its shape.
async function readProgress(request: APIRequestContext) {
  const response = await request.get(PROGRESS);
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  expectSchema("PracticeProgress", body);
  return body;
}

// The flags of what was found, in order.
const flagsOf = (body: { found: { flag: string }[] }) =>
  body.found.map((entry) => entry.flag);

// The catalogue's flags, in order, from the server. The faults these tests
// tick come from here, never written into this file: the test-cases page and
// the runner's knowledge base list a spec under every fault it names, and
// these tests check the progress, not the faults.
async function faults(request: APIRequestContext): Promise<string[]> {
  const state = await (await request.get("/api/practice")).json();
  return state.bugs.map((bug: { flag: string }) => bug.flag);
}

test.describe("Practice progress (/api/bank/practice/progress)", () => {
  // Signed out: nothing to read, nothing to write.
  test("asks a visitor who is not signed in to sign in", async ({
    request,
  }) => {
    expected("GET, PUT and DELETE each answer 401 with no session");
    const [flag] = await faults(request);
    for (const [method, path] of [
      ["GET", PROGRESS],
      ["PUT", one(flag)],
      ["DELETE", PROGRESS],
    ]) {
      const response = await request.fetch(path, { method });
      fact(`${method} ${path}`, response.status());
      expect(response.status()).toBe(401);
    }
  });

  // A new customer marks, re-marks, unmarks and clears, and each answer is
  // the progress after it.
  test("a signed-up customer marks a fault found, and it is saved", async ({
    request,
  }) => {
    expected(
      "starts empty and saved; marking keeps one row with its time; marking again keeps the first time; unmarking empties it; unmarking again is harmless",
    );
    await signUpCustomer(request, "Progress Customer");
    const start = await readProgress(request);
    expect(start.found).toEqual([]);
    expect(start.saved).toBe(true);
    expect(start.total).toBeGreaterThan(20);
    fact("total", start.total);

    const [flag] = await faults(request);
    fact("fault", flag);
    const marked = await request.put(one(flag));
    expect(marked.status(), await marked.text()).toBe(200);
    const first = await marked.json();
    expectSchema("PracticeProgress", first);
    expect(flagsOf(first)).toEqual([flag]);
    fact("found at", first.found[0].foundAt);

    // Marking again keeps the first time; reading it back gives the same.
    const again = await (await request.put(one(flag))).json();
    expect(again.found).toEqual(first.found);
    expect((await readProgress(request)).found).toEqual(first.found);

    const unmarked = await request.delete(one(flag));
    expect(unmarked.status()).toBe(200);
    expect((await unmarked.json()).found).toEqual([]);
    const twice = await request.delete(one(flag));
    expect(twice.status()).toBe(200);
    expect((await readProgress(request)).found).toEqual([]);
  });

  // Start over: every mark gone at once.
  test("clearing takes every mark off at once", async ({ request }) => {
    expected("two faults marked; DELETE on the list leaves none");
    await signUpCustomer(request, "Clearing Customer");
    const [first, second] = await faults(request);
    await request.put(one(first));
    await request.put(one(second));
    const before = await readProgress(request);
    fact("before", flagsOf(before));
    expect(flagsOf(before).sort()).toEqual([first, second].sort());

    const cleared = await request.delete(PROGRESS);
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect((await cleared.json()).found).toEqual([]);
    expect((await readProgress(request)).found).toEqual([]);
  });

  // Only the catalogue's faults can be marked.
  test("a fault that does not exist is a 404", async ({ request }) => {
    expected(
      "PUT and DELETE on noSuchFault answer 404 PRACTICE_FAULT_NOT_FOUND",
    );
    await signUpCustomer(request, "Typo Customer");
    for (const method of ["PUT", "DELETE"]) {
      const response = await request.fetch(one("noSuchFault"), { method });
      const body = await response.json();
      fact(method, `${response.status()} ${body.code}`);
      expect(response.status()).toBe(404);
      expect(body.code).toBe("PRACTICE_FAULT_NOT_FOUND");
    }
    expect((await readProgress(request)).found).toEqual([]);
  });

  // The demo accounts are shared: they read none and may not write.
  test("a demo account reads no progress, unsaved, and cannot mark any", async ({
    request,
  }) => {
    expected(
      "the demo customer reads found empty with saved false; PUT, DELETE one and DELETE all answer 403 DEMO_READ_ONLY",
    );
    fact("demo", DEMO.customer);
    await signIn(request, DEMO.customer);
    const state = await readProgress(request);
    expect(state.found).toEqual([]);
    expect(state.saved).toBe(false);

    const [flag] = await faults(request);
    for (const [method, path] of [
      ["PUT", one(flag)],
      ["DELETE", one(flag)],
      ["DELETE", PROGRESS],
    ]) {
      const response = await request.fetch(path, { method });
      const body = await response.json();
      fact(`${method} ${path}`, `${response.status()} ${body.code}`);
      expect(response.status()).toBe(403);
      expect(body.code).toBe("DEMO_READ_ONLY");
    }
  });

  // One customer's ticks are theirs alone.
  test("one customer's progress is never another's", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "customer A marks a fault; customer B, in a second session, reads none",
    );
    await signUpCustomer(request, "Customer A");
    const [flag] = await faults(request);
    await request.put(one(flag));
    expect(flagsOf(await readProgress(request))).toEqual([flag]);

    const other = await playwright.request.newContext({ baseURL });
    try {
      await signUpCustomer(other, "Customer B");
      expect((await readProgress(other)).found).toEqual([]);
    } finally {
      await other.dispose();
    }
  });

  // A read-only API key may read the progress, but not change it.
  test("a read-only API key can read the progress but not mark it", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with a read key alone: GET 200 showing the session's mark; PUT 403 KEY_READ_ONLY",
    );
    await signUpCustomer(request, "Key Customer");
    const [marked, other] = await faults(request);
    await request.put(one(marked));
    const made = await request.post("/api/bank/keys", {
      data: { name: "progress read key", scope: "read" },
    });
    expect(made.status(), await made.text()).toBe(201);
    const { token } = await made.json();
    fact("key", "read scope (token not printed)");

    const keyOnly = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    try {
      expect(flagsOf(await readProgress(keyOnly))).toEqual([marked]);
      const refused = await keyOnly.put(one(other));
      const body = await refused.json();
      fact("PUT with the key", `${refused.status()} ${body.code}`);
      expect(refused.status()).toBe(403);
      expect(body.code).toBe("KEY_READ_ONLY");
    } finally {
      await keyOnly.dispose();
    }
  });
});
