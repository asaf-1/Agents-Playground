// Node's file and path tools.
import fs from "node:fs";
import path from "node:path";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  test,
} from "../../../framework/fixtures/resultBlock";
// The GraphQL schema the server builds, printed as text.
import { printBankSchema } from "../../../bank/graphql.js";
// What the database schema files should say, and which ones are out of date.
import { buildSchemaFiles, staleFiles } from "../../../scripts/db/schema.js";

// The schema files are written by scripts, not by hand, so they can only go
// stale one way: somebody changes a migration or the GraphQL schema and forgets
// to regenerate. These two tests are that reminder, in the suite every push
// runs. Neither needs the server: each builds what the file should say and
// compares.

// The repository root, three folders up from this file.
const ROOT = path.resolve(__dirname, "..", "..", "..");

test.describe("Schema files (plan 2, phase B)", () => {
  // The checked-in SQL schema and its doc match what the migrations build.
  test("bank/schema.sql and docs/database.md match the migrations", async () => {
    expected("no stale files (else: run npm run db:schema)");
    const files = await buildSchemaFiles();
    expect(
      staleFiles(files),
      "A migration changed the database. Run npm run db:schema.",
    ).toEqual([]);
  });

  // The checked-in GraphQL schema matches the one the server runs.
  test("bank/schema.graphql matches the schema the server runs", async () => {
    expected(
      "the file equals the printed schema (else: run npm run graphql:schema)",
    );
    const file = fs.readFileSync(
      path.join(ROOT, "bank", "schema.graphql"),
      "utf8",
    );
    expect(
      file === printBankSchema(),
      "The GraphQL schema changed. Run npm run graphql:schema.",
    ).toBe(true);
  });
});
