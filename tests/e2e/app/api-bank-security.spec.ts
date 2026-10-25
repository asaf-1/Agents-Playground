import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test } from "@playwright/test";
import { PASSWORD, signIn, signUpCustomer } from "./_bank";

// The security pack, phase A1: the headers every response carries, the hold on
// repeated failed log-ins, and the sessions API behind the Devices page.
//
// Safe in the fully parallel suite: every test signs up its own customer, and
// the hold is keyed by email, so one test's wrong passwords never touch
// another's. The suite's server holds for 4 seconds (playwright.config.ts), so
// the release can be watched instead of waited 15 minutes for.

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

test.describe("Security pack: headers", () => {
  test("every kind of response carries the security headers", async ({
    request,
  }) => {
    // The app shell, two JSON APIs, a classic page, the docs page.
    for (const path of [
      "/app",
      "/api/health",
      "/api/bank/status",
      "/login",
      "/api/docs",
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const headers = response.headers();
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["x-frame-options"], path).toBe("DENY");
      expect(headers["referrer-policy"], path).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(headers["permissions-policy"], path).toContain("camera=()");
      expect(headers["cross-origin-opener-policy"], path).toBe("same-origin");
      expect(headers["cross-origin-embedder-policy"], path).toBe(
        "require-corp",
      );
      expect(headers["cross-origin-resource-policy"], path).toBe("same-origin");
      expect(headers["content-security-policy"], path).toContain(
        "frame-ancestors 'none'",
      );
      // Never over plain http: a wrong HSTS is hard to undo.
      expect(headers["strict-transport-security"], path).toBeUndefined();
    }
  });

  test("the app shell gets a fresh nonce every time, and the page carries it", async ({
    request,
  }) => {
    const nonceOf = (csp: string) => csp.match(/'nonce-([^']+)'/)?.[1];
    const first = await request.get("/app");
    const second = await request.get("/app");
    const csp = first.headers()["content-security-policy"];
    const nonce = nonceOf(csp);
    expect(nonce, csp).toBeTruthy();
    expect(nonce).not.toBe(
      nonceOf(second.headers()["content-security-policy"]),
    );
    // Scripts and styles need the nonce; nothing inline is allowed without it.
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
    expect(csp).not.toContain("unsafe-inline");

    const html = await first.text();
    expect(html).not.toContain("__CSP_NONCE__");
    expect(html).toContain(`<meta property="csp-nonce" nonce="${nonce}">`);
    expect(html.split(`nonce="${nonce}"`).length - 1).toBeGreaterThan(1);
  });

  test("hashed assets may be cached for a year; the shell may not", async ({
    request,
  }) => {
    const shell = await request.get("/app");
    expect(shell.headers()["cache-control"]).toBe("no-store");
    const asset = (await shell.text()).match(/\/app\/assets\/index-[^"]+\.js/);
    expect(asset).not.toBeNull();
    const response = await request.get(asset![0]);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    // A file is never a page, so its policy allows nothing.
    expect(response.headers()["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  test("the classic pages hash their inline scripts instead of allowing all of them", async ({
    request,
  }) => {
    const csp = (await request.get("/login")).headers()[
      "content-security-policy"
    ];
    const scriptSrc = csp.match(/script-src ([^;]+)/)?.[1] ?? "";
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'sha256-");
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  test("HSTS is sent only when the request came over https", async ({
    request,
  }) => {
    const plain = await request.get("/api/health");
    expect(plain.headers()["strict-transport-security"]).toBeUndefined();
    const secure = await request.get("/api/health", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(secure.headers()["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});

test.describe("Security pack: the hold on failed log-ins", () => {
  test("too many wrong passwords hold the email, even for the right one, then the hold releases itself", async ({
    request,
  }) => {
    const { email } = await signUpCustomer(request, "Held Customer");
    const attempt = (password: string) =>
      request.post("/api/bank/login", { data: { email, password } });

    // The first four wrong passwords answer like any wrong password.
    for (let i = 1; i <= 4; i += 1) {
      const wrong = await attempt(`wrong-password-${i}`);
      expect(wrong.status(), `attempt ${i}`).toBe(401);
      expect((await wrong.json()).code).toBe("INVALID_CREDENTIALS");
    }

    // The fifth starts the hold.
    const fifth = await attempt("wrong-password-5");
    expect(fifth.status()).toBe(429);
    const body = await fifth.json();
    expectSchema("BankError", body);
    expect(body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number(fifth.headers()["retry-after"])).toBe(body.retryAfterSeconds);

    // While held, the right password is refused too: that is the point.
    const right = await attempt(PASSWORD);
    expect(right.status()).toBe(429);

    // And then it lets go by itself. 4 seconds in the suite's server.
    await expect
      .poll(async () => (await attempt(PASSWORD)).status(), {
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toBe(200);
  });

  test("the hold is per email: another customer logs in while one is held", async ({
    request,
    browser,
  }) => {
    const held = await signUpCustomer(request, "Held Customer");
    for (let i = 1; i <= 5; i += 1) {
      await request.post("/api/bank/login", {
        data: { email: held.email, password: `wrong-password-${i}` },
      });
    }
    const other = await browser.newContext();
    const free = await signUpCustomer(other.request, "Free Customer");
    await signIn(other.request, free.email, PASSWORD);
    await other.close();
  });
});

test.describe("Security pack: sessions", () => {
  test("a customer sees every signed-in browser, ends the others, and those are signed out", async ({
    request,
    browser,
  }) => {
    const { email } = await signUpCustomer(request, "Devices Customer");
    const other = await browser.newContext();
    await signIn(other.request, email, PASSWORD);

    const list = await request.get("/api/bank/sessions");
    expect(list.status()).toBe(200);
    const body = await list.json();
    expectSchema("BankSessionsResponse", body);
    expect(body.total).toBe(2);
    expect(
      body.sessions.filter((s: { current: boolean }) => s.current),
    ).toHaveLength(1);
    for (const session of body.sessions) {
      expect(session.device).not.toBe("");
    }

    const ended = await request.post("/api/bank/sessions/end-others", {
      data: {},
    });
    expect(ended.status()).toBe(200);
    expect((await ended.json()).ended).toBe(1);

    expect((await other.request.get("/api/bank/me")).status()).toBe(401);
    expect((await request.get("/api/bank/me")).status()).toBe(200);
    expect((await (await request.get("/api/bank/sessions")).json()).total).toBe(
      1,
    );
    await other.close();
  });

  test("ending the current session clears the cookie", async ({ request }) => {
    await signUpCustomer(request, "Leaving Customer");
    const { sessions } = await (await request.get("/api/bank/sessions")).json();
    const current = sessions.find((s: { current: boolean }) => s.current);
    const response = await request.delete(`/api/bank/sessions/${current.id}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ended: true, current: true });
    expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
    expect((await request.get("/api/bank/me")).status()).toBe(401);
  });

  test("a session that is not yours cannot be ended, and looks like it does not exist", async ({
    request,
    browser,
  }) => {
    await signUpCustomer(request, "First Customer");
    const other = await browser.newContext();
    await signUpCustomer(other.request, "Second Customer");
    const { sessions } = await (
      await other.request.get("/api/bank/sessions")
    ).json();

    const response = await request.delete(
      `/api/bank/sessions/${sessions[0].id}`,
    );
    expect(response.status()).toBe(404);
    expect((await response.json()).code).toBe("SESSION_NOT_FOUND");
    expect((await other.request.get("/api/bank/me")).status()).toBe(200);
    await other.close();
  });

  test("a visitor who is not signed in gets 401", async ({ browser }) => {
    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/sessions")).status()).toBe(
      401,
    );
    expect(
      (
        await visitor.request.post("/api/bank/sessions/end-others", {
          data: {},
        })
      ).status(),
    ).toBe(401);
    await visitor.close();
  });
});
