// Checks an API answer against a schema in bank/openapi.json, the document the
// server publishes, so a test proves the answer is what the spec promises.

// Reads the spec from disk (Playwright runs from the repository root).
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema (OpenAPI 3.1 is JSON Schema
// 2020-12); ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

// The spec, taught to Ajv once.
const spec = JSON.parse(readFileSync("bank/openapi.json", "utf8"));
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(spec, "openapi.json");

// Whether the body matches the named schema (components/schemas/<name>), and
// Ajv's errors as text when it doesn't.
export function matchesSchema(
  name: string,
  body: unknown,
): { valid: boolean; errors: string } {
  const check = ajv.compile({
    $ref: `openapi.json#/components/schemas/${name}`,
  });
  const valid = check(body) as boolean;
  return { valid, errors: JSON.stringify(check.errors ?? [], null, 2) };
}
