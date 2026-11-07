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

// The security pack in the browser: the Devices page, and a walk through every
// page under the Content Security Policy to prove nothing is refused.
//
// Safe in the fully parallel suite: each test signs up its own customer, and a
// second browser context stands in for "another device".

// Every route in web/src/App.tsx. A new page belongs here too, so the policy
// is checked against it on the day it is added.
const ROUTES = [
  "/app",
  "/app/bank",
  "/app/bank/transfer",
  "/app/bank/bills",
  "/app/bank/loans",
  "/app/bank/requests",
  "/app/markets",
  "/app/markets/BTC",
  "/app/portfolio",
  "/app/wallet",
  "/app/practice",
  "/app/notifications",
  "/app/support",
  "/app/graphql",
  "/app/orders",
  "/app/users",
  "/app/products",
  "/app/account",
  "/app/profile",
  "/app/settings",
  "/app/devices",
  "/app/about",
];

test.describe("Devices page (/app/devices)", () => {
  // The page lists this browser and a second one, and "sign out the others"
  // signs the second out.
  test("lists this browser and the other one, and signs the other out", async ({
    page,
    browser,
  }) => {
    expected(
      "2 device rows, 1 current, '2 signed-in devices'; after ending the others: 'Signed out 1 other device.', 1 row, the button disabled, the other browser 401",
    );
    // The customer signed in here and on a second device.
    const { email } = await signUpCustomer(page.request, "Devices Customer");
    const other = await browser.newContext();
    await signIn(other.request, email, PASSWORD);

    // Both are listed, one marked as this device.
    await page.goto("/app/devices");
    await expect(page.getByTestId("devices-page")).toBeVisible();
    await expect(page.getByTestId("device-row")).toHaveCount(2);
    await expect(page.getByTestId("device-current")).toHaveCount(1);
    await expect(page.getByTestId("devices-count")).toHaveText(
      "2 signed-in devices",
    );

    // Sign out the others: one row left, and the other device is signed out.
    await page.getByTestId("devices-end-others").click();
    await expect(page.getByTestId("devices-ended")).toHaveText(
      "Signed out 1 other device.",
    );
    await expect(page.getByTestId("device-row")).toHaveCount(1);
    await expect(page.getByTestId("devices-end-others")).toBeDisabled();
    expect((await other.request.get("/api/bank/me")).status()).toBe(401);
    await other.close();
  });

  // One other device can be ended from its own row; this device has no End button.
  test("ends one device from its own row", async ({ page, browser }) => {
    expected(
      "2 rows, 1 End button; after ending: 1 row (this one), the other browser 401",
    );
    // The customer signed in here and on a second device.
    const { email } = await signUpCustomer(page.request, "Devices Customer");
    const other = await browser.newContext();
    await signIn(other.request, email, PASSWORD);

    await page.goto("/app/devices");
    await expect(page.getByTestId("device-row")).toHaveCount(2);
    // Only a row that is not this device has an End button.
    await expect(page.getByTestId("device-end")).toHaveCount(1);
    await page.getByTestId("device-end").click();
    await expect(page.getByTestId("device-row")).toHaveCount(1);
    await expect(page.getByTestId("device-current")).toHaveCount(1);
    expect((await other.request.get("/api/bank/me")).status()).toBe(401);
    await other.close();
  });

  // Signed out, the page asks to sign in; the sidebar links to it.
  test("asks a visitor to log in, and the sidebar links here", async ({
    page,
  }) => {
    expected(
      "the sign-in prompt on /app/devices; the sidebar link opens /app/devices",
    );
    await page.goto("/app/devices");
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
    await page.goto("/app");
    await page.getByTestId("nav-link-devices").click();
    await expect(page).toHaveURL(/\/app\/devices$/);
    await expect(page.getByTestId("devices-page")).toBeVisible();
  });
});

test.describe("Content Security Policy", () => {
  // Every page and the account menu load with no "Refused to" message from
  // the Content Security Policy.
  test("no page, and no dialog, is refused by the policy", async ({ page }) => {
    expected(
      "every route shows the practice banner, the account menu opens, and the console has no CSP refusals",
    );
    // Collect any console message that is a CSP refusal.
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) {
        violations.push(`${page.url()}: ${message.text()}`);
      }
    });

    // Visit every route as a signed-in customer.
    await signUpCustomer(page.request, "Policy Customer");
    fact("routes", ROUTES.length);
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByTestId("practice-banner"), route).toBeVisible();
    }

    // A Radix menu injects a <style> element when it opens. It must carry the
    // nonce, or the policy refuses it and the console says so.
    await page.goto("/app");
    await page.getByTestId("account-menu-trigger").click();
    await expect(page.getByTestId("account-menu")).toBeVisible();

    fact("violations", violations);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
