// Playground Bank in the customer's own currency and number format (Settings:
// currency, and "Language and date format"). Found by the bug hunt with Claude
// on 2026-11-14, and not planted (both still happened with practice mode off):
// with EUR and de-DE the transfer form wrote money as "17.771,30 €" but
// refused "250,00", and the price ticker and the product list showed dollars
// while the rest of the site showed euros.

// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: a fresh customer and their accounts.
import { moneyAccounts, signUpCustomer } from "../../../framework/helpers/bank";
// The type of a request context.
import type { APIRequestContext } from "@playwright/test";

// A fresh customer who picked euros and the German number format. Signed up
// through page.request, so the browser is signed in as them too.
async function germanCustomer(request: APIRequestContext): Promise<void> {
  await signUpCustomer(request, "Locale Customer");
  const answer = await request.put("/api/bank/me/settings", {
    data: {
      currency: "EUR",
      locale: "de-DE",
      emailAlerts: true,
      statementEmails: true,
    },
  });
  expect(answer.status()).toBe(200);
  fact("settings", "EUR, de-DE");
}

test.describe("Playground Bank in the customer's own format", () => {
  // The transfer form reads money the way the page writes it, and its hint is
  // written the same way.
  test("a German amount (250,00) goes through the transfer form", async ({
    page,
  }) => {
    expected(
      "EUR and de-DE: 'abc' refused with 'Enter an amount like 250,00.'; 250,00 to Savings reviews as 250,00 €",
    );
    await germanCustomer(page.request);
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);
    fact("savings", savings.id);
    await page.goto(`/app/bank/transfer?from=${checking.id}`);
    await expect(page.getByTestId("transfer-from")).toHaveValue(checking.id);
    await page.getByTestId("transfer-to-account").selectOption(savings.id);

    // Not an amount: the hint is written the German way.
    await page.getByTestId("transfer-amount").fill("abc");
    await page.getByTestId("transfer-review").click();
    await expect(page.getByTestId("transfer-amount-error")).toHaveText(
      "Enter an amount like 250,00.",
    );

    // 250,00 is money, and the review writes it back the same way.
    await page.getByTestId("transfer-amount").fill("250,00");
    await page.getByTestId("transfer-review").click();
    await expect(page.getByTestId("summary-amount")).toHaveText(/^250,00\s€$/);
  });

  // The ticker writes the same currency and format as the Markets table below
  // it (the numbers themselves move every few seconds, so only the format is
  // compared).
  test("the ticker and the Markets table both show euros", async ({ page }) => {
    expected(
      "EUR and de-DE: the ticker and the BTC price show €, never $; the BTC change reads like +2,11 %",
    );
    await germanCustomer(page.request);
    await page.goto("/app/markets");
    const price = page.getByTestId("market-price-BTC");
    await expect(price).toContainText("€");
    const ticker = page.getByTestId("market-ticker");
    await expect(ticker).toContainText("€");
    await expect(ticker).not.toContainText("$");
    await expect(page.getByTestId("market-change-BTC")).toHaveText(
      /^[+−]?\d+,\d{2}\s%$/,
    );
    fact("BTC", await price.innerText());
  });

  // The product list and a product's page write prices in the customer's
  // currency, like the cart and the orders.
  test("the product list and a product page show euros", async ({ page }) => {
    expected(
      "EUR and de-DE: the first product card's price and its page's price show €, never $",
    );
    await germanCustomer(page.request);
    await page.goto("/app/products");
    const card = page.locator('[data-testid^="product-price-"]').first();
    await expect(card).toContainText("€");
    await expect(card).not.toContainText("$");
    fact("card price", await card.innerText());

    await page.locator('[data-testid^="product-link-"]').first().click();
    const detail = page.getByTestId("product-detail-price");
    await expect(detail).toContainText("€");
    await expect(detail).not.toContainText("$");
    fact("page price", await detail.innerText());
  });
});
