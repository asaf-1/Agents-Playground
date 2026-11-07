// The type of a browser page.
import { type Page } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Signs up a fresh customer.
import { signUpCustomer } from "../../../framework/helpers/bank";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";

// The wallet in the browser (phase 3c): addresses to receive at, a send form
// that checks the address before it moves anything, and a swap.
//
// Sending is two steps on purpose -- check the address, then send -- because
// an address typo is the thing this screen exists to catch.

// Signs up a customer in the page and buys $5,000 of one coin, so they have
// coin to send or swap.
async function signUpWithCoin(page: Page, name: string, symbol = "BTC") {
  fact("seeded", `$5,000 of ${symbol}`);
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

// The signed-in customer's receiving address for one coin.
async function addressOf(page: Page, symbol: string): Promise<string> {
  const wallet = await (await page.request.get("/api/bank/wallet")).json();
  return wallet.wallets.find(
    (entry: { symbol: string }) => entry.symbol === symbol,
  ).address;
}

test.describe("Playground Bank wallet (/app/wallet)", () => {
  // Signed out, the wallet asks to sign in and has no send form.
  test("a signed-out visitor is asked to log in", async ({ page }) => {
    expected("the sign-in prompt, and no send form");
    await page.goto("/app/wallet");
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
    await expect(page.getByTestId("wallet-send")).toHaveCount(0);
  });

  // The wallet lists an address for each of the eight coins.
  test("the page shows an address for every coin", async ({ page }) => {
    expected(
      "heading Wallet; 8 addresses; BTC, ETH and PLAY in the pbx1 shape; an empty history",
    );
    await signUpCustomer(page.request, "Address Browser");
    await page.goto("/app/wallet");
    await expect(page.getByTestId("app-heading")).toHaveText("Wallet");

    // Eight rows, and three of them checked for the address shape.
    const rows = page.getByTestId("wallet-addresses").locator("li");
    await expect(rows).toHaveCount(8);
    for (const symbol of ["BTC", "ETH", "PLAY"]) {
      await expect(page.getByTestId(`wallet-address-${symbol}`)).toHaveText(
        new RegExp(`^pbx1${symbol.toLowerCase()}[0-9A-HJKMNP-TV-Z]{13}$`),
      );
    }
    await expect(page.getByTestId("wallet-history-empty")).toBeVisible();
  });

  // Sending: check the address and see the fee and total, then send, and the
  // other customer has the coin.
  test("send: check the address, then send, and the coin arrives", async ({
    page,
    playwright,
    baseURL,
  }) => {
    expected(
      "the preview shows 0.001 BTC, a fee and a total in BTC; 'Sent 0.001 BTC' and a Sent row; the receiver holds 100000 atoms",
    );
    // A sender with BTC, and a receiver's BTC address.
    await signUpWithCoin(page, "Browser Sender");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Browser Receiver");
    const theirWallet = await (await other.get("/api/bank/wallet")).json();
    const theirAddress = theirWallet.wallets.find(
      (entry: { symbol: string }) => entry.symbol === "BTC",
    ).address;
    fact("to address", theirAddress);

    // Fill in the send form and check it.
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

    // Send it.
    await page.getByTestId("send-confirm").click();
    await expect(page.getByTestId("send-done")).toContainText("Sent 0.001 BTC");
    await expect(page.getByTestId("sends-table")).toContainText("Sent");

    // The receiver has it.
    const theirPortfolio = await (
      await other.get("/api/bank/portfolio")
    ).json();
    expect(theirPortfolio.positions[0].quantityAtoms).toBe(100_000);
    await other.dispose();
  });

  // An address with one wrong character is refused when sending, and nothing goes.
  test("a mistyped address is caught at the check step", async ({ page }) => {
    expected(
      "on send, a send-to error mentioning the check, and no 'done' message",
    );
    // A customer with BTC, and their own address with one character changed.
    await signUpWithCoin(page, "Typo Sender");
    const mine = await addressOf(page, "BTC");
    const typo =
      mine.slice(0, -4) + (mine.at(-4) === "X" ? "Y" : "X") + mine.slice(-3);
    fact("typo", typo);

    await page.goto("/app/wallet");
    await page.getByTestId("send-to").fill(typo);
    await page.getByTestId("send-amount").fill("0.001");
    await page.getByTestId("send-check").click();

    // Checking only previews the fee; the address is proved when sending.
    await page.getByTestId("send-confirm").click();
    await expect(page.getByTestId("send-to-error")).toContainText("check");
    await expect(page.getByTestId("send-done")).toHaveCount(0);
  });

  // Nine decimal places are refused.
  test("an amount with too many decimals is refused", async ({ page }) => {
    expected("an amount error for 0.123456789");
    await signUpWithCoin(page, "Precise Sender");
    await page.goto("/app/wallet");
    await page.getByTestId("send-amount").fill("0.123456789");
    await page.getByTestId("send-check").click();
    await expect(page.getByTestId("send-amount-error")).toBeVisible();
  });

  // Swapping BTC for ETH shows what you'd get and the fee, then swaps.
  test("swap: see what you'd get, then swap", async ({ page }) => {
    expected(
      "the preview names ETH and a $ fee; 'Swapped' and an ETH row; the portfolio has an ETH position",
    );
    await signUpWithCoin(page, "Browser Swapper");
    await page.goto("/app/wallet");

    // 0.001 BTC into ETH, checked first.
    await page.getByTestId("swap-from").selectOption("BTC");
    await page.getByTestId("swap-into").selectOption("ETH");
    await page.getByTestId("swap-amount").fill("0.001");
    await page.getByTestId("swap-check").click();

    await expect(page.getByTestId("swap-preview")).toBeVisible();
    await expect(page.getByTestId("swap-gets")).toContainText("ETH");
    await expect(page.getByTestId("swap-fee")).toHaveText(/^\$\d/);

    // Swap it.
    await page.getByTestId("swap-confirm").click();
    await expect(page.getByTestId("swap-done")).toContainText("Swapped");
    await expect(page.getByTestId("swaps-table")).toContainText("ETH");

    // The portfolio now holds both.
    await page.goto("/app/portfolio");
    await expect(page.getByTestId("position-ETH")).toBeVisible();
  });

  // BTC into BTC is refused on the form.
  test("swapping a coin into itself is refused", async ({ page }) => {
    expected("a swap-into error saying 'different'");
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

  // With the bug armed, a send to a made-up address says it was sent, and
  // the history shows it never arrived.
  test("REPORT bankBadAddress: the page says it was sent, and it landed nowhere", async ({
    page,
  }) => {
    expected(
      "with bankBadAddress armed: 'no wallet holds that address' after sending, and Landed reads No",
    );
    // Arm the bug, and a customer with BTC.
    const runKey = `wallet-bad-${Date.now()}`;
    fact("runKey", runKey);
    await armFlags(page.request, runKey, { bankBadAddress: true });
    await signUpWithCoin(page, "Losing Sender");

    // Send 0.001 BTC to an address nobody has.
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

  // With the bug armed, 0.29 typed comes back as 0.28999999.
  test("REPORT bankCryptoFloat: the amount sent is a hair under what was typed", async ({
    page,
  }) => {
    expected("with bankCryptoFloat armed: 0.29 reads back as 0.28999999 BTC");
    // Arm the bug, and a customer with BTC.
    const runKey = `wallet-float-${Date.now()}`;
    fact("runKey", runKey);
    await armFlags(page.request, runKey, { bankCryptoFloat: true });
    await signUpWithCoin(page, "Floating Sender");

    // Type 0.29 and check it.
    await page.goto(`/app/wallet?runKey=${runKey}`);
    await page.getByTestId("send-amount").fill("0.29");
    await page.getByTestId("send-check").click();

    // Typed 0.29; the amount the server read back is a hair under it.
    await expect(page.getByTestId("send-amount-parsed")).toHaveText(
      "0.28999999 BTC",
    );
  });

  // The sidebar's Wallet link works.
  test("the wallet is reachable from the sidebar", async ({ page }) => {
    expected("the Wallet link opens a page headed Wallet");
    await signUpCustomer(page.request, "Wallet Nav");
    await page.goto("/app/markets");
    await page.getByTestId("nav-link-wallet").click();
    await expect(page.getByTestId("app-heading")).toHaveText("Wallet");
  });
});
