const {
  buildSchema,
  execute,
  getNamedType,
  isListType,
  isNonNullType,
  parse,
  printSchema,
  validate,
  specifiedRules,
  GraphQLError,
  Kind,
} = require("graphql");

const accounts = require("./accounts");
const money = require("./money");
const bills = require("./bills");
const coins = require("./coins");
const trading = require("./trading");
const wallet = require("./wallet");
const loans = require("./loans");
const notifications = require("./notify");
const requests = require("./requests");
const support = require("./support");
const cards = require("./cards");
const exchange = require("./exchange");
const keys = require("./keys");
const schedule = require("./schedule");

// Playground Bank's GraphQL API, at POST /api/bank/graphql. It sits on the same
// bank modules, session and rules as the REST API (bank/routes.js): the signed-in
// user comes from the session cookie, demo accounts are read-only, and someone
// else's data answers "not found". REST and GraphQL always agree because they
// call the same code.
//
// Three bugs are planted here, all off by default and armed per runKey like the
// rest of the site (server.js owns the flag store):
//   - bankGraphqlOwnerLeak:  a nested field leaks another customer's name/email.
//   - bankGraphqlErrorDetail: errors leak the internal message and stack.
//   - bankGraphqlDepth:       the query-depth and cost limits are dropped.
//   - bankCursorSkip:         the page after a cursor skips one row.
// A fourth, bankGraphqlKeyScope, lives in bank/routes.js, which is where a
// read-only API key is told it may not run a mutation.

// How deep a query may nest before it's refused (introspection is exempt, so
// the schema explorer still works). The bug drops this.
const MAX_DEPTH = 8;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_NUMBER = /^PB-?(\d{4})-?(\d{4})$/i;
const MEMO_MAX = 140;
const MAX_TOP_UP_CENTS = 100_000_000;
const HISTORY_TYPES = ["in", "out", "deposit", "transfer", "bill", "loan"];
const STAFF = ["support", "admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lists that page with a cursor: `first` rows at a time, at most this many.
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// A query's cost, and the most one request may spend (see queryCost below).
// The richest example in the explorer costs under a fifth of this.
const MAX_COST = 5000;
const DEFAULT_LIST_SIZE = 10;

// A safe, user-facing error: its message and code are always sent, like an
// HttpError in REST. Anything else is treated as unexpected and hidden (unless
// the error-detail bug is armed).
class BankGraphQLError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const notSignedIn = () =>
  new BankGraphQLError("NOT_SIGNED_IN", "Sign in first.");
const forbidden = () =>
  new BankGraphQLError("FORBIDDEN", "You don't have access to this.");
const demoReadOnly = () =>
  new BankGraphQLError(
    "DEMO_READ_ONLY",
    "Demo accounts are read-only. Sign up for your own account to try this.",
  );

function requireUser(ctx) {
  if (!ctx.user) {
    throw notSignedIn();
  }
  return ctx.user;
}

function requireRole(ctx, roles) {
  requireUser(ctx);
  if (!roles.includes(ctx.user.role)) {
    throw forbidden();
  }
}

function requireEditable(user) {
  if (user.isDemo) {
    throw demoReadOnly();
  }
}

function validationError(message) {
  return new BankGraphQLError("VALIDATION_FAILED", message);
}

function checkMemo(memo) {
  const value = typeof memo === "string" ? memo.trim() : "";
  if (value.length > MEMO_MAX) {
    throw validationError(`Keep the memo under ${MEMO_MAX} characters.`);
  }
  return value;
}

function checkTopUp(amountCents, message) {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    amountCents > MAX_TOP_UP_CENTS
  ) {
    throw validationError(message);
  }
  return amountCents;
}

function matchNumber(value) {
  const match = String(value || "").match(ACCOUNT_NUMBER);
  if (!match) {
    throw validationError("Enter an account number like PB-1234-5678.");
  }
  return `PB-${match[1]}-${match[2]}`;
}

// The whole-day period filter shared with REST history, both ends inclusive.
// It reads the same flags as the REST route, so a bug armed for a run key shows
// through both doors: practice mode turns every bug on at once, and a surface
// that stayed correct would look like a GraphQL fault instead of the planted bug.
function periodFilter(from, to, flags = {}) {
  // The date must really exist, not just look right: "9999-99-99" matches the
  // pattern but isn't a day.
  for (const value of [from, to]) {
    if (value === undefined || value === null) {
      continue;
    }
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !DATE.test(value) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw validationError("Use a real date, written YYYY-MM-DD.");
    }
  }
  if (from && to && from > to) {
    throw validationError("The end date can't be before the start date.");
  }
  const dayAfter = (date) => {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  };
  return {
    fromIso: from ? `${from}T00:00:00.000Z` : undefined,
    // INTENTIONAL DEFECT (bankDateFilterOffByOne, REPORT): ends the period at
    // the START of the "to" day instead of the start of the day after, so the
    // last day of the range is left out. Same bug as the REST route's.
    toIso: to
      ? flags.bankDateFilterOffByOne
        ? `${to}T00:00:00.000Z`
        : dayAfter(to)
      : undefined,
  };
}

// GraphQL spells ranges as enum members (GraphQL has no "24h" identifier), so
// the two names are mapped in one place.
const RANGE_FROM_ENUM = { H1: "1h", H24: "24h", D7: "7d", D30: "30d" };
const RANGE_TO_ENUM = { "1h": "H1", "24h": "H24", "7d": "D7", "30d": "D30" };

// Who this market belongs to: the signed-in customer, else the run key, the
// same rule the REST route uses, so one person sees one market through both.
function marketKey(ctx) {
  return ctx.user ? `user:${ctx.user.id}` : `run:${ctx.runKey || "global"}`;
}

// A test that brought its own run key may pin the instant, exactly as REST
// allows, so a moving market can still be asserted on.
function marketNow(ctx) {
  const at = ctx.marketAt;
  if (!at || !ctx.runKey || ctx.runKey === "global") {
    return Date.now();
  }
  const ms = /^\d+$/.test(at) ? Number(at) : Date.parse(at);
  return Number.isFinite(ms) ? ms : Date.now();
}

// Wallet failures are the caller's fault, not the server's, so they come back
// as readable errors with a code rather than a generic SERVER_ERROR.
function walletError(error) {
  if (
    error instanceof wallet.BadAddressError ||
    error instanceof wallet.UnknownAddressError ||
    error instanceof wallet.OwnAddressError ||
    error instanceof wallet.SameCoinError
  ) {
    return validationError(
      `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.`,
    );
  }
  if (error instanceof wallet.NotEnoughCoinError) {
    return new BankGraphQLError(
      "INSUFFICIENT_FUNDS",
      "There isn't enough to cover that.",
    );
  }
  return error;
}

async function ownAccount(ctx, id) {
  const row = await money.findOwnAccount(ctx.db, ctx.user.id, id);
  if (!row) {
    throw new BankGraphQLError("ACCOUNT_NOT_FOUND", "There's no such account.");
  }
  return row;
}

const schemaSource = `
  "A whole number of cents. Used for money so a balance can pass 32-bit limits."
  scalar Cents

  """
  A price, as a whole number of micro-dollars: 1000000 is $1.00. Prices get six
  decimals because cents are too coarse for a market -- a penny on a $0.39 coin
  is a 2.5% jump -- and, like Cents, it is an integer so nothing rounds badly.
  """
  scalar Micros

  "How far back a coin's chart reaches."
  enum ChartRange {
    H1
    H24
    D7
    D30
  }

  type Query {
    "The signed-in user, or an error if nobody is signed in."
    me: User!
    "Every money account you own."
    accounts: [MoneyAccount!]!
    "One of your accounts by id; someone else's answers as not found."
    account(id: ID!): MoneyAccount!
    "Your saved payees for bill pay."
    payees: [Payee!]!
    "Your recent bill payments."
    billPayments: [BillPayment!]!
    "Your loans, newest first."
    loans: [Loan!]!
    "One loan by id (yours, or any for staff)."
    loan(id: ID!): Loan!
    "A loan quote: monthly payment, interest and schedule, nothing saved."
    loanQuote(amountCents: Cents!, termMonths: Int!): LoanQuote!
    "Money requests, incoming (asked of you) and outgoing (you asked)."
    requests: RequestsResult!
    "Your latest notifications and the unread count."
    notifications: NotificationsResult!
    "Your support tickets, or every ticket for staff."
    tickets: [SupportTicket!]!
    "One ticket with its messages (yours, or any for staff)."
    ticket(id: ID!): TicketThread!
    "Your own market: every coin, your price for it, and a day of history."
    market: [MarketCoin!]!
    "One coin on your own price line, with a chart for the chosen range."
    coin(symbol: String!, range: ChartRange = H24): CoinDetail!
    "What you hold, what it is worth now, and your profit or loss."
    portfolio: Portfolio!
    "Your filled trades, newest first."
    trades: [Trade!]!
    "Your address for every coin, plus what you have sent and swapped."
    wallet: WalletResult!
    "Your cards, one per account."
    cards: [Card!]!
    "One of your cards by id; someone else's answers as not found."
    card(id: ID!): Card!
    """
    Your limit orders, newest first, a page at a time. Pass the last page's
    endCursor as after to get the next one.
    """
    orders(symbol: String, first: Int = 20, after: String): OrderConnection!
    "Your price alerts, armed ones first."
    priceAlerts(symbol: String): [PriceAlert!]!
    """
    Your API keys. Only with a signed-in session: a key can never list, make or
    revoke keys, so a leaked key cannot mint more of itself.
    """
    apiKeys: ApiKeysResult!
  }

  type Mutation {
    "Price a buy or a sell. The price holds for a few seconds."
    quoteTrade(
      symbol: String!
      side: TradeSide!
      "On a buy: how much money to spend."
      spendCents: Cents
      "On a sell: how much coin to sell."
      quantityAtoms: Atoms
    ): TradeQuote!
    "Act on a quote: money and coin both move."
    trade(quoteId: ID!, accountId: ID!): TradeResult!
    """
    Send coin to another customer's address. The amount is a decimal string,
    because that is what a person types; it is read digit by digit, never
    through a float.
    """
    sendCoin(
      symbol: String!
      toAddress: String!
      quantity: String!
      memo: String
    ): WalletSend!
    "Swap one coin straight into another at your own two prices."
    swapCoin(fromSymbol: String!, toSymbol: String!, quantity: String!): WalletSwap!
    "Add practice money to one of your accounts."
    addFunds(accountId: ID!, amountCents: Cents!): MoneyAccount!
    "Send money to another account by its number."
    transfer(
      fromAccountId: ID!
      toAccountNumber: String!
      amountCents: Cents!
      memo: String
    ): TransferResult!
    "Pay a saved payee from one of your accounts."
    payBill(
      fromAccountId: ID!
      payeeId: ID!
      amountCents: Cents!
      memo: String
    ): BillPaymentResult!
    "Ask for a loan; an Admin approves or rejects it later."
    requestLoan(
      accountId: ID!
      amountCents: Cents!
      termMonths: Int!
      purpose: String
    ): Loan!
    "Ask another customer for money by their account number."
    askForMoney(
      toAccountId: ID!
      fromAccountNumber: String!
      amountCents: Cents!
      memo: String
    ): MoneyRequest!
    "Pay a request that was asked of you."
    payRequest(id: ID!, fromAccountId: ID!): RequestPaidResult!
    "Decline a request that was asked of you."
    declineRequest(id: ID!): MoneyRequest!
    "Cancel a request you asked for."
    cancelRequest(id: ID!): MoneyRequest!
    "Mark one of your notifications read."
    markNotificationRead(id: ID!): BankNotification!
    "Mark all your notifications read; returns how many changed."
    markAllNotificationsRead: Int!
    "Open a support ticket, optionally about one of your transactions."
    openTicket(subject: String!, body: String!, transactionId: ID): TicketThread!
    "Reply to a ticket you can see."
    replyToTicket(id: ID!, body: String!): TicketThread!
    "Get a virtual debit card for one of your accounts."
    getCard(accountId: ID!): Card!
    "Freeze or unfreeze your card, or change its daily limit."
    updateCard(id: ID!, status: CardStatus, limitCents: Cents): Card!
    """
    Pay a merchant with your card. A frozen card, a limit reached for the day or
    an empty account declines it, and the answer says why.
    """
    chargeCard(id: ID!, merchant: String!, amountCents: Cents!): CardChargeResult!
    """
    Buy at or below a price, or sell at or above one. It fills when your own
    price gets there, through the same quote and fee as a trade by hand.
    """
    placeOrder(
      symbol: String!
      side: TradeSide!
      accountId: ID!
      "On a buy: how much money to spend."
      spendCents: Cents
      "On a sell: how much coin to sell."
      quantityAtoms: Atoms
      limitMicros: Micros!
    ): Order!
    "Cancel one of your open orders."
    cancelOrder(id: ID!): Order!
    "Be told once when a coin goes above or below a price."
    createPriceAlert(
      symbol: String!
      direction: AlertDirection!
      limitMicros: Micros!
    ): PriceAlert!
    "Cancel one of your armed alerts."
    cancelPriceAlert(id: ID!): PriceAlert!
    "Make an API key. The token is in this answer and nowhere else, ever."
    createApiKey(name: String!, scope: KeyScope = READ): NewApiKey!
    "Revoke one of your keys; the next request made with it is refused."
    revokeApiKey(id: ID!): ApiKey!
  }

  type User {
    id: ID!
    email: String!
    fullName: String!
    role: String!
    status: String!
    isDemo: Boolean!
    createdAt: String!
  }

  "Another account's owner. Only the number is yours to see."
  type Counterparty {
    accountNumber: String!
    fullName: String
    email: String
  }

  type MoneyAccount {
    id: ID!
    number: String!
    kind: String!
    name: String!
    balanceCents: Cents!
    createdAt: String!
    "This account's history, with the same filters and pages as REST."
    transactions(
      from: String
      to: String
      type: String
      minCents: Cents
      maxCents: Cents
      page: Int
      pageSize: Int
    ): TransactionsPage!
    """
    The same history newest first, a page after a cursor: pass the last
    page's endCursor as after. Unlike page numbers, a payment that lands while
    you page does not shift the pages you have not read yet.
    """
    history(
      first: Int = 20
      after: String
      from: String
      to: String
      type: String
      minCents: Cents
      maxCents: Cents
    ): TransactionConnection!
  }

  type MoneyTransaction {
    id: ID!
    accountId: ID!
    kind: String!
    amountCents: Cents!
    balanceAfterCents: Cents!
    description: String!
    memo: String!
    "The other side as plain text (an account number or payee reference)."
    counterparty: String!
    transferId: ID
    createdAt: String!
    "The other side as an object. Only the number is yours to see."
    counterpartyDetails: Counterparty
    "The transfer behind this row, if it was a transfer."
    transfer: Transfer
  }

  type TransactionsPage {
    transactions: [MoneyTransaction!]!
    page: Int!
    pageSize: Int!
    total: Int!
    totalPages: Int!
  }

  type Transfer {
    id: ID!
    fromAccountId: ID!
    toAccountNumber: String!
    amountCents: Cents!
    memo: String!
    createdAt: String!
    "The sending account, if you own it."
    fromAccount: MoneyAccount
    "The receiving account, if you own it."
    toAccount: MoneyAccount
  }

  type TransferResult {
    transfer: Transfer!
    fromAccount: MoneyAccount!
    replayed: Boolean!
  }

  type Payee {
    id: ID!
    name: String!
    reference: String!
    createdAt: String!
  }

  type BillPayment {
    id: ID!
    accountId: ID!
    payeeId: ID!
    payeeName: String!
    payeeReference: String!
    amountCents: Cents!
    memo: String!
    createdAt: String!
  }

  type BillPaymentResult {
    payment: BillPayment!
    fromAccount: MoneyAccount!
    replayed: Boolean!
  }

  type ScheduleRow {
    month: Int!
    paymentCents: Cents!
    principalCents: Cents!
    interestCents: Cents!
    balanceCents: Cents!
  }

  """
  Why this customer was offered this rate. There is no published rate card:
  the offer is worked out from what the bank can see of them, so the same ask
  on the same day costs two customers different amounts.
  """
  type RateReasons {
    "Where the curve starts for this term. Longer money costs more."
    termBp: Int!
    "Taken off for standing: balances, time here, earlier loans, activity."
    discountBp: Int!
    "Added because of how big this ask is next to what they already hold."
    exposureBp: Int!
    "Their standing, 0 to 1."
    score: Float!
    "This ask against their own money, 0 to 1."
    exposure: Float!
    balanceCents: Cents!
    tenureDays: Int!
    loansApproved: Int!
    loansRejected: Int!
    transactions: Int!
  }

  type LoanQuote {
    amountCents: Cents!
    termMonths: Int!
    aprBasisPoints: Int!
    monthlyPaymentCents: Cents!
    totalInterestCents: Cents!
    totalRepaidCents: Cents!
    schedule: [ScheduleRow!]!
    "Why this rate, for this customer."
    rate: RateReasons!
  }

  type Loan {
    id: ID!
    accountId: ID!
    accountNumber: String!
    amountCents: Cents!
    termMonths: Int!
    aprBasisPoints: Int!
    monthlyPaymentCents: Cents!
    totalInterestCents: Cents!
    purpose: String!
    status: String!
    decisionNote: String
    decidedAt: String
    createdAt: String!
    "The borrower; only staff see this."
    customer: Customer
    "The repayment schedule."
    schedule: [ScheduleRow!]!
  }

  type Customer {
    id: ID!
    fullName: String!
    email: String!
    isDemo: Boolean!
  }

  type MoneyRequest {
    id: ID!
    amountCents: Cents!
    memo: String!
    status: String!
    requesterName: String!
    toAccountNumber: String!
    payerAccountNumber: String!
    transferId: ID
    answeredAt: String
    createdAt: String!
  }

  type RequestsResult {
    incoming: [MoneyRequest!]!
    outgoing: [MoneyRequest!]!
  }

  type RequestPaidResult {
    request: MoneyRequest!
    transfer: Transfer!
    fromAccount: MoneyAccount!
  }

  type BankNotification {
    id: ID!
    kind: String!
    title: String!
    body: String!
    link: String!
    amountCents: Cents
    read: Boolean!
    createdAt: String!
  }

  type NotificationsResult {
    notifications: [BankNotification!]!
    unread: Int!
  }

  type SupportTicket {
    id: ID!
    subject: String!
    status: String!
    transactionId: ID
    transactionDescription: String
    customer: Customer!
    createdAt: String!
    updatedAt: String!
  }

  type TicketMessage {
    id: ID!
    body: String!
    authorName: String!
    fromStaff: Boolean!
    createdAt: String!
  }

  type TicketThread {
    ticket: SupportTicket!
    messages: [TicketMessage!]!
  }

  "One price at one instant on the viewer's own line."
  type PricePoint {
    at: String!
    priceMicros: Micros!
  }

  "A coin as the markets list shows it."
  type MarketCoin {
    symbol: String!
    name: String!
    priceMicros: Micros!
    "How far the price moved over the last day, in micros."
    changeMicros: Micros!
    "The same move in basis points: 250 is +2.50%."
    changeBasisPoints: Int!
    "When this price was taken."
    at: String!
    "A day of prices for a sparkline."
    spark: [Micros!]!
  }

  """
  A quantity of a coin, as a whole number of 1e-8 units, so adding two amounts
  is exact: 0.1 and 0.2 of a coin really do make 0.3.
  """
  scalar Atoms

  "Which way a trade goes."
  enum TradeSide {
    BUY
    SELL
  }

  "A price the bank will hold for a few seconds while you decide."
  type TradeQuote {
    id: ID!
    symbol: String!
    name: String!
    side: TradeSide!
    priceMicros: Micros!
    "What the coin is worth before the fee."
    grossCents: Cents!
    feeCents: Cents!
    "The fee as basis points. It falls the more you trade."
    feeBasisPoints: Int!
    "What leaves your account on a buy, or arrives on a sell."
    netCents: Cents!
    "How much coin this gets you."
    filledAtoms: Atoms!
    expiresAt: String!
    expiresInSeconds: Int!
  }

  type Trade {
    id: ID!
    symbol: String!
    side: TradeSide!
    accountNumber: String
    quantityAtoms: Atoms!
    "The same quantity written for a person to read."
    quantity: String!
    priceMicros: Micros!
    grossCents: Cents!
    feeCents: Cents!
    netCents: Cents!
    "What a sale made or lost against what the coin had cost. Zero on a buy."
    realisedCents: Cents!
    createdAt: String!
  }

  "One coin you hold."
  type Position {
    symbol: String!
    name: String!
    quantityAtoms: Atoms!
    quantity: String!
    "What you paid for what you still hold, fees included."
    costCents: Cents!
    priceMicros: Micros!
    "The average price you paid, in the same unit as the live price."
    averagePriceMicros: Micros!
    valueCents: Cents!
    "Worth now minus what it cost. Not money until you sell."
    unrealisedCents: Cents!
    unrealisedBasisPoints: Int!
  }

  type Portfolio {
    positions: [Position!]!
    valueCents: Cents!
    costCents: Cents!
    unrealisedCents: Cents!
    "What selling has actually made or lost."
    realisedCents: Cents!
    at: String!
  }

  type TradeResult {
    trade: Trade!
    balanceAfterCents: Cents!
  }

  "One address you can be sent coin at. The last three characters are a checksum."
  type WalletAddress {
    symbol: String!
    name: String!
    address: String!
  }

  "Coin sent to an address."
  type WalletSend {
    id: ID!
    symbol: String!
    "out when you sent it, in when somebody sent it to you."
    direction: String!
    toAddress: String!
    quantityAtoms: Atoms!
    quantity: String!
    "The network fee, charged in the coin being sent."
    feeAtoms: Atoms!
    memo: String!
    "False when no wallet holds that address, which should be impossible."
    delivered: Boolean!
    createdAt: String!
  }

  "One coin turned straight into another."
  type WalletSwap {
    id: ID!
    fromSymbol: String!
    toSymbol: String!
    fromAtoms: Atoms!
    fromQuantity: String!
    toAtoms: Atoms!
    toQuantity: String!
    valueCents: Cents!
    feeCents: Cents!
    createdAt: String!
  }

  type WalletResult {
    wallets: [WalletAddress!]!
    sends: [WalletSend!]!
    swaps: [WalletSwap!]!
  }

  "One coin with a chart."
  type CoinDetail {
    symbol: String!
    name: String!
    priceMicros: Micros!
    changeMicros: Micros!
    changeBasisPoints: Int!
    at: String!
    range: ChartRange!
    rangeChangeMicros: Micros!
    rangeChangeBasisPoints: Int!
    highMicros: Micros!
    lowMicros: Micros!
    series: [PricePoint!]!
  }

  "Where a page of a cursor-paged list ends, and whether there is more."
  type PageInfo {
    "Pass this as after to get the next page. Null on an empty page."
    endCursor: String
    hasNextPage: Boolean!
  }

  type TransactionConnection {
    nodes: [MoneyTransaction!]!
    pageInfo: PageInfo!
    "How many rows match, across every page."
    total: Int!
  }

  enum CardStatus {
    ACTIVE
    FROZEN
  }

  "A virtual debit card. The full number and CVV are under details."
  type Card {
    id: ID!
    accountId: ID!
    accountName: String!
    accountNumber: String!
    last4: String!
    expires: String!
    status: CardStatus!
    "Who froze it: customer or admin. Only the bank undoes a bank freeze."
    frozenBy: String
    limitCents: Cents!
    "Spent today, on your own clock."
    spentTodayCents: Cents!
    createdAt: String!
    "The full number, expiry and CVV."
    details: CardDetails!
    "Every attempt to pay with this card, newest first, a page at a time."
    charges(first: Int = 20, after: String): CardChargeConnection!
  }

  type CardDetails {
    number: String!
    expires: String!
    cvv: String!
  }

  type CardCharge {
    id: ID!
    merchant: String!
    amountCents: Cents!
    "approved or declined."
    status: String!
    "frozen, over_limit or insufficient_funds, on a decline."
    reason: String
    reasonText: String
    "The customer's own day the charge counts against."
    chargedOn: String!
    createdAt: String!
  }

  type CardChargeConnection {
    nodes: [CardCharge!]!
    pageInfo: PageInfo!
    total: Int!
  }

  type CardChargeResult {
    charge: CardCharge!
    card: Card!
  }

  type Order {
    id: ID!
    symbol: String!
    coinName: String!
    accountId: ID!
    accountNumber: String!
    side: TradeSide!
    spendCents: Cents
    quantityAtoms: Atoms
    quantity: String
    limitMicros: Micros!
    "open, filled, cancelled or failed."
    status: String!
    fillPriceMicros: Micros
    tradeId: ID
    failReason: String
    failReasonText: String
    createdAt: String!
    filledAt: String
  }

  type OrderConnection {
    nodes: [Order!]!
    pageInfo: PageInfo!
    total: Int!
  }

  enum AlertDirection {
    ABOVE
    BELOW
  }

  type PriceAlert {
    id: ID!
    symbol: String!
    coinName: String!
    direction: AlertDirection!
    limitMicros: Micros!
    "armed, fired or cancelled."
    status: String!
    firedMicros: Micros
    firedAt: String
    createdAt: String!
  }

  enum KeyScope {
    READ
    WRITE
  }

  type ApiKey {
    id: ID!
    name: String!
    scope: KeyScope!
    "The first characters of the token, kept to tell keys apart."
    prefix: String!
    createdAt: String!
    lastUsedAt: String
    revokedAt: String
  }

  type ApiKeysResult {
    keys: [ApiKey!]!
    rateLimitPerMinute: Int!
    maxActiveKeys: Int!
  }

  type NewApiKey {
    key: ApiKey!
    "The token itself. Shown here once; the bank keeps only a hash."
    token: String!
  }
`;

function buildBankSchema() {
  const schema = buildSchema(schemaSource);
  const cents = schema.getType("Cents");
  const asInt = (value) => {
    const number = typeof value === "string" ? Number(value) : value;
    if (!Number.isSafeInteger(number)) {
      throw new GraphQLError("Cents must be a whole number of cents.");
    }
    return number;
  };
  cents.serialize = (value) => Number(value);
  cents.parseValue = asInt;
  cents.parseLiteral = (node) => {
    if (node.kind !== Kind.INT) {
      throw new GraphQLError("Cents must be a whole number of cents.");
    }
    return asInt(node.value);
  };

  // Micros works exactly like Cents, for the same reason: GraphQL's Int is
  // 32-bit and stops at 2,147,483,647, while one bitcoin at $67,420 is already
  // 67,420,000,000 micros.
  const micros = schema.getType("Micros");
  const asMicros = (value) => {
    const number = typeof value === "string" ? Number(value) : value;
    if (!Number.isSafeInteger(number)) {
      throw new GraphQLError("Micros must be a whole number of micro-dollars.");
    }
    return number;
  };
  // Atoms needs the same treatment: one bitcoin is 100,000,000 atoms, which
  // is already inside Int's range, but a hundred of them is not.
  const atoms = schema.getType("Atoms");
  const asAtoms = (value) => {
    const number = typeof value === "string" ? Number(value) : value;
    if (!Number.isSafeInteger(number)) {
      throw new GraphQLError("Atoms must be a whole number of 1e-8 units.");
    }
    return number;
  };
  atoms.serialize = (value) => Number(value);
  atoms.parseValue = asAtoms;
  atoms.parseLiteral = (node) => {
    if (node.kind !== Kind.INT) {
      throw new GraphQLError("Atoms must be a whole number of 1e-8 units.");
    }
    return asAtoms(node.value);
  };

  micros.serialize = (value) => Number(value);
  micros.parseValue = asMicros;
  micros.parseLiteral = (node) => {
    if (node.kind !== Kind.INT) {
      throw new GraphQLError("Micros must be a whole number of micro-dollars.");
    }
    return asMicros(node.value);
  };
  return schema;
}

// --- Shapers: wrap module rows so nested fields resolve lazily --------------

function shapeAccount(account, ctx) {
  return {
    ...account,
    transactions: async (args) => {
      const filters = {
        ...periodFilter(args.from, args.to, ctx.flags),
        type: args.type || undefined,
        minCents: args.minCents ?? undefined,
        maxCents: args.maxCents ?? undefined,
        page: args.page ?? 1,
        pageSize: args.pageSize ?? 20,
      };
      if (filters.type && !HISTORY_TYPES.includes(filters.type)) {
        throw validationError(`Pick one of ${HISTORY_TYPES.join(", ")}.`);
      }
      // The same limits as REST, so GraphQL can't ask for more in one go.
      if ((args.page ?? 1) < 1) {
        throw validationError("Use a page number from 1.");
      }
      if ((args.pageSize ?? 20) < 1 || (args.pageSize ?? 20) > 100) {
        throw validationError("Use a page size from 1 to 100.");
      }
      const page = await money.listTransactions(ctx.db, account.id, filters);
      return {
        ...page,
        transactions: page.transactions.map((tx) => shapeTx(tx, ctx)),
      };
    },
    history: async (args) => {
      const filters = {
        ...periodFilter(args.from, args.to, ctx.flags),
        type: args.type || undefined,
        minCents: args.minCents ?? undefined,
        maxCents: args.maxCents ?? undefined,
      };
      if (filters.type && !HISTORY_TYPES.includes(filters.type)) {
        throw validationError(`Pick one of ${HISTORY_TYPES.join(", ")}.`);
      }
      const { first, after } = pageArgs(args, "seq");
      // INTENTIONAL DEFECT (bankCursorSkip, REPORT): with the flag armed the
      // page after a cursor starts one row late, so one row of history is on
      // no page at all. Every page still looks complete on its own.
      const skip = ctx.flags.bankCursorSkip && after ? 1 : 0;
      const page = await money.transactionsAfter(ctx.db, account.id, filters, {
        first,
        after,
        skip,
      });
      return connection(
        page.transactions.map((tx) => shapeTx(tx, ctx)),
        page.total,
        page.hasNextPage,
        page.last,
      );
    },
  };
}

// --- Cursors ----------------------------------------------------------------

// A cursor is the sort key of the last row a page returned, opaque to the
// caller: base64url of a small JSON object. It is checked as strictly as any
// other input, because it goes back into a query.
const CURSOR_AT =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)$/;

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(text, key) {
  let value = null;
  try {
    value = JSON.parse(Buffer.from(String(text), "base64url").toString("utf8"));
  } catch {
    value = null;
  }
  const keyOk =
    key === "seq"
      ? typeof value?.seq === "string" && /^\d{1,19}$/.test(value.seq)
      : typeof value?.id === "string" && UUID.test(value.id);
  if (
    !value ||
    typeof value.at !== "string" ||
    !CURSOR_AT.test(value.at) ||
    !keyOk
  ) {
    throw new BankGraphQLError(
      "BAD_CURSOR",
      "That cursor is not one this API gave out. Start again without after.",
    );
  }
  return key === "seq"
    ? { at: value.at, seq: value.seq }
    : { at: value.at, id: value.id };
}

function pageArgs(args, key) {
  const first = args.first ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(first) || first < 1 || first > MAX_PAGE_SIZE) {
    throw validationError(`Ask for 1 to ${MAX_PAGE_SIZE} rows at a time.`);
  }
  return {
    first,
    after: args.after ? decodeCursor(args.after, key) : null,
  };
}

function connection(nodes, total, hasNextPage, last) {
  return {
    nodes,
    total,
    pageInfo: {
      hasNextPage,
      endCursor: last ? encodeCursor(last) : null,
    },
  };
}

// --- Cards, orders, alerts and keys (plan 2, phase B2) ----------------------

// The same modules and the same rules as REST (bank/routes.js): a card's day is
// the customer's own clock, demo accounts are read-only, someone else's card or
// order answers "not found", and keys are managed only with a session.

async function customerToday(ctx) {
  return (await schedule.getClock(ctx.db, ctx.user.id)).today;
}

async function ownCard(ctx, id) {
  const today = await customerToday(ctx);
  const card = UUID.test(String(id))
    ? await cards.findOwnCard(ctx.db, ctx.user.id, id, today)
    : null;
  if (!card) {
    throw new BankGraphQLError("CARD_NOT_FOUND", "There's no such card.");
  }
  return { card, today };
}

function requireSession(ctx) {
  if (ctx.viaKey) {
    throw new BankGraphQLError(
      "KEY_MANAGEMENT_NEEDS_SESSION",
      "API keys are managed from the Developer page while signed in, not with a key.",
    );
  }
}

async function coinOrNotFound(ctx, symbol) {
  try {
    return await coins.findCoin(ctx.db, String(symbol || "").toUpperCase());
  } catch {
    throw new BankGraphQLError("COIN_NOT_FOUND", "There's no such coin.");
  }
}

function checkLimitMicros(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw validationError("Enter a limit price above zero.");
  }
}

function shapeCard(card, ctx) {
  return {
    ...card,
    status: card.status.toUpperCase(),
    details: async () => cards.cardDetails(ctx.db, card.id),
    charges: async (args) => {
      const { first, after } = pageArgs(args, "id");
      const page = await cards.chargesAfter(ctx.db, card.id, { first, after });
      return connection(page.charges, page.total, page.hasNextPage, page.last);
    },
  };
}

const shapeOrder = (order) => ({ ...order, side: order.side.toUpperCase() });
const shapeAlert = (alert) => ({
  ...alert,
  direction: alert.direction.toUpperCase(),
});
const shapeKey = (key) => ({ ...key, scope: key.scope.toUpperCase() });

function shapeTx(tx, ctx) {
  return {
    ...tx,
    counterpartyDetails: () => resolveCounterparty(tx, ctx),
    transfer: () => resolveTransfer(tx, ctx),
  };
}

// The nested owner object. The number is public; the name and email are not,
// so they stay null unless the leak bug is armed.
async function resolveCounterparty(tx, ctx) {
  const number = tx.counterparty;
  if (!number || !ACCOUNT_NUMBER.test(number)) {
    return null;
  }
  // INTENTIONAL DEFECT (bankGraphqlOwnerLeak, REPORT): a nested field reaches
  // another customer's name and email, which a transfer row should never
  // expose. The correct path returns only the account number.
  if (!ctx.flags.bankGraphqlOwnerLeak) {
    return { accountNumber: number, fullName: null, email: null };
  }
  const row = await money.findAccountByNumber(ctx.db, number);
  if (!row) {
    return { accountNumber: number, fullName: null, email: null };
  }
  const owner = await accounts.findUserById(ctx.db, row.user_id);
  return {
    accountNumber: number,
    fullName: owner ? owner.full_name : null,
    email: owner ? owner.email : null,
  };
}

async function resolveTransfer(tx, ctx) {
  if (!tx.transferId) {
    return null;
  }
  const transfer = await money.findTransfer(ctx.db, tx.transferId);
  return transfer ? shapeTransfer(transfer, ctx) : null;
}

function shapeTransfer(transfer, ctx) {
  return {
    ...transfer,
    fromAccount: async () => {
      const row = await money.findOwnAccount(
        ctx.db,
        ctx.user.id,
        transfer.fromAccountId,
      );
      return row ? shapeAccount(money.toMoneyAccount(row), ctx) : null;
    },
    toAccount: async () => {
      const row = await money.findAccountByNumber(
        ctx.db,
        transfer.toAccountNumber,
      );
      // Only an account you own is returned; someone else's answers null.
      return row && row.user_id === ctx.user.id
        ? shapeAccount(money.toMoneyAccount(row), ctx)
        : null;
    },
  };
}

// The schedule is rebuilt from the stored loan only when a query asks for it,
// so listing loans costs nothing extra.
function shapeLoan(loan, ctx) {
  return {
    ...loan,
    schedule: async () => {
      const row = await loans.findLoan(ctx.db, loan.id);
      return row ? loans.scheduleFor(row) : [];
    },
  };
}

// --- Resolvers --------------------------------------------------------------

const root = {
  async me(_args, ctx) {
    const user = requireUser(ctx);
    const account = await accounts.loadAccount(ctx.db, user.id);
    return account.user;
  },

  async accounts(_args, ctx) {
    requireUser(ctx);
    const list = await money.listAccounts(ctx.db, ctx.user.id);
    return list.map((account) => shapeAccount(account, ctx));
  },

  async account({ id }, ctx) {
    requireUser(ctx);
    const row = await ownAccount(ctx, id);
    return shapeAccount(money.toMoneyAccount(row), ctx);
  },

  async payees(_args, ctx) {
    requireUser(ctx);
    return bills.listPayees(ctx.db, ctx.user.id);
  },

  async billPayments(_args, ctx) {
    requireUser(ctx);
    return bills.listBillPayments(ctx.db, ctx.user.id);
  },

  async loans(_args, ctx) {
    requireUser(ctx);
    const list = await loans.listLoans(ctx.db, ctx.user.id);
    return list.map((loan) => shapeLoan(loan, ctx));
  },

  async loan({ id }, ctx) {
    requireUser(ctx);
    const row = await loans.findLoan(ctx.db, id);
    const staff = STAFF.includes(ctx.user.role);
    if (!row || (row.user_id !== ctx.user.id && !staff)) {
      throw new BankGraphQLError("LOAN_NOT_FOUND", "There's no such loan.");
    }
    const loan = loans.toLoan(row);
    if (!staff) {
      delete loan.customer;
    }
    return shapeLoan(loan, ctx);
  },

  async loanQuote({ amountCents, termMonths }, ctx) {
    requireUser(ctx);
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < loans.MIN_LOAN_CENTS ||
      amountCents > loans.MAX_LOAN_CENTS
    ) {
      throw validationError("Ask for $1,000 to $1,000,000.");
    }
    if (!loans.TERM_MONTHS.includes(termMonths)) {
      throw validationError("Pick 12, 24, 36 or 60 months.");
    }
    // Same rule as REST: the offer is worked out for the customer asking.
    return loans.quote(amountCents, termMonths, {
      standing: await loans.standingFor(ctx.db, ctx.user.id),
    });
  },

  async requests(_args, ctx) {
    requireUser(ctx);
    return requests.listRequests(ctx.db, ctx.user.id);
  },

  async notifications(_args, ctx) {
    requireUser(ctx);
    return notifications.listNotifications(ctx.db, ctx.user.id, {
      countBug: Boolean(ctx.flags.bankNotificationCount),
    });
  },

  async tickets(_args, ctx) {
    requireUser(ctx);
    return STAFF.includes(ctx.user.role)
      ? support.listAllTickets(ctx.db)
      : support.listMyTickets(ctx.db, ctx.user.id);
  },

  async ticket({ id }, ctx) {
    requireUser(ctx);
    const row = await support.findTicket(ctx.db, id);
    if (
      !row ||
      (row.user_id !== ctx.user.id && !STAFF.includes(ctx.user.role))
    ) {
      throw new BankGraphQLError("TICKET_NOT_FOUND", "There's no such ticket.");
    }
    return {
      ticket: support.toTicket(row),
      messages: await support.ticketMessages(ctx.db, row.id),
    };
  },

  // --- The market -----------------------------------------------------------
  // The same coins module REST reads, on the same per-viewer key, so a price
  // fetched through GraphQL and one fetched through REST at the same instant
  // are the same number. The market is public: no requireUser here, because a
  // visitor can watch prices before they have an account.
  //
  // bankCryptoPriceType stays REST-only on purpose. It makes a price serialise
  // as a string, and the Micros scalar coerces it straight back to a number, so
  // the bug cannot show through this door. Forcing it through would mean
  // hanging per-request state on a scalar shared by every concurrent request,
  // which is how flaky tests get written. Four earlier bugs are REST- or
  // UI-only for the same kind of reason.

  async market(_args, ctx) {
    return coins.marketList(ctx.db, marketKey(ctx), marketNow(ctx));
  },

  async wallet(_args, ctx) {
    requireUser(ctx);
    const [wallets, sends, swaps] = await Promise.all([
      wallet.listWallets(ctx.db, ctx.user.id),
      wallet.listSends(ctx.db, ctx.user.id),
      wallet.listSwaps(ctx.db, ctx.user.id),
    ]);
    return { wallets, sends, swaps };
  },

  async portfolio(_args, ctx) {
    requireUser(ctx);
    return trading.portfolio(
      ctx.db,
      ctx.user.id,
      marketKey(ctx),
      marketNow(ctx),
      ctx.flags,
    );
  },

  async trades(_args, ctx) {
    requireUser(ctx);
    const rows = await trading.listTrades(ctx.db, ctx.user.id);
    return rows.map((row) => ({ ...row, side: row.side.toUpperCase() }));
  },

  async coin({ symbol, range }, ctx) {
    const detail = await coins.coinDetail(
      ctx.db,
      marketKey(ctx),
      symbol,
      marketNow(ctx),
      RANGE_FROM_ENUM[range] || "24h",
    );
    return { ...detail, range: RANGE_TO_ENUM[detail.range] };
  },

  // --- Mutations ------------------------------------------------------------

  async quoteTrade({ symbol, side, spendCents, quantityAtoms }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    const lowered = side === "BUY" ? "buy" : "sell";
    if (lowered === "buy") {
      if (
        !Number.isSafeInteger(spendCents) ||
        spendCents < trading.MIN_SPEND_CENTS ||
        spendCents > trading.MAX_SPEND_CENTS
      ) {
        throw validationError("Spend $1.00 to $1,000,000.");
      }
    } else if (!Number.isSafeInteger(quantityAtoms) || quantityAtoms <= 0) {
      throw validationError("Enter how much to sell.");
    }
    const quote = await trading.quoteTrade(
      ctx.db,
      ctx.user.id,
      marketKey(ctx),
      { symbol, side: lowered, spendCents, quantityAtoms },
      marketNow(ctx),
      ctx.flags,
    );
    // The modules speak "buy"/"sell"; the schema spells them as enum members.
    return { ...quote, side: quote.side.toUpperCase() };
  },

  async trade({ quoteId, accountId }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    const result = await trading.fillQuote(
      ctx.db,
      ctx.user.id,
      { quoteId, accountId },
      ctx.flags,
      marketNow(ctx),
    );
    return {
      ...result,
      trade: { ...result.trade, side: result.trade.side.toUpperCase() },
    };
  },

  async sendCoin({ symbol, toAddress, quantity, memo }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    let quantityAtoms;
    try {
      quantityAtoms = wallet.parseQuantity(quantity, ctx.flags);
    } catch (error) {
      throw validationError("Enter an amount, up to eight decimal places.");
    }
    if (quantityAtoms <= 0) {
      throw validationError("Enter an amount above zero.");
    }
    try {
      return await wallet.send(
        ctx.db,
        ctx.user.id,
        marketKey(ctx),
        { symbol, toAddress, quantityAtoms, memo: memo || "" },
        ctx.flags,
        marketNow(ctx),
      );
    } catch (error) {
      throw walletError(error);
    }
  },

  async swapCoin({ fromSymbol, toSymbol, quantity }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    let quantityAtoms;
    try {
      quantityAtoms = wallet.parseQuantity(quantity, ctx.flags);
    } catch (error) {
      throw validationError("Enter an amount, up to eight decimal places.");
    }
    if (quantityAtoms <= 0) {
      throw validationError("Enter an amount above zero.");
    }
    try {
      return await wallet.swap(
        ctx.db,
        ctx.user.id,
        marketKey(ctx),
        { fromSymbol, toSymbol, quantityAtoms },
        marketNow(ctx),
      );
    } catch (error) {
      throw walletError(error);
    }
  },

  async addFunds({ accountId, amountCents }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    const account = await ownAccount(ctx, accountId);
    checkTopUp(amountCents, "Enter an amount from $0.01 to $1,000,000.");
    const updated = await money.deposit(ctx.db, account.id, amountCents);
    return shapeAccount(updated, ctx);
  },

  async transfer({ fromAccountId, toAccountNumber, amountCents, memo }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    // INTENTIONAL DEFECT (bankNegativeTransfer, REPORT): with the flag armed,
    // any amount except zero passes, so a negative transfer pulls money from
    // the recipient into the sender's account. The REST route carries the same
    // bug, so practice mode breaks both doors together.
    const amountOk = ctx.flags.bankNegativeTransfer
      ? Number.isSafeInteger(amountCents) && amountCents !== 0
      : Number.isSafeInteger(amountCents) && amountCents > 0;
    if (!amountOk) {
      throw validationError("Enter an amount above zero.");
    }
    const cleanMemo = checkMemo(memo);
    const from = await ownAccount(ctx, fromAccountId);
    const to = await money.findAccountByNumber(
      ctx.db,
      matchNumber(toAccountNumber),
    );
    if (!to) {
      throw new BankGraphQLError(
        "RECIPIENT_NOT_FOUND",
        "There's no account with that number.",
      );
    }
    if (to.id === from.id) {
      throw validationError("Pick a different account from the one sending.");
    }
    if (to.is_demo) {
      throw new BankGraphQLError(
        "DEMO_ACCOUNT",
        "Demo accounts can't receive money, so they stay the same for everyone.",
      );
    }
    let result;
    try {
      result = await money.transfer(ctx.db, {
        userId: user.id,
        from,
        to,
        amountCents,
        memo: cleanMemo,
        key: null,
        // INTENTIONAL DEFECT (bankTransferRace, REPORT): check-then-act, the
        // same race the REST route carries, so the bug shows through both doors.
        race: Boolean(ctx.flags.bankTransferRace),
      });
    } catch (error) {
      if (error instanceof money.InsufficientFundsError) {
        throw new BankGraphQLError(
          "INSUFFICIENT_FUNDS",
          "The account doesn't have enough money for this transfer.",
        );
      }
      throw error;
    }
    const fromAccount = money.toMoneyAccount(
      await money.findOwnAccount(ctx.db, user.id, from.id),
    );
    return {
      transfer: shapeTransfer(result.transfer, ctx),
      fromAccount: shapeAccount(fromAccount, ctx),
      replayed: result.replayed,
    };
  },

  async payBill({ fromAccountId, payeeId, amountCents, memo }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw validationError("Enter an amount above zero.");
    }
    const cleanMemo = checkMemo(memo);
    const from = await ownAccount(ctx, fromAccountId);
    const payee = await bills.findOwnPayee(ctx.db, user.id, payeeId);
    if (!payee) {
      throw new BankGraphQLError("PAYEE_NOT_FOUND", "There's no such payee.");
    }
    let result;
    try {
      result = await bills.payBill(ctx.db, {
        userId: user.id,
        from,
        payee,
        amountCents,
        memo: cleanMemo,
        key: null,
      });
    } catch (error) {
      if (error instanceof money.InsufficientFundsError) {
        throw new BankGraphQLError(
          "INSUFFICIENT_FUNDS",
          "The account doesn't have enough money for this payment.",
        );
      }
      throw error;
    }
    const fromAccount = money.toMoneyAccount(
      await money.findOwnAccount(ctx.db, user.id, from.id),
    );
    return {
      payment: result.payment,
      fromAccount: shapeAccount(fromAccount, ctx),
      replayed: result.replayed,
    };
  },

  async requestLoan({ accountId, amountCents, termMonths, purpose }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < loans.MIN_LOAN_CENTS ||
      amountCents > loans.MAX_LOAN_CENTS
    ) {
      throw validationError("Ask for $1,000 to $1,000,000.");
    }
    if (!loans.TERM_MONTHS.includes(termMonths)) {
      throw validationError("Pick 12, 24, 36 or 60 months.");
    }
    const cleanPurpose = checkMemo(purpose);
    const account = await ownAccount(ctx, accountId);
    try {
      const loan = await loans.requestLoan(ctx.db, {
        userId: user.id,
        account,
        amountCents,
        termMonths,
        purpose: cleanPurpose,
        roundingBug: Boolean(ctx.flags.bankLoanRounding),
      });
      return shapeLoan(loan, ctx);
    } catch (error) {
      if (error instanceof loans.TooManyPendingError) {
        throw new BankGraphQLError(
          "TOO_MANY_PENDING",
          `You can have up to ${loans.MAX_PENDING} loan requests waiting.`,
        );
      }
      throw error;
    }
  },

  async askForMoney(
    { toAccountId, fromAccountNumber, amountCents, memo },
    ctx,
  ) {
    const user = requireUser(ctx);
    requireEditable(user);
    checkTopUp(amountCents, "Ask for $0.01 to $1,000,000.");
    const cleanMemo = checkMemo(memo);
    const toAccount = await ownAccount(ctx, toAccountId);
    const payerAccount = await money.findAccountByNumber(
      ctx.db,
      matchNumber(fromAccountNumber),
    );
    if (!payerAccount) {
      throw new BankGraphQLError(
        "PAYER_NOT_FOUND",
        "There's no account with that number.",
      );
    }
    if (payerAccount.user_id === user.id) {
      throw validationError(
        "Ask another customer, not one of your own accounts.",
      );
    }
    if (payerAccount.is_demo) {
      throw new BankGraphQLError(
        "DEMO_ACCOUNT",
        "Demo accounts can't be asked for money.",
      );
    }
    try {
      return await requests.createRequest(ctx.db, {
        requesterId: user.id,
        requesterName: user.fullName,
        toAccount,
        payerAccount,
        amountCents,
        memo: cleanMemo,
      });
    } catch (error) {
      if (error instanceof requests.TooManyRequestsError) {
        throw new BankGraphQLError(
          "TOO_MANY_REQUESTS",
          `You can have up to ${requests.MAX_PENDING_REQUESTS} requests waiting.`,
        );
      }
      throw error;
    }
  },

  async payRequest({ id, fromAccountId }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    const row = await requests.findRequest(ctx.db, id);
    if (!row || row.payer_id !== user.id) {
      throw new BankGraphQLError(
        "REQUEST_NOT_FOUND",
        "There's no such request.",
      );
    }
    const fromAccount = await ownAccount(ctx, fromAccountId);
    try {
      const result = await requests.payRequest(ctx.db, {
        request: row,
        payerId: user.id,
        fromAccount,
        key: null,
        doublePay: Boolean(ctx.flags.bankRequestDoublePay),
      });
      const reloaded = money.toMoneyAccount(
        await money.findOwnAccount(ctx.db, user.id, fromAccount.id),
      );
      return {
        request: result.request,
        transfer: shapeTransfer(result.transfer, ctx),
        fromAccount: shapeAccount(reloaded, ctx),
      };
    } catch (error) {
      if (error instanceof requests.RequestNotPendingError) {
        throw new BankGraphQLError(
          "REQUEST_NOT_PENDING",
          "This request was already answered.",
        );
      }
      if (error instanceof money.InsufficientFundsError) {
        throw new BankGraphQLError(
          "INSUFFICIENT_FUNDS",
          "The account doesn't have enough money to pay this.",
        );
      }
      if (error.code === "23505") {
        throw new BankGraphQLError(
          "REQUEST_NOT_PENDING",
          "This request was already answered.",
        );
      }
      throw error;
    }
  },

  async declineRequest({ id }, ctx) {
    return answerRequest(ctx, id, "decline");
  },

  async cancelRequest({ id }, ctx) {
    return answerRequest(ctx, id, "cancel");
  },

  async markNotificationRead({ id }, ctx) {
    requireUser(ctx);
    const updated = await notifications.markRead(ctx.db, ctx.user.id, id);
    if (!updated) {
      throw new BankGraphQLError(
        "NOTIFICATION_NOT_FOUND",
        "There's no such notification.",
      );
    }
    return updated;
  },

  // --- Cards, orders, alerts and keys -----------------------------------------

  async cards(_args, ctx) {
    requireUser(ctx);
    const today = await customerToday(ctx);
    const list = await cards.listCards(ctx.db, ctx.user.id, today);
    return list.map((card) => shapeCard(card, ctx));
  },

  async card({ id }, ctx) {
    requireUser(ctx);
    const { card } = await ownCard(ctx, id);
    return shapeCard(card, ctx);
  },

  async orders(args, ctx) {
    requireUser(ctx);
    const { first, after } = pageArgs(args, "id");
    const page = await exchange.ordersAfter(ctx.db, ctx.user.id, {
      symbol: args.symbol ? String(args.symbol).toUpperCase() : null,
      first,
      after,
    });
    return connection(
      page.orders.map(shapeOrder),
      page.total,
      page.hasNextPage,
      page.last,
    );
  },

  async priceAlerts({ symbol }, ctx) {
    requireUser(ctx);
    const list = await exchange.listAlerts(ctx.db, ctx.user.id, {
      symbol: symbol ? String(symbol).toUpperCase() : null,
    });
    return list.map(shapeAlert);
  },

  async apiKeys(_args, ctx) {
    requireUser(ctx);
    requireSession(ctx);
    return {
      keys: (await keys.listKeys(ctx.db, ctx.user.id)).map(shapeKey),
      rateLimitPerMinute: keys.RATE_LIMIT_PER_MINUTE,
      maxActiveKeys: keys.MAX_ACTIVE_KEYS,
    };
  },

  async getCard({ accountId }, ctx) {
    requireUser(ctx);
    requireEditable(ctx.user);
    const account = await ownAccount(ctx, accountId);
    let created;
    try {
      created = await cards.createCard(ctx.db, {
        userId: ctx.user.id,
        account,
      });
    } catch (error) {
      if (error instanceof cards.CardExistsError) {
        throw new BankGraphQLError(
          "CARD_EXISTS",
          "This account already has a card.",
        );
      }
      throw error;
    }
    const today = await customerToday(ctx);
    return shapeCard(
      await cards.findOwnCard(ctx.db, ctx.user.id, created.id, today),
      ctx,
    );
  },

  async updateCard({ id, status, limitCents }, ctx) {
    requireUser(ctx);
    requireEditable(ctx.user);
    const changes = {};
    if (status !== undefined && status !== null) {
      changes.status = status.toLowerCase();
    }
    if (limitCents !== undefined && limitCents !== null) {
      if (
        !Number.isSafeInteger(limitCents) ||
        limitCents < 100 ||
        limitCents > MAX_TOP_UP_CENTS
      ) {
        throw validationError(
          "Set a daily limit between $1.00 and $1,000,000.",
        );
      }
      changes.limitCents = limitCents;
    }
    if (Object.keys(changes).length === 0) {
      throw validationError("Change the status or the limit.");
    }
    const { card, today } = await ownCard(ctx, id);
    // Only the bank undoes a bank freeze.
    if (
      changes.status === "active" &&
      card.status === "frozen" &&
      card.frozenBy === "admin"
    ) {
      throw new BankGraphQLError(
        "CARD_FROZEN_BY_BANK",
        "The bank froze this card. Only the bank can unfreeze it.",
      );
    }
    const frozenBy =
      changes.status === "frozen"
        ? "customer"
        : changes.status === "active"
          ? null
          : undefined;
    return shapeCard(
      await cards.updateCard(ctx.db, card.id, { ...changes, frozenBy }, today),
      ctx,
    );
  },

  async chargeCard({ id, merchant, amountCents }, ctx) {
    requireUser(ctx);
    requireEditable(ctx.user);
    const name = typeof merchant === "string" ? merchant.trim() : "";
    if (name.length < 2 || name.length > 60) {
      throw validationError("Name the merchant in 2 to 60 characters.");
    }
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw validationError("Enter an amount above zero.");
    }
    const { card, today } = await ownCard(ctx, id);
    const result = await cards.charge(ctx.db, {
      userId: ctx.user.id,
      card,
      merchant: name,
      amountCents,
      today,
      perChargeBug: Boolean(ctx.flags.bankCardLimitPerCharge),
    });
    return { charge: result.charge, card: shapeCard(result.card, ctx) };
  },

  async placeOrder(args, ctx) {
    requireUser(ctx);
    requireEditable(ctx.user);
    const side = args.side === "SELL" ? "sell" : "buy";
    if (
      side === "buy" &&
      (!Number.isSafeInteger(args.spendCents) ||
        args.spendCents < trading.MIN_SPEND_CENTS ||
        args.spendCents > trading.MAX_SPEND_CENTS)
    ) {
      throw validationError("Spend $1.00 to $1,000,000.");
    }
    if (
      side === "sell" &&
      (!Number.isSafeInteger(args.quantityAtoms) || args.quantityAtoms <= 0)
    ) {
      throw validationError("Enter how much to sell.");
    }
    checkLimitMicros(args.limitMicros);
    const coin = await coinOrNotFound(ctx, args.symbol);
    const account = await ownAccount(ctx, args.accountId);
    if (side === "sell") {
      const held = (await trading.listHoldings(ctx.db, ctx.user.id)).find(
        (holding) => holding.symbol === coin.symbol,
      );
      if (!held || held.quantityAtoms < args.quantityAtoms) {
        throw new BankGraphQLError(
          "NOT_ENOUGH_COIN",
          "You don't hold that much to sell.",
        );
      }
    }
    const order = await exchange.createOrder(ctx.db, {
      userId: ctx.user.id,
      coin,
      account,
      side,
      spendCents: side === "buy" ? args.spendCents : undefined,
      quantityAtoms: side === "sell" ? args.quantityAtoms : undefined,
      limitMicros: args.limitMicros,
    });
    return shapeOrder(order);
  },

  async cancelOrder({ id }, ctx) {
    requireUser(ctx);
    requireEditable(ctx.user);
    const order = UUID.test(String(id))
      ? await exchange.cancelOrder(ctx.db, ctx.user.id, id)
      : null;
    if (!order) {
      throw new BankGraphQLError(
        "ORDER_NOT_FOUND",
        "There's no such open order to cancel.",
      );
    }
    return shapeOrder(order);
  },

  async createPriceAlert({ symbol, direction, limitMicros }, ctx) {
    requireUser(ctx);
    requireEditable(ctx.user);
    checkLimitMicros(limitMicros);
    const coin = await coinOrNotFound(ctx, symbol);
    const alert = await exchange.createAlert(ctx.db, {
      userId: ctx.user.id,
      coin,
      direction: direction === "BELOW" ? "below" : "above",
      limitMicros,
    });
    return shapeAlert(alert);
  },

  async cancelPriceAlert({ id }, ctx) {
    requireUser(ctx);
    requireEditable(ctx.user);
    const alert = UUID.test(String(id))
      ? await exchange.cancelAlert(ctx.db, ctx.user.id, id)
      : null;
    if (!alert) {
      throw new BankGraphQLError(
        "ALERT_NOT_FOUND",
        "There's no such armed alert to cancel.",
      );
    }
    return shapeAlert(alert);
  },

  async createApiKey({ name, scope }, ctx) {
    requireUser(ctx);
    requireSession(ctx);
    requireEditable(ctx.user);
    const label = typeof name === "string" ? name.trim() : "";
    if (label.length < 2 || label.length > 60) {
      throw validationError("Name the key in 2 to 60 characters.");
    }
    let created;
    try {
      created = await keys.createKey(ctx.db, {
        userId: ctx.user.id,
        name: label,
        scope: scope === "WRITE" ? "write" : "read",
      });
    } catch (error) {
      if (error instanceof keys.TooManyKeysError) {
        throw new BankGraphQLError(
          "TOO_MANY_KEYS",
          `You can have up to ${keys.MAX_ACTIVE_KEYS} active keys. Revoke one first.`,
        );
      }
      throw error;
    }
    return { key: shapeKey(created.key), token: created.token };
  },

  async revokeApiKey({ id }, ctx) {
    requireUser(ctx);
    requireSession(ctx);
    requireEditable(ctx.user);
    const key = UUID.test(String(id))
      ? await keys.revokeKey(ctx.db, ctx.user.id, id)
      : null;
    if (!key) {
      throw new BankGraphQLError(
        "KEY_NOT_FOUND",
        "There's no such active key to revoke.",
      );
    }
    return shapeKey(key);
  },

  async markAllNotificationsRead(_args, ctx) {
    requireUser(ctx);
    return notifications.markAllRead(ctx.db, ctx.user.id);
  },

  async openTicket({ subject, body, transactionId }, ctx) {
    const user = requireUser(ctx);
    requireEditable(user);
    const cleanSubject = String(subject || "").trim();
    if (cleanSubject.length < 3 || cleanSubject.length > 120) {
      throw validationError("Write a subject of 3 to 120 characters.");
    }
    const cleanBody = String(body || "").trim();
    if (cleanBody.length < 3 || cleanBody.length > 2000) {
      throw validationError("Write a message of 3 to 2,000 characters.");
    }
    let ownId = null;
    if (transactionId !== undefined && transactionId !== null) {
      const own = await support.ownTransaction(ctx.db, user.id, transactionId);
      if (!own) {
        throw validationError("That isn't one of your transactions.");
      }
      ownId = own.id;
    }
    const ticket = await support.openTicket(ctx.db, {
      userId: user.id,
      subject: cleanSubject,
      body: cleanBody,
      transactionId: ownId,
    });
    return {
      ticket: support.toTicket(ticket),
      messages: await support.ticketMessages(ctx.db, ticket.id),
    };
  },

  async replyToTicket({ id, body }, ctx) {
    const user = requireUser(ctx);
    const row = await support.findTicket(ctx.db, id);
    if (!row || (row.user_id !== user.id && !STAFF.includes(user.role))) {
      throw new BankGraphQLError("TICKET_NOT_FOUND", "There's no such ticket.");
    }
    if (row.user_id === user.id) {
      requireEditable(user);
    }
    const message = String(body || "").trim();
    if (message.length < 1 || message.length > 2000) {
      throw validationError("Write a message of 1 to 2,000 characters.");
    }
    if (row.customer_is_demo) {
      throw new BankGraphQLError(
        "DEMO_READ_ONLY",
        "Demo accounts' tickets can't be changed.",
      );
    }
    const updated = await support.addMessage(ctx.db, {
      ticket: row,
      author: user,
      body: message,
      statusBug: Boolean(ctx.flags.bankSupportStatus),
    });
    return {
      ticket: support.toTicket(updated),
      messages: await support.ticketMessages(ctx.db, row.id),
    };
  },
};

async function answerRequest(ctx, id, action) {
  const user = requireUser(ctx);
  requireEditable(user);
  const row = await requests.findRequest(ctx.db, id);
  const mine =
    row &&
    (action === "cancel"
      ? row.requester_id === user.id
      : row.payer_id === user.id);
  if (!mine) {
    throw new BankGraphQLError("REQUEST_NOT_FOUND", "There's no such request.");
  }
  try {
    return action === "decline"
      ? await requests.declineRequest(ctx.db, {
          request: row,
          payerId: user.id,
        })
      : await requests.cancelRequest(ctx.db, {
          request: row,
          requesterId: user.id,
        });
  } catch (error) {
    if (error instanceof requests.RequestNotPendingError) {
      throw new BankGraphQLError(
        "REQUEST_NOT_PENDING",
        "This request was already answered.",
      );
    }
    throw error;
  }
}

// --- Depth limit ------------------------------------------------------------

// How deep a query nests. Introspection fields (__schema, __type, __typename)
// are treated as leaves, so the schema explorer is never refused. Runs after
// standard validation, so fragments are known and acyclic.
function queryDepth(node, fragments) {
  if (!node.selectionSet) {
    return 0;
  }
  let max = 0;
  for (const selection of node.selectionSet.selections) {
    let depth = 0;
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value.startsWith("__")) {
        continue;
      }
      depth = 1 + queryDepth(selection, fragments);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      depth = queryDepth(selection, fragments);
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragment = fragments[selection.name.value];
      depth = fragment ? queryDepth(fragment, fragments) : 0;
    }
    if (depth > max) {
      max = depth;
    }
  }
  return max;
}

function exceedsDepth(document) {
  const fragments = {};
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments[definition.name.value] = definition;
    }
  }
  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      if (queryDepth(definition, fragments) > MAX_DEPTH) {
        return true;
      }
    }
  }
  return false;
}

// --- Cost limit -------------------------------------------------------------

// Depth alone does not stop a wide query: ten fields that each ask for a
// hundred rows of a hundred rows is shallow and enormous. So every field costs
// one, and a field that returns a list multiplies what it asks for inside by
// how many rows it may return: the `first` or `pageSize` the query gives (or
// the argument's default), else DEFAULT_LIST_SIZE. Introspection is free, as
// for depth. Runs after standard validation, so every field and fragment is
// known.
function argNumber(field, name, variables) {
  const arg = (field.arguments || []).find((item) => item.name.value === name);
  if (!arg) return null;
  if (arg.value.kind === Kind.INT) return Number(arg.value.value);
  if (arg.value.kind === Kind.VARIABLE) {
    const value = variables ? variables[arg.value.name.value] : undefined;
    return Number.isSafeInteger(value) ? value : null;
  }
  return null;
}

function selectionCost(selectionSet, parentType, env, pageSize) {
  if (
    !selectionSet ||
    !parentType ||
    typeof parentType.getFields !== "function"
  ) {
    return 0;
  }
  let total = 0;
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const name = selection.name.value;
      if (name.startsWith("__")) continue;
      const field = parentType.getFields()[name];
      if (!field) continue;
      const childType = getNamedType(field.type);
      const pager = field.args.find(
        (arg) => arg.name === "first" || arg.name === "pageSize",
      );
      if (pager) {
        // A page: the list inside it holds at most this many rows.
        const size =
          argNumber(selection, pager.name, env.variables) ??
          (Number.isSafeInteger(pager.defaultValue)
            ? pager.defaultValue
            : DEFAULT_PAGE_SIZE);
        total +=
          1 + selectionCost(selection.selectionSet, childType, env, size);
        continue;
      }
      const type = isNonNullType(field.type) ? field.type.ofType : field.type;
      const rows = isListType(type) ? (pageSize ?? DEFAULT_LIST_SIZE) : 1;
      total +=
        1 + rows * selectionCost(selection.selectionSet, childType, env, null);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const type = selection.typeCondition
        ? env.schema.getType(selection.typeCondition.name.value)
        : parentType;
      total += selectionCost(selection.selectionSet, type, env, pageSize);
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragment = env.fragments[selection.name.value];
      if (fragment) {
        total += selectionCost(
          fragment.selectionSet,
          env.schema.getType(fragment.typeCondition.name.value),
          env,
          pageSize,
        );
      }
    }
  }
  return total;
}

function queryCost(schema, document, variables) {
  const fragments = {};
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments[definition.name.value] = definition;
    }
  }
  const env = { schema, fragments, variables };
  let max = 0;
  for (const definition of document.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
    const root =
      definition.operation === "mutation"
        ? schema.getMutationType()
        : schema.getQueryType();
    max = Math.max(
      max,
      selectionCost(definition.selectionSet, root, env, null),
    );
  }
  return max;
}

// --- Error shaping ----------------------------------------------------------

// A GraphQL answer always has HTTP 200; problems live in `errors`. A known
// BankGraphQLError and a validation/syntax error are safe to send as-is. Any
// other (unexpected) error is hidden behind a generic message and SERVER_ERROR,
// unless the error-detail bug is armed, which then leaks the message and stack.
function shapeError(error, flags) {
  const original = error.originalError;
  if (original instanceof BankGraphQLError) {
    return {
      message: original.message,
      path: error.path,
      extensions: { code: original.code },
    };
  }
  // Validation and syntax errors carry no originalError; their message is safe
  // and the explorer needs it.
  if (!original) {
    return {
      message: error.message,
      locations: error.locations,
      path: error.path,
      extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
    };
  }
  // INTENTIONAL DEFECT (bankGraphqlErrorDetail, REPORT): leaks the real error
  // message and stack, which can reveal how the server and database work. The
  // correct path answers with a generic message only.
  if (flags.bankGraphqlErrorDetail) {
    return {
      message: original.message,
      path: error.path,
      extensions: {
        code: "SERVER_ERROR",
        stacktrace: String(original.stack || "").split("\n"),
      },
    };
  }
  console.error("[bank] graphql error:", original);
  return {
    message: "Something went wrong.",
    path: error.path,
    extensions: { code: "SERVER_ERROR" },
  };
}

function createGraphql(db) {
  const schema = buildBankSchema();

  async function run({
    query,
    variables,
    operationName,
    user,
    flags,
    runKey,
    marketAt,
    viaKey = false,
  }) {
    const safeFlags = flags || {};
    if (typeof query !== "string" || query.trim() === "") {
      return {
        errors: [
          {
            message: "A query string is required.",
            extensions: { code: "VALIDATION_FAILED" },
          },
        ],
      };
    }

    let document;
    try {
      document = parse(query);
    } catch (error) {
      return { errors: [shapeError(error, safeFlags)] };
    }

    const validationErrors = validate(schema, document, specifiedRules);
    if (validationErrors.length > 0) {
      return {
        errors: validationErrors.map((error) => shapeError(error, safeFlags)),
      };
    }

    // INTENTIONAL DEFECT (bankGraphqlDepth, REPORT): with the flag armed the
    // depth and cost checks are skipped, so one caller-written query can nest
    // and widen without limit and ask the server for unbounded work.
    if (!safeFlags.bankGraphqlDepth && exceedsDepth(document)) {
      return {
        errors: [
          {
            message: `Query is too deep; the limit is ${MAX_DEPTH} levels.`,
            extensions: { code: "QUERY_TOO_DEEP" },
          },
        ],
      };
    }

    const cost = queryCost(
      schema,
      document,
      variables && typeof variables === "object" ? variables : undefined,
    );
    if (!safeFlags.bankGraphqlDepth && cost > MAX_COST) {
      return {
        errors: [
          {
            message: `Query would cost ${cost}; the limit is ${MAX_COST}. Ask for fewer rows (first, pageSize) or fewer nested lists.`,
            extensions: { code: "QUERY_TOO_COSTLY", cost, limit: MAX_COST },
          },
        ],
      };
    }

    let result;
    try {
      result = await execute({
        schema,
        document,
        rootValue: root,
        contextValue: {
          db,
          user,
          flags: safeFlags,
          runKey,
          marketAt,
          viaKey: Boolean(viaKey),
        },
        variableValues:
          variables && typeof variables === "object" ? variables : undefined,
        operationName: operationName || undefined,
      });
    } catch (error) {
      // execute() itself refused the request (a bad operationName, say). Keep
      // the GraphQL shape rather than falling through to a 500.
      return {
        errors: [
          {
            message: error.message,
            extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
          },
        ],
      };
    }

    const response = {};
    if (result.data !== undefined) {
      response.data = result.data;
    }
    if (result.errors && result.errors.length > 0) {
      response.errors = result.errors.map((error) =>
        shapeError(error, safeFlags),
      );
    }
    return response;
  }

  return { schema, run };
}

// The schema as SDL, for the checked-in bank/schema.graphql (written by
// `npm run graphql:schema`, compared by the test suite).
function printBankSchema() {
  return `${printSchema(buildBankSchema())}\n`;
}

module.exports = {
  createGraphql,
  printBankSchema,
  BankGraphQLError,
  MAX_COST,
  MAX_DEPTH,
  MAX_PAGE_SIZE,
};
