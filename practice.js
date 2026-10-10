// Practice mode: the catalogue of planted bugs, and the set of flags the
// switch arms.
//
// This is the one place the bug list lives in code. The switch in the top bar
// arms exactly these flags, and the Practice page at /app/practice reads the
// same rows, so the two can never drift apart. `docs/react-surface-defects.md`
// stays as the written reference for people reading the repo.
//
// Every bug is armed for one visitor's run key only (see FLAG_DEFAULTS and
// getRunKey in server.js), so turning practice mode on never changes what
// anybody else sees. It is deliberately not saved anywhere: a visitor turns it
// on, practises, and leaves. Coming back and starting over is the point.

// A bug the practice switch turns on.
//
//   flag    the runtime flag, and the row's id
//   value   what the flag is set to (true, or a replacement string)
//   title   what goes wrong, in a sentence
//   where   where to go and look
//   kind    the family it belongs to, for grouping
//   verdict REPORT (a real fault; file it) or HEAL (the test should adapt)
//   hint    what to try, without giving it away
//   reveal  what is actually wrong, and why it is easy to miss
const BUGS = [
  // --- The classic demo site ---------------------------------------------
  {
    flag: "rbacBug",
    value: true,
    title: "An Editor is allowed to delete a user",
    where: "/user-manager, signed in as an Editor",
    kind: "Access control",
    verdict: "REPORT",
    hint: "Sign in as an Editor and try to delete somebody. Watch what the server answers, not what the page shows.",
    reveal:
      "The page hides the delete button for an Editor, but the server answers 200 and deletes the user anyway. Hiding a control is not a permission check: anything the UI refuses must also be refused by the API, because a request can be sent without the UI.",
  },

  // --- The React back office ---------------------------------------------
  {
    flag: "userCreateConflict",
    value: true,
    title: "A new user appears in the table, then vanishes",
    where: "/app/users — create a user",
    kind: "Async / state",
    verdict: "REPORT",
    hint: "Create a user and watch the row closely for a second after you submit.",
    reveal:
      "The page adds the row before the server has agreed (an optimistic update). The server answers 409, so the row rolls back. The bug is that nothing tells the person it failed — the row simply disappears.",
  },
  {
    flag: "usersSearchStale",
    value: true,
    title: "Search shows the results for what you typed a moment ago",
    where: "/app/users — the search box",
    kind: "Async / closure",
    verdict: "REPORT",
    hint: "Type a few letters quickly, then a few more. Compare what is in the box with what is in the table.",
    reveal:
      "The debounced search closes over the previous query, so it always runs one keystroke behind. It looks right if you type slowly, which is why it survives manual testing.",
  },
  {
    flag: "usersLocaleBug",
    value: true,
    title: "A date is formatted in the wrong country's style",
    where: "/app/users — the 'Directory as of' line",
    kind: "Internationalisation",
    verdict: "REPORT",
    hint: "Look at how the date is punctuated, and compare it with the rest of the site.",
    reveal:
      "The date is formatted as de-DE (15.01.26) while the rest of the page is en-US. 01.02.26 is the first of February in one and the second of January in the other, so the same string means two different days.",
  },
  {
    flag: "usersA11yBug",
    value: true,
    title: "A form field has no name a screen reader can use",
    where: "/app/users — the New user dialog",
    kind: "Accessibility",
    verdict: "REPORT",
    hint: "The field looks labelled on screen. Run an accessibility check over the dialog, or try it with a screen reader.",
    reveal:
      "The Name input has visible text beside it but nothing connecting the two — no `for`/`id` pair and no `aria-label`. Anyone not looking at the screen hears an unnamed text box. axe reports it as a `label` violation.",
  },
  {
    flag: "ordersRefreshLabel",
    value: "Reload",
    title: "A button's text changes, but nothing else does",
    where: "/app/orders — the Refresh button",
    kind: "DOM / selector",
    verdict: "HEAL",
    hint: "Nothing is broken for a person here. Think about what it does to a test that finds the button by its words.",
    reveal:
      "Refresh becomes Reload. The button still works and its `data-testid` is unchanged, so this is not a fault to report — it is a test that should have been written against the test id instead of the visible text. The one case here where the right answer is to fix the test.",
  },
  {
    flag: "productSchemaDrift",
    value: true,
    title: "A price comes back as text instead of a number",
    where: "GET /api/products",
    kind: "API contract",
    verdict: "REPORT",
    hint: "The page still looks fine. Read the raw JSON, and compare it with the published schema at /api/docs.",
    reveal:
      '`price` is sent as "19.99" rather than 19.99. JavaScript hides it — the page prints it the same either way — but anything doing arithmetic concatenates instead of adding, and the response violates the OpenAPI schema the API publishes about itself.',
  },

  // --- The bank: money ----------------------------------------------------
  {
    flag: "bankNegativeTransfer",
    value: true,
    title: "Sending a negative amount pulls money the other way",
    where: "/app/bank/transfer",
    kind: "Validation",
    verdict: "REPORT",
    hint: "Try an amount that is not a sensible amount of money.",
    reveal:
      'The amount is checked for "not zero" instead of "above zero", in the form and again on the server. Send -50 and the sender gains 50 while the recipient loses it.',
  },
  {
    flag: "bankDoubleSubmit",
    value: true,
    title: "One transfer, charged twice",
    where: "/app/bank/transfer — the Confirm button",
    kind: "Async / state",
    verdict: "REPORT",
    hint: "Press Confirm twice, quickly, the way an impatient person does on a slow connection.",
    reveal:
      "The button stays enabled while the request is in flight, and each click sends a fresh idempotency key, so the server treats them as two separate transfers. The key exists precisely to stop this, and the page defeats it.",
  },
  {
    flag: "bankTransferRace",
    value: true,
    title: "Two transfers at once overdraw the account",
    where: "POST /api/bank/transfers",
    kind: "Concurrency",
    verdict: "REPORT",
    hint: "One at a time is always fine. Send two large ones at the same instant.",
    reveal:
      'Check-then-act: the balance is read, checked, and written back later without an "only if there is still enough" condition. Both requests read the same balance, both pass, and the account goes negative. Clicking slowly never finds this.',
  },
  {
    flag: "bankStaleBalance",
    value: true,
    title: "The balance does not change after you move money",
    where: "/app/bank — after making a transfer",
    kind: "Async / cache",
    verdict: "REPORT",
    hint: "Make a transfer, then go back to the overview without reloading the page.",
    reveal:
      "The transfer really happened — the receipt is right and a reload shows the truth. The cached balances are simply never refreshed, so the page keeps showing numbers that are no longer true.",
  },
  {
    flag: "bankDateFilterOffByOne",
    value: true,
    title: "A date range quietly leaves out its last day",
    where: "/app/bank/accounts/{id} — the history filter, and the CSV",
    kind: "Off-by-one",
    verdict: "REPORT",
    hint: "Filter to a range whose last day you know has a transaction in it.",
    reveal:
      'The period ends at the start of the "to" day instead of the start of the day after, so everything on that final day is dropped. The answer looks completely reasonable, which is why it survives.',
  },
  {
    flag: "bankStatementTotal",
    value: true,
    title: "The statement's total does not match its own rows",
    where: "/app/bank/accounts/{id} — download the CSV",
    kind: "Reporting",
    verdict: "REPORT",
    hint: "Add the rows up by hand and compare with the Total line.",
    reveal:
      "The total skips the last row. On a statement with many rows the difference is small enough to look like a rounding quirk rather than a missing entry.",
  },
  {
    flag: "bankLoanRounding",
    value: true,
    title: "The loan's payments never actually pay it off",
    where: "/app/bank/loans — ask for a quote and open the schedule",
    kind: "Rounding",
    verdict: "REPORT",
    hint: "Scroll to the last month of the schedule and look at what is left.",
    reveal:
      "The monthly payment is cut off rather than rounded, so every month is a fraction short and the final month never settles. A balance is still owed at the end of the term.",
  },
  {
    flag: "bankPayeeIdor",
    value: true,
    title: "You can delete somebody else's saved payee",
    where: "DELETE /api/bank/payees/{id}",
    kind: "Security / IDOR",
    verdict: "REPORT",
    hint: "Two customers, one payee id. The UI will never offer you this — send the request yourself.",
    reveal:
      "The delete looks the payee up by id and never checks whose it is. Knowing the id is enough. This is an IDOR: the object is referenced directly, and ownership is assumed rather than verified.",
  },

  // --- The bank: connected screens ---------------------------------------
  {
    flag: "bankNotificationCount",
    value: true,
    title: "The unread badge never goes down",
    where: "The bell in the top bar, and /app/notifications",
    kind: "Async / state",
    verdict: "REPORT",
    hint: "Read your notifications, then look at the badge again.",
    reveal:
      "The count query counts every notification rather than the unread ones, so marking them read changes nothing. The list is right; only the number is wrong.",
  },
  {
    flag: "bankRequestDoublePay",
    value: true,
    title: "A money request can be paid twice",
    where: "/app/bank/requests",
    kind: "Concurrency / state",
    verdict: "REPORT",
    hint: "Pay a request, then try to pay the same one again.",
    reveal:
      'The claim updates the request without the condition "only while it is still pending", so a second payment goes through and the money moves twice for one request.',
  },
  {
    flag: "bankSupportStatus",
    value: true,
    title: "A customer's reply never reaches support",
    where: "/app/support — reply to an answered ticket",
    kind: "Workflow / state",
    verdict: "REPORT",
    hint: "Reply to a ticket that staff have already answered, then look at it from the support inbox.",
    reveal:
      'The reply keeps the ticket on "answered" instead of setting it back to "open", so it never returns to the support queue. The customer sees their message; staff never do.',
  },

  // --- The bank: GraphQL --------------------------------------------------
  {
    flag: "bankGraphqlOwnerLeak",
    value: true,
    title: "A nested field returns another customer's name and email",
    where: "POST /api/bank/graphql, and the explorer at /app/graphql",
    kind: "Access control",
    verdict: "REPORT",
    hint: "Ask a transaction for the details of whoever is on the other side of it.",
    reveal:
      "The nested resolver loads the counterparty without checking who is asking. The top-level query is guarded; the field underneath it is not. In GraphQL the caller picks the shape, so every field needs its own check.",
  },
  {
    flag: "bankGraphqlErrorDetail",
    value: true,
    title: "An error replies with the server's own stack trace",
    where: "POST /api/bank/graphql",
    kind: "Information leak",
    verdict: "REPORT",
    hint: "Make something fail unexpectedly and read the whole error, not just its message.",
    reveal:
      "The error shaper passes the original error straight through, so the answer carries the internal message and a stack trace — file paths, library versions, and the shape of the database.",
  },
  {
    flag: "bankGraphqlDepth",
    value: true,
    title: "A deeply nested query is run instead of refused",
    where: "POST /api/bank/graphql",
    kind: "Resource exhaustion",
    verdict: "REPORT",
    hint: "Follow a relationship back and forth: account to transaction to account, and keep going.",
    reveal:
      "The depth limit is skipped. Because the caller writes the query and types can point back at each other, a short request can ask for an enormous amount of work. A depth limit is the cheapest guard against that.",
  },

  // --- The exchange -------------------------------------------------------
  {
    flag: "bankCryptoPriceType",
    value: true,
    title: "A price comes back as text instead of a number",
    where: "GET /api/bank/market",
    kind: "API contract",
    verdict: "REPORT",
    hint: "The market page looks fine. Read the raw JSON and check it against the published schema.",
    reveal:
      "`priceMicros` is sent with quotes around it. The page renders it identically, so only a schema check or arithmetic catches it — which is exactly what a contract test is for.",
  },
  {
    flag: "bankQuoteExpired",
    value: true,
    title: "A price you were quoted minutes ago still goes through",
    where: "/app/markets/{coin} — the trade panel",
    kind: "Time / state",
    verdict: "REPORT",
    hint: "Ask for a price, then wait past the countdown before confirming.",
    reveal:
      "The expiry on the quote is never checked, so a stale price is honoured. In a market that moves every second, that is money made or lost for free — and in the right direction, every time.",
  },
  {
    flag: "bankProfitSign",
    value: true,
    title: "A gain is shown as a loss, and a loss as a gain",
    where: "/app/portfolio",
    kind: "Sign / display",
    verdict: "REPORT",
    hint: "Buy something, then compare what you paid with what the page says you are up or down.",
    reveal:
      "The sign on the unrealised figure is flipped. The size is right, which is what makes it slip past: the number looks plausible, and only the direction is wrong.",
  },
  {
    flag: "bankFeeHidden",
    value: true,
    title: "The total on a quote leaves the fee out",
    where: "/app/markets/{coin} — sell something",
    kind: "Money / display",
    verdict: "REPORT",
    hint: "Note what the quote says you will receive, then check what actually arrives in your account.",
    reveal:
      "The quote shows the value before the fee as the total, while the trade charges the real one. The customer agrees to one number and gets another.",
  },

  // --- The wallet ---------------------------------------------------------
  {
    flag: "bankBadAddress",
    value: true,
    title: "A mistyped address is accepted and the coin is lost",
    where: "/app/wallet — send",
    kind: "Validation",
    verdict: "REPORT",
    hint: "Change one character in the middle of a valid address and send to it.",
    reveal:
      "The address's checksum is never verified. The send reports success, the coin leaves your wallet, and no wallet holds that address — the history row says it never landed. This is the one bug here that cannot be undone.",
  },
  {
    flag: "bankCryptoFloat",
    value: true,
    title: "You send slightly less than you typed",
    where: "/app/wallet — send or swap",
    kind: "Floating point",
    verdict: "REPORT",
    hint: "Type 0.29 and read back what the preview says you are sending.",
    reveal:
      "The decimal is multiplied as a float and then cut off, so 0.29 becomes 0.28999999. Binary floating point cannot hold most decimals exactly — the same reason 0.1 + 0.2 is 0.30000000000000004. The fix is to read the digits as text, which is what the correct path does.",
  },
];

// The flags the switch arms, as the flag store wants them.
function practiceFlags() {
  return Object.fromEntries(BUGS.map((bug) => [bug.flag, bug.value]));
}

// The flags turned back to their defaults, for switching practice mode off.
function cleanFlags(defaults) {
  return Object.fromEntries(BUGS.map((bug) => [bug.flag, defaults[bug.flag]]));
}

// The catalogue as the Practice page shows it: no `value`, because what a flag
// is set to is an implementation detail nobody practising needs.
function catalogue() {
  return BUGS.map(({ value, ...rest }) => rest);
}

module.exports = { BUGS, catalogue, cleanFlags, practiceFlags };
