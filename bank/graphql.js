const {
  buildSchema,
  execute,
  parse,
  validate,
  specifiedRules,
  GraphQLError,
  Kind,
} = require("graphql");

const accounts = require("./accounts");
const money = require("./money");
const bills = require("./bills");
const loans = require("./loans");
const notifications = require("./notify");
const requests = require("./requests");
const support = require("./support");

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
//   - bankGraphqlDepth:       the query-depth limit is dropped.

// How deep a query may nest before it's refused (introspection is exempt, so
// the schema explorer still works). The bug drops this.
const MAX_DEPTH = 8;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_NUMBER = /^PB-?(\d{4})-?(\d{4})$/i;
const MEMO_MAX = 140;
const MAX_TOP_UP_CENTS = 100_000_000;
const HISTORY_TYPES = ["in", "out", "deposit", "transfer", "bill", "loan"];
const STAFF = ["support", "admin"];

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
  }

  type Mutation {
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

  type LoanQuote {
    amountCents: Cents!
    termMonths: Int!
    aprBasisPoints: Int!
    monthlyPaymentCents: Cents!
    totalInterestCents: Cents!
    totalRepaidCents: Cents!
    schedule: [ScheduleRow!]!
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
  };
}

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

  loanQuote({ amountCents, termMonths }, ctx) {
    requireUser(ctx);
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < loans.MIN_LOAN_CENTS ||
      amountCents > loans.MAX_LOAN_CENTS
    ) {
      throw validationError("Ask for $1,000 to $1,000,000.");
    }
    if (!Object.keys(loans.TERMS).map(Number).includes(termMonths)) {
      throw validationError("Pick 12, 24, 36 or 60 months.");
    }
    return loans.quote(amountCents, termMonths);
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

  // --- Mutations ------------------------------------------------------------

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
    if (!Object.keys(loans.TERMS).map(Number).includes(termMonths)) {
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

  async function run({ query, variables, operationName, user, flags }) {
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
    // depth check is skipped, so one caller-written query can nest without
    // limit and ask the server for unbounded work.
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

    let result;
    try {
      result = await execute({
        schema,
        document,
        rootValue: root,
        contextValue: { db, user, flags: safeFlags },
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

module.exports = { createGraphql, BankGraphQLError, MAX_DEPTH };
