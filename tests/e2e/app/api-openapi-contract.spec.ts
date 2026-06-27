import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test } from "@playwright/test";
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
];

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
});
