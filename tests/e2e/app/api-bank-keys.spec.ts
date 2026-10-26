import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { DEMO, signIn, signUpCustomer } from "./_bank";

// Personal API keys (phase A5): made with the session, shown once, stored as
// a hash; a key authenticates as `Authorization: Bearer pbk_…`, a read key may
// not change anything, every key is rate-limited per minute, and keys cannot
// manage keys.

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

async function makeKey(
  request: APIRequestContext,
  scope: "read" | "write",
  name = `${scope} key`,
) {
  const response = await request.post("/api/bank/keys", {
    data: { name, scope },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  expectSchema("BankApiKeyCreated", body);
  return body as { key: { id: string; prefix: string }; token: string };
}

const bearer = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

test.describe("API keys (/api/bank/keys)", () => {
  test("a key is made once, shown once, and opens the API without a cookie", async ({
    request,
    browser,
  }) => {
    const { account } = await signUpCustomer(request, "Developer Customer");
    const { key, token } = await makeKey(request, "write", "Postman");
    expect(token).toMatch(/^pbk_[A-Za-z0-9_-]{32}$/);
    expect(key.prefix).toBe(token.slice(0, 12));

    // The list knows the prefix, never the token.
    const list = await (await request.get("/api/bank/keys")).json();
    expectSchema("BankApiKeysResponse", list);
    expect(JSON.stringify(list)).not.toContain(token);
    expect(list.keys[0].prefix).toBe(key.prefix);
    expect(list.rateLimitPerMinute).toBeGreaterThan(0);

    // A fresh context has no cookie; the key alone is the identity.
    const api = await browser.newContext();
    const me = await api.request.get("/api/bank/me", bearer(token));
    expect(me.status(), await me.text()).toBe(200);
    expect((await me.json()).user.id).toBe(account.user.id);
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

  test("a read key reads but cannot change; a write key can", async ({
    request,
    browser,
  }) => {
    await signUpCustomer(request, "Scoped Customer");
    const read = await makeKey(request, "read");
    const write = await makeKey(request, "write");
    const api = await browser.newContext();

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

  test("a revoked or unknown key answers 401 KEY_INVALID", async ({
    request,
    browser,
  }) => {
    await signUpCustomer(request, "Revoking Customer");
    const { key, token } = await makeKey(request, "read");
    const api = await browser.newContext();
    expect(
      (await api.request.get("/api/bank/me", bearer(token))).status(),
    ).toBe(200);

    const revoked = await request.delete(`/api/bank/keys/${key.id}`);
    expect(revoked.status()).toBe(200);
    expect((await revoked.json()).key.revokedAt).not.toBeNull();
    const gone = await api.request.get("/api/bank/me", bearer(token));
    expect(gone.status()).toBe(401);
    expect((await gone.json()).code).toBe("KEY_INVALID");
    expect((await request.delete(`/api/bank/keys/${key.id}`)).status()).toBe(
      404,
    );

    const bogus = await api.request.get(
      "/api/bank/me",
      bearer("pbk_definitely-not-a-real-token-value-xx"),
    );
    expect(bogus.status()).toBe(401);
    expect((await bogus.json()).code).toBe("KEY_INVALID");
    await api.close();
  });

  test("keys cannot manage keys", async ({ request, browser }) => {
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

  test("a key is limited per minute, and says so", async ({
    request,
    browser,
  }) => {
    await signUpCustomer(request, "Busy Customer");
    const { token } = await makeKey(request, "read");
    const { rateLimitPerMinute: limit } = await (
      await request.get("/api/bank/keys")
    ).json();
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

    let last = null;
    for (let i = 0; i < limit; i += 1) {
      last = await api.request.get("/api/bank/clock", bearer(token));
      expect(last.status(), `request ${i + 1}`).toBe(200);
    }
    expect(last!.headers()["x-ratelimit-remaining"]).toBe("0");

    const over = await api.request.get("/api/bank/clock", bearer(token));
    expect(over.status()).toBe(429);
    const body = await over.json();
    expect(body.code).toBe("KEY_RATE_LIMITED");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number(over.headers()["retry-after"])).toBe(body.retryAfterSeconds);
    expect(over.headers()["x-ratelimit-limit"]).toBe(String(limit));
    await api.close();
  });

  test("validation, the cap, and who may make keys", async ({
    request,
    browser,
  }) => {
    await signUpCustomer(request, "Careful Customer");
    for (const [data, field] of [
      [{ name: "x", scope: "read" }, "name"],
      [{ name: "Fine", scope: "admin" }, "scope"],
    ] as [Record<string, unknown>, string][]) {
      const response = await request.post("/api/bank/keys", { data });
      expect(response.status(), field).toBe(400);
      expect(Object.keys((await response.json()).errors)).toContain(field);
    }

    const { maxActiveKeys } = await (
      await request.get("/api/bank/keys")
    ).json();
    for (let i = 0; i < maxActiveKeys; i += 1) {
      await makeKey(request, "read", `Key ${i + 1}`);
    }
    const tooMany = await request.post("/api/bank/keys", {
      data: { name: "One more", scope: "read" },
    });
    expect(tooMany.status()).toBe(409);
    expect((await tooMany.json()).code).toBe("TOO_MANY_KEYS");

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

    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/keys")).status()).toBe(401);
    await visitor.close();
  });
});
