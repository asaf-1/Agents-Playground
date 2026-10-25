import { expect, test } from "@playwright/test";
import { PASSWORD, signIn, signUpCustomer } from "./_bank";

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
  test("lists this browser and the other one, and signs the other out", async ({
    page,
    browser,
  }) => {
    const { email } = await signUpCustomer(page.request, "Devices Customer");
    const other = await browser.newContext();
    await signIn(other.request, email, PASSWORD);

    await page.goto("/app/devices");
    await expect(page.getByTestId("devices-page")).toBeVisible();
    await expect(page.getByTestId("device-row")).toHaveCount(2);
    await expect(page.getByTestId("device-current")).toHaveCount(1);
    await expect(page.getByTestId("devices-count")).toHaveText(
      "2 signed-in devices",
    );

    await page.getByTestId("devices-end-others").click();
    await expect(page.getByTestId("devices-ended")).toHaveText(
      "Signed out 1 other device.",
    );
    await expect(page.getByTestId("device-row")).toHaveCount(1);
    await expect(page.getByTestId("devices-end-others")).toBeDisabled();
    expect((await other.request.get("/api/bank/me")).status()).toBe(401);
    await other.close();
  });

  test("ends one device from its own row", async ({ page, browser }) => {
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

  test("asks a visitor to log in, and the sidebar links here", async ({
    page,
  }) => {
    await page.goto("/app/devices");
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
    await page.goto("/app");
    await page.getByTestId("nav-link-devices").click();
    await expect(page).toHaveURL(/\/app\/devices$/);
    await expect(page.getByTestId("devices-page")).toBeVisible();
  });
});

test.describe("Content Security Policy", () => {
  test("no page, and no dialog, is refused by the policy", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) {
        violations.push(`${page.url()}: ${message.text()}`);
      }
    });

    await signUpCustomer(page.request, "Policy Customer");
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByTestId("practice-banner"), route).toBeVisible();
    }

    // A Radix menu injects a <style> element when it opens. It must carry the
    // nonce, or the policy refuses it and the console says so.
    await page.goto("/app");
    await page.getByTestId("account-menu-trigger").click();
    await expect(page.getByTestId("account-menu")).toBeVisible();

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
