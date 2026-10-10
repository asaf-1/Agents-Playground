// Typed client for Playground Bank's /api/bank/* endpoints. The session lives in
// an httpOnly cookie, so scripts never see the token; the browser sends it.
import { ApiError, request } from "./api";

export type BankRole = "customer" | "support" | "admin";
export type BankStatus = "active" | "locked";

export interface BankUser {
  id: string;
  email: string;
  fullName: string;
  role: BankRole;
  status: BankStatus;
  isDemo: boolean;
  createdAt: string;
}

export interface BankProfile {
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  updatedAt: string;
}

export const CURRENCIES = ["USD", "EUR", "GBP", "ILS"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const LOCALES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
] as const;
export type Locale = (typeof LOCALES)[number]["value"];

export interface BankSettings {
  currency: Currency;
  locale: Locale;
  emailAlerts: boolean;
  statementEmails: boolean;
}

export interface BankAccount {
  user: BankUser;
  profile: BankProfile;
  settings: BankSettings;
}

export interface BankUsersResponse {
  users: BankUser[];
  total: number;
}

export const ROLE_LABELS: Record<BankRole, string> = {
  customer: "Customer",
  support: "Support",
  admin: "Admin",
};

export const STATUS_LABELS: Record<BankStatus, string> = {
  active: "Active",
  locked: "Locked",
};

export const COUNTRIES = [
  "Australia",
  "Brazil",
  "Canada",
  "France",
  "Germany",
  "India",
  "Israel",
  "Italy",
  "Japan",
  "Mexico",
  "Netherlands",
  "Spain",
  "Sweden",
  "Switzerland",
  "United Kingdom",
  "United States",
];

function send(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

// null when nobody is signed in, instead of an error.
export async function getMe(): Promise<BankAccount | null> {
  try {
    return await request<BankAccount>("/api/bank/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function registerAccount(input: {
  fullName: string;
  email: string;
  password: string;
  acceptTerms: boolean;
}): Promise<BankAccount> {
  return request("/api/bank/register", send("POST", input));
}

export function bankLogin(
  email: string,
  password: string,
): Promise<BankAccount> {
  return request("/api/bank/login", send("POST", { email, password }));
}

export function bankLogout(): Promise<{ message: string }> {
  return request("/api/bank/logout", send("POST", {}));
}

export function updateProfile(
  fields: Partial<Omit<BankProfile, "updatedAt"> & { fullName: string }>,
): Promise<BankAccount> {
  return request("/api/bank/me/profile", send("PATCH", fields));
}

export function updateSettings(settings: BankSettings): Promise<BankAccount> {
  return request("/api/bank/me/settings", send("PUT", settings));
}

export function listBankUsers(): Promise<BankUsersResponse> {
  return request("/api/bank/admin/users");
}

export function updateBankUser(
  id: string,
  change: { role?: BankRole; status?: BankStatus },
): Promise<{ user: BankUser }> {
  return request(
    `/api/bank/admin/users/${encodeURIComponent(id)}`,
    send("PATCH", change),
  );
}

// --- Money -----------------------------------------------------------------
// Amounts travel as whole cents. Every money call forwards the page's runKey,
// so a test can arm a planted bug for itself only.

export type AccountKind = "checking" | "savings";
export type TransactionKind =
  | "opening"
  | "deposit"
  | "transfer_in"
  | "transfer_out";
export type HistoryType = "in" | "out" | "deposit" | "transfer";

export interface MoneyAccount {
  id: string;
  number: string;
  kind: AccountKind;
  name: string;
  balanceCents: number;
  createdAt: string;
}

export interface MoneyTransaction {
  id: string;
  accountId: string;
  kind: TransactionKind;
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  memo: string;
  counterparty: string;
  transferId: string | null;
  createdAt: string;
}

export interface TransactionsPage {
  transactions: MoneyTransaction[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface HistoryFilters {
  from?: string;
  to?: string;
  type?: HistoryType;
  minCents?: number;
  maxCents?: number;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountNumber: string;
  amountCents: number;
  memo: string;
  createdAt: string;
}

export interface TransferResult {
  transfer: Transfer;
  fromAccount: MoneyAccount;
  replayed: boolean;
}

export interface BankUserDetail {
  user: BankUser;
  profile: BankProfile;
  accounts: MoneyAccount[];
}

export const KIND_LABELS: Record<AccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
};

export const TRANSACTION_LABELS: Record<TransactionKind, string> = {
  opening: "Opening deposit",
  deposit: "Added funds",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

// "PB-1000-0001", plus the type when the name doesn't already say it.
export function accountMeta(
  account: Pick<MoneyAccount, "number" | "kind" | "name">,
): string {
  const kind = KIND_LABELS[account.kind];
  return account.name === kind ? account.number : `${account.number} · ${kind}`;
}

// The most one Add funds (or a new account's starting amount) can add.
export const MAX_TOP_UP_CENTS = 100_000_000;

function withRunKey(path: string, runKey: string, params = {}): string {
  const search = new URLSearchParams({ ...params, runKey });
  return `${path}?${search.toString()}`;
}

export function listMoneyAccounts(
  runKey: string,
): Promise<{ accounts: MoneyAccount[]; totalCents: number }> {
  return request(withRunKey("/api/bank/accounts", runKey));
}

export function getMoneyAccount(
  id: string,
  runKey: string,
): Promise<{ account: MoneyAccount }> {
  return request(
    withRunKey(`/api/bank/accounts/${encodeURIComponent(id)}`, runKey),
  );
}

export function openMoneyAccount(
  input: { kind: AccountKind; name?: string; openingCents: number },
  runKey: string,
): Promise<{ account: MoneyAccount }> {
  return request(withRunKey("/api/bank/accounts", runKey), send("POST", input));
}

export function addFunds(
  id: string,
  amountCents: number,
  runKey: string,
): Promise<{ account: MoneyAccount }> {
  return request(
    withRunKey(`/api/bank/accounts/${encodeURIComponent(id)}/deposits`, runKey),
    send("POST", { amountCents }),
  );
}

function historyParams(filters: HistoryFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.type) params.type = filters.type;
  if (filters.minCents !== undefined)
    params.minCents = String(filters.minCents);
  if (filters.maxCents !== undefined)
    params.maxCents = String(filters.maxCents);
  return params;
}

export function listTransactions(
  id: string,
  filters: HistoryFilters,
  page: number,
  runKey: string,
): Promise<TransactionsPage> {
  return request(
    withRunKey(
      `/api/bank/accounts/${encodeURIComponent(id)}/transactions`,
      runKey,
      { ...historyParams(filters), page: String(page) },
    ),
  );
}

export function statementUrl(
  id: string,
  filters: HistoryFilters,
  runKey: string,
): string {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  return withRunKey(
    `/api/bank/accounts/${encodeURIComponent(id)}/statement.csv`,
    runKey,
    params,
  );
}

export function recentActivity(
  runKey: string,
): Promise<{ transactions: MoneyTransaction[] }> {
  return request(withRunKey("/api/bank/activity", runKey));
}

export function makeTransfer(
  input: {
    fromAccountId: string;
    toAccountNumber: string;
    amountCents: number;
    memo: string;
  },
  idempotencyKey: string,
  runKey: string,
): Promise<TransferResult> {
  return request(withRunKey("/api/bank/transfers", runKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export function getBankUserDetail(id: string): Promise<BankUserDetail> {
  return request(`/api/bank/admin/users/${encodeURIComponent(id)}`);
}

// Shown in the currency and number format picked in Settings. The money
// itself has no currency: it's practice money.
export function formatMoney(
  cents: number,
  settings: Pick<BankSettings, "currency" | "locale"> | undefined,
): string {
  return new Intl.NumberFormat(settings?.locale ?? "en-US", {
    style: "currency",
    currency: settings?.currency ?? "USD",
  }).format(cents / 100);
}

// "1,250.5" -> 125050. Read as text, never through floating point, so every
// cent is exact. null when the text isn't an amount.
export function parseAmount(
  input: string,
  allowNegative = false,
): number | null {
  const value = input.trim().replace(/^\$/, "");
  const pattern = allowNegative
    ? /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/
    : /^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;
  if (!pattern.test(value)) {
    return null;
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/[-,]/g, "").split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : null;
}

// Bank times are shown in UTC, like an exchange: "2026-10-10 14:03".
export function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// The per-field messages a 400 answer carries, keyed by field name.
export function fieldErrors(error: unknown): Record<string, string> {
  if (
    error instanceof ApiError &&
    error.body &&
    typeof error.body === "object"
  ) {
    const errors = (error.body as { errors?: Record<string, string> }).errors;
    return errors ?? {};
  }
  return {};
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(iso),
  );
}
