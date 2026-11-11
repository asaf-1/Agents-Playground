// Typed client for Playground Bank's /api/bank/* endpoints. The session lives in
// an httpOnly cookie, so scripts never see the token; the browser sends it.

// The shared call helper, and its error type.
import { ApiError, request } from "./api";

// A bank user's role, and whether they can sign in.
export type BankRole = "customer" | "support" | "admin";
export type BankStatus = "active" | "locked";

// A bank user, as the server sends it.
export interface BankUser {
  id: string;
  email: string;
  fullName: string;
  role: BankRole;
  status: BankStatus;
  isDemo: boolean;
  createdAt: string;
}

// The customer's contact details, from Edit profile.
export interface BankProfile {
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  updatedAt: string;
}

// The currencies and number formats Settings offers.
export const CURRENCIES = ["USD", "EUR", "GBP", "ILS"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const LOCALES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
] as const;
export type Locale = (typeof LOCALES)[number]["value"];

// The customer's choices in Settings.
export interface BankSettings {
  currency: Currency;
  locale: Locale;
  emailAlerts: boolean;
  statementEmails: boolean;
}

// Everything about the signed-in customer: who they are, their profile and
// their settings.
export interface BankAccount {
  user: BankUser;
  profile: BankProfile;
  settings: BankSettings;
}

// The admin's user list: the users and how many.
export interface BankUsersResponse {
  users: BankUser[];
  total: number;
}

// The words the pages show for each role and status.
export const ROLE_LABELS: Record<BankRole, string> = {
  customer: "Customer",
  support: "Support",
  admin: "Admin",
};

export const STATUS_LABELS: Record<BankStatus, string> = {
  active: "Active",
  locked: "Locked",
};

// The countries the profile form offers.
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

// A call's method and its JSON body.
function send(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

// null when nobody is signed in, instead of an error.
export async function getMe(): Promise<BankAccount | null> {
  // Ask who is signed in; a 401 means nobody, anything else is a real error.
  try {
    return await request<BankAccount>("/api/bank/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

// Open a new bank account; the answer is the signed-in customer.
export function registerAccount(input: {
  fullName: string;
  email: string;
  password: string;
  acceptTerms: boolean;
}): Promise<BankAccount> {
  return request("/api/bank/register", send("POST", input));
}

// Sign in with an email and a password.
export function bankLogin(
  email: string,
  password: string,
): Promise<BankAccount> {
  return request("/api/bank/login", send("POST", { email, password }));
}

// Sign out of this browser.
export function bankLogout(): Promise<{ message: string }> {
  return request("/api/bank/logout", send("POST", {}));
}

// --- Devices (the security pack) -------------------------------------------
// Every browser signed in to the account. Sessions are named by id; the page
// never sees a token.

// One browser signed in to the account, and whether it is this one.
export interface BankSession {
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

// The Devices list: every session, and how many.
export interface BankSessionsResponse {
  sessions: BankSession[];
  total: number;
}

// Every browser signed in to the account.
export function listSessions(): Promise<BankSessionsResponse> {
  return request("/api/bank/sessions");
}

// Sign out one browser by its session id.
export function endSession(
  id: string,
): Promise<{ ended: boolean; current: boolean }> {
  return request(`/api/bank/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// Forwards the run key so practice mode can arm bankEndOthersKeepsOne for one
// visitor only.
export function endOtherSessions(runKey: string): Promise<{ ended: number }> {
  return request(
    withRunKey("/api/bank/sessions/end-others", runKey),
    send("POST", {}),
  );
}

// Save changes to the name or contact details.
export function updateProfile(
  fields: Partial<Omit<BankProfile, "updatedAt"> & { fullName: string }>,
): Promise<BankAccount> {
  return request("/api/bank/me/profile", send("PATCH", fields));
}

// Save the Settings choices.
export function updateSettings(settings: BankSettings): Promise<BankAccount> {
  return request("/api/bank/me/settings", send("PUT", settings));
}

// Admin: every bank user.
export function listBankUsers(): Promise<BankUsersResponse> {
  return request("/api/bank/admin/users");
}

// Admin: change a user's role, or lock or unlock them.
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

// What an account is, what a history line can be, and the history filter's
// types.
export type AccountKind = "checking" | "savings";
export type TransactionKind =
  | "opening"
  | "deposit"
  | "transfer_in"
  | "transfer_out"
  | "bill_payment"
  | "loan_disbursement"
  | "card_purchase";
export type HistoryType =
  "in" | "out" | "deposit" | "transfer" | "bill" | "loan";

// One money account and its balance in cents.
export interface MoneyAccount {
  id: string;
  number: string;
  kind: AccountKind;
  name: string;
  balanceCents: number;
  createdAt: string;
}

// One line in an account's history, with the balance after it.
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

// One page of an account's history.
export interface TransactionsPage {
  transactions: MoneyTransaction[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// The history filters: dates, type and an amount range.
export interface HistoryFilters {
  from?: string;
  to?: string;
  type?: HistoryType;
  minCents?: number;
  maxCents?: number;
}

// One transfer, as the server stored it.
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountNumber: string;
  amountCents: number;
  memo: string;
  createdAt: string;
}

// A transfer's answer: the transfer, the new balance, and whether it was a
// replay of the same key.
export interface TransferResult {
  transfer: Transfer;
  fromAccount: MoneyAccount;
  replayed: boolean;
}

// Admin: one user with their profile, accounts and cards.
export interface BankUserDetail {
  user: BankUser;
  profile: BankProfile;
  accounts: MoneyAccount[];
  cards: BankCard[];
}

// The words the pages show for each account kind and history line.
export const KIND_LABELS: Record<AccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
};

export const TRANSACTION_LABELS: Record<TransactionKind, string> = {
  opening: "Opening deposit",
  deposit: "Added funds",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  bill_payment: "Bill payment",
  loan_disbursement: "Loan",
  card_purchase: "Card purchase",
};

// "PB-1000-0001", plus the type when the name doesn't already say it.
export function accountMeta(
  account: Pick<MoneyAccount, "number" | "kind" | "name">,
): string {
  // The account's kind, then its number, with the kind added when the name is
  // something else.
  const kind = KIND_LABELS[account.kind];
  return account.name === kind ? account.number : `${account.number} · ${kind}`;
}

// The most one Add funds (or a new account's starting amount) can add.
export const MAX_TOP_UP_CENTS = 100_000_000;

// Same rule as `query` in api.ts: "app" is the default run key and is left out,
// so the server reads the qa_runkey cookie instead and practice mode applies.
// A test's own run key is passed through and wins.
export function withRunKey(path: string, runKey: string, params = {}): string {
  // Add the params, and the runKey unless it is "app".
  const search = new URLSearchParams(
    runKey && runKey !== "app" ? { ...params, runKey } : { ...params },
  );
  // The path, with ?query only when there is one.
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

// The customer's accounts and their total.
export function listMoneyAccounts(
  runKey: string,
): Promise<{ accounts: MoneyAccount[]; totalCents: number }> {
  return request(withRunKey("/api/bank/accounts", runKey));
}

// One account.
export function getMoneyAccount(
  id: string,
  runKey: string,
): Promise<{ account: MoneyAccount }> {
  return request(
    withRunKey(`/api/bank/accounts/${encodeURIComponent(id)}`, runKey),
  );
}

// Open a checking or savings account with a starting amount.
export function openMoneyAccount(
  input: { kind: AccountKind; name?: string; openingCents: number },
  runKey: string,
): Promise<{ account: MoneyAccount }> {
  return request(withRunKey("/api/bank/accounts", runKey), send("POST", input));
}

// Add money to an account (practice money).
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

// The history filters as query values, leaving out the empty ones.
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

// One page of an account's history, filtered.
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

// The address of the account's statement as a CSV file, for the chosen dates.
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

// The latest lines across all the customer's accounts.
export function recentActivity(
  runKey: string,
): Promise<{ transactions: MoneyTransaction[] }> {
  return request(withRunKey("/api/bank/activity", runKey));
}

// Send money to an account number. The Idempotency-Key makes a second send of
// the same transfer a replay, not a second payment.
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

// Admin: one user in full.
export function getBankUserDetail(id: string): Promise<BankUserDetail> {
  return request(`/api/bank/admin/users/${encodeURIComponent(id)}`);
}

// --- Bill pay and loans (phase 2b-2) -----------------------------------------

// A saved bill payee: a name and the customer's reference with them.
export interface Payee {
  id: string;
  name: string;
  reference: string;
  createdAt: string;
}

// One bill paid, with the payee it went to.
export interface BillPayment {
  id: string;
  accountId: string;
  payeeId: string;
  payeeName: string;
  payeeReference: string;
  amountCents: number;
  memo: string;
  createdAt: string;
}

// A loan ask's status, and the terms on offer in months.
export type LoanStatus = "pending" | "approved" | "rejected";
export const LOAN_TERMS = [12, 24, 36, 60] as const;
export type LoanTerm = (typeof LOAN_TERMS)[number];

// One month of a loan's repayment schedule.
export interface ScheduleRow {
  month: number;
  paymentCents: number;
  principalCents: number;
  interestCents: number;
  balanceCents: number;
}

// Why this customer was offered this rate. The bank publishes no rate card:
// an offer is worked out from what it can see of the customer, so the same ask
// costs two people different amounts, and one person's offer moves as their
// balance does.
export interface RateReasons {
  /** Where the curve starts for this term. Longer money costs more. */
  termBp: number;
  /** Taken off for standing: balances, time here, earlier loans, activity. */
  discountBp: number;
  /** Added for how big this ask is next to what they already hold. */
  exposureBp: number;
  /** Standing, 0 to 1. */
  score: number;
  /** This ask against their own money, 0 to 1. */
  exposure: number;
  balanceCents: number;
  tenureDays: number;
  loansApproved: number;
  loansRejected: number;
  transactions: number;
}

// What a loan would cost: the rate, the monthly payment, the totals, the
// schedule, and why.
export interface LoanQuote {
  amountCents: number;
  termMonths: number;
  aprBasisPoints: number;
  monthlyPaymentCents: number;
  totalInterestCents: number;
  totalRepaidCents: number;
  schedule: ScheduleRow[];
  rate: RateReasons;
}

// One loan ask, with the customer for staff.
export interface Loan {
  id: string;
  accountId: string;
  accountNumber: string;
  amountCents: number;
  termMonths: number;
  aprBasisPoints: number;
  monthlyPaymentCents: number;
  totalInterestCents: number;
  purpose: string;
  status: LoanStatus;
  decisionNote: string;
  decidedAt: string | null;
  createdAt: string;
  customer?: { id: string; fullName: string; email: string; isDemo: boolean };
}

// The words the pages show for each loan status.
export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

// The smallest and largest loan, in cents.
export const MIN_LOAN_CENTS = 100_000;
export const MAX_LOAN_CENTS = 100_000_000;

// 590 -> "5.90%"
export function formatApr(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

// The customer's saved payees.
export function listPayees(runKey: string): Promise<{ payees: Payee[] }> {
  return request(withRunKey("/api/bank/payees", runKey));
}

// Save a payee.
export function addPayee(
  input: { name: string; reference: string },
  runKey: string,
): Promise<{ payee: Payee }> {
  return request(withRunKey("/api/bank/payees", runKey), send("POST", input));
}

// Remove a payee.
export function deletePayee(
  id: string,
  runKey: string,
): Promise<{ message: string; payee: Payee }> {
  return request(
    withRunKey(`/api/bank/payees/${encodeURIComponent(id)}`, runKey),
    send("DELETE", {}),
  );
}

// The bills paid so far.
export function listBillPayments(
  runKey: string,
): Promise<{ payments: BillPayment[] }> {
  return request(withRunKey("/api/bank/bill-payments", runKey));
}

// --- Scheduled payments and the customer's clock (phase A2) -----------------
// Dates are UTC calendar days as "YYYY-MM-DD". A due payment runs the next
// time the customer shows up, or when they move their clock.

// How often a scheduled payment repeats, and its status.
export type RepeatKind = "once" | "weekly" | "monthly";
export const REPEATS: { value: RepeatKind; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];
export type ScheduledStatus = "active" | "done" | "failed" | "cancelled";

// One scheduled bill payment, when it runs next, and how its runs went.
export interface ScheduledPayment {
  id: string;
  accountId: string;
  accountName: string;
  payeeId: string;
  payeeName: string;
  payeeReference: string;
  amountCents: number;
  memo: string;
  repeat: RepeatKind;
  /** The scheduled date. */
  nextDue: string;
  /** The day it runs: the Monday after, when nextDue is a weekend. */
  runsOn: string;
  status: ScheduledStatus;
  runs: number;
  lastRunOn: string | null;
  lastResult: "paid" | "failed" | null;
  createdAt: string;
}

// The customer's clock: the real date, how far it has been moved, and the date
// it shows.
export interface BankClock {
  realToday: string;
  offsetDays: number;
  today: string;
}

// The customer's date today.
export function getClock(runKey: string): Promise<BankClock> {
  return request(withRunKey("/api/bank/clock", runKey));
}

// Move the customer's clock forward; payments that fall due run.
export function advanceClock(days: number, runKey: string): Promise<BankClock> {
  return request(
    withRunKey("/api/bank/clock/advance", runKey),
    send("POST", { days }),
  );
}

// Put the clock back to the real date.
export function resetClock(runKey: string): Promise<BankClock> {
  return request(withRunKey("/api/bank/clock/reset", runKey), send("POST", {}));
}

// The scheduled payments, with the date they are measured from.
export function listScheduledPayments(
  runKey: string,
): Promise<{ payments: ScheduledPayment[]; today: string }> {
  return request(withRunKey("/api/bank/scheduled-payments", runKey));
}

// Schedule a bill payment: once, weekly or monthly, from a first date.
export function createScheduledPayment(
  input: {
    fromAccountId: string;
    payeeId: string;
    amountCents: number;
    memo: string;
    repeat: RepeatKind;
    firstDue: string;
  },
  runKey: string,
): Promise<{ payment: ScheduledPayment; today: string }> {
  return request(
    withRunKey("/api/bank/scheduled-payments", runKey),
    send("POST", input),
  );
}

// Cancel a scheduled payment.
export function cancelScheduledPayment(
  id: string,
  runKey: string,
): Promise<{ payment: ScheduledPayment }> {
  return request(
    withRunKey(
      `/api/bank/scheduled-payments/${encodeURIComponent(id)}`,
      runKey,
    ),
    { method: "DELETE" },
  );
}

// --- Cards (phase A3) --------------------------------------------------------
// One virtual debit card per account. The list never carries the full number;
// the details call does, on request.

// A card is active or frozen; a declined charge says why.
export type CardStatus = "active" | "frozen";
export type ChargeReason = "frozen" | "over_limit" | "insufficient_funds";

// One virtual card: its account, the last 4 digits, its status and its daily
// limit.
export interface BankCard {
  id: string;
  userId: string;
  accountId: string;
  accountName: string;
  accountNumber: string;
  last4: string;
  expires: string;
  status: CardStatus;
  frozenBy: "customer" | "admin" | null;
  limitCents: number;
  spentTodayCents: number;
  createdAt: string;
}

// The card's full number, expiry and CVV, sent only when asked for.
export interface BankCardDetails {
  number: string;
  expires: string;
  cvv: string;
}

// One charge on a card, approved or declined.
export interface CardCharge {
  id: string;
  cardId: string;
  merchant: string;
  amountCents: number;
  status: "approved" | "declined";
  reason: ChargeReason | null;
  reasonText: string | null;
  chargedOn: string;
  createdAt: string;
}

// Simulated merchants to pay. Names only; every amount is the customer's.
export const MERCHANTS = [
  "Corner Grocery",
  "Metro Transit",
  "Cloud Coffee",
  "Bay Books",
  "Night Market",
  "Gear Shop",
];

// The customer's cards, and the date the daily limits count from.
export function listCards(
  runKey: string,
): Promise<{ cards: BankCard[]; today: string }> {
  return request(withRunKey("/api/bank/cards", runKey));
}

// Issue a card for an account.
export function createCard(
  accountId: string,
  runKey: string,
): Promise<{ card: BankCard }> {
  return request(
    withRunKey("/api/bank/cards", runKey),
    send("POST", { accountId }),
  );
}

// The card's full details.
export function cardDetails(
  id: string,
  runKey: string,
): Promise<BankCardDetails> {
  return request(
    withRunKey(`/api/bank/cards/${encodeURIComponent(id)}/details`, runKey),
  );
}

// Freeze or unfreeze a card, or change its daily limit.
export function updateCard(
  id: string,
  change: { status?: CardStatus; limitCents?: number },
  runKey: string,
): Promise<{ card: BankCard }> {
  return request(
    withRunKey(`/api/bank/cards/${encodeURIComponent(id)}`, runKey),
    send("PATCH", change),
  );
}

// Pay a merchant with the card.
export function chargeCard(
  id: string,
  input: { merchant: string; amountCents: number },
  runKey: string,
): Promise<{ charge: CardCharge; card: BankCard }> {
  return request(
    withRunKey(`/api/bank/cards/${encodeURIComponent(id)}/charges`, runKey),
    send("POST", input),
  );
}

// A card's charges.
export function listCardCharges(
  id: string,
  runKey: string,
): Promise<{ charges: CardCharge[] }> {
  return request(
    withRunKey(`/api/bank/cards/${encodeURIComponent(id)}/charges`, runKey),
  );
}

// Admin only.
export function adminUpdateCard(
  id: string,
  status: CardStatus,
): Promise<{ card: BankCard }> {
  return request(
    `/api/bank/admin/cards/${encodeURIComponent(id)}`,
    send("PATCH", { status }),
  );
}

// --- API keys (phase A5) -----------------------------------------------------
// Managed with the session only. The token comes back once, on creation.

// What a key may do: only read, or read and write.
export type KeyScope = "read" | "write";

// One API key; only its first characters are ever shown again.
export interface ApiKey {
  id: string;
  name: string;
  scope: KeyScope;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

// The customer's keys, the rate limit, and how many may be active.
export function listApiKeys(): Promise<{
  keys: ApiKey[];
  rateLimitPerMinute: number;
  maxActiveKeys: number;
}> {
  return request("/api/bank/keys");
}

// Make a key; the answer holds the full token, this one time only.
export function createApiKey(input: {
  name: string;
  scope: KeyScope;
}): Promise<{ key: ApiKey; token: string }> {
  return request("/api/bank/keys", send("POST", input));
}

// Revoke a key.
export function revokeApiKey(id: string): Promise<{ key: ApiKey }> {
  return request(`/api/bank/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// The weekday of a "YYYY-MM-DD" day, in UTC, for the schedule table.
export function weekdayOf(day: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

// Pay a bill now. The Idempotency-Key makes a second send of the same payment a
// replay.
export function payBill(
  input: {
    fromAccountId: string;
    payeeId: string;
    amountCents: number;
    memo: string;
  },
  idempotencyKey: string,
  runKey: string,
): Promise<{
  payment: BillPayment;
  fromAccount: MoneyAccount;
  replayed: boolean;
}> {
  return request(withRunKey("/api/bank/bill-payments", runKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

// What a loan of this amount and term would cost this customer.
export function loanQuote(
  amountCents: number,
  termMonths: number,
  runKey: string,
): Promise<LoanQuote> {
  return request(
    withRunKey("/api/bank/loans/quote", runKey, {
      amountCents: String(amountCents),
      termMonths: String(termMonths),
    }),
  );
}

// The customer's loan asks.
export function listLoans(runKey: string): Promise<{ loans: Loan[] }> {
  return request(withRunKey("/api/bank/loans", runKey));
}

// Ask for a loan into an account.
export function requestLoan(
  input: {
    accountId: string;
    amountCents: number;
    termMonths: number;
    purpose: string;
  },
  runKey: string,
): Promise<{ loan: Loan }> {
  return request(withRunKey("/api/bank/loans", runKey), send("POST", input));
}

// One loan ask and its repayment schedule.
export function getLoan(
  id: string,
  runKey: string,
): Promise<{ loan: Loan; schedule: ScheduleRow[] }> {
  return request(
    withRunKey(`/api/bank/loans/${encodeURIComponent(id)}`, runKey),
  );
}

// Staff: every loan ask, or only those with one status.
export function listStaffLoans(
  status: LoanStatus | undefined,
): Promise<{ loans: Loan[]; total: number }> {
  return request(
    status ? `/api/bank/admin/loans?status=${status}` : "/api/bank/admin/loans",
  );
}

// Staff: approve or reject a loan ask, with a note.
export function decideLoan(
  id: string,
  decision: "approve" | "reject",
  note: string,
): Promise<{ loan: Loan }> {
  return request(
    `/api/bank/admin/loans/${encodeURIComponent(id)}`,
    send("PATCH", { decision, note }),
  );
}

// --- Connected flows: notifications, requests, support (phase 2c) ------------

// Every kind of notification the server can send (the same list as the
// database's bank_notifications_kind_check). The bell has an icon for each.
export type NotificationKind =
  | "money_received"
  | "loan_decided"
  | "account_changed"
  | "request_received"
  | "request_answered"
  | "support_reply"
  | "support_solved"
  | "welcome"
  | "scheduled_paid"
  | "scheduled_failed"
  | "card_declined"
  | "order_filled"
  | "order_failed"
  | "price_alert"
  | "shop_order"
  | "shop_order_status"
  | "shop_refund";

// One notification, and where its link goes.
export interface BankNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  amountCents: number | null;
  read: boolean;
  createdAt: string;
}

// A money request's status.
export type RequestStatus = "pending" | "paid" | "declined" | "cancelled";

// One money request, asked or received.
export interface MoneyRequest {
  id: string;
  amountCents: number;
  memo: string;
  status: RequestStatus;
  requesterName: string;
  toAccountNumber: string;
  payerAccountNumber: string;
  transferId: string | null;
  answeredAt: string | null;
  createdAt: string;
}

// A support ticket's status.
export type TicketStatus = "open" | "answered" | "solved";

// One support ticket, and the history line it is about, if any.
export interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  transactionId: string | null;
  transactionDescription: string | null;
  customer: { id: string; fullName: string; email: string; isDemo: boolean };
  createdAt: string;
  updatedAt: string;
}

// One message in a ticket, from the customer or from staff.
export interface TicketMessage {
  id: string;
  body: string;
  authorName: string;
  fromStaff: boolean;
  createdAt: string;
}

// The words the pages show for each request and ticket status.
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Waiting",
  paid: "Paid",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  answered: "Answered",
  solved: "Solved",
};

// The customer's notifications, and how many are unread.
export function listNotifications(
  runKey: string,
): Promise<{ notifications: BankNotification[]; unread: number }> {
  return request(withRunKey("/api/bank/notifications", runKey));
}

// Mark one notification as read.
export function markNotificationRead(
  id: string,
  runKey: string,
): Promise<{ notification: BankNotification }> {
  return request(
    withRunKey(
      `/api/bank/notifications/${encodeURIComponent(id)}/read`,
      runKey,
    ),
    send("POST", {}),
  );
}

// Mark every notification as read.
export function markAllNotificationsRead(
  runKey: string,
): Promise<{ marked: number }> {
  return request(
    withRunKey("/api/bank/notifications/read-all", runKey),
    send("POST", {}),
  );
}

// Money requests: the ones asked of the customer, and the ones they sent.
export function listRequests(
  runKey: string,
): Promise<{ incoming: MoneyRequest[]; outgoing: MoneyRequest[] }> {
  return request(withRunKey("/api/bank/requests", runKey));
}

// Ask another account for money.
export function askForMoney(
  input: {
    toAccountId: string;
    fromAccountNumber: string;
    amountCents: number;
    memo: string;
  },
  runKey: string,
): Promise<{ request: MoneyRequest }> {
  return request(withRunKey("/api/bank/requests", runKey), send("POST", input));
}

// Pay a request from one of the customer's accounts; the Idempotency-Key stops
// a double payment.
export function payRequest(
  id: string,
  fromAccountId: string,
  idempotencyKey: string,
  runKey: string,
): Promise<{ request: MoneyRequest; fromAccount: MoneyAccount }> {
  return request(
    withRunKey(`/api/bank/requests/${encodeURIComponent(id)}/pay`, runKey),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ fromAccountId }),
    },
  );
}

// Decline a request asked of you, or cancel one you sent.
export function answerRequest(
  id: string,
  action: "decline" | "cancel",
  runKey: string,
): Promise<{ request: MoneyRequest }> {
  return request(
    withRunKey(
      `/api/bank/requests/${encodeURIComponent(id)}/${action}`,
      runKey,
    ),
    send("POST", {}),
  );
}

// The customer's support tickets.
export function listMyTickets(
  runKey: string,
): Promise<{ tickets: SupportTicket[] }> {
  return request(withRunKey("/api/bank/support", runKey));
}

// Open a ticket, about a history line if one is picked.
export function openTicket(
  input: { subject: string; body: string; transactionId?: string },
  runKey: string,
): Promise<{ ticket: SupportTicket }> {
  return request(withRunKey("/api/bank/support", runKey), send("POST", input));
}

// One ticket and its messages.
export function getTicket(
  id: string,
  runKey: string,
): Promise<{ ticket: SupportTicket; messages: TicketMessage[] }> {
  return request(
    withRunKey(`/api/bank/support/${encodeURIComponent(id)}`, runKey),
  );
}

// Add a message to a ticket.
export function replyToTicket(
  id: string,
  body: string,
  runKey: string,
): Promise<{ ticket: SupportTicket; messages: TicketMessage[] }> {
  return request(
    withRunKey(`/api/bank/support/${encodeURIComponent(id)}/messages`, runKey),
    send("POST", { body }),
  );
}

// Mark a ticket solved.
export function solveTicket(
  id: string,
  runKey: string,
): Promise<{ ticket: SupportTicket }> {
  return request(
    withRunKey(`/api/bank/support/${encodeURIComponent(id)}`, runKey),
    send("PATCH", { status: "solved" }),
  );
}

// Staff: every ticket, or only those with one status.
export function listInbox(
  status: TicketStatus | undefined,
): Promise<{ tickets: SupportTicket[]; total: number }> {
  return request(
    status
      ? `/api/bank/admin/support?status=${status}`
      : "/api/bank/admin/support",
  );
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
  // Drop a leading $, then refuse anything that isn't an amount with up to 2
  // decimals (and a minus only when allowed).
  const value = input.trim().replace(/^\$/, "");
  const pattern = allowNegative
    ? /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/
    : /^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;
  if (!pattern.test(value)) {
    return null;
  }
  // Whole dollars and cents, turned into whole cents.
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/[-,]/g, "").split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  // Only a number that fits a safe whole number.
  return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : null;
}

// Bank times are shown in UTC, like an exchange: "2026-10-10 14:03".
export function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

// Today's date in UTC, as "YYYY-MM-DD".
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// The per-field messages a 400 answer carries, keyed by field name.
export function fieldErrors(error: unknown): Record<string, string> {
  // Only an API error with a body can carry field messages.
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

// A date written out in full, in the given locale.
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(iso),
  );
}

// --- The gear shop ("a more real back end", phase 2) --------------------------

// A product as the bank's shop API sends it: the price in cents, real stock.
export interface ShopProduct {
  id: string;
  name: string;
  category: string;
  listPriceCents: number;
  stock: number;
  status: "Available" | "Backordered";
  updatedAt: string;
}

// The customer's loyalty tier: what they have spent, the share off now, and
// the next tier up (null at the top).
export interface Loyalty {
  spentCents: number;
  basisPoints: number;
  next: { atCents: number; basisPoints: number } | null;
}

// One product with what the signed-in customer would pay; the extra fields are
// missing when nobody is signed in.
export interface ShopProductDetail {
  product: ShopProduct;
  loyalty?: Loyalty;
  yourPriceCents?: number;
  inCart?: number;
}

// One product in the cart, and whether it can be bought as it is.
export interface CartLine {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  stock: number;
  status: "Available" | "Backordered";
  buyable: boolean;
}

// The cart, priced at the customer's tier.
export interface Cart {
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  discountBasisPoints: number;
  discountCents: number;
  totalCents: number;
  loyalty: Loyalty;
}

// An order's step: forward one at a time, or refunded.
export type ShopOrderStatus =
  "placed" | "packed" | "shipped" | "delivered" | "refunded";

// The words each step shows.
export const SHOP_STATUS_LABELS: Record<ShopOrderStatus, string> = {
  placed: "Placed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  refunded: "Refunded",
};

// One product in an order, at the price it was bought for.
export interface ShopOrderLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

// One step an order took, who took it and when.
export interface ShopOrderEvent {
  status: ShopOrderStatus;
  note: string;
  actorName: string | null;
  actorRole: BankRole | null;
  createdAt: string;
}

// An order. A list sends it without lines and events; one order sends both.
export interface ShopOrder {
  id: string;
  number: string;
  status: ShopOrderStatus;
  nextStatus: ShopOrderStatus | null;
  userId: string;
  customer: { fullName: string; email: string };
  accountId: string;
  accountNumber: string;
  itemCount: number;
  subtotalCents: number;
  discountBasisPoints: number;
  discountCents: number;
  totalCents: number;
  refundedCents: number;
  createdAt: string;
  updatedAt: string;
  lines?: ShopOrderLine[];
  events?: ShopOrderEvent[];
}

// A share in basis points as a percent: 200 -> "2%".
export function formatShare(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}

// A new Idempotency-Key for one attempt at a payment.
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

// One product with the signed-in customer's price.
export function getShopProduct(id: string): Promise<ShopProductDetail> {
  return request(`/api/bank/shop/products/${encodeURIComponent(id)}`);
}

// The customer's cart.
export function getCart(): Promise<Cart> {
  return request("/api/bank/shop/cart");
}

// Put a product in the cart, on top of any already there.
export function addToCart(
  productId: string,
  quantity: number,
  runKey: string,
): Promise<Cart> {
  return request(
    withRunKey("/api/bank/shop/cart", runKey),
    send("POST", { productId, quantity }),
  );
}

// Set how many of a product are in the cart; 0 takes it out.
export function setCartQuantity(
  productId: string,
  quantity: number,
  runKey: string,
): Promise<Cart> {
  return request(
    withRunKey(`/api/bank/shop/cart/${encodeURIComponent(productId)}`, runKey),
    send("PATCH", { quantity }),
  );
}

// Pay for the cart. expectedTotalCents is the total the page showed; the
// Idempotency-Key makes a second click a replay, not a second payment.
export function checkout(
  input: { accountId: string; expectedTotalCents: number },
  idempotencyKey: string,
  runKey: string,
): Promise<{ order: ShopOrder; account: MoneyAccount }> {
  return request(withRunKey("/api/bank/shop/checkout", runKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

// The customer's orders, and one of them in full.
export function listMyShopOrders(): Promise<{
  orders: ShopOrder[];
  total: number;
}> {
  return request("/api/bank/shop/orders");
}

export function getMyShopOrder(id: string): Promise<{ order: ShopOrder }> {
  return request(`/api/bank/shop/orders/${encodeURIComponent(id)}`);
}

// --- The shop's back office (phase 3) -----------------------------------------

// Staff: every order, optionally one status.
export function listStaffShopOrders(
  status: ShopOrderStatus | undefined,
): Promise<{ orders: ShopOrder[]; total: number }> {
  return request(
    status
      ? `/api/bank/admin/shop/orders?status=${status}`
      : "/api/bank/admin/shop/orders",
  );
}

// Staff: one order in full.
export function getStaffShopOrder(id: string): Promise<{ order: ShopOrder }> {
  return request(`/api/bank/admin/shop/orders/${encodeURIComponent(id)}`);
}

// Admin: move an order to its next step.
export function advanceShopOrder(
  id: string,
  status: ShopOrderStatus,
  runKey: string,
): Promise<{ order: ShopOrder }> {
  return request(
    withRunKey(`/api/bank/admin/shop/orders/${encodeURIComponent(id)}`, runKey),
    send("PATCH", { status }),
  );
}

// Admin: refund an order, once per Idempotency-Key.
export function refundShopOrder(
  id: string,
  idempotencyKey: string,
  runKey: string,
): Promise<{ order: ShopOrder }> {
  return request(
    withRunKey(
      `/api/bank/admin/shop/orders/${encodeURIComponent(id)}/refund`,
      runKey,
    ),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: "{}",
    },
  );
}

// Admin: set how many of a product are in stock.
export function restockProduct(
  id: string,
  stock: number,
): Promise<{ product: ShopProduct }> {
  return request(
    `/api/bank/admin/shop/products/${encodeURIComponent(id)}`,
    send("PATCH", { stock }),
  );
}

// --- The audit log and the books (phase 4) --------------------------------------

// One line of the audit log.
export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string;
  actorRole: BankRole;
  action: string;
  targetType: string;
  targetId: string;
  door: "rest" | "graphql";
  auth: "session" | "api_key";
  requestId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

// One page of the log, and where the next one starts.
export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  hasNextPage: boolean;
  nextCursor: string | null;
  actions: string[];
}

// The log's filters.
export interface AuditFilters {
  action?: string;
  door?: "rest" | "graphql";
  actor?: string;
}

// The filters as a query string, without the empty ones.
function auditQuery(
  filters: AuditFilters,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(extra);
  if (filters.action) params.set("action", filters.action);
  if (filters.door) params.set("door", filters.door);
  if (filters.actor) params.set("actor", filters.actor);
  const query = params.toString();
  return query ? `?${query}` : "";
}

// Admin: a page of the log, after a cursor.
export function listAudit(
  filters: AuditFilters,
  after: string | null,
): Promise<AuditPage> {
  return request(
    `/api/bank/admin/audit${auditQuery(filters, after ? { after } : {})}`,
  );
}

// Admin: where the CSV of the log downloads from, with the same filters.
export function auditCsvUrl(filters: AuditFilters): string {
  return `/api/bank/admin/audit.csv${auditQuery(filters)}`;
}

// An account whose balance is not the sum of its history.
export interface BooksAccount {
  accountId: string;
  accountNumber: string;
  ownerEmail: string;
  balanceCents: number;
  linesCents: number;
  differenceCents: number;
}

// The books check.
export interface BooksReport {
  balanced: boolean;
  checkedAccounts: number;
  sampleAccounts: number;
  totalBalanceCents: number;
  totalLinesCents: number;
  differenceCents: number;
  outOfBalance: BooksAccount[];
  checkedAt: string;
}

// Admin: run the books check.
export function getBooks(): Promise<BooksReport> {
  return request("/api/bank/admin/books");
}
