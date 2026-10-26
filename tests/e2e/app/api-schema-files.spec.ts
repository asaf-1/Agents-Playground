import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { printBankSchema } from "../../../bank/graphql.js";
import { buildSchemaFiles, staleFiles } from "../../../scripts/db/schema.js";

// The schema files are written by scripts, not by hand, so they can only go
// stale one way: somebody changes a migration or the GraphQL schema and forgets
// to regenerate. These two tests are that reminder, in the suite every push
// runs. Neither needs the server: each builds what the file should say and
// compares.

const ROOT = path.resolve(__dirname, "..", "..", "..");

test.describe("Schema files (plan 2, phase B)", () => {
  test("bank/schema.sql and docs/database.md match the migrations", async () => {
    const files = await buildSchemaFiles();
    expect(
      staleFiles(files),
      "A migration changed the database. Run npm run db:schema.",
    ).toEqual([]);
  });

  test("bank/schema.graphql matches the schema the server runs", async () => {
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
