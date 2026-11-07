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
// The bank helpers: sign up and read accounts.
import { moneyAccounts, signUpCustomer } from "../../../framework/helpers/bank";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";

// Validate live API responses against the OpenAPI 3.1 schemas (JSON Schema
// 2020-12). The spec is loaded from the repo root (Playwright runs with cwd at
// the project root).
const openApiSpec = JSON.parse(readFileSync("openapi.json", "utf8"));

// Teach Ajv the document's schemas once.
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(openApiSpec, "openapi.json");

// Checks one answer against a named schema, and returns whether it matched
// with Ajv's errors (the caller decides what to expect).
function validate(schemaName: string, body: unknown) {
  const validateFn = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  return { valid: validateFn(body), errors: validateFn.errors };
}

// Each public GET endpoint, and the schema its answer must match.
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
    name: "practice",
    url: "/api/practice",
    schema: "PracticeState",
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
  // One test per endpoint: the live answer matches its schema.
  for (const { name, url, schema } of CASES) {
    test(`${name} response conforms to ${schema}`, async ({ request }) => {
      expected(`2xx, and the body matches ${schema}`);
      fact("schema", schema);
      const response = await request.get(url);
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      const { valid, errors } = validate(schema, body);
      fact("valid", valid);
      expect(valid, JSON.stringify(errors, null, 2)).toBeTruthy();
    });
  }

  // The document the server serves is the same one in the repo.
  test("the served /api/openapi.json matches the repo spec", async ({
    request,
  }) => {
    expected("2xx, OpenAPI 3.1.0, the same paths as openapi.json");
    const response = await request.get("/api/openapi.json");
    expect(response.ok()).toBeTruthy();
    const served = await response.json();
    expect(served.openapi).toBe("3.1.0");
    expect(Object.keys(served.paths)).toEqual(Object.keys(openApiSpec.paths));
  });
});

test.describe("OpenAPI contract: trading responses", () => {
  // A quote, a trade, the portfolio and the trade list each match their schema.
  test("a quote, a trade and the portfolio all match the spec", async ({
    request,
  }) => {
    expected(
      "BankTradeQuote, BankTradeResult, BankPortfolio and BankTradesResponse all valid",
    );
    // A new customer prices and fills a $250 BTC buy.
    await signUpCustomer(request, "Contract Trader");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);

    const quoted = await request.post("/api/bank/trades/quote", {
      data: { symbol: "BTC", side: "buy", spendCents: 25_000 },
    });
    const quote = await quoted.json();
    fact("quoteId", quote.id);
    expect(validate("BankTradeQuote", quote).valid, "quote").toBeTruthy();

    const filled = await request.post("/api/bank/trades", {
      data: { quoteId: quote.id, accountId: checking.id },
    });
    const result = await filled.json();
    expect(validate("BankTradeResult", result).valid, "trade").toBeTruthy();

    // The holdings and the trade list.
    const portfolio = await (await request.get("/api/bank/portfolio")).json();
    expect(
      validate("BankPortfolio", portfolio).valid,
      JSON.stringify(validate("BankPortfolio", portfolio).errors, null, 2),
    ).toBeTruthy();

    const trades = await (await request.get("/api/bank/trades")).json();
    expect(validate("BankTradesResponse", trades).valid, "trades").toBeTruthy();
  });

  // The wallet, a send preview, a send and a swap each match their schema.
  test("the wallet, a send and a swap all match the spec", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "BankWalletResponse, BankSendPreview, BankWalletSend and BankWalletSwap all valid",
    );
    // A new customer buys $2,000 of BTC.
    await signUpCustomer(request, "Contract Wallet");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    const quote = await (
      await request.post("/api/bank/trades/quote", {
        data: { symbol: "BTC", side: "buy", spendCents: 200_000 },
      })
    ).json();
    await request.post("/api/bank/trades", {
      data: { quoteId: quote.id, accountId: checking.id },
    });

    // The wallet.
    const wallet = await (await request.get("/api/bank/wallet")).json();
    expect(
      validate("BankWalletResponse", wallet).valid,
      JSON.stringify(validate("BankWalletResponse", wallet).errors, null, 2),
    ).toBeTruthy();

    // A send preview.
    const preview = await (
      await request.post("/api/bank/wallet/send/preview", {
        data: { symbol: "BTC", quantity: "0.0001" },
      })
    ).json();
    expect(
      validate("BankSendPreview", preview).valid,
      "send preview",
    ).toBeTruthy();

    // A send to a second customer's BTC address.
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

    // A swap of BTC into ETH.
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
  // With the planted bug armed, products no longer match their schema.
  test("productSchemaDrift makes /api/products violate ProductsResponse", async ({
    request,
  }) => {
    expected("with productSchemaDrift armed, /api/products is NOT valid");
    await armFlags(request, "contract-drift", { productSchemaDrift: true });
    const response = await request.get("/api/products?runKey=contract-drift");
    const body = await response.json();
    const { valid } = validate("ProductsResponse", body);
    fact("valid", valid);
    // price is emitted as a string instead of a number -> schema violation.
    expect(valid).toBeFalsy();
  });

  // With the planted bug armed, the market and coin page no longer match their schemas.
  test("bankCryptoPriceType makes the market violate BankMarketResponse", async ({
    request,
  }) => {
    expected(
      "with bankCryptoPriceType armed, the market and the BTC page are NOT valid",
    );
    await armFlags(request, "contract-crypto", { bankCryptoPriceType: true });

    // The market list.
    const market = await request.get("/api/bank/market?runKey=contract-crypto");
    expect(
      validate("BankMarketResponse", await market.json()).valid,
    ).toBeFalsy();

    // Bitcoin's page.
    const coin = await request.get(
      "/api/bank/market/BTC?runKey=contract-crypto",
    );
    expect(validate("BankCoinDetail", await coin.json()).valid).toBeFalsy();
  });
});
