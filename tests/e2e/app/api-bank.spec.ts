import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test } from "@playwright/test";
import { DEMO, PASSWORD, signIn, signUpCustomer } from "./_bank";

// Playground Bank's API (/api/bank/*): status codes, role rules and the
// OpenAPI contract. Each identity gets its own request context, so cookies
// never mix.
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

test.describe("Playground Bank API (/api/bank)", () => {
  test("status says which database runs", async ({ request }) => {
    const response = await request.get("/api/bank/status");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectSchema("BankStatusResponse", body);
    expect(["pglite", "postgres"]).toContain(body.database);
  });

  test("sign up, read the account, sign out", async ({ request }) => {
    const { account } = await signUpCustomer(request, "Api Customer");
    expectSchema("BankAccountResponse", account);
    expect(account.user.role).toBe("customer");
    expect(account.user).not.toHaveProperty("passwordHash");

    const me = await request.get("/api/bank/me");
    expect(me.status()).toBe(200);
    expectSchema("BankAccountResponse", await me.json());

    const out = await request.post("/api/bank/logout", { data: {} });
    expect(out.status()).toBe(200);
    expect(out.headers()["set-cookie"]).toContain("Max-Age=0");
    expect((await request.get("/api/bank/me")).status()).toBe(401);
  });

  test("log-in answers: wrong password, locked account, missing fields", async ({
    request,
  }) => {
    const wrong = await request.post("/api/bank/login", {
      data: { email: DEMO.customer, password: "wrong-password1" },
    });
    expect(wrong.status()).toBe(401);
    const error = await wrong.json();
    expectSchema("BankError", error);
    expect(error.code).toBe("INVALID_CREDENTIALS");

    const locked = await request.post("/api/bank/login", {
      data: { email: DEMO.locked, password: "demo1234" },
    });
    expect(locked.status()).toBe(403);
    expect((await locked.json()).code).toBe("ACCOUNT_LOCKED");

    const missing = await request.post("/api/bank/login", { data: {} });
    expect(missing.status()).toBe(400);
    expect(Object.keys((await missing.json()).errors)).toEqual([
      "email",
      "password",
    ]);
  });

  test("sign-up validates every field and refuses a taken email", async ({
    request,
  }) => {
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

  test("changes must be sent as JSON", async ({ request }) => {
    const response = await request.post("/api/bank/login", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: `email=${encodeURIComponent(DEMO.customer)}&password=demo1234`,
    });
    expect(response.status()).toBe(415);
    expect((await response.json()).code).toBe("JSON_REQUIRED");
  });

  test("Bank users: 401 signed out, 403 for customers, 200 for staff", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expect((await request.get("/api/bank/admin/users")).status()).toBe(401);

    await signIn(request, DEMO.customer);
    const customer = await request.get("/api/bank/admin/users");
    expect(customer.status()).toBe(403);
    expect((await customer.json()).code).toBe("FORBIDDEN");

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

  test("only an Admin changes users, and never itself or a demo account", async ({
    request,
    playwright,
    baseURL,
  }) => {
    const target = await signUpCustomer(request, "Promotable Customer");

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

    const admin = await playwright.request.newContext({ baseURL });
    const adminAccount = await signIn(admin, DEMO.admin);
    const promoted = await admin.patch(`/api/bank/admin/users/${target.id}`, {
      data: { role: "support" },
    });
    expect(promoted.status()).toBe(200);
    const updated = await promoted.json();
    expectSchema("BankUserResponse", updated);
    expect(updated.user.role).toBe("support");

    const self = await admin.patch(
      `/api/bank/admin/users/${adminAccount.user.id}`,
      { data: { status: "locked" } },
    );
    expect(self.status()).toBe(409);

    const users = (await (await admin.get("/api/bank/admin/users")).json())
      .users as { id: string; email: string }[];
    const demo = users.find((user) => user.email === DEMO.customer);
    const demoChange = await admin.patch(`/api/bank/admin/users/${demo?.id}`, {
      data: { status: "locked" },
    });
    expect(demoChange.status()).toBe(403);
    expect((await demoChange.json()).code).toBe("DEMO_READ_ONLY");
    await admin.dispose();
  });

  test("profile and settings updates are validated", async ({ request }) => {
    await signUpCustomer(request);

    const badProfile = await request.patch("/api/bank/me/profile", {
      data: { phone: "call me", postalCode: "!!" },
    });
    expect(badProfile.status()).toBe(400);
    expect(Object.keys((await badProfile.json()).errors).sort()).toEqual([
      "phone",
      "postalCode",
    ]);

    const profile = await request.patch("/api/bank/me/profile", {
      data: { city: "Lisbon", country: "Spain" },
    });
    expect(profile.status()).toBe(200);
    expect((await profile.json()).profile.city).toBe("Lisbon");

    const badSettings = await request.put("/api/bank/me/settings", {
      data: { currency: "BTC", locale: "xx", emailAlerts: "yes" },
    });
    expect(badSettings.status()).toBe(400);

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
