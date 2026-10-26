// The bank's GraphQL schema as a file: `npm run graphql:schema`.
//
// Writes bank/schema.graphql from the schema the server actually runs
// (bank/graphql.js), so a reader, a reviewer or a client generator can see
// every type and field without starting the server or running introspection.
//
//   npm run graphql:schema          write it
//   npm run graphql:schema:check    fail if it is stale
//
// tests/e2e/app/api-schema-files.spec.ts runs the same comparison, so a change
// to the schema that forgets this file fails the suite.

const fs = require("node:fs");
const path = require("node:path");
const { printBankSchema } = require("../../bank/graphql");

const FILE = path.resolve(__dirname, "..", "..", "bank", "schema.graphql");

function main() {
  const next = printBankSchema();
  const current = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : null;

  if (process.argv.includes("--check")) {
    if (current !== next) {
      console.error(
        "[graphql] bank/schema.graphql is stale. Run npm run graphql:schema.",
      );
      process.exit(1);
    }
    console.log("[graphql] bank/schema.graphql is current.");
    return;
  }

  if (current === next) {
    console.log("[graphql] No change: bank/schema.graphql is current.");
    return;
  }

  fs.writeFileSync(FILE, next);
  console.log("[graphql] Wrote bank/schema.graphql.");
}

main();
