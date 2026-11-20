# Playground Bank

[← Back to the README](../../README.md)

<p align="center">
  <img src="../assets/bank-tour.gif" alt="A tour of Playground Bank: the home hub, the markets, a coin's chart, a customer's accounts and the transfer page" width="900" />
</p>

A practice site for testers, like ParaBank with a crypto exchange's look: fake
money, real accounts, and bugs planted on purpose. Open `/app` after
`npm start`, or try it [live](https://agents-playground-app.onrender.com/app).

```mermaid
flowchart LR
  browser["Browser"] --> app["/app<br/>React"]
  app --> api["/api/bank"]
  api --> db[("Postgres<br/>Neon live<br/>PGlite locally and in CI<br/>a Neon branch on demand")]
```

Every table it keeps, drawn from the migrations: **[docs/database.md](../database.md)**.

- **Real accounts.** Sign up, log in, edit your profile, and pick a currency and
  number format in settings. The Devices page lists every browser signed in to
  your account, with an End button per device and "log out everywhere else".
  Five wrong passwords put a hold on that email from that client — a 429 with
  a `Retry-After` — and the hold lifts by itself; the pair is what is held, so
  one visitor's mistakes never lock a demo account for everybody. "That
  client" is the real caller: a made-up `X-Forwarded-For` doesn't dodge the
  hold, and behind Render's proxy only the address the proxy wrote counts.
  One address can open a limited number of accounts (10 at once on the live
  site, then one a minute), and the Sign up page says so. When too many
  passwords are being checked at once, the bank answers "busy, try again"
  (503) instead of slowing everyone down. Log out and someone else logs in on
  the same browser: they see a short "loading", never your accounts.
- **Money.** Every customer opens funded, with their own amounts: the balances
  are drawn from your own account, so no two people start the same. Add
  funds (up to $1,000,000 at a time), open more accounts, send money to your own
  accounts or another customer's, filter the history, and download a CSV
  statement.
- **Bill pay and loans.** Save payees and pay bills, now or on a date: once,
  every week or every month, with a payment due on a weekend paid on the Monday
  after and a monthly one set for the 31st landing on the last day of a shorter
  month. Payments run on your own clock: **Your date**, in the top bar of every
  page once you sign in, shows the time now (in UTC, when the bank's day turns
  over) and your own date, and **+1 day** moves your calendar forward, so a
  bill due tomorrow can be watched getting paid now, and nobody else's day
  moves. A back arrow returns to the real date; demo accounts stay on it. Ask for a loan of $1,000 to
  $1,000,000 with a live quote and the full schedule; an Admin approves or
  rejects it, and an approved loan is paid straight into the account. **There
  is no rate card.** Your rate is worked out from what the bank can see of you
  -- what you hold, how long you have banked here, how your earlier loans went,
  and how big the ask is next to your own money -- and the quote tells you
  which of those moved it. Spend money and your next offer gets dearer.
- **Cards.** A virtual debit card for each account, with a daily limit that
  starts as a share of the account's balance and is yours to change. Pay a shop
  with it and the purchase lands in the same history as everything else; a
  frozen card, a limit reached for the day, or an empty account declines it and
  the bell tells you why. The limit counts your own day, so it resets when your
  clock does. Freeze and unfreeze your own card; an Admin can freeze any card
  from a customer's profile, and only the bank can undo a bank freeze. The full
  number and CVV show only on request.
- **Connected screens.** What one person does shows up for another: a bell with
  notifications (money received, a loan decided, a request answered, a reply
  from support), money requests the other customer pays or declines, and
  support tickets, raised from any transaction, that staff answer from an inbox.
- **Three roles.** A Customer sees their own money, Support sees every user's
  profile and accounts and answers support tickets, and an Admin can also change
  roles, lock accounts and decide loans (never their own).
  The server checks the role on every request, not just the page.
- **Demo accounts**, password `demo1234`: `maya@` (Customer), `sam@` (Support),
  `alex@` (Admin) and `lee@` (locked), all `@playgroundbank.test`. They are
  read-only; sign up to move money or edit.
- **API keys of your own.** Make a key on the Developer page with a name and
  a scope, read or read-and-write, and it is shown exactly once; after that
  the site knows only its first characters. Send it as a bearer token and the
  REST API and GraphQL answer as you, from Postman, curl or a test. A read key
  can look but not change, every key is limited per minute with the usual
  `X-RateLimit` headers and a 429 that says when to retry, keys cannot make
  keys, and revoking one shuts it off at once. Swagger knows the scheme, so
  "Authorize" works in the docs.
- **A GraphQL API** at `/api/bank/graphql`, over the same accounts, money and
  rules as REST: ask for exactly the fields you want, and read four screens'
  worth of data in one request. Cards, limit orders, price alerts and API keys
  go through it too, with the same rules as REST. Long lists come a page at a
  time with a cursor, so a payment that lands while you page never shifts the
  pages you have not read, and a cost limit refuses a query that is too wide
  the way the depth limit refuses one too deep. The schema is checked in as
  `bank/schema.graphql`. The explorer at `/app/graphql` has ready-made queries
  for all of it, runs them against your own session and browses the live
  schema with every field's description.
- **A database you can read.** Every table, column, constraint and index is in
  `bank/schema.sql`, and drawn in [`docs/database.md`](../database.md). Both
  are generated from the migrations and checked by the suite, so they cannot
  drift. `npm run db:audit` fills a throwaway copy with tens of thousands of
  rows and prints how the busiest queries run; it found three missing
  indexes, now added.
- **A market that is yours alone.** Eight coins with live practice prices that
  move while you watch. Your prices are not anybody else's: open the same coin
  on another machine and it sits on a different line, climbing while yours
  falls. Each coin has its own page with a chart over an hour, a day, a week or
  a month, and the strip across the top shows the same prices as the list.
- **A crypto look.** A dark exchange-style theme and a crypto gear shop where
  each of the 48 products has its own icon.
- **Made for a phone too.** On a phone the side menu folds behind a ☰ button
  and slides in from the left, and every table turns each row into a card
  with the column names beside the values, so nothing hides off the edge of
  the screen. A test opens every page at an iPhone's width and fails if any of
  them is wider than the screen.
- **A menu that folds.** Money, Exchange, Shop, Back office, You and
  Developers each fold under a heading with its own icon. Only the group of
  the page you are on opens by itself; the ones you open stay open in your
  browser. About sits last, on its own.
- **A way back from a wrong turn.** An address the site does not have shows
  Page not found, with the address you typed and three ways back, instead of
  an empty page. A page that breaks shows what went wrong with Reload and Back
  to home, while the menu stays, and the error is still reported to the
  browser as before.

- **Buying and selling, with real bank money.** Ask for a price, and the bank
  holds it for fifteen seconds while you decide; confirm, and the money leaves
  your Checking account and the coin arrives. Selling pays straight back in.
  The fee is yours too: it starts at 0.30% and falls the more you trade.
- **A portfolio that moves.** What you hold, what it is worth on your own
  prices right now, what you paid, and whether you are up or down -- changing
  while the page is open. Every buy and sell lands in the same history as your
  transfers and bills, so there is one story, not two.

- **Orders and alerts.** Tell the exchange to buy at or below a price, or
  sell at or above one, and it fills when your own price gets there, through
  the same quote and fee as a trade by hand. Ask to be told once when a coin
  goes above or below a level, and the bell says so with the price it saw.
  Nothing watches a feed: orders and alerts are checked against your price
  whenever you are on the site, and a test can even ask for the check at a
  past instant. The first thing here that acts without a click.
- **A wallet with real addresses.** Every coin gets you an address like
  `pbx1btc7KZJ3E8B2RTDM`. Give one out and somebody can send you coin; send to
  one and the site checks it before anything moves, because the last three
  characters are a checksum. A network fee comes out in the coin itself.
- **Swapping.** Turn one coin straight into another at your own two prices,
  with the fee shown before you commit. No bank account involved.

- **A shop you can really buy from.** The 48 products live in the database
  with real stock. Put some in a cart, pay from one of your accounts, and the
  money, the stock, the order, its history row and the receipt are saved in one
  transaction — all of it, or none of it. The page sends the total it showed
  you; if the real total moved, nothing is charged and you see the new one. The
  more you spend in the shop, the bigger your loyalty discount: 2% from $1,000,
  5% from $5,000, 10% from $20,000. Two people paying for the last one at the
  same moment can't both get it.
- **A back office that runs the shop.** Staff see every order on Shop orders.
  An Admin moves an order placed → packed → shipped → delivered, one step at a
  time, or refunds it before delivery: the money goes back with its history
  row and the items go back on the shelf. The customer is told at every step.
  Support can look but not act, nobody handles their own order, and an Admin
  sets a product's stock from its page.
- **Back-office staff with roles.** The back office behind Orders and Users
  has its own three staff, signed in on Sign-in status (`/app/account`) with
  the password `demo1234`: Alice the Admin, Bob the Editor, and Carol, who is
  inactive on purpose. Only an Admin sees Delete in a user's ⋯ menu, and the
  server makes the same check itself. One planted fault lets an Editor
  through anyway.
- **The rules a real bank keeps.** Every money request takes an
  `Idempotency-Key`: send it twice and it happens once, send the same key with
  a different request and it is refused (422). The action and its stored
  answer are saved together, so even a failure in between can't make a retry
  pay twice. When a payment's answer is lost on the way back, the transfer,
  bill, checkout and request pages say "We couldn't confirm the payment.
  Pressing Pay again is safe" and keep the same key, so pressing again gets
  the first payment back, never a second one. Every answer carries an
  `X-Request-Id`. An audit log records every staff action and every money
  action — who, what, which record, REST or GraphQL, session or API key — and
  the database itself refuses to change or delete a line. A Books page adds up
  every account's history and checks it against the balance. Two health checks
  need no sign-in: `/api/bank/health/live` says the bank is running, and
  `/api/bank/health/ready` says its database answers and every migration ran,
  and names the commit it runs. The cluster, Render and both canaries ask them.

- **Practice mode.** One switch in the top bar turns every planted fault in the
  site on at once — and only for you. Anyone else browsing at the same time
  still sees a site that behaves. Turn it off and everything is correct again;
  leave and come back and you start clean, the way a practice site should.
  When the server doesn't answer, the switch and Your progress say so
  ("Couldn't load", "Not up to date", or a note under the switch) instead of a
  false "off", and the switch stays locked until it knows what is on.
- **The Practice guide.** `/app/practice` explains the hunt: how to use Your
  progress, what the levels mean, REPORT and HEAL, who keeps progress, and
  what Your date does. It also warns that the demo staff log-ins are public:
  other visitors can see and change an account you sign up for, so use a
  made-up name and email. Most faults are marked REPORT — a real fault you
  would raise. One is marked HEAL: nothing is broken for a person, and it is
  the test that should adapt. Telling those apart is the skill worth
  practising.
- **Your progress.** `/app/practice/progress`, under the guide in the menu,
  lists all 44 planted faults as a checklist, one thin line each: a round
  tick, the title with its kind and verdict, and an On/Off switch. Press a
  line to open it: where to go, what to try, and a reveal you open when you
  want to check yourself. A dot per fault at the top turns green as you tick
  them, and pressing a dot opens its fault. Tabs show what is left to find,
  what you found, what is on, or all. Its own instructions name every control
  on it.
- **One fault at a time, by level.** Turn on a single fault, or a whole level,
  instead of all 44. Each is marked Easy (you see it in the browser), Medium
  (it takes care: two places, timing, a second account, the raw answer) or
  Hard (only with requests you send yourself, or two at the same instant).
  The list is grouped by level, and each level folds away under its heading,
  which counts what you found in it. The switch in the top bar says how many
  are on.
- **Progress you keep.** Tick the circle beside each fault you catch, and an
  account you signed up for keeps the ticks in the database, "7 of 44 found",
  for the next visit. The demo accounts are shared by everyone, so they, like
  visitors who are not signed in, can switch faults but keep no ticks. Start
  over, after asking, turns every fault off and clears the ticks.

- **The headers a bank would send.** Every response carries a Content Security
  Policy — a fresh nonce per page view for the app, a hash for the API docs
  page's one inline script — plus no framing, no MIME sniffing, a referrer
  policy, a permissions policy, the three cross-origin isolation headers, and
  HSTS behind https. One module, `security-headers.js`, serves them all. The
  OWASP ZAP baseline scan went from 2 Medium and 5 Low findings to none; what
  is left is informational, about caching and the fact that this is a
  single-page app. A browser walk through every page in the suite proves the
  policy refuses nothing the site needs.

<p align="center">
  <img src="../assets/practice-mode.gif" alt="Practice mode: the switch arms every planted fault, a loan schedule is left owing money, and Your progress reveals the answer" width="900" />
</p>
<p align="center">
  <sub>Practice mode: one switch arms every fault for you alone. Here a loan's schedule never pays it off.</sub>
</p>

<table>
  <tr>
    <td width="50%"><img src="../assets/bank-cards.gif" alt="Cards: getting a card, reading its details, and paying a shop with it" /></td>
    <td width="50%"><img src="../assets/developer-keys.gif" alt="API keys: making a key on the Developer page, seeing it once with a curl line, and the list after" /></td>
  </tr>
  <tr>
    <td><sub>Cards: get one, pay a shop, watch the purchase land.</sub></td>
    <td><sub>API keys: made once, shown once, then only the first characters.</sub></td>
  </tr>
</table>

The pictures on this page are recorded by `npm run media:record`, so they can
be made again whenever the screens change.
