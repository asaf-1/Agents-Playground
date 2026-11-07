// Reads openapi.json from disk, so answers can be checked against the contract.
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema; ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the shared test password, sign in, sign up.
import {
  PASSWORD,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";

// The security pack, phase A1: the headers every response carries, the hold on
// repeated failed log-ins, and the sessions API behind the Devices page.
//
// Safe in the fully parallel suite: every test signs up its own customer, and
// the hold is keyed by email, so one test's wrong passwords never touch
// another's. The suite's server holds for 4 seconds (playwright.config.ts), so
// the release can be watched instead of waited 15 minutes for.

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

test.describe("Security pack: headers", () => {
  // Pages, APIs and the docs all carry the same security headers, and no HSTS
  // over plain http.
  test("every kind of response carries the security headers", async ({
    request,
  }) => {
    expected(
      "for /app, /api/health, /api/bank/status, /login, /api/docs: 200, nosniff, DENY, the referrer, permissions, COOP, COEP, CORP and CSP headers; no HSTS",
    );
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

  // Each load of the app gets a new nonce, the policy needs it for scripts
  // and styles, and the page's tags carry it.
  test("the app shell gets a fresh nonce every time, and the page carries it", async ({
    request,
  }) => {
    expected(
      "a nonce that differs between two loads; script-src and style-src need it; no unsafe-inline; the placeholder is replaced and the nonce appears more than once",
    );
    // Load the shell twice and read each nonce.
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

    // The page itself carries the same nonce on its tags.
    const html = await first.text();
    expect(html).not.toContain("__CSP_NONCE__");
    expect(html).toContain(`<meta property="csp-nonce" nonce="${nonce}">`);
    expect(html.split(`nonce="${nonce}"`).length - 1).toBeGreaterThan(1);
  });

  // The shell is never cached; the hashed script files are cached for a year
  // and allow nothing to run from them.
  test("hashed assets may be cached for a year; the shell may not", async ({
    request,
  }) => {
    expected(
      "shell no-store; its hashed index-*.js 200, cached a year, immutable, with a policy that allows nothing",
    );
    // The shell, and the script file it names.
    const shell = await request.get("/app");
    expect(shell.headers()["cache-control"]).toBe("no-store");
    const asset = (await shell.text()).match(/\/app\/assets\/index-[^"]+\.js/);
    expect(asset).not.toBeNull();
    fact("asset", asset![0]);
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

  // The classic login page lists the hashes of its own inline scripts
  // instead of allowing every inline script.
  test("the classic pages hash their inline scripts instead of allowing all of them", async ({
    request,
  }) => {
    expected(
      "/login script-src has 'self' and a sha256 hash, no unsafe-inline",
    );
    const csp = (await request.get("/login")).headers()[
      "content-security-policy"
    ];
    const scriptSrc = csp.match(/script-src ([^;]+)/)?.[1] ?? "";
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'sha256-");
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  // HSTS appears only when the request came through https (as the
  // x-forwarded-proto header says behind a proxy).
  test("HSTS is sent only when the request came over https", async ({
    request,
  }) => {
    expected(
      "no HSTS over plain http; max-age=31536000; includeSubDomains when forwarded as https",
    );
    // Plain http: no HSTS.
    const plain = await request.get("/api/health");
    expect(plain.headers()["strict-transport-security"]).toBeUndefined();
    // Forwarded as https: HSTS for a year.
    const secure = await request.get("/api/health", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(secure.headers()["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});

test.describe("Security pack: the hold on failed log-ins", () => {
  // Five wrong passwords start a hold that refuses even the right password,
  // and the hold ends by itself.
  test("too many wrong passwords hold the email, even for the right one, then the hold releases itself", async ({
    request,
  }) => {
    expected(
      "4 x 401 INVALID_CREDENTIALS; the 5th 429 TOO_MANY_ATTEMPTS with Retry-After; the right password 429 while held; then 200 once the hold ends",
    );
    // A new customer, and a short way to try a password for them.
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
    fact("hold secs", body.retryAfterSeconds);
    expect(body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number(fifth.headers()["retry-after"])).toBe(body.retryAfterSeconds);

    // While held, the right password is refused too: that is the point.
    const right = await attempt(PASSWORD);
    expect(right.status()).toBe(429);

    // And then it lets go by itself, after the hold the server reported: 4
    // seconds in the suite's own server (playwright.config.ts). A deployed
    // copy holds for its real time, 900 seconds in k8s/10-configmap.yaml, which
    // is too long to wait for here, so against one only this last step is left
    // out, and the report says so.
    const holdSeconds: number = body.retryAfterSeconds;
    if (holdSeconds > 15) {
      test.info().annotations.push({
        type: "not watched",
        description: `This server holds for ${holdSeconds} s, too long to watch the hold release.`,
      });
      return;
    }
    // Keep trying the right password until it works, for up to 20 seconds.
    await expect
      .poll(async () => (await attempt(PASSWORD)).status(), {
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toBe(200);
  });

  // One customer being held doesn't stop another from signing in.
  test("the hold is per email: another customer logs in while one is held", async ({
    request,
    browser,
  }) => {
    expected(
      "after 5 wrong passwords for one customer, another customer signs in (200)",
    );
    // Five wrong passwords put one customer on hold.
    const held = await signUpCustomer(request, "Held Customer");
    for (let i = 1; i <= 5; i += 1) {
      await request.post("/api/bank/login", {
        data: { email: held.email, password: `wrong-password-${i}` },
      });
    }
    // Another customer, in their own browser context, signs in fine.
    const other = await browser.newContext();
    const free = await signUpCustomer(other.request, "Free Customer");
    await signIn(other.request, free.email, PASSWORD);
    await other.close();
  });
});

test.describe("Security pack: sessions", () => {
  // The customer sees both signed-in browsers, ends the other one, and that
  // browser is signed out.
  test("a customer sees every signed-in browser, ends the others, and those are signed out", async ({
    request,
    browser,
  }) => {
    expected(
      "2 sessions, one current, each with a device; end-others ends 1; the other browser 401, this one 200; 1 session left",
    );
    // The customer is signed in here and in a second browser context.
    const { email } = await signUpCustomer(request, "Devices Customer");
    const other = await browser.newContext();
    await signIn(other.request, email, PASSWORD);

    // Two sessions, one of them this one, each naming its device.
    const list = await request.get("/api/bank/sessions");
    expect(list.status()).toBe(200);
    const body = await list.json();
    expectSchema("BankSessionsResponse", body);
    fact("sessions", body.total);
    expect(body.total).toBe(2);
    expect(
      body.sessions.filter((s: { current: boolean }) => s.current),
    ).toHaveLength(1);
    for (const session of body.sessions) {
      expect(session.device).not.toBe("");
    }

    // End the others: one ended.
    const ended = await request.post("/api/bank/sessions/end-others", {
      data: {},
    });
    expect(ended.status()).toBe(200);
    expect((await ended.json()).ended).toBe(1);

    // The other browser is signed out; this one is still in, alone.
    expect((await other.request.get("/api/bank/me")).status()).toBe(401);
    expect((await request.get("/api/bank/me")).status()).toBe(200);
    expect((await (await request.get("/api/bank/sessions")).json()).total).toBe(
      1,
    );
    await other.close();
  });

  // Ending your own current session signs you out and clears the cookie.
  test("ending the current session clears the cookie", async ({ request }) => {
    expected(
      "200 { ended: true, current: true }, a Max-Age=0 cookie, then /me 401",
    );
    // Find this session and end it.
    await signUpCustomer(request, "Leaving Customer");
    const { sessions } = await (await request.get("/api/bank/sessions")).json();
    const current = sessions.find((s: { current: boolean }) => s.current);
    const response = await request.delete(`/api/bank/sessions/${current.id}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ended: true, current: true });
    // The cookie is cleared, and the customer is signed out.
    expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
    expect((await request.get("/api/bank/me")).status()).toBe(401);
  });

  // Another customer's session can't be ended, and looks like it doesn't exist.
  test("a session that is not yours cannot be ended, and looks like it does not exist", async ({
    request,
    browser,
  }) => {
    expected("404 SESSION_NOT_FOUND; the other customer stays signed in (200)");
    // Two customers; customer one tries to end customer two's session.
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
    // Customer two is still signed in.
    expect((await other.request.get("/api/bank/me")).status()).toBe(200);
    await other.close();
  });

  // Someone signed out can't list or end sessions.
  test("a visitor who is not signed in gets 401", async ({ browser }) => {
    expected("401 on the session list and on end-others");
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
