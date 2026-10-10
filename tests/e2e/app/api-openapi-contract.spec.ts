import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test } from "@playwright/test";
import { moneyAccounts, signUpCustomer } from "./_bank";
import { armFlags } from "./_helpers";

// Validate live API responses against the OpenAPI 3.1 schemas (JSON Schema
// 2020-12). The spec is loaded from the repo root (Playwright runs with cwd at
// the project root).
const openApiSpec = JSON.parse(readFileSync("openapi.json", "utf8"));

const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(openApiSpec, "openapi.json");

function validate(schemaName: string, body: unknown) {
  const validateFn = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  return { valid: validateFn(body), errors: validateFn.errors };
}

const CASES = [
  { name: "health", url: "/api/health", schema: "HealthResponse" },
  {
    name: "orders",
    url: "/api/orders?runKey=contract",
    schema: "OrdersResponse",
  },
  {
    name: "products",
    url: "/api/products?runKey=contract",
    schema: "ProductsResponse",
  },
  {
    name: "product detail",
    url: "/api/products/sku-001",
    schema: "ProductResponse",
  },
  { name: "users", url: "/api/users?runKey=contract", schema: "UsersResponse" },
  {
    name: "session",
    url: "/api/session?runKey=contract",
    schema: "SessionResponse",
  },
  {
    name: "flags",
    url: "/api/test/flags?runKey=contract",
    schema: "FlagsResponse",
  },
  {
    name: "market",
    url: "/api/bank/market?runKey=contract",
    schema: "BankMarketResponse",
  },
  {
    name: "coin detail",
    url: "/api/bank/market/BTC?runKey=contract",
    schema: "BankCoinDetail",
  },
];

// Trading needs a signed-in customer, so it is checked separately below.

test.describe("OpenAPI contract: live responses match the published spec", () => {
  for (const { name, url, schema } of CASES) {
    test(`${name} response conforms to ${schema}`, async ({ request }) => {
      const response = await request.get(url);
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      const { valid, errors } = validate(schema, body);
      expect(valid, JSON.stringify(errors, null, 2)).toBeTruthy();
    });
  }

  test("the served /api/openapi.json matches the repo spec", async ({
    request,
  }) => {
    const response = await request.get("/api/openapi.json");
    expect(response.ok()).toBeTruthy();
    const served = await response.json();
    expect(served.openapi).toBe("3.1.0");
    expect(Object.keys(served.paths)).toEqual(Object.keys(openApiSpec.paths));
  });
});

test.describe("OpenAPI contract: trading responses", () => {
  test("a quote, a trade and the portfolio all match the spec", async ({
    request,
  }) => {
    await signUpCustomer(request, "Contract Trader");
    const [checking] = (await moneyAccounts(request)).accounts;

    const quoted = await request.post("/api/bank/trades/quote", {
      data: { symbol: "BTC", side: "buy", spendCents: 25_000 },
    });
    const quote = await quoted.json();
    expect(validate("BankTradeQuote", quote).valid, "quote").toBeTruthy();

    const filled = await request.post("/api/bank/trades", {
      data: { quoteId: quote.id, accountId: checking.id },
    });
    const result = await filled.json();
    expect(validate("BankTradeResult", result).valid, "trade").toBeTruthy();

    const portfolio = await (await request.get("/api/bank/portfolio")).json();
    expect(
      validate("BankPortfolio", portfolio).valid,
      JSON.stringify(validate("BankPortfolio", portfolio).errors, null, 2),
    ).toBeTruthy();

    const trades = await (await request.get("/api/bank/trades")).json();
    expect(validate("BankTradesResponse", trades).valid, "trades").toBeTruthy();
  });

  test("the wallet, a send and a swap all match the spec", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Contract Wallet");
    const [checking] = (await moneyAccounts(request)).accounts;
    const quote = await (
      await request.post("/api/bank/trades/quote", {
        data: { symbol: "BTC", side: "buy", spendCents: 200_000 },
      })
    ).json();
    await request.post("/api/bank/trades", {
      data: { quoteId: quote.id, accountId: checking.id },
    });

    const wallet = await (await request.get("/api/bank/wallet")).json();
    expect(
      validate("BankWalletResponse", wallet).valid,
      JSON.stringify(validate("BankWalletResponse", wallet).errors, null, 2),
    ).toBeTruthy();

    const preview = await (
      await request.post("/api/bank/wallet/send/preview", {
        data: { symbol: "BTC", quantity: "0.0001" },
      })
    ).json();
    expect(
      validate("BankSendPreview", preview).valid,
      "send preview",
    ).toBeTruthy();

    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Contract Wallet Receiver");
    const theirs = await (await other.get("/api/bank/wallet")).json();
    const sent = await (
      await request.post("/api/bank/wallet/send", {
        data: {
          symbol: "BTC",
          toAddress: theirs.wallets[0].address,
          quantity: "0.0001",
        },
      })
    ).json();
    expect(validate("BankWalletSend", sent).valid, "send").toBeTruthy();

    const swapped = await (
      await request.post("/api/bank/wallet/swap", {
        data: { fromSymbol: "BTC", toSymbol: "ETH", quantity: "0.0001" },
      })
    ).json();
    expect(validate("BankWalletSwap", swapped).valid, "swap").toBeTruthy();
    await other.dispose();
  });
});

test.describe("OpenAPI contract: armed drift is detected (REPORT)", () => {
  test("productSchemaDrift makes /api/products violate ProductsResponse", async ({
    request,
  }) => {
    await armFlags(request, "contract-drift", { productSchemaDrift: true });
    const response = await request.get("/api/products?runKey=contract-drift");
    const body = await response.json();
    const { valid } = validate("ProductsResponse", body);
    // price is emitted as a string instead of a number -> schema violation.
    expect(valid).toBeFalsy();
  });

  test("bankCryptoPriceType makes the market violate BankMarketResponse", async ({
    request,
  }) => {
    await armFlags(request, "contract-crypto", { bankCryptoPriceType: true });

    const market = await request.get("/api/bank/market?runKey=contract-crypto");
    expect(
      validate("BankMarketResponse", await market.json()).valid,
    ).toBeFalsy();

    const coin = await request.get(
      "/api/bank/market/BTC?runKey=contract-crypto",
    );
    expect(validate("BankCoinDetail", await coin.json()).valid).toBeFalsy();
  });
});
