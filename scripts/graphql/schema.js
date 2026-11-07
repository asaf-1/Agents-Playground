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

// Files, paths, and the function that prints the schema the server runs.
const fs = require("node:fs");
const path = require("node:path");
const { printBankSchema } = require("../../bank/graphql");

// Where the schema file lives: bank/schema.graphql.
const FILE = path.resolve(__dirname, "..", "..", "bank", "schema.graphql");

// Write the file, or with --check only say whether it is current.
function main() {
  // The schema as the server has it now, and the file as it is on disk.
  const next = printBankSchema();
  const current = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : null;

  // --check: fail when the file differs, and change nothing.
  if (process.argv.includes("--check")) {
    // Stale: say how to fix it and stop with an error.
    if (current !== next) {
      console.error(
        "[graphql] bank/schema.graphql is stale. Run npm run graphql:schema.",
      );
      process.exit(1);
    }
    console.log("[graphql] bank/schema.graphql is current.");
    return;
  }

  // Nothing to write when the file already matches.
  if (current === next) {
    console.log("[graphql] No change: bank/schema.graphql is current.");
    return;
  }

  // Otherwise write the new schema.
  fs.writeFileSync(FILE, next);
  console.log("[graphql] Wrote bank/schema.graphql.");
}

// Run it.
main();
