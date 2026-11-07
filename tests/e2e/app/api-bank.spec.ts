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
// The bank helpers: the demo people, the shared test password, sign in, sign up.
import {
  DEMO,
  PASSWORD,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";

// Playground Bank's API (/api/bank/*): status codes, role rules and the
// OpenAPI contract. Each identity gets its own request context, so cookies
// never mix.

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

test.describe("Playground Bank API (/api/bank)", () => {
  // The status endpoint names the database the bank is running on.
  test("status says which database runs", async ({ request }) => {
    expected("200, database pglite or postgres");
    const response = await request.get("/api/bank/status");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectSchema("BankStatusResponse", body);
    fact("database", body.database);
    expect(["pglite", "postgres"]).toContain(body.database);
  });

  // Signing up gives a customer account (never its password hash), /me reads
  // it, and signing out ends the session.
  test("sign up, read the account, sign out", async ({ request }) => {
    expected(
      "a customer account with no passwordHash; /me 200; logout 200 with a Max-Age=0 cookie; then /me 401",
    );
    // A new customer's account.
    const { account } = await signUpCustomer(request, "Api Customer");
    expectSchema("BankAccountResponse", account);
    expect(account.user.role).toBe("customer");
    expect(account.user).not.toHaveProperty("passwordHash");

    // /me reads the same account.
    const me = await request.get("/api/bank/me");
    expect(me.status()).toBe(200);
    expectSchema("BankAccountResponse", await me.json());

    // Sign out: the cookie is cleared, and /me is refused.
    const out = await request.post("/api/bank/logout", { data: {} });
    expect(out.status()).toBe(200);
    expect(out.headers()["set-cookie"]).toContain("Max-Age=0");
    expect((await request.get("/api/bank/me")).status()).toBe(401);
  });

  // A wrong password, a locked account and missing fields each get their own answer.
  test("log-in answers: wrong password, locked account, missing fields", async ({
    request,
  }) => {
    expected(
      "401 INVALID_CREDENTIALS; 403 ACCOUNT_LOCKED for the locked demo; 400 naming email and password",
    );
    // A wrong password for the demo customer.
    const wrong = await request.post("/api/bank/login", {
      data: { email: DEMO.customer, password: "wrong-password1" },
    });
    expect(wrong.status()).toBe(401);
    const error = await wrong.json();
    expectSchema("BankError", error);
    expect(error.code).toBe("INVALID_CREDENTIALS");

    // The locked demo account, with its right password.
    const locked = await request.post("/api/bank/login", {
      data: { email: DEMO.locked, password: "demo1234" },
    });
    expect(locked.status()).toBe(403);
    expect((await locked.json()).code).toBe("ACCOUNT_LOCKED");

    // Nothing at all.
    const missing = await request.post("/api/bank/login", { data: {} });
    expect(missing.status()).toBe(400);
    expect(Object.keys((await missing.json()).errors)).toEqual([
      "email",
      "password",
    ]);
  });

  // Every bad sign-up field is reported at once, and an email already in use
  // (in any letter case) is refused.
  test("sign-up validates every field and refuses a taken email", async ({
    request,
  }) => {
    expected(
      "400 naming acceptTerms, email, fullName, password; 409 EMAIL_TAKEN for the demo email in capitals",
    );
    // Every field wrong.
    const invalid = await request.post("/api/bank/register", {
      data: {
        fullName: "A",
        email: "nope",
        password: "short",
        acceptTerms: false,
      },
    });
    expect(invalid.status()).toBe(400);
    expect(Object.keys((await invalid.json()).errors).sort()).toEqual([
      "acceptTerms",
      "email",
      "fullName",
      "password",
    ]);

    // The demo customer's email, in capitals.
    const taken = await request.post("/api/bank/register", {
      data: {
        fullName: "Copy Cat",
        email: DEMO.customer.toUpperCase(),
        password: PASSWORD,
        acceptTerms: true,
      },
    });
    expect(taken.status()).toBe(409);
    expect((await taken.json()).code).toBe("EMAIL_TAKEN");
  });

  // A form-encoded log-in is refused: changes must be JSON.
  test("changes must be sent as JSON", async ({ request }) => {
    expected("415 JSON_REQUIRED");
    const response = await request.post("/api/bank/login", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: `email=${encodeURIComponent(DEMO.customer)}&password=demo1234`,
    });
    expect(response.status()).toBe(415);
    expect((await response.json()).code).toBe("JSON_REQUIRED");
  });

  // The staff user list: refused signed out, forbidden to customers, open to Support.
  test("Bank users: 401 signed out, 403 for customers, 200 for staff", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "401 signed out; 403 FORBIDDEN for the demo customer; 200 for Support, listing the demo Admin",
    );
    // Signed out.
    expect((await request.get("/api/bank/admin/users")).status()).toBe(401);

    // As the demo customer.
    await signIn(request, DEMO.customer);
    const customer = await request.get("/api/bank/admin/users");
    expect(customer.status()).toBe(403);
    expect((await customer.json()).code).toBe("FORBIDDEN");

    // As the demo Support person, in their own context.
    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    const list = await support.get("/api/bank/admin/users");
    expect(list.status()).toBe(200);
    const body = await list.json();
    expectSchema("BankUsersResponse", body);
    expect(body.users.map((user: { email: string }) => user.email)).toContain(
      DEMO.admin,
    );
    await support.dispose();
  });

  // Support can't change a user; an Admin can, but not themselves or a demo account.
  test("only an Admin changes users, and never itself or a demo account", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "Support 403; Admin promotes the customer to support (200); Admin locking itself 409; changing the demo customer 403 DEMO_READ_ONLY",
    );
    // A new customer to change.
    const target = await signUpCustomer(request, "Promotable Customer");

    // Support tries to make them Support staff: refused.
    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    const bySupport = await support.patch(
      `/api/bank/admin/users/${target.id}`,
      {
        data: { role: "support" },
      },
    );
    expect(bySupport.status()).toBe(403);
    await support.dispose();

    // The demo Admin does it.
    const admin = await playwright.request.newContext({ baseURL });
    const adminAccount = await signIn(admin, DEMO.admin);
    const promoted = await admin.patch(`/api/bank/admin/users/${target.id}`, {
      data: { role: "support" },
    });
    expect(promoted.status()).toBe(200);
    const updated = await promoted.json();
    expectSchema("BankUserResponse", updated);
    expect(updated.user.role).toBe("support");

    // The Admin can't lock their own account.
    const self = await admin.patch(
      `/api/bank/admin/users/${adminAccount.user.id}`,
      { data: { status: "locked" } },
    );
    expect(self.status()).toBe(409);

    // Nor change the demo customer.
    const users = (await (await admin.get("/api/bank/admin/users")).json())
      .users as { id: string; email: string }[];
    const demo = users.find((user) => user.email === DEMO.customer);
    fact("demo user", demo?.id);
    const demoChange = await admin.patch(`/api/bank/admin/users/${demo?.id}`, {
      data: { status: "locked" },
    });
    expect(demoChange.status()).toBe(403);
    expect((await demoChange.json()).code).toBe("DEMO_READ_ONLY");
    await admin.dispose();
  });

  // Bad profile and settings changes are refused with the fields named; good
  // ones are saved.
  test("profile and settings updates are validated", async ({ request }) => {
    expected(
      "profile 400 naming phone and postalCode, then 200 city Lisbon; settings 400, then 200",
    );
    await signUpCustomer(request);

    // A phone and postcode that aren't real.
    const badProfile = await request.patch("/api/bank/me/profile", {
      data: { phone: "call me", postalCode: "!!" },
    });
    expect(badProfile.status()).toBe(400);
    expect(Object.keys((await badProfile.json()).errors).sort()).toEqual([
      "phone",
      "postalCode",
    ]);

    // A good profile change.
    const profile = await request.patch("/api/bank/me/profile", {
      data: { city: "Lisbon", country: "Spain" },
    });
    expect(profile.status()).toBe(200);
    expect((await profile.json()).profile.city).toBe("Lisbon");

    // Settings with an unsupported currency, locale and a non-boolean.
    const badSettings = await request.put("/api/bank/me/settings", {
      data: { currency: "BTC", locale: "xx", emailAlerts: "yes" },
    });
    expect(badSettings.status()).toBe(400);

    // Good settings.
    const settings = await request.put("/api/bank/me/settings", {
      data: {
        currency: "GBP",
        locale: "en-GB",
        emailAlerts: false,
        statementEmails: true,
      },
    });
    expect(settings.status()).toBe(200);
    expectSchema("BankAccountResponse", await settings.json());
  });
});
