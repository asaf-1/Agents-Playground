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
//   node bin/password.js --username asaf --generate
//   node bin/password.js --username dana --role user
//        (reads the password from RUNNER_PASSWORD)
//   node bin/password.js --username dana --password "..."
//        (avoid outside a scratch shell: it lands in shell history)

// Node's crypto, for the salt and the scrypt hash.
const crypto = require("node:crypto");

// Must match SCRYPT_PARAMS in src/auth.js. ~100ms and 16MB per verification,
// which is what prices offline cracking of a leaked account list out of reach.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
// The hash's length, and the salt's.
const KEYLEN = 64;
const SALT_BYTES = 16;

// What an account may be: a 3 to 32 character name, a 10 to 200 character
// password, and one of two roles.
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
const ROLES = ["admin", "user"];

// The help text.
function printHelp() {
  console.log(`Usage:
  node bin/password.js --username <name> [options]

Options:
  --username <name>   3-32 characters: letters, digits, dot, underscore, hyphen.
  --role <role>       admin or user. Default admin for the first account you make.
  --password <pw>     Prefer RUNNER_PASSWORD to keep it out of shell history.
  --generate          Invent a strong password and print it once.
  --help              Show this help.

Output is one line for TR_USERS. Add more accounts by repeating the command and
separating the lines with commas or newlines.`);
}

// Read the command line into options; an unknown argument or a missing value is
// an error.
function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    // --generate and --help are switches.
    if (argument === "--generate") {
      options.generate = true;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    // --username, --password and --role each take the next argument.
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

// The account's hash: a fresh random salt, then scrypt, written as
// scrypt$N$r$p$salt$key.
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

// Read the options, check each one, then print the account line.
function main() {
  let options;

  // Bad arguments: say why, show the help, stop.
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

  // The name must fit the pattern.
  const username = String(options.username || "").trim();

  if (!USERNAME_PATTERN.test(username)) {
    console.error(
      "--username is required: 3-32 characters, letters, digits, dot, underscore or hyphen.",
    );
    process.exit(1);
  }

  // The role: admin unless another is given.
  const role = String(options.role || "admin").toLowerCase();

  if (!ROLES.includes(role)) {
    console.error(`--role must be one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  // The password: --password, then RUNNER_PASSWORD, then a generated one.
  let password = options.password || process.env.RUNNER_PASSWORD || "";
  let generated = false;

  if (!password && options.generate) {
    // base64url of 18 bytes: 24 characters, nothing a shell will mangle.
    password = crypto.randomBytes(18).toString("base64url");
    generated = true;
  }

  // No password at all: stop.
  if (!password) {
    console.error(
      "No password given. Set RUNNER_PASSWORD, pass --password, or use --generate.",
    );
    process.exit(1);
  }

  // The password must be 10 to 200 characters.
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    console.error(
      `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters (got ${password.length}).`,
    );
    process.exit(1);
  }

  // Print the line for TR_USERS.
  console.log(`${username}:${role}:${hashPassword(password)}`);

  // A generated password is shown once, here.
  if (generated) {
    console.log("");
    console.log(`Password for ${username}: ${password}`);
    console.log("Shown once, stored nowhere. Hand it over securely.");
  }
}

// Run it; any error is printed and stops with exit code 1.
try {
  main();
} catch (error) {
  console.error(`[password] ${error.message}`);
  process.exit(1);
}
