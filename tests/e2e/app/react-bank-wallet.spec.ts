import { expect, test, type Page } from "@playwright/test";
import { signUpCustomer } from "./_bank";
import { armFlags } from "./_helpers";

// The wallet in the browser (phase 3c): addresses to receive at, a send form
// that checks the address before it moves anything, and a swap.
//
// Sending is two steps on purpose -- check the address, then send -- because
// an address typo is the thing this screen exists to catch.

async function signUpWithCoin(page: Page, name: string, symbol = "BTC") {
  await signUpCustomer(page.request, name);
  const accounts = await (await page.request.get("/api/bank/accounts")).json();
  const quote = await (
    await page.request.post("/api/bank/trades/quote", {
      data: { symbol, side: "buy", spendCents: 500_000 },
    })
  ).json();
  await page.request.post("/api/bank/trades", {
    data: { quoteId: quote.id, accountId: accounts.accounts[0].id },
  });
}

async function addressOf(page: Page, symbol: string): Promise<string> {
  const wallet = await (await page.request.get("/api/bank/wallet")).json();
  return wallet.wallets.find(
    (entry: { symbol: string }) => entry.symbol === symbol,
  ).address;
}

test.describe("Playground Bank wallet (/app/wallet)", () => {
  test("a signed-out visitor is asked to log in", async ({ page }) => {
    await page.goto("/app/wallet");
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
    await expect(page.getByTestId("wallet-send")).toHaveCount(0);
  });

  test("the page shows an address for every coin", async ({ page }) => {
    await signUpCustomer(page.request, "Address Browser");
    await page.goto("/app/wallet");
    await expect(page.getByTestId("app-heading")).toHaveText("Wallet");

    const rows = page.getByTestId("wallet-addresses").locator("li");
    await expect(rows).toHaveCount(8);
    for (const symbol of ["BTC", "ETH", "PLAY"]) {
      await expect(page.getByTestId(`wallet-address-${symbol}`)).toHaveText(
        new RegExp(`^pbx1${symbol.toLowerCase()}[0-9A-HJKMNP-TV-Z]{13}$`),
      );
    }
    await expect(page.getByTestId("wallet-history-empty")).toBeVisible();
  });

  test("send: check the address, then send, and the coin arrives", async ({
    page,
    playwright,
    baseURL,
  }) => {
    await signUpWithCoin(page, "Browser Sender");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Browser Receiver");
    const theirWallet = await (await other.get("/api/bank/wallet")).json();
    const theirAddress = theirWallet.wallets.find(
      (entry: { symbol: string }) => entry.symbol === "BTC",
    ).address;

    await page.goto("/app/wallet");
    await page.getByTestId("send-to").fill(theirAddress);
    await page.getByTestId("send-amount").fill("0.001");
    await page.getByTestId("send-memo").fill("for coffee");
    await page.getByTestId("send-check").click();

    // The fee, the parsed amount and the real total are all shown before
    // anything moves.
    await expect(page.getByTestId("send-preview")).toBeVisible();
    await expect(page.getByTestId("send-amount-parsed")).toHaveText(
      "0.001 BTC",
    );
    await expect(page.getByTestId("send-fee")).toContainText("BTC");
    await expect(page.getByTestId("send-total")).toContainText("BTC");

    await page.getByTestId("send-confirm").click();
    await expect(page.getByTestId("send-done")).toContainText("Sent 0.001 BTC");
    await expect(page.getByTestId("sends-table")).toContainText("Sent");

    const theirPortfolio = await (
      await other.get("/api/bank/portfolio")
    ).json();
    expect(theirPortfolio.positions[0].quantityAtoms).toBe(100_000);
    await other.dispose();
  });

  test("a mistyped address is caught at the check step", async ({ page }) => {
    await signUpWithCoin(page, "Typo Sender");
    const mine = await addressOf(page, "BTC");
    const typo =
      mine.slice(0, -4) + (mine.at(-4) === "X" ? "Y" : "X") + mine.slice(-3);

    await page.goto("/app/wallet");
    await page.getByTestId("send-to").fill(typo);
    await page.getByTestId("send-amount").fill("0.001");
    await page.getByTestId("send-check").click();

    // Checking only previews the fee; the address is proved when sending.
    await page.getByTestId("send-confirm").click();
    await expect(page.getByTestId("send-to-error")).toContainText("check");
    await expect(page.getByTestId("send-done")).toHaveCount(0);
  });

  test("an amount with too many decimals is refused", async ({ page }) => {
    await signUpWithCoin(page, "Precise Sender");
    await page.goto("/app/wallet");
    await page.getByTestId("send-amount").fill("0.123456789");
    await page.getByTestId("send-check").click();
    await expect(page.getByTestId("send-amount-error")).toBeVisible();
  });

  test("swap: see what you'd get, then swap", async ({ page }) => {
    await signUpWithCoin(page, "Browser Swapper");
    await page.goto("/app/wallet");

    await page.getByTestId("swap-from").selectOption("BTC");
    await page.getByTestId("swap-into").selectOption("ETH");
    await page.getByTestId("swap-amount").fill("0.001");
    await page.getByTestId("swap-check").click();

    await expect(page.getByTestId("swap-preview")).toBeVisible();
    await expect(page.getByTestId("swap-gets")).toContainText("ETH");
    await expect(page.getByTestId("swap-fee")).toHaveText(/^\$\d/);

    await page.getByTestId("swap-confirm").click();
    await expect(page.getByTestId("swap-done")).toContainText("Swapped");
    await expect(page.getByTestId("swaps-table")).toContainText("ETH");

    // The portfolio now holds both.
    await page.goto("/app/portfolio");
    await expect(page.getByTestId("position-ETH")).toBeVisible();
  });

  test("swapping a coin into itself is refused", async ({ page }) => {
    await signUpWithCoin(page, "Circular Swapper");
    await page.goto("/app/wallet");
    await page.getByTestId("swap-from").selectOption("BTC");
    await page.getByTestId("swap-into").selectOption("BTC");
    await page.getByTestId("swap-amount").fill("0.001");
    await page.getByTestId("swap-check").click();
    await expect(page.getByTestId("swap-into-error")).toContainText(
      "different",
    );
  });

  test("REPORT bankBadAddress: the page says it was sent, and it landed nowhere", async ({
    page,
  }) => {
    const runKey = `wallet-bad-${Date.now()}`;
    await armFlags(page.request, runKey, { bankBadAddress: true });
    await signUpWithCoin(page, "Losing Sender");

    await page.goto(`/app/wallet?runKey=${runKey}`);
    await page.getByTestId("send-to").fill("pbx1btcZZZZZZZZZZZZZ");
    await page.getByTestId("send-amount").fill("0.001");
    await page.getByTestId("send-check").click();
    await page.getByTestId("send-confirm").click();

    // It reports success, and the history admits nobody received it.
    await expect(page.getByTestId("send-done")).toContainText(
      "no wallet holds that address",
    );
    const landed = page.locator('[data-testid^="send-landed-"]').first();
    await expect(landed).toHaveText("No");
  });

  test("REPORT bankCryptoFloat: the amount sent is a hair under what was typed", async ({
    page,
  }) => {
    const runKey = `wallet-float-${Date.now()}`;
    await armFlags(page.request, runKey, { bankCryptoFloat: true });
    await signUpWithCoin(page, "Floating Sender");

    await page.goto(`/app/wallet?runKey=${runKey}`);
    await page.getByTestId("send-amount").fill("0.29");
    await page.getByTestId("send-check").click();

    // Typed 0.29; the amount the server read back is a hair under it.
    await expect(page.getByTestId("send-amount-parsed")).toHaveText(
      "0.28999999 BTC",
    );
  });

  test("the wallet is reachable from the sidebar", async ({ page }) => {
    await signUpCustomer(page.request, "Wallet Nav");
    await page.goto("/app/markets");
    await page.getByTestId("nav-link-wallet").click();
    await expect(page.getByTestId("app-heading")).toHaveText("Wallet");
  });
});
