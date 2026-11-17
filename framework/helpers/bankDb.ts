// The bank's own database layer and its migrations.
import { createDatabase } from "../../bank/db.js";
import { runMigrations } from "../../bank/migrate.js";
// A new user, and their two starter accounts.
import { createUser } from "../../bank/accounts.js";
import { listAccounts, openStarterAccounts } from "../../bank/money.js";
// A unique email and the shared test password.
import { PASSWORD, uniqueEmail } from "./bank";
// Adds a line to the running test's [RESULT] block.
import { fact } from "../fixtures/resultBlock";

// For tests that drive the bank's own modules with no server: a fresh
// Playground Bank database (PGlite, in memory, every migration applied), a
// customer in it, and a database whose "save the answer" step fails once.
// Used by tests/e2e/app/bank-retry-safety.spec.ts (feedback-fixes plan, Part 1).

// The bank's small database interface (bank/db.js): query, exec, transaction.
export type BankDb = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
  exec: (text: string) => Promise<unknown>;
  transaction: <T>(work: (tx: BankDb) => Promise<T>) => Promise<T>;
  close?: () => Promise<void>;
};

// A fresh bank. "" picks PGlite, so DATABASE_URL (Neon) is never touched.
export async function freshBank(): Promise<BankDb> {
  const db = (await createDatabase("")) as BankDb;
  await runMigrations(db);
  return db;
}

// A customer with their starter accounts; the first account is returned.
export async function newCustomer(db: BankDb) {
  const user = await createUser(db, {
    email: uniqueEmail("retry"),
    fullName: "Retry Customer",
    password: PASSWORD,
  });
  await openStarterAccounts(db, user.id);
  const [account] = await listAccounts(db, user.id);
  // The block shows whose money the test moves.
  fact("userId", user.id);
  fact("accountId", account.id);
  return { userId: user.id as string, accountId: account.id as string };
}

// One account's balance in cents, read fresh.
export async function balanceCents(
  db: BankDb,
  userId: string,
  accountId: string,
): Promise<number> {
  const accounts = await listAccounts(db, userId);
  const account = accounts.find((row: { id: string }) => row.id === accountId);
  return account.balanceCents as number;
}

// The statement bank/idempotency.js runs to keep a finished action's answer.
const SAVE_ANSWER = /UPDATE bank_idempotency_keys SET state = 'done'/;

// The database with that statement failing once, inside a transaction or out
// of one. `fired` turns true when it has failed.
export function failSaveOnce(db: BankDb): {
  db: BankDb;
  state: { fired: boolean };
} {
  const state = { fired: false };
  // Every runner (the database, and each transaction inside it) gets the trap.
  const wrap = (runner: BankDb): BankDb => ({
    ...runner,
    query: (text, params) => {
      if (!state.fired && SAVE_ANSWER.test(text)) {
        state.fired = true;
        fact("injected", "saving the answer failed once");
        return Promise.reject(new Error("saving the answer failed (injected)"));
      }
      return runner.query(text, params);
    },
    transaction: (work) => runner.transaction((tx) => work(wrap(tx))),
  });
  return { db: wrap(db), state };
}
