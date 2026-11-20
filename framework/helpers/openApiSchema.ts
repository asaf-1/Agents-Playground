// Checks an API answer against a schema in bank/openapi.json, the document the
// server publishes, so a test proves the answer is what the spec promises.

// Reads the spec from disk (Playwright runs from the repository root).
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema (OpenAPI 3.1 is JSON Schema
// 2020-12); ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// The shape of one wrong-type field, shared with the diagnosis agents.
import type { SchemaMismatch } from "../agents/diagnosis/types";

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

// A value's type as JSON names it: "array" and "null" apart from "object".
function jsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// Every field of the body whose type is not the one the named schema
// promises, as "products[0].price" with what the schema says and what came.
// The API diagnosis agent and the bug reporter read the root cause from it.
export function typeMismatches(name: string, body: unknown): SchemaMismatch[] {
  const check = ajv.compile({
    $ref: `openapi.json#/components/schemas/${name}`,
  });
  if (check(body)) return [];
  return (check.errors ?? [])
    .filter((error) => error.keyword === "type")
    .map((error) => {
      // "/products/0/price" -> the value there, and "products[0].price".
      const steps = error.instancePath.split("/").filter(Boolean);
      const value = steps.reduce<unknown>(
        (node, step) =>
          node && typeof node === "object"
            ? (node as Record<string, unknown>)[step]
            : undefined,
        body,
      );
      const field = steps
        .map((step, index) =>
          /^\d+$/.test(step) ? `[${step}]` : index === 0 ? step : `.${step}`,
        )
        .join("");
      return {
        expectedType: String((error.params as { type?: unknown }).type),
        field,
        receivedType: jsonTypeOf(value),
      };
    });
}
