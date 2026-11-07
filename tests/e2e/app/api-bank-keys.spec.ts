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
// The bank helpers: the demo people, sign in, sign up.
import { DEMO, signIn, signUpCustomer } from "../../../framework/helpers/bank";

// Personal API keys (phase A5): made with the session, shown once, stored as
// a hash; a key authenticates as `Authorization: Bearer pbk_…`, a read key may
// not change anything, every key is rate-limited per minute, and keys cannot
// manage keys.

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

// Makes a key with the session and returns it with its one-time token. The
// block records the key's name and scope, never the token.
async function makeKey(
  request: APIRequestContext,
  scope: "read" | "write",
  name = `${scope} key`,
) {
  fact("key made", `${name} (${scope})`);
  const response = await request.post("/api/bank/keys", {
    data: { name, scope },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  expectSchema("BankApiKeyCreated", body);
  return body as { key: { id: string; prefix: string }; token: string };
}

// Request options that sign in with a key alone, in the Authorization header.
const bearer = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

test.describe("API keys (/api/bank/keys)", () => {
  // The token is shown once, the list shows only its prefix, and the token on
  // its own opens the API as that customer.
  test("a key is made once, shown once, and opens the API without a cookie", async ({
    request,
    browser,
  }) => {
    expected(
      "token pbk_ + 32 chars, prefix = its first 12; list shows the prefix, never the token; the key alone reads /me as the customer with rate-limit headers; lastUsedAt set",
    );
    // A new customer makes a write key called Postman.
    const { account } = await signUpCustomer(request, "Developer Customer");
    const { key, token } = await makeKey(request, "write", "Postman");
    fact("keyId", key.id);
    fact("prefix", key.prefix);
    expect(token).toMatch(/^pbk_[A-Za-z0-9_-]{32}$/);
    expect(key.prefix).toBe(token.slice(0, 12));

    // The list knows the prefix, never the token.
    const list = await (await request.get("/api/bank/keys")).json();
    expectSchema("BankApiKeysResponse", list);
    expect(JSON.stringify(list)).not.toContain(token);
    expect(list.keys[0].prefix).toBe(key.prefix);
    expect(list.rateLimitPerMinute).toBeGreaterThan(0);
    fact("limit/min", list.rateLimitPerMinute);

    // A fresh context has no cookie; the key alone is the identity.
    const api = await browser.newContext();
    const me = await api.request.get("/api/bank/me", bearer(token));
    expect(me.status(), await me.text()).toBe(200);
    expect((await me.json()).user.id).toBe(account.user.id);
    // The answer carries the limit and how much of it is left.
    expect(me.headers()["x-ratelimit-limit"]).toBe(
      String(list.rateLimitPerMinute),
    );
    expect(Number(me.headers()["x-ratelimit-remaining"])).toBeLessThan(
      list.rateLimitPerMinute,
    );

    // Last used is recorded.
    const after = await (await request.get("/api/bank/keys")).json();
    expect(after.keys[0].lastUsedAt).not.toBeNull();
    await api.close();
  });

  // A read key can read but not change; a write key can change. In GraphQL,
  // a query is a read and a mutation is a change.
  test("a read key reads but cannot change; a write key can", async ({
    request,
    browser,
  }) => {
    expected(
      "read key: accounts 200, add payee 403 KEY_READ_ONLY; write key: add payee 201; read key GraphQL query 200, mutation 403 KEY_READ_ONLY",
    );
    // A new customer with one read key and one write key.
    await signUpCustomer(request, "Scoped Customer");
    const read = await makeKey(request, "read");
    const write = await makeKey(request, "write");
    fact("read key", read.key.id);
    fact("write key", write.key.id);
    const api = await browser.newContext();

    // The read key reads accounts, and is refused when it adds a payee.
    expect(
      (
        await api.request.get("/api/bank/accounts", bearer(read.token))
      ).status(),
    ).toBe(200);
    const refused = await api.request.post("/api/bank/payees", {
      ...bearer(read.token),
      data: { name: "City Power", reference: "ACC-1" },
    });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).code).toBe("KEY_READ_ONLY");

    // The write key adds it.
    const allowed = await api.request.post("/api/bank/payees", {
      ...bearer(write.token),
      data: { name: "City Power", reference: "ACC-1" },
    });
    expect(allowed.status(), await allowed.text()).toBe(201);

    // GraphQL: a query is a read, a mutation is a change.
    const query = await api.request.post("/api/bank/graphql", {
      ...bearer(read.token),
      data: { query: "{ me { email } }" },
    });
    expect(query.status()).toBe(200);
    expect((await query.json()).data.me.email).toContain("@");
    const mutation = await api.request.post("/api/bank/graphql", {
      ...bearer(read.token),
      data: {
        query: 'mutation { addPayee(name: "Telco", reference: "415") { id } }',
      },
    });
    expect(mutation.status()).toBe(403);
    expect((await mutation.json()).code).toBe("KEY_READ_ONLY");
    await api.close();
  });

  // A revoked key and a made-up key are both refused the same way.
  test("a revoked or unknown key answers 401 KEY_INVALID", async ({
    request,
    browser,
  }) => {
    expected(
      "key works (200); revoked (200, revokedAt set); then 401 KEY_INVALID; revoking again 404; a made-up key 401 KEY_INVALID",
    );
    // A new customer's read key works.
    await signUpCustomer(request, "Revoking Customer");
    const { key, token } = await makeKey(request, "read");
    fact("keyId", key.id);
    const api = await browser.newContext();
    expect(
      (await api.request.get("/api/bank/me", bearer(token))).status(),
    ).toBe(200);

    // Revoke it: it is refused from then on, and can't be revoked twice.
    const revoked = await request.delete(`/api/bank/keys/${key.id}`);
    expect(revoked.status()).toBe(200);
    expect((await revoked.json()).key.revokedAt).not.toBeNull();
    const gone = await api.request.get("/api/bank/me", bearer(token));
    expect(gone.status()).toBe(401);
    expect((await gone.json()).code).toBe("KEY_INVALID");
    expect((await request.delete(`/api/bank/keys/${key.id}`)).status()).toBe(
      404,
    );

    // A key nobody made is refused the same way.
    const bogus = await api.request.get(
      "/api/bank/me",
      bearer("pbk_definitely-not-a-real-token-value-xx"),
    );
    expect(bogus.status()).toBe(401);
    expect((await bogus.json()).code).toBe("KEY_INVALID");
    await api.close();
  });

  // Even a write key can't list or make keys: that needs a signed-in session.
  test("keys cannot manage keys", async ({ request, browser }) => {
    expected("list keys and make a key, each 403 KEY_MANAGEMENT_NEEDS_SESSION");
    // A new customer's write key tries to list keys and to make another.
    await signUpCustomer(request, "Key Customer");
    const { token } = await makeKey(request, "write");
    const api = await browser.newContext();
    for (const call of [
      () => api.request.get("/api/bank/keys", bearer(token)),
      () =>
        api.request.post("/api/bank/keys", {
          ...bearer(token),
          data: { name: "Another", scope: "write" },
        }),
    ]) {
      const response = await call();
      expect(response.status()).toBe(403);
      expect((await response.json()).code).toBe("KEY_MANAGEMENT_NEEDS_SESSION");
    }
    await api.close();
  });

  // A key has a per-minute limit; going over is refused with how long to wait.
  test("a key is limited per minute, and says so", async ({
    request,
    browser,
  }) => {
    expected(
      "limit x 200 with remaining 0 at the end; then 429 KEY_RATE_LIMITED, retryAfterSeconds >= 1 matching Retry-After",
    );
    // A new customer's read key, and its limit.
    await signUpCustomer(request, "Busy Customer");
    const { token } = await makeKey(request, "read");
    const { rateLimitPerMinute: limit } = await (
      await request.get("/api/bank/keys")
    ).json();
    fact("limit/min", limit);
    const api = await browser.newContext();

    // The limit is per clock minute. Sixty requests take a second or two, so
    // starting late in a minute would let the count reset mid-loop; wait for
    // a fresh minute when fewer than fifteen seconds of this one are left.
    const secondsIntoMinute = new Date().getUTCSeconds();
    if (secondsIntoMinute > 45) {
      await new Promise((resolve) =>
        setTimeout(resolve, (61 - secondsIntoMinute) * 1000),
      );
    }

    // Use up the whole minute's allowance.
    let last = null;
    for (let i = 0; i < limit; i += 1) {
      last = await api.request.get("/api/bank/clock", bearer(token));
      expect(last.status(), `request ${i + 1}`).toBe(200);
    }
    expect(last!.headers()["x-ratelimit-remaining"]).toBe("0");

    // One more is refused, saying how many seconds to wait.
    const over = await api.request.get("/api/bank/clock", bearer(token));
    expect(over.status()).toBe(429);
    const body = await over.json();
    expect(body.code).toBe("KEY_RATE_LIMITED");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number(over.headers()["retry-after"])).toBe(body.retryAfterSeconds);
    expect(over.headers()["x-ratelimit-limit"]).toBe(String(limit));
    await api.close();
  });

  // A bad name or scope is refused, there is a cap on active keys, and only a
  // signed-in, non-demo customer may make keys.
  test("validation, the cap, and who may make keys", async ({
    request,
    browser,
  }) => {
    expected(
      "400 on name and on scope; keys up to the cap, then 409 TOO_MANY_KEYS; demo 403; signed out 401",
    );
    // A one-letter name, and a scope that doesn't exist.
    await signUpCustomer(request, "Careful Customer");
    for (const [data, field] of [
      [{ name: "x", scope: "read" }, "name"],
      [{ name: "Fine", scope: "admin" }, "scope"],
    ] as [Record<string, unknown>, string][]) {
      const response = await request.post("/api/bank/keys", { data });
      expect(response.status(), field).toBe(400);
      expect(Object.keys((await response.json()).errors)).toContain(field);
    }

    // Make as many keys as the cap allows; one more is refused.
    const { maxActiveKeys } = await (
      await request.get("/api/bank/keys")
    ).json();
    fact("cap", maxActiveKeys);
    for (let i = 0; i < maxActiveKeys; i += 1) {
      await makeKey(request, "read", `Key ${i + 1}`);
    }
    const tooMany = await request.post("/api/bank/keys", {
      data: { name: "One more", scope: "read" },
    });
    expect(tooMany.status()).toBe(409);
    expect((await tooMany.json()).code).toBe("TOO_MANY_KEYS");

    // The demo customer can't make one.
    const demo = await browser.newContext();
    await signIn(demo.request, DEMO.customer);
    expect(
      (
        await demo.request.post("/api/bank/keys", {
          data: { name: "Demo key", scope: "read" },
        })
      ).status(),
    ).toBe(403);
    await demo.close();

    // Someone signed out gets 401.
    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/keys")).status()).toBe(401);
    await visitor.close();
  });
});
