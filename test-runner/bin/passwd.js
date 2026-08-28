#!/usr/bin/env node
// Generates a test runner account entry.
//
// Prints one line: `username:role:scrypt$...`. Put those lines in TR_USERS (or
// in the file named by TR_USERS_FILE). The plaintext password is never stored
// by this script and never leaves your terminal.
//
// Deliberately standalone: it implements the hash format directly rather than
// importing src/auth.js, so generating credentials never depends on the app
// booting, its config being valid, or a store being writable. The format is the
// contract, and it is documented here and in auth.js.
//
//   scrypt$N$r$p$<salt base64>$<derived key base64>
//
// Usage:
//   node bin/passwd.js --username asaf --generate
//   node bin/passwd.js --username dana --role user
//        (reads the password from RUNNER_PASSWORD)
//   node bin/passwd.js --username dana --password "..."
//        (avoid outside a scratch shell: it lands in shell history)

const crypto = require("node:crypto");

// Must match SCRYPT_PARAMS in src/auth.js. ~100ms and 16MB per verification,
// which is what prices offline cracking of a leaked account list out of reach.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;
const SALT_BYTES = 16;

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
const ROLES = ["admin", "user"];

function printHelp() {
  console.log(`Usage:
  node bin/passwd.js --username <name> [options]

Options:
  --username <name>   3-32 characters: letters, digits, dot, underscore, hyphen.
  --role <role>       admin or user. Default admin for the first account you make.
  --password <pw>     Prefer RUNNER_PASSWORD to keep it out of shell history.
  --generate          Invent a strong password and print it once.
  --help              Show this help.

Output is one line for TR_USERS. Add more accounts by repeating the command and
separating the lines with commas or newlines.`);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--generate") {
      options.generate = true;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (["--username", "--password", "--role"].includes(argument)) {
      const value = argv[index + 1];

      if (value === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }

      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, KEYLEN, SCRYPT_PARAMS);

  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    return;
  }

  const username = String(options.username || "").trim();

  if (!USERNAME_PATTERN.test(username)) {
    console.error(
      "--username is required: 3-32 characters, letters, digits, dot, underscore or hyphen.",
    );
    process.exit(1);
  }

  const role = String(options.role || "admin").toLowerCase();

  if (!ROLES.includes(role)) {
    console.error(`--role must be one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  let password = options.password || process.env.RUNNER_PASSWORD || "";
  let generated = false;

  if (!password && options.generate) {
    // base64url of 18 bytes: 24 characters, nothing a shell will mangle.
    password = crypto.randomBytes(18).toString("base64url");
    generated = true;
  }

  if (!password) {
    console.error(
      "No password given. Set RUNNER_PASSWORD, pass --password, or use --generate.",
    );
    process.exit(1);
  }

  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    console.error(
      `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters (got ${password.length}).`,
    );
    process.exit(1);
  }

  console.log(`${username}:${role}:${hashPassword(password)}`);

  if (generated) {
    console.log("");
    console.log(`Password for ${username}: ${password}`);
    console.log("Shown once, stored nowhere. Hand it over securely.");
  }
}

try {
  main();
} catch (error) {
  console.error(`[passwd] ${error.message}`);
  process.exit(1);
}
