// The bank's schema, readable without reading twelve migrations.
//
// Builds a fresh database from bank/migrations/ (PGlite, in memory, so no
// server and no secret), reads what Postgres itself says the tables are, and
// writes two things from that one reading:
//
//   bank/schema.sql     every table, column, constraint and index, in order
//   docs/database.md    the same, drawn as a diagram, with a table list
//
//   npm run db:schema          write them
//   npm run db:schema:check    fail if any of them is stale
//
// The check is also a test (tests/e2e/app/api-schema-files.spec.ts), so a
// migration that changes the database without regenerating these fails the
// suite instead of quietly leaving the documents behind.

// Files, paths, and the migrations that build the bank's tables.
const fs = require("node:fs");
const path = require("node:path");
const { runMigrations } = require("../../bank/migrate");

// The repo's root folder, and the two files this writes.
const ROOT = path.resolve(__dirname, "..", "..");
const SCHEMA_SQL = path.join(ROOT, "bank", "schema.sql");
const DATABASE_MD = path.join(ROOT, "docs", "database.md");

// Postgres spells some types in several words; a diagram wants one.
const SHORT_TYPES = {
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  "character varying": "varchar",
  "double precision": "float8",
};

// A type's one-word name for the diagram.
function shortType(type) {
  return SHORT_TYPES[type] || type.replace(/\s+/g, "_");
}

// Every table as Postgres reports it: columns, constraints and extra indexes.
async function readSchema(db) {
  // The tables in the public schema, by name.
  const tables = await db.query(
    `SELECT c.oid, c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`,
  );

  // One entry per table.
  const result = [];

  // For each table, read its parts from Postgres's own catalogue.
  for (const table of tables.rows) {
    // Its columns, in order, with type, NOT NULL, identity and default.
    const columns = await db.query(
      `SELECT a.attname AS name,
              format_type(a.atttypid, a.atttypmod) AS type,
              a.attnotnull AS not_null,
              a.attidentity AS identity,
              pg_get_expr(d.adbin, d.adrelid) AS default_value
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [table.oid],
    );

    // Its constraints: primary key first, then unique, foreign keys, and the
    // rest.
    const constraints = await db.query(
      `SELECT conname AS name, contype AS type,
              pg_get_constraintdef(oid) AS definition,
              confrelid::regclass::text AS references_table,
              (SELECT array_agg(a.attname ORDER BY a.attnum)
                 FROM pg_attribute a
                WHERE a.attrelid = conrelid AND a.attnum = ANY (conkey)) AS columns
         FROM pg_constraint
        WHERE conrelid = $1
          -- Newer Postgres also lists NOT NULL as a constraint; the column line
          -- already says it.
          AND contype <> 'n'
        ORDER BY CASE contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'f' THEN 2 ELSE 3 END,
                 conname`,
      [table.oid],
    );

    // Indexes that back a constraint are already said by the constraint.
    const indexes = await db.query(
      `SELECT i.relname AS name, pg_get_indexdef(i.oid) AS definition
         FROM pg_index x
         JOIN pg_class i ON i.oid = x.indexrelid
        WHERE x.indrelid = $1
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid)
        ORDER BY i.relname`,
      [table.oid],
    );

    // Its triggers, with the function each one runs: the audit log's
    // append-only guard is a rule of the schema as much as a constraint is.
    const triggers = await db.query(
      `SELECT t.tgname AS name, pg_get_triggerdef(t.oid) AS definition,
              pg_get_functiondef(p.oid) AS function_definition
         FROM pg_trigger t
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE t.tgrelid = $1 AND NOT t.tgisinternal
        ORDER BY t.tgname`,
      [table.oid],
    );

    // The table, with each constraint's columns as a list.
    result.push({
      name: table.name,
      columns: columns.rows,
      constraints: constraints.rows.map((row) => ({
        ...row,
        columns: Array.isArray(row.columns) ? row.columns : [],
      })),
      indexes: indexes.rows,
      triggers: triggers.rows,
    });
  }

  // Every table.
  return result;
}

// One column as a line of SQL.
function columnLine(column) {
  // Its name and type.
  const parts = [`  ${column.name} ${column.type}`];

  // An identity column says which kind.
  if (column.identity === "a") parts.push("GENERATED ALWAYS AS IDENTITY");
  else if (column.identity === "d")
    parts.push("GENERATED BY DEFAULT AS IDENTITY");

  // Then NOT NULL and the default, when it has them.
  if (column.not_null) parts.push("NOT NULL");
  if (column.default_value !== null && column.default_value !== undefined) {
    parts.push(`DEFAULT ${column.default_value}`);
  }

  // Joined into one line.
  return parts.join(" ");
}

// bank/schema.sql: a header, then each table with its constraints and indexes.
function renderSql(tables) {
  // The header says the file is generated.
  const lines = [
    "-- Playground Bank's schema, as Postgres reports it after every migration in",
    "-- bank/migrations/ has run. Generated by `npm run db:schema`; do not edit.",
    "-- A migration that changes this without regenerating it fails the suite.",
    "",
  ];

  // Each table in turn.
  for (const table of tables) {
    // Its columns, then its constraints.
    const body = [
      ...table.columns.map(columnLine),
      ...table.constraints.map(
        (constraint) =>
          `  CONSTRAINT ${constraint.name} ${constraint.definition}`,
      ),
    ];

    // As one CREATE TABLE statement.
    lines.push(`CREATE TABLE ${table.name} (`);
    lines.push(body.join(",\n"));
    lines.push(");");

    // Then its extra indexes.
    for (const index of table.indexes) {
      lines.push(`${index.definition};`);
    }

    // Then each trigger, after the function it runs.
    for (const trigger of table.triggers || []) {
      lines.push(`${trigger.function_definition.trim()};`);
      lines.push(`${trigger.definition};`);
    }

    // A blank line between tables.
    lines.push("");
  }

  // One final newline.
  return `${lines.join("\n").trimEnd()}\n`;
}

// The diagram: each table with its columns and keys, then the links between
// tables.
function renderErd(tables) {
  // A Mermaid diagram, and the links collected along the way.
  const lines = ["```mermaid", "erDiagram"];
  const relations = [];

  // Each table in turn.
  for (const table of tables) {
    // Which columns are the primary key, foreign keys, and unique on their own.
    const primary = new Set(
      table.constraints
        .filter((constraint) => constraint.type === "p")
        .flatMap((constraint) => constraint.columns),
    );
    const foreign = new Set(
      table.constraints
        .filter((constraint) => constraint.type === "f")
        .flatMap((constraint) => constraint.columns),
    );
    const unique = new Set(
      table.constraints
        .filter(
          (constraint) =>
            constraint.type === "u" && constraint.columns.length === 1,
        )
        .flatMap((constraint) => constraint.columns),
    );

    // The table's box.
    lines.push(`  ${table.name} {`);

    // One line per column, with PK, FK or UK.
    for (const column of table.columns) {
      // The column's keys.
      const keys = [
        primary.has(column.name) ? "PK" : "",
        foreign.has(column.name) ? "FK" : "",
        unique.has(column.name) && !primary.has(column.name) ? "UK" : "",
      ].filter(Boolean);

      // Its type, name and keys.
      lines.push(
        `    ${shortType(column.type)} ${column.name}${keys.length ? ` ${keys.join(", ")}` : ""}`,
      );
    }

    // Close the box.
    lines.push("  }");

    // A link for each foreign key.
    for (const constraint of table.constraints) {
      // Only foreign keys.
      if (constraint.type !== "f") continue;

      // One-to-one when the referencing column is unique on its own.
      const single =
        constraint.columns.length === 1 &&
        (unique.has(constraint.columns[0]) ||
          primary.has(constraint.columns[0]));

      // One-to-one or one-to-many, labelled with the column.
      relations.push(
        `  ${constraint.references_table} ||--${single ? "o|" : "o{"} ${table.name} : "${constraint.columns.join(", ")}"`,
      );
    }
  }

  // All the links, then close the diagram.
  lines.push(...relations, "```");

  // As one text.
  return lines.join("\n");
}

// docs/database.md: what it is, the diagram, and a table list.
function renderMarkdown(tables, erd) {
  // One row per table: columns, extra indexes, and the tables it points at.
  const rows = tables.map((table) => {
    // The tables it points at, each once.
    const references = [
      ...new Set(
        table.constraints
          .filter((constraint) => constraint.type === "f")
          .map((constraint) => `\`${constraint.references_table}\``),
      ),
    ];

    // The row.
    return `| \`${table.name}\` | ${table.columns.length} | ${table.indexes.length} | ${references.join(", ") || "—"} |`;
  });

  // The page.
  return `${[
    "# Playground Bank's database",
    "",
    "Every table the bank keeps, drawn from what Postgres itself reports after",
    "all of `bank/migrations/` has run. The same reading writes",
    "[`bank/schema.sql`](../bank/schema.sql), the schema as SQL. Both are",
    "generated by `npm run db:schema` and checked by `npm run db:schema:check`",
    "and by the test suite, so they cannot drift from the migrations.",
    "",
    "Locally and in CI the database is PGlite, a Postgres engine inside Node, in",
    "memory; on Render it is Neon. The SQL is the same either way.",
    "",
    erd,
    "",
    "## Tables",
    "",
    "| Table | Columns | Extra indexes | Points at |",
    "| ----- | ------- | ------------- | --------- |",
    ...rows,
    "",
    "Extra indexes are the ones not already made by a primary key or a unique",
    "constraint.",
  ].join("\n")}\n`;
}

// Everything the generator would write, as { path: content }.
async function buildSchemaFiles() {
  // An in-memory PGlite database, wrapped in the query, exec and transaction
  // shape the migrations expect.
  const { PGlite } = await import("@electric-sql/pglite");
  const pglite = await PGlite.create();
  const db = {
    query: (text, params) => pglite.query(text, params),
    exec: (text) => pglite.exec(text),
    transaction: (work) =>
      pglite.transaction((tx) =>
        work({
          query: (text, params) => tx.query(text, params),
          exec: (text) => tx.exec(text),
        }),
      ),
  };

  // The database is closed at the end, even after an error.
  try {
    // Build the tables, read them back, and draw the diagram.
    await runMigrations(db);
    const tables = await readSchema(db);
    const erd = renderErd(tables);

    // The markdown goes through Prettier here, so the files written are the
    // files the format check expects and the two checks never disagree.
    const prettier = require("prettier");
    const markdown = (content, filepath) =>
      prettier.format(content, { parser: "markdown", filepath });

    // The two files and their content.
    return {
      [SCHEMA_SQL]: renderSql(tables),
      [DATABASE_MD]: await markdown(renderMarkdown(tables, erd), DATABASE_MD),
    };
  } finally {
    await pglite.close();
  }
}

// The files whose content on disk differs, by their path from the repo root.
function staleFiles(files) {
  // Compare each with what is on disk.
  return Object.entries(files)
    .filter(([file, content]) => {
      const current = fs.existsSync(file)
        ? fs.readFileSync(file, "utf8")
        : null;
      return current !== content;
    })
    .map(([file]) => path.relative(ROOT, file));
}

// Write the schema files, or with --check only say whether they are current.
async function main() {
  // Whether this is a check, the files as they should be, and which are stale.
  const check = process.argv.includes("--check");
  const files = await buildSchemaFiles();
  const stale = staleFiles(files);

  // --check: fail when any is stale, and change nothing.
  if (check) {
    // Stale: say which, and how to fix it.
    if (stale.length) {
      console.error(
        `[db] Stale: ${stale.join(", ")}. A migration changed the database; run npm run db:schema.`,
      );
      process.exit(1);
    }
    console.log("[db] bank/schema.sql and docs/database.md are current.");
    return;
  }

  // Otherwise write them all.
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(file, content);
  }

  // Say what changed.
  console.log(
    stale.length
      ? `[db] Wrote ${stale.join(", ")}.`
      : "[db] No change: the schema files are current.",
  );
}

// Run only when started directly; an error prints its message and fails.
if (require.main === module) {
  main().catch((error) => {
    console.error(`[db] ${error.message}`);
    process.exit(1);
  });
}

// What the schema-files test uses.
module.exports = { buildSchemaFiles, staleFiles };
