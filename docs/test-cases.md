# Test cases

[← Back to the README](../README.md)

Every test in the Playwright suite (`npm test`), in plain words: what it
checks, and the result it expects. Then the bugs planted on purpose: where
each one is, what goes wrong, and which tests catch it.

**548 tests in 89 files · 44 planted bugs.**

Written by `npm run docs:tests` from the tests themselves: the note above
each test, and its `expected(...)` line, which is what its [RESULT] block
prints. Don't edit this page by hand; run the command again after changing
a test.

## If someone asks

- **"What do your tests cover?"** 548 tests over two websites and their APIs: the classic pages at `/` and Playground Bank at `/app` (accounts, money, cards, loans, trading, the shop, GraphQL), plus the API contracts, the infrastructure and the test framework itself. The areas are listed below with their counts.
- **"How do you know a test checks the right thing?"** Each test says in one line what it expects, and after it runs it prints a [RESULT] block with that line, every API call and its status, and the ids and amounts it used. The expected results on this page are those lines.
- **"What is a planted bug?"** A bug put in on purpose, 44 of them, switched on for one session at a time (practice mode, or a test's own run key) and off for everyone else. Every one is named by at least one test; the list at the end shows which.
- **"Why plant bugs?"** To prove the tests and the tools can find real problems: a test that never fails proves nothing.

## Contents

- [app](#app): 468 tests
  - [`tests/e2e/app/api-bank-backoffice.spec.ts`](#file-testse2eappapi-bank-backofficespects): 7 tests
  - [`tests/e2e/app/api-bank-bills-loans.spec.ts`](#file-testse2eappapi-bank-bills-loansspects): 13 tests
  - [`tests/e2e/app/api-bank-cards.spec.ts`](#file-testse2eappapi-bank-cardsspects): 7 tests
  - [`tests/e2e/app/api-bank-connected.spec.ts`](#file-testse2eappapi-bank-connectedspects): 9 tests
  - [`tests/e2e/app/api-bank-graphql-more.spec.ts`](#file-testse2eappapi-bank-graphql-morespects): 9 tests
  - [`tests/e2e/app/api-bank-graphql.spec.ts`](#file-testse2eappapi-bank-graphqlspects): 21 tests
  - [`tests/e2e/app/api-bank-keys.spec.ts`](#file-testse2eappapi-bank-keysspects): 6 tests
  - [`tests/e2e/app/api-bank-loan-rate.spec.ts`](#file-testse2eappapi-bank-loan-ratespects): 7 tests
  - [`tests/e2e/app/api-bank-market.spec.ts`](#file-testse2eappapi-bank-marketspects): 12 tests
  - [`tests/e2e/app/api-bank-money.spec.ts`](#file-testse2eappapi-bank-moneyspects): 16 tests
  - [`tests/e2e/app/api-bank-orders.spec.ts`](#file-testse2eappapi-bank-ordersspects): 6 tests
  - [`tests/e2e/app/api-bank-rules.spec.ts`](#file-testse2eappapi-bank-rulesspects): 11 tests
  - [`tests/e2e/app/api-bank-scheduled.spec.ts`](#file-testse2eappapi-bank-scheduledspects): 7 tests
  - [`tests/e2e/app/api-bank-security.spec.ts`](#file-testse2eappapi-bank-securityspects): 11 tests
  - [`tests/e2e/app/api-bank-shop.spec.ts`](#file-testse2eappapi-bank-shopspects): 14 tests
  - [`tests/e2e/app/api-bank-trading.spec.ts`](#file-testse2eappapi-bank-tradingspects): 13 tests
  - [`tests/e2e/app/api-bank-wallet.spec.ts`](#file-testse2eappapi-bank-walletspects): 14 tests
  - [`tests/e2e/app/api-bank.spec.ts`](#file-testse2eappapi-bankspects): 8 tests
  - [`tests/e2e/app/api-openapi-contract.spec.ts`](#file-testse2eappapi-openapi-contractspects): 15 tests
  - [`tests/e2e/app/api-practice-mode.spec.ts`](#file-testse2eappapi-practice-modespects): 8 tests
  - [`tests/e2e/app/api-schema-files.spec.ts`](#file-testse2eappapi-schema-filesspects): 2 tests
  - [`tests/e2e/app/bank-backoffice-bugs.spec.ts`](#file-testse2eappbank-backoffice-bugsspects): 3 tests
  - [`tests/e2e/app/bank-card-bugs.spec.ts`](#file-testse2eappbank-card-bugsspects): 1 test
  - [`tests/e2e/app/bank-data-bugs.spec.ts`](#file-testse2eappbank-data-bugsspects): 3 tests
  - [`tests/e2e/app/bank-key-bugs.spec.ts`](#file-testse2eappbank-key-bugsspects): 1 test
  - [`tests/e2e/app/bank-money-bugs.spec.ts`](#file-testse2eappbank-money-bugsspects): 18 tests
  - [`tests/e2e/app/bank-order-bugs.spec.ts`](#file-testse2eappbank-order-bugsspects): 1 test
  - [`tests/e2e/app/bank-rules-bugs.spec.ts`](#file-testse2eappbank-rules-bugsspects): 3 tests
  - [`tests/e2e/app/bank-schedule-bugs.spec.ts`](#file-testse2eappbank-schedule-bugsspects): 1 test
  - [`tests/e2e/app/bank-security-bugs.spec.ts`](#file-testse2eappbank-security-bugsspects): 1 test
  - [`tests/e2e/app/bank-shop-bugs.spec.ts`](#file-testse2eappbank-shop-bugsspects): 4 tests
  - [`tests/e2e/app/react-a11y.spec.ts`](#file-testse2eappreact-a11yspects): 6 tests
  - [`tests/e2e/app/react-account.spec.ts`](#file-testse2eappreact-accountspects): 2 tests
  - [`tests/e2e/app/react-bank-accounts.spec.ts`](#file-testse2eappreact-bank-accountsspects): 13 tests
  - [`tests/e2e/app/react-bank-backoffice.spec.ts`](#file-testse2eappreact-bank-backofficespects): 5 tests
  - [`tests/e2e/app/react-bank-bills-loans.spec.ts`](#file-testse2eappreact-bank-bills-loansspects): 10 tests
  - [`tests/e2e/app/react-bank-cards.spec.ts`](#file-testse2eappreact-bank-cardsspects): 3 tests
  - [`tests/e2e/app/react-bank-connected.spec.ts`](#file-testse2eappreact-bank-connectedspects): 7 tests
  - [`tests/e2e/app/react-bank-devices.spec.ts`](#file-testse2eappreact-bank-devicesspects): 4 tests
  - [`tests/e2e/app/react-bank-graphql.spec.ts`](#file-testse2eappreact-bank-graphqlspects): 8 tests
  - [`tests/e2e/app/react-bank-keys.spec.ts`](#file-testse2eappreact-bank-keysspects): 2 tests
  - [`tests/e2e/app/react-bank-locale.spec.ts`](#file-testse2eappreact-bank-localespects): 3 tests
  - [`tests/e2e/app/react-bank-market.spec.ts`](#file-testse2eappreact-bank-marketspects): 8 tests
  - [`tests/e2e/app/react-bank-mobile.spec.ts`](#file-testse2eappreact-bank-mobilespects): 7 tests
  - [`tests/e2e/app/react-bank-money.spec.ts`](#file-testse2eappreact-bank-moneyspects): 16 tests
  - [`tests/e2e/app/react-bank-notifications.spec.ts`](#file-testse2eappreact-bank-notificationsspects): 2 tests
  - [`tests/e2e/app/react-bank-orders.spec.ts`](#file-testse2eappreact-bank-ordersspects): 3 tests
  - [`tests/e2e/app/react-bank-rules.spec.ts`](#file-testse2eappreact-bank-rulesspects): 3 tests
  - [`tests/e2e/app/react-bank-scheduled.spec.ts`](#file-testse2eappreact-bank-scheduledspects): 4 tests
  - [`tests/e2e/app/react-bank-shell.spec.ts`](#file-testse2eappreact-bank-shellspects): 9 tests
  - [`tests/e2e/app/react-bank-shop.spec.ts`](#file-testse2eappreact-bank-shopspects): 5 tests
  - [`tests/e2e/app/react-bank-trading.spec.ts`](#file-testse2eappreact-bank-tradingspects): 8 tests
  - [`tests/e2e/app/react-bank-wallet.spec.ts`](#file-testse2eappreact-bank-walletspects): 10 tests
  - [`tests/e2e/app/react-flows.spec.ts`](#file-testse2eappreact-flowsspects): 2 tests
  - [`tests/e2e/app/react-home-hero.spec.ts`](#file-testse2eappreact-home-herospects): 3 tests
  - [`tests/e2e/app/react-orders.spec.ts`](#file-testse2eappreact-ordersspects): 3 tests
  - [`tests/e2e/app/react-practice-mode.spec.ts`](#file-testse2eappreact-practice-modespects): 7 tests
  - [`tests/e2e/app/react-products.spec.ts`](#file-testse2eappreact-productsspects): 57 tests
  - [`tests/e2e/app/react-shell.spec.ts`](#file-testse2eappreact-shellspects): 2 tests
  - [`tests/e2e/app/react-users.spec.ts`](#file-testse2eappreact-usersspects): 4 tests
- [contracts](#contracts): 1 test
  - [`tests/e2e/contracts/api-contract-governance.spec.ts`](#file-testse2econtractsapi-contract-governancespects): 1 test
- [functional](#functional): 3 tests
  - [`tests/e2e/functional/negative/functional-negative.spec.ts`](#file-testse2efunctionalnegativefunctional-negativespects): 2 tests
  - [`tests/e2e/functional/positive/functional-positive.spec.ts`](#file-testse2efunctionalpositivefunctional-positivespects): 1 test
- [generated](#generated): 1 test
  - [`tests/e2e/generated/home-cta-navigates-to-dashboard.spec.ts`](#file-testse2egeneratedhome-cta-navigates-to-dashboardspects): 1 test
- [infra](#infra): 18 tests
  - [`tests/e2e/infra/infra-versions.spec.ts`](#file-testse2einfrainfra-versionsspects): 13 tests
  - [`tests/e2e/infra/result-block.spec.ts`](#file-testse2einfraresult-blockspects): 5 tests
- [non-functional](#non-functional): 2 tests
  - [`tests/e2e/non-functional/non-functional-quality.spec.ts`](#file-testse2enon-functionalnon-functional-qualityspects): 2 tests
- [sanity](#sanity): 5 tests
  - [`tests/e2e/sanity/new-pages.spec.ts`](#file-testse2esanitynew-pagesspects): 4 tests
  - [`tests/e2e/sanity/sanity-smoke.spec.ts`](#file-testse2esanitysanity-smokespects): 1 test
- [scenarios](#scenarios): 48 tests
  - [`tests/e2e/scenarios/advanced-locator-healing.spec.ts`](#file-testse2escenariosadvanced-locator-healingspects): 1 test
  - [`tests/e2e/scenarios/api-error-diagnosis.spec.ts`](#file-testse2escenariosapi-error-diagnosisspects): 1 test
  - [`tests/e2e/scenarios/auth-session.spec.ts`](#file-testse2escenariosauth-sessionspects): 4 tests
  - [`tests/e2e/scenarios/dynamic-content-validation.spec.ts`](#file-testse2escenariosdynamic-content-validationspects): 1 test
  - [`tests/e2e/scenarios/execution-planner.spec.ts`](#file-testse2escenariosexecution-plannerspects): 2 tests
  - [`tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts`](#file-testse2escenariosfailure-classification-and-patch-proposalspects): 1 test
  - [`tests/e2e/scenarios/failure-classifier-expansion.spec.ts`](#file-testse2escenariosfailure-classifier-expansionspects): 1 test
  - [`tests/e2e/scenarios/flaky-network-recovery.spec.ts`](#file-testse2escenariosflaky-network-recoveryspects): 1 test
  - [`tests/e2e/scenarios/generic-self-healing.spec.ts`](#file-testse2escenariosgeneric-self-healingspects): 1 test
  - [`tests/e2e/scenarios/incident-memory-and-evidence.spec.ts`](#file-testse2escenariosincident-memory-and-evidencespects): 2 tests
  - [`tests/e2e/scenarios/narrative-enricher.spec.ts`](#file-testse2escenariosnarrative-enricherspects): 8 tests
  - [`tests/e2e/scenarios/orchestrated-recovery.spec.ts`](#file-testse2escenariosorchestrated-recoveryspects): 1 test
  - [`tests/e2e/scenarios/page-contract-validation.spec.ts`](#file-testse2escenariospage-contract-validationspects): 1 test
  - [`tests/e2e/scenarios/policy-engine.spec.ts`](#file-testse2escenariospolicy-enginespects): 3 tests
  - [`tests/e2e/scenarios/rbac.spec.ts`](#file-testse2escenariosrbacspects): 5 tests
  - [`tests/e2e/scenarios/real-agent-proof.spec.ts`](#file-testse2escenariosreal-agent-proofspects): 9 tests
  - [`tests/e2e/scenarios/repair-flow.spec.ts`](#file-testse2escenariosrepair-flowspects): 5 tests
  - [`tests/e2e/scenarios/ui-change-healing.spec.ts`](#file-testse2escenariosui-change-healingspects): 1 test
- [setup](#setup): 2 tests
  - [`tests/e2e/auth.setup.ts`](#file-testse2eauthsetupts): 1 test
  - [`tests/e2e/seed.spec.ts`](#file-testse2eseedspects): 1 test
- [Planted bugs](#planted-bugs): 44

## app

468 tests in 60 files.

### File: `tests/e2e/app/api-bank-backoffice.spec.ts`

7 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **an Admin moves an order one step at a time and the customer is told**
  - File: `tests/e2e/app/api-bank-backoffice.spec.ts`
  - Checks: The happy path: every step, the history, and a notification each time.
  - Expected: placed -> packed -> shipped -> delivered, each 200; four steps in the history by the right people; three shop_order_status notifications; a delivered order can't be refunded (409 ALREADY_DELIVERED)
- **a step can't be skipped or undone**
  - File: `tests/e2e/app/api-bank-backoffice.spec.ts`
  - Checks: The order of steps is enforced.
  - Expected: placed -> delivered 409 STATUS_MOVE_NOT_ALLOWED; placed -> packed 200; packed -> placed 409; a bad status 400
- **a refund pays the total back with a history row and restocks, once**
  - File: `tests/e2e/app/api-bank-backoffice.spec.ts`
  - Checks: A refund: money back with its row, stock back, once only.
  - Expected: 2 x sku-030: refund 200, status refunded, refundedCents = total, the balance back where it started, a shop_refund row, stock 10 again; a second refund 409 ALREADY_REFUNDED; no step after a refund
- **Support can look but not act, and a customer can't look**
  - File: `tests/e2e/app/api-bank-backoffice.spec.ts`
  - Checks: Support reads; only an Admin acts. A customer sees none of it.
  - Expected: Support: the list and the order 200, a move 403, a refund 403; a customer: the staff list 403
- **an Admin can't move or refund their own order**
  - File: `tests/e2e/app/api-bank-backoffice.spec.ts`
  - Checks: Nobody handles their own order.
  - Expected: a customer made Admin buys sku-032, then moving or refunding their own order is 403 OWN_ORDER
- **only an Admin restocks, from 0 to 9999**
  - File: `tests/e2e/app/api-bank-backoffice.spec.ts`
  - Checks: Restocking: Admin only, within its limits, seen everywhere.
  - Expected: a customer and Support 403; 10000 is 400; 5 is 200 and both product APIs say 5
- **GraphQL: staff list, a step, a refund and a restock**
  - File: `tests/e2e/app/api-bank-backoffice.spec.ts`
  - Checks: Every door: the same back office through GraphQL.
  - Expected: staffShopOrders(PLACED) holds the order; advanceShopOrder PACKED; a skip refused; refundShopOrder REFUNDED; a customer's staffShopOrders FORBIDDEN

### File: `tests/e2e/app/api-bank-bills-loans.spec.ts`

13 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **save, list and delete payees**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: A payee can be saved, listed and deleted, and bad payees are refused.
  - Expected: 201 on save, the payee listed, 400 for bad payees, 200 on delete, then 404
- **pay a bill: the money leaves and the history says to whom**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: Paying a bill takes the money out of Checking, and the history names the payee.
  - Expected: 201, Checking down by 12050 cents, one bill_payment in the history
- **the same Idempotency-Key pays a bill once**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: Sending the same payment twice with one Idempotency-Key pays once.
  - Expected: 201 first, 200 replayed second, Checking down by 5000 cents only once
- **a bill payment needs a real amount and enough money**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: A payment of nothing, less than nothing, a fraction, a string, or more than the balance is refused, and the balance does not move.
  - Expected: 400 for 0, -500, 10.5 and '100'; 409 INSUFFICIENT_FUNDS for balance + 1; balance unchanged
- **another customer's payee can't be paid or deleted**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: One customer can't pay or delete another customer's payee.
  - Expected: 404 PAYEE_NOT_FOUND on pay, 404 on delete, the other customer still has the payee
- **demo accounts can see their payees but not pay or add**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: The demo customer sees their three payees but can't add one or pay.
  - Expected: three demo payees listed; 403 on add and on pay
- **a quote's payments pay the loan off exactly**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: A quote's monthly payments add up to the amount plus the interest, and longer loans cost more per year.
  - Expected: 200, APR 350-1600 bp, 12 payments ending at 0, longer terms cost more, 400 for bad asks
- **ask for a loan: it waits, with its schedule**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: Asking for a loan makes a pending loan with its schedule; no money moves yet.
  - Expected: 201 pending with 36 payments, balance unchanged, 404 for another customer, 400 for bad asks
- **at most three loan requests wait at once**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: A customer can have three loan requests waiting, not four.
  - Expected: three loans asked, the fourth 409 TOO_MANY_PENDING
- **an Admin approves a loan and the money is paid out once**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: An Admin approves a loan: the money arrives once, and a second approval is refused.
  - Expected: 200 approved, Checking up by 1000000 cents, a loan_disbursement line, 409 ALREADY_DECIDED on a second approve
- **rejecting needs a reason, and pays nothing**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: A rejection must say why, and pays nothing.
  - Expected: 400 without a note, 200 with one, the loan shows rejected with the note, balance unchanged
- **Support sees the queue but can't decide; customers can't see it**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: Support can read the queue but not decide; a customer can do neither.
  - Expected: customer 403 on the queue and on deciding; Support 200 on the queue with the loan, 403 on deciding
- **nobody decides their own loan, and demo loans can't change**
  - File: `tests/e2e/app/api-bank-bills-loans.spec.ts`
  - Checks: An Admin can't decide their own loan, and the demo loans can't be changed.
  - Expected: 409 CANNOT_DECIDE_OWN for the promoted customer; 403 DEMO_READ_ONLY on a demo loan

### File: `tests/e2e/app/api-bank-cards.spec.ts`

7 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **one card per account, a limit from the balance, details on request**
  - File: `tests/e2e/app/api-bank-cards.spec.ts`
  - Checks: A card is issued once per account with a limit taken from the balance, and its full details are shown only to its owner.
  - Expected: 201 active card, limit a tenth of the balance, 409 CARD_EXISTS on a second, valid details, 404 for another customer
- **a purchase within the limit is approved and lands in the history**
  - File: `tests/e2e/app/api-bank-cards.spec.ts`
  - Checks: A purchase inside the limit is approved, the money leaves, and the history shows it.
  - Expected: approved, spentToday = amount, balance down by amount, a card_purchase line naming Cloud Coffee
- **the daily limit is a daily total, and resets with the customer's day**
  - File: `tests/e2e/app/api-bank-cards.spec.ts`
  - Checks: The limit counts the whole day's spending, and starts again the next day on the customer's own clock.
  - Expected: 6000 approved, a second 6000 declined over_limit with a notification, approved again tomorrow
- **a frozen card declines, and the customer can unfreeze their own**
  - File: `tests/e2e/app/api-bank-cards.spec.ts`
  - Checks: A frozen card declines everything until its owner unfreezes it.
  - Expected: frozen by customer, a purchase declined 'frozen', active again, the next purchase approved
- **not enough money declines with its own reason**
  - File: `tests/e2e/app/api-bank-cards.spec.ts`
  - Checks: Spending more than the account holds is declined with its own reason.
  - Expected: declined insufficient_funds for balance + 100, balance unchanged
- **the bank's freeze beats the customer's, and staff see the cards**
  - File: `tests/e2e/app/api-bank-cards.spec.ts`
  - Checks: A freeze by the bank can't be undone by the customer, and staff see the customer's cards. Support can read but not freeze.
  - Expected: Admin freeze 200 frozenBy admin, customer unfreeze 403 CARD_FROZEN_BY_BANK with a notification, Support freeze 403
- **validation and access**
  - File: `tests/e2e/app/api-bank-cards.spec.ts`
  - Checks: Bad limits, statuses and purchases are refused with the field named, and only the owner can change a card.
  - Expected: 400 naming the field for each bad change and purchase; 404 for another customer, 403 for the demo, 401 signed out

### File: `tests/e2e/app/api-bank-connected.spec.ts`

9 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **money from someone else notifies the recipient; your own moves don't**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: Money from another customer makes a notification; moving your own money doesn't.
  - Expected: no notification for an own transfer; one unread money_received for 4200 from the sender; none for the sender
- **mark one read, mark all read, and nobody else's**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: One notification can be marked read, then all of them; another customer can't touch them.
  - Expected: 3 unread; 404 for the sender marking one; 200 and 2 unread after one; marked 2 and 0 unread after all
- **loan decisions and role changes notify the customer**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: An approved loan and a new role each reach the customer as a notification.
  - Expected: two notifications, newest first: 'Your role is now Support', 'Your loan was approved'
- **ask, and the other customer pays: a real transfer, both sides told**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: A request the other side pays becomes a real transfer, and both are told.
  - Expected: 201 pending; payer told and pays 200; balances move by 2500; asker told; a second pay 409 REQUEST_NOT_PENDING
- **decline and cancel, and only the right side can answer**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: The payer can decline, the asker can cancel, and neither can do the other's part.
  - Expected: asker can't pay (404), payer can't cancel (404); payer declines, asker told; asker cancels; a late pay 409, no money moved
- **a request needs a real payer and amount; paying needs the money**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: A request must name a real other customer and a sane amount, and paying needs the money.
  - Expected: own account 400, demo account 403, unknown account 404, 0 and over the cap 400; paying more than the balance 409 INSUFFICIENT_FUNDS, still pending
- **a customer's ticket goes to the inbox, staff answer, it gets solved**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: A ticket about a transaction reaches the staff inbox, staff answer, the customer replies, and only staff can mark it solved.
  - Expected: 201 open ticket about the opening deposit; in the staff inbox; answered with a notification; open again on reply; customer 403 on solve; staff solve with a notification
- **tickets are private, and transactions must be your own**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: Another customer can't read or answer a ticket, and a ticket can't point at someone else's transaction.
  - Expected: another customer 404 on read and reply, 403 on the staff inbox; a ticket about their transaction 400 on transactionId
- **demo tickets are read-only, for the customer and for staff**
  - File: `tests/e2e/app/api-bank-connected.spec.ts`
  - Checks: The demo customer's solved ticket can be read but not added to, by them or by staff.
  - Expected: one solved demo ticket with 3 messages; 403 on a new ticket; Admin reply 403 DEMO_READ_ONLY

### File: `tests/e2e/app/api-bank-graphql-more.spec.ts`

9 tests in this file.

What the file is about: The type of a request context.

- **cards: get one, read its details, pay with it, page its charges**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: A card can be got, read, paid with, and its charges paged, all matching REST.
  - Expected: card ACTIVE; details equal REST's; 3 approved charges; 2 pages, 375-250-125, same ids as REST
- **a frozen card declines, and a limit outside the rules is refused**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: Freezing through GraphQL declines purchases; a bad limit and a second card are refused.
  - Expected: FROZEN by customer; a purchase declined 'frozen'; limit 50 VALIDATION_FAILED; second getCard CARD_EXISTS
- **someone else's card answers as not found**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: Another customer's card is "not found".
  - Expected: CARD_NOT_FOUND
- **orders and alerts: place, page, cancel, as REST sees them**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: Orders and alerts work through GraphQL, and REST sees the same state.
  - Expected: 3 open BUY orders, listed newest first; the first cancelled in GraphQL and REST; an ETH alert armed, listed, then cancelled
- **API keys: made and listed with the session, never with a key**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: A key is made and listed with the session. Used as the only sign-in, a read key can read but can't manage keys or change anything, and a revoked key stops working.
  - Expected: READ key made, token starts with its prefix, listed; with the key: me reads, apiKeys KEY_MANAGEMENT_NEEDS_SESSION, mutations 403 KEY_READ_ONLY; revoked, then 401
- **history a page at a time: every row once, newest first, as REST lists it**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: Paging an account's history returns every row once, newest first, the same as REST.
  - Expected: total and ids equal REST's, no duplicates, ceil(rows / 3) pages
- **a cursor this API did not give out, or a page too big, is refused**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: A made-up cursor, a forged one, and page sizes of 0 or 101 are refused.
  - Expected: BAD_CURSOR for nonsense and for a forged cursor; VALIDATION_FAILED for first 0 and first 101
- **a query too wide is refused by its cost; an ordinary one is not**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: A shallow but very wide query is refused by its cost; an ordinary page query is fine.
  - Expected: the wide query QUERY_TOO_COSTLY naming 5000; the ordinary query has no errors
- **demo accounts can read their cards but not get a new one**
  - File: `tests/e2e/app/api-bank-graphql-more.spec.ts`
  - Checks: The demo customer can read cards but not get a new one.
  - Expected: cards read with no errors; getCard DEMO_READ_ONLY

### File: `tests/e2e/app/api-bank-graphql.spec.ts`

21 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **a GraphQL answer is HTTP 200; signed out, the error says so**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: Errors come back inside a 200 answer; signed out, the error says to sign in.
  - Expected: NOT_SIGNED_IN, message 'Sign in first.', data null
- **me and accounts match what REST returns**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: GraphQL's "me" and "accounts" say the same as the REST API.
  - Expected: me = the new customer; account numbers and the first balance equal REST's
- **you get back only the fields you asked for**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: Asking for one field returns that field and nothing else.
  - Expected: an account object with exactly one key: number
- **an account carries its own history, with filters and pages**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: An account's history can be filtered and paged, with the same page-size limit as REST.
  - Expected: 3 outgoing, page 1 of 2 with 2 rows, newest -3000 to Savings; pageSize 5000 VALIDATION_FAILED
- **someone else's account answers as not found**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: Asking for another customer's account says "not found", as if it did not exist.
  - Expected: ACCOUNT_NOT_FOUND
- **a nested counterparty never carries the other customer's name or email**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: The other side of a transfer shows its account number, never its owner's name or email.
  - Expected: counterparty accountNumber = theirs, fullName null, email null, their email nowhere in the answer
- **addFunds and transfer move real money, seen by REST**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: GraphQL's addFunds and transfer change the real balances, and REST sees it.
  - Expected: addFunds +150000; transfer 50000 not replayed; REST shows +100000 here and +50000 there
- **a transfer keeps every rule REST has**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: Every refusal REST gives a transfer, GraphQL gives too, and no money moves.
  - Expected: VALIDATION_FAILED x3, RECIPIENT_NOT_FOUND, DEMO_ACCOUNT, ACCOUNT_NOT_FOUND, INSUFFICIENT_FUNDS; balance unchanged
- **demo accounts can read everything but change nothing**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: The demo customer can read through GraphQL but not change anything.
  - Expected: isDemo true, accounts listed; addFunds DEMO_READ_ONLY
- **bill pay: payees and a payment through GraphQL**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: A bill can be paid through GraphQL, and the payee list comes back too.
  - Expected: payBill names City Power for 12500, Checking down by 12500; payees = [City Power]
- **a loan quote matches the REST quote, to the cent**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: GraphQL's loan quote equals REST's for the same customer.
  - Expected: monthly, interest and APR equal REST's; 24 rows ending at balance 0
- **a loan asked for in REST is visible in GraphQL, with its schedule**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: A loan asked for through REST shows in GraphQL with its full schedule, and never names the borrower to the customer.
  - Expected: loans = [the loan]; loan pending for 1200000, customer null, 12 months; listed schedule ends at 0
- **notifications, requests and support come through one query**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: Asking for money, seeing it, and paying it all work through GraphQL.
  - Expected: askForMoney pending 2500; payer has 1 unread request_received and the request; pays it, asker +2500; paying twice REQUEST_NOT_PENDING
- **a ticket opened in GraphQL reaches the staff inbox**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: A ticket opened through GraphQL reaches staff, they answer through GraphQL, and REST shows the same thread.
  - Expected: ticket open, first message from the customer; Support reply makes it answered; customer told; REST thread has 2 messages
- **someone else's ticket, request and notification stay private**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: Another customer can't read a ticket or mark a notification that isn't theirs.
  - Expected: TICKET_NOT_FOUND; NOTIFICATION_NOT_FOUND
- **introspection describes the schema, for the explorer**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: Introspection works, so the GraphQL explorer can show the schema.
  - Expected: no errors; Query and Mutation types; MoneyAccount and Cents among the types
- **a broken query is refused with a readable message**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: An unknown field, broken syntax, an empty query and a fractional Cents are each refused with a clear code.
  - Expected: GRAPHQL_VALIDATION_FAILED naming 'nope'; GRAPHQL_VALIDATION_FAILED; VALIDATION_FAILED; GRAPHQL_VALIDATION_FAILED for 1.5
- **a query deeper than the limit is refused**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: A query nested too deep is refused, and the message names the limit.
  - Expected: QUERY_TOO_DEEP, message mentions 8
- **Cents carries money past the 32-bit Int limit**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: Balances above the 32-bit integer limit still come back exact.
  - Expected: 22 x addFunds 100000000; balance = start + 2200000000, above 2147483647, a number; read back and REST agree
- **the endpoint takes JSON only**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: The endpoint refuses a form-encoded body: JSON only.
  - Expected: 415 JSON_REQUIRED
- **an unexpected failure never leaks how the server works**
  - File: `tests/e2e/app/api-bank-graphql.spec.ts`
  - Checks: When the database itself fails, the answer is a plain message with no stack trace and no table names.
  - Expected: SERVER_ERROR, 'Something went wrong.', no stacktrace, no table name in the answer

### File: `tests/e2e/app/api-bank-keys.spec.ts`

6 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **a key is made once, shown once, and opens the API without a cookie**
  - File: `tests/e2e/app/api-bank-keys.spec.ts`
  - Checks: The token is shown once, the list shows only its prefix, and the token on its own opens the API as that customer.
  - Expected: token pbk_ + 32 chars, prefix = its first 12; list shows the prefix, never the token; the key alone reads /me as the customer with rate-limit headers; lastUsedAt set
- **a read key reads but cannot change; a write key can**
  - File: `tests/e2e/app/api-bank-keys.spec.ts`
  - Checks: A read key can read but not change; a write key can change. In GraphQL, a query is a read and a mutation is a change.
  - Expected: read key: accounts 200, add payee 403 KEY_READ_ONLY; write key: add payee 201; read key GraphQL query 200, mutation 403 KEY_READ_ONLY
- **a revoked or unknown key answers 401 KEY_INVALID**
  - File: `tests/e2e/app/api-bank-keys.spec.ts`
  - Checks: A revoked key and a made-up key are both refused the same way.
  - Expected: key works (200); revoked (200, revokedAt set); then 401 KEY_INVALID; revoking again 404; a made-up key 401 KEY_INVALID
- **keys cannot manage keys**
  - File: `tests/e2e/app/api-bank-keys.spec.ts`
  - Checks: Even a write key can't list or make keys: that needs a signed-in session.
  - Expected: list keys and make a key, each 403 KEY_MANAGEMENT_NEEDS_SESSION
- **a key is limited per minute, and says so**
  - File: `tests/e2e/app/api-bank-keys.spec.ts`
  - Checks: A key has a per-minute limit; going over is refused with how long to wait.
  - Expected: limit x 200 with remaining 0 at the end; then 429 KEY_RATE_LIMITED, retryAfterSeconds >= 1 matching Retry-After
- **validation, the cap, and who may make keys**
  - File: `tests/e2e/app/api-bank-keys.spec.ts`
  - Checks: A bad name or scope is refused, there is a cap on active keys, and only a signed-in, non-demo customer may make keys.
  - Expected: 400 on name and on scope; keys up to the cap, then 409 TOO_MANY_KEYS; demo 403; signed out 401

### File: `tests/e2e/app/api-bank-loan-rate.spec.ts`

7 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **the offer explains itself, and the reasons add up to the rate**
  - File: `tests/e2e/app/api-bank-loan-rate.spec.ts`
  - Checks: The quote lists its reasons, they add up to the APR, and they describe this customer's real money.
  - Expected: term - discount + exposure = APR; balance = Checking + Savings; score in (0, 1]; exposure > 0
- **two customers asking the same thing get different offers**
  - File: `tests/e2e/app/api-bank-loan-rate.spec.ts`
  - Checks: Two customers asking for the same loan get different rates, because their money differs: there is no rate card.
  - Expected: the richer customer's quoted balance is higher, and the two APRs differ
- **spending money makes the next offer dearer, and receiving makes it cheaper**
  - File: `tests/e2e/app/api-bank-loan-rate.spec.ts`
  - Checks: Sending most of your money away raises your next rate; receiving it lowers the receiver's.
  - Expected: after an 80% transfer: the sender's APR goes up, the receiver's goes down
- **buying crypto also makes the next offer dearer**
  - File: `tests/e2e/app/api-bank-loan-rate.spec.ts`
  - Checks: Turning most of the balance into Bitcoin leaves less money at the bank, so the next loan costs more.
  - Expected: after buying BTC with 80% of Checking: quoted balance lower, APR higher
- **a bigger ask against the same money costs more**
  - File: `tests/e2e/app/api-bank-loan-rate.spec.ts`
  - Checks: Asking for much more than you hold costs more than a small ask.
  - Expected: the $1,000,000 ask has a higher exposure, exposure bp and APR than the $1,000 ask
- **longer money costs more, for everyone**
  - File: `tests/e2e/app/api-bank-loan-rate.spec.ts`
  - Checks: 12, 24, 36 and 60 months each cost more than the one before.
  - Expected: APR rises at each of 12, 24, 36 and 60 months
- **the rate is fixed on the loan when it is asked for**
  - File: `tests/e2e/app/api-bank-loan-rate.spec.ts`
  - Checks: The loan keeps the rate it was asked at, even if the customer's money changes later.
  - Expected: loan APR = the quote's APR; after spending half of Checking, the loan's APR and payment are unchanged

### File: `tests/e2e/app/api-bank-market.spec.ts`

12 tests in this file.

What the file is about: The type of a request context.

- **the market lists every coin, open to a visitor who is not signed in**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: Anyone can see the market: all eight coins, each with a sane price and a 24-point sparkline.
  - Expected: 8 coins in order; each named, price a positive integer, change an integer, 24 integer spark points
- **two viewers get different prices for the same coin at the same instant**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: Two viewers at the same instant see different prices.
  - Expected: no coin has the same price for both viewers
- **one viewer at one pinned instant always gets the same price**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: The same viewer at the same pinned instant always sees the same prices.
  - Expected: both answers identical, stamped with the pinned instant
- **the price moves on its own as the instant moves**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: Five minutes later, every price has moved.
  - Expected: all 8 prices differ between 12:00 and 12:05
- **a visitor on the live clock cannot pin the instant**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: A visitor without a runKey can't pin the time: they always get now.
  - Expected: 200, stamped after 2020 (the pinned 2020 instant ignored)
- **a coin page answers with a chart, and its high and low bound the series**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: A coin's page has a 24-hour chart whose high and low really are the series' highest and lowest points.
  - Expected: BTC Bitcoin 24h; high = max, low = min of the series; series oldest to newest, ending at the pinned instant
- **each range draws its own window**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: The 1-hour and 30-day ranges have their own number of points, end on the same price, and the month spans a wider band.
  - Expected: 1h has 60 points, 30d has 90; same current price; the 30d band is wider
- **the symbol is not case sensitive**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: "btc" and "BTC" are the same coin.
  - Expected: btc comes back as BTC with the same price
- **an unknown coin is 404 and a bad range is 400**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: An unknown coin is not found; an unknown range is refused, listing the good ones.
  - Expected: NOPE 404 NOT_FOUND; range 99y 400 VALIDATION naming 1h
- **GraphQL and REST answer with the same price at the same instant**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: GraphQL and REST give the same coin page at the same instant.
  - Expected: price, high, low and series equal between REST 7d and GraphQL D7
- **a price stays an exact integer past the 32-bit ceiling**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: Bitcoin's price is above the 32-bit integer limit and still exact.
  - Expected: BTC priceMicros above 2147483647 and a safe integer
- **PLANTED BUG bankCryptoPriceType: the price comes back as a string**
  - File: `tests/e2e/app/api-bank-market.spec.ts`
  - Checks: With the planted bug armed for one runKey, prices come back as strings for that runKey only.
  - Expected: clean: number; armed (bankCryptoPriceType): string in the market and on the coin page; another runKey: number

### File: `tests/e2e/app/api-bank-money.spec.ts`

16 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **a new customer opens funded, with their own amounts**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: A new customer starts with funded Checking and Savings, in amounts of their own.
  - Expected: checking then savings; both funded, savings > checking, total = sum, between $60,000 and $160,000; numbers PB-0000-0000
- **two new customers do not open on the same balance**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Two new customers don't start with the same money.
  - Expected: the two opening totals differ
- **Add funds takes $0.01 to $1,000,000 at a time**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: A deposit can be from one cent to a million dollars; anything else is refused.
  - Expected: $1,000,000 added; over the cap, 0, -500, 12.5 and '100' each 400 on amountCents; balance up by exactly $1,000,000
- **open an account with its own name and starting amount**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: A customer can open a third account with a name and opening amount; bad kinds, amounts and names are refused.
  - Expected: 201 savings 'Holiday fund' with 50000; 3 accounts; 400 for brokerage, over the cap, and a one-letter name
- **a transfer between your own accounts records both sides**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Moving money between your own accounts writes a line on each side, linked by the same transfer id.
  - Expected: 201 not replayed; Checking -12345, Savings +12345; transfer_out and transfer_in lines with the same transferId
- **send money to another customer by account number**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Money can go to another customer by their account number, written with or without dashes.
  - Expected: 201; the transfer names the number with dashes; the recipient is up by 50000
- **a transfer can't spend more than the account holds**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: One cent more than the balance is refused, and neither balance moves.
  - Expected: 409 INSUFFICIENT_FUNDS; both balances unchanged
- **a transfer amount must be a whole number of cents above zero**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Zero, negative, fractional and string amounts are refused, and so is sending to the same account.
  - Expected: 400 on amountCents for 0, -100, 10.5 and '500'; 400 on toAccountNumber to itself; balance unchanged
- **the same Idempotency-Key moves the money once**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Sending twice with the same Idempotency-Key moves the money once.
  - Expected: 201 then 200 replayed with the same transfer id; Checking down by 7500 once
- **two transfers at the same moment can't overdraw the account**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Two transfers fired at once can't both spend the same money.
  - Expected: one 201 and one 409; Checking down by one amount only
- **another customer's account answers 404**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Another customer's account looks like it doesn't exist, and can't be sent from.
  - Expected: 404 ACCOUNT_NOT_FOUND for their account, history and CSV; 404 sending from theirs; 404 RECIPIENT_NOT_FOUND to an unknown number; their balance unchanged
- **demo accounts can be browsed but never send or receive money**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: The demo accounts can be read but not paid into, sent from, or sent to.
  - Expected: demo accounts PB-1000-0001 and -0002 with over 10 history rows; deposit 403; send 403 DEMO_READ_ONLY; a customer sending to it 403 DEMO_ACCOUNT
- **history filters by date, type and amount, 20 to a page**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: History pages 20 at a time and filters by type, amount and date; bad filters are refused.
  - Expected: 22 rows, 2 pages of 20 and 2, newest 2100, oldest opening; deposit 22, out 0, $10-$15 is 6, today 22, Jan 2020 0; 400 for each bad filter
- **the CSV statement adds up and defuses formulas**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: The CSV statement's rows add up to its total, and a memo that looks like a spreadsheet formula is made harmless.
  - Expected: 200 text/csv named after the account; the header row; 3 rows; the formula memo starts with '; the rows sum to the Total line
- **staff see a customer's accounts; customers can't**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Support staff can see a customer's profile and accounts; a customer can't.
  - Expected: customer 403 on their own staff view; Support 200 with the user and 2 accounts
- **recent activity lists the latest moves, newest first**
  - File: `tests/e2e/app/api-bank-money.spec.ts`
  - Checks: Recent activity shows at most 8 moves, newest first.
  - Expected: 200; at most 8 rows; the first is the 999-cent deposit

### File: `tests/e2e/app/api-bank-orders.spec.ts`

6 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **a buy order whose limit the price already meets fills on the next request**
  - File: `tests/e2e/app/api-bank-orders.spec.ts`
  - Checks: A buy with a limit above today's price fills as soon as the customer makes another request.
  - Expected: placed open; on the next read filled at or below the limit with a trade; Checking -50000, BTC held, an order_filled notification
- **an order out of reach stays open and can be cancelled**
  - File: `tests/e2e/app/api-bank-orders.spec.ts`
  - Checks: A buy far below the price waits, takes no money, and can be cancelled once.
  - Expected: open with the balance unchanged; cancel 200 cancelled; cancel again 404 ORDER_NOT_FOUND
- **a sell order fills at or above its limit**
  - File: `tests/e2e/app/api-bank-orders.spec.ts`
  - Checks: A sell far above the price waits; one just below it fills at or above its limit.
  - Expected: a sell at twice the price stays open; a sell at 99% fills at or above its limit and the balance goes up
- **time as an input: an order fills at a past instant where the price was lower**
  - File: `tests/e2e/app/api-bank-orders.spec.ts`
  - Checks: Reading the orders "at" an earlier instant runs the fill check as of that instant, so an order at the day's low fills there.
  - Expected: a buy at the day's low stays open now, and fills at or below that low when read at its instant
- **a price alert fires once, with the price it saw**
  - File: `tests/e2e/app/api-bank-orders.spec.ts`
  - Checks: An alert the price already meets fires once and says so; one out of reach stays armed until cancelled.
  - Expected: a below-alert just over the price fires at or under its limit with a price_alert notification; a far above-alert stays armed, cancels, then 404
- **validation and access**
  - File: `tests/e2e/app/api-bank-orders.spec.ts`
  - Checks: Bad orders are refused with the field named; an unknown coin and selling coin you don't have are refused; demo and signed-out access are limited.
  - Expected: 400 on side, limitMicros, spendCents, accountId; 404 COIN_NOT_FOUND; 409 NOT_ENOUGH_COIN; demo 403 to place, 200 to read; signed out 401

### File: `tests/e2e/app/api-bank-rules.spec.ts`

11 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **the same Idempotency-Key charges a card once and replays the answer**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: A card charge sent twice with one key charges once.
  - Expected: 201, then 200 with Idempotent-Replayed: true and the same charge; one charge on the card; Checking down once
- **add funds and a loan ask happen once per key**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: Add funds and a loan ask are retry-safe too.
  - Expected: two deposits with one key: 201 then 200, the balance up once; two loan asks with one key: one loan
- **a key reused for a different request is refused with 422**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: One key, a different request: refused, through every money door.
  - Expected: a transfer, then the same key with another amount: 422 IDEMPOTENCY_KEY_REUSED and money moved once; the same through a card charge and GraphQL
- **a refused checkout frees its key for the corrected request**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: A request that failed lets go of its key.
  - Expected: checkout with a key and a wrong total: 409 PRICE_CHANGED; the same key with the right total: 201
- **every answer has an X-Request-Id; a sensible one sent is kept**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: Every bank answer carries a request id.
  - Expected: no id sent: a new UUID back; 'trace-abcdef12' sent: the same back; a bad one replaced
- **the audit log records a transfer through REST and through GraphQL**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: The log records the same action through both doors.
  - Expected: two money.transfer lines for this customer: one rest, one graphql, both session, each with its transfer id; the REST line's request id is the answer's X-Request-Id
- **the log marks API-key changes and records staff actions**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: A change made with an API key says so, and staff actions are logged too.
  - Expected: a deposit made with a write key logs auth api_key; the Admin's refund logs staff.order_refund by the Admin
- **the log pages with a cursor and downloads as CSV**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: The log pages with a cursor, and downloads as CSV.
  - Expected: three deposits: pages of 1 hand over a cursor, three different lines in all, no fourth page; the CSV has a header and three lines
- **the books check a customer's accounts after a purchase and a refund**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: The books: a busy customer's accounts still add up.
  - Expected: after transfers, a deposit, a purchase and its refund, neither of the customer's accounts is out of balance; demo accounts counted as sample data
- **only an Admin reads the log, the CSV and the books**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: Admin only: the log, its CSV and the books.
  - Expected: a customer and Support get 403 on all three; GraphQL books FORBIDDEN
- **GraphQL reads the log and the books for an Admin**
  - File: `tests/e2e/app/api-bank-rules.spec.ts`
  - Checks: Every door: the log and the books through GraphQL.
  - Expected: auditLog filtered to this customer holds their deposit as REST; books answers with balanced and the counts

### File: `tests/e2e/app/api-bank-scheduled.spec.ts`

7 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **starts on the real date, moves forward in whole days, and comes back**
  - File: `tests/e2e/app/api-bank-scheduled.spec.ts`
  - Checks: The clock starts on the real date, moves a whole day at a time, rejects bad steps, and resets. The demo clock can't move.
  - Expected: offset 0 on the real date; +1 day, then +1 more by default; 400 for 0, 367, 1.5, -1; reset to offset 0; demo 403 and stays at 0; signed out 401
- **a payment set for tomorrow is paid when the customer's tomorrow comes**
  - File: `tests/e2e/app/api-bank-scheduled.spec.ts`
  - Checks: A one-off payment for tomorrow waits, then is paid when the customer's clock reaches its run day, and the customer is told.
  - Expected: active, 0 runs, due tomorrow; nothing moves until the run day; then done, paid once, Checking -12050, a 'Power' bill payment and a scheduled_paid notification
- **a payment due on a weekend is paid on the Monday after**
  - File: `tests/e2e/app/api-bank-scheduled.spec.ts`
  - Checks: A payment due on a Saturday waits through the weekend and is paid on Monday.
  - Expected: runsOn Monday; still active on Saturday and Sunday with no money moved; done on Monday, Checking -5000
- **a weekly payment comes back every seven days**
  - File: `tests/e2e/app/api-bank-scheduled.spec.ts`
  - Checks: A weekly payment is paid, then due again seven days later, and again.
  - Expected: after the first run: 1 run, active, paid, next due +7; after the second: 2 runs, next due +14; Checking -5000
- **a monthly payment keeps its day, and the 31st becomes the last day of a shorter month**
  - File: `tests/e2e/app/api-bank-scheduled.spec.ts`
  - Checks: A monthly payment on the 31st moves to the last day of a shorter month, never skipping it.
  - Expected: anchorDay 31; after the first run: 1 run, active, next due on the last day of the next (shorter) month
- **not enough money: the payment is skipped and the customer is told**
  - File: `tests/e2e/app/api-bank-scheduled.spec.ts`
  - Checks: A payment bigger than the balance fails on its day, takes nothing, and the customer is told.
  - Expected: failed after 1 run, lastResult failed, balance unchanged, a scheduled_failed notification saying 'was not paid'
- **cancel, validation, and who may do what**
  - File: `tests/e2e/app/api-bank-scheduled.spec.ts`
  - Checks: Cancelling stops a payment for good; bad fields are refused one by one; another customer can't cancel it; the demo customer can only read.
  - Expected: cancel 200 cancelled, again 404 SCHEDULE_NOT_FOUND; it never runs; 400 naming each bad field; another customer 404; demo 403 to schedule, 200 to read

### File: `tests/e2e/app/api-bank-security.spec.ts`

11 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **every kind of response carries the security headers**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: Pages, APIs and the docs all carry the same security headers, and no HSTS over plain http.
  - Expected: for /app, /api/health, /api/bank/status, /login, /api/docs: 200, nosniff, DENY, the referrer, permissions, COOP, COEP, CORP and CSP headers; no HSTS
- **the app shell gets a fresh nonce every time, and the page carries it**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: Each load of the app gets a new nonce, the policy needs it for scripts and styles, and the page's tags carry it.
  - Expected: a nonce that differs between two loads; script-src and style-src need it; no unsafe-inline; the placeholder is replaced and the nonce appears more than once
- **hashed assets may be cached for a year; the shell may not**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: The shell is never cached; the hashed script files are cached for a year and allow nothing to run from them.
  - Expected: shell no-store; its hashed index-\*.js 200, cached a year, immutable, with a policy that allows nothing
- **the classic pages hash their inline scripts instead of allowing all of them**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: The classic login page lists the hashes of its own inline scripts instead of allowing every inline script.
  - Expected: /login script-src has 'self' and a sha256 hash, no unsafe-inline
- **HSTS is sent only when the request came over https**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: HSTS appears only when the request came through https (as the x-forwarded-proto header says behind a proxy).
  - Expected: no HSTS over plain http; max-age=31536000; includeSubDomains when forwarded as https
- **too many wrong passwords hold the email, even for the right one, then the hold releases itself**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: Five wrong passwords start a hold that refuses even the right password, and the hold ends by itself.
  - Expected: 4 x 401 INVALID_CREDENTIALS; the 5th 429 TOO_MANY_ATTEMPTS with Retry-After; the right password 429 while held; then 200 once the hold ends
- **the hold is per email: another customer logs in while one is held**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: One customer being held doesn't stop another from signing in.
  - Expected: after 5 wrong passwords for one customer, another customer signs in (200)
- **a customer sees every signed-in browser, ends the others, and those are signed out**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: The customer sees both signed-in browsers, ends the other one, and that browser is signed out.
  - Expected: 2 sessions, one current, each with a device; end-others ends 1; the other browser 401, this one 200; 1 session left
- **ending the current session clears the cookie**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: Ending your own current session signs you out and clears the cookie.
  - Expected: 200 { ended: true, current: true }, a Max-Age=0 cookie, then /me 401
- **a session that is not yours cannot be ended, and looks like it does not exist**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: Another customer's session can't be ended, and looks like it doesn't exist.
  - Expected: 404 SESSION_NOT_FOUND; the other customer stays signed in (200)
- **a visitor who is not signed in gets 401**
  - File: `tests/e2e/app/api-bank-security.spec.ts`
  - Checks: Someone signed out can't list or end sessions.
  - Expected: 401 on the session list and on end-others

### File: `tests/e2e/app/api-bank-shop.spec.ts`

14 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **the catalogue lists 48 products from the database, with stock**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: The products now come from the database, in the shape they always had.
  - Expected: 48 products on both APIs; sku-001 is $115 / 11500 cents, Available, with a whole number in stock
- **a signed-out visitor sees the product but no price of their own**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: Signed out: the product, but no personal price and no cart.
  - Expected: sku-002 answers with the product only; adding to cart is 401
- **a customer buys: money and stock go down, the order and its receipt appear**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: The whole purchase: cart, checkout, the money, the stock, the order, the history row, the receipt, and privacy.
  - Expected: 3 x sku-010 at its list price: 201; balance down by the total; a shop_purchase row; stock 20 -> 17 on both APIs; cart empty; the order placed with one step; a shop_order notification; another customer gets 404
- **a total that doesn't match charges nothing and says the real one**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: The total the customer was shown is a check: a different one charges nothing and says the real total.
  - Expected: checkout with $1 against sku-011's real total: 409 PRICE_CHANGED with totalCents; balance, stock and cart unchanged; no order
- **a backordered product can't be added to the cart**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: A Backordered product can't go in the cart.
  - Expected: sku-009 is Backordered: 409 BACKORDERED and an empty cart
- **asking for more than is in stock is refused**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: More than there is: refused when adding, with how many there are.
  - Expected: sku-012 with 2 in stock: 3 is 409 OUT_OF_STOCK available 2; 2 is 201; quantity 0 or 100 is 400
- **checking out an empty cart is refused**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: Nothing in the cart: nothing to pay.
  - Expected: 409 CART_EMPTY and the balance unchanged
- **not enough money: nothing is charged and nothing leaves the shelf**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: Not enough in the account: the whole checkout rolls back.
  - Expected: a cart of sku-043 worth more than Checking holds: 409 INSUFFICIENT_FUNDS; balance, stock and cart unchanged
- **after $1,000 in the shop the next cart is 2% off**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: Spending in the shop earns the next tier: 2% off from $1,000.
  - Expected: 4 x sku-014 ($1,240) earns 200 basis points; 1 x sku-015 then costs its price less 2% (rounded down), on the cart, the product page and the order
- **the same Idempotency-Key twice pays once and replays the first answer**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: A retried checkout with the same Idempotency-Key pays once.
  - Expected: 201, then 200 with Idempotent-Replayed: true and the same order; one order, one payment, stock down by one
- **two checkouts for the last item: one order, the other is out of stock**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: Two customers race for the last one: exactly one gets it.
  - Expected: sku-023 with 1 in stock, two customers pay at once: one 201 and one 409 OUT_OF_STOCK; stock 0
- **a demo account can't put anything in a cart**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: Demo accounts can look but not buy.
  - Expected: maya@ adding sku-003: 403 DEMO_READ_ONLY
- **GraphQL buys the same way: cart, checkout, the order and the money**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: Every door: the same purchase through GraphQL.
  - Expected: addToCart, cart and checkout through GraphQL: the order PLACED with sku-017, the balance down by the total, the same order on REST
- **every new answer matches its schema in openapi.json**
  - File: `tests/e2e/app/api-bank-shop.spec.ts`
  - Checks: The REST docs describe what the shop, the back office, the audit log and the books really answer.
  - Expected: products, one product, the cart, a checkout, my orders, one order, the staff list, the audit page and the books all match their OpenAPI schemas

### File: `tests/e2e/app/api-bank-trading.spec.ts`

13 tests in this file.

What the file is about: The type of a request context.

- **a buy takes money out of the account and gives back coin**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: A buy prices itself consistently, takes the money out of Checking, and the coin shows in the portfolio.
  - Expected: net 50000, fee = net x feeBp, gross = net - fee, atoms > 0, 15 s to expire; filled 201; Checking -50000; one BTC position at cost 50000
- **the buy shows in the bank's own history, not a separate one**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: The buy is a line in the bank's own activity list.
  - Expected: newest activity: crypto_buy 'Bought ETH' for -20000, balance after = start - 20000
- **selling returns money and books the profit or loss**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: Selling half returns money, keeps half the cost on the rest, and books the profit or loss.
  - Expected: sell fee = gross x feeBp, net = gross - fee; balance = start - 100000 + net; half the SOL left at cost 50000; realised matches the trade
- **a price expires after fifteen seconds and cannot be used twice**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: A quote can't be used after it expires, nor used twice.
  - Expected: a 2020 quote 409 QUOTE_EXPIRED with no money moved; a live quote fills once, then 409 QUOTE_USED
- **the same quote sent twice at once fills exactly once**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: Two fills of one quote sent at the same moment: only one goes through.
  - Expected: one 201 and one 409; Checking -40000 once; the position holds the quote's atoms once
- **you cannot spend money you don't have, or sell coin you don't hold**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: A buy bigger than the balance, and a sale of coin not held, are both refused.
  - Expected: a buy over the balance fills 409 INSUFFICIENT_FUNDS, balance unchanged; quoting a sale of 1 BTC not held 409 INSUFFICIENT_FUNDS
- **the fee falls as a customer trades more**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: The fee rate drops once the customer has traded a lot.
  - Expected: first quote 30 bp; after three $20,000 buys, a lower fee rate
- **the amount is checked before anything is priced**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: A bad amount or side is refused before any price is made; an unknown coin is not found.
  - Expected: 400 for spend 0, -100, over the cap, 10.5, side 'sideways', sell 0 atoms; 404 for coin NOPE
- **a signed-out visitor cannot trade**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: Quoting, trading and the portfolio all need a signed-in customer.
  - Expected: 401 on quote, trade and portfolio
- **buying and selling through GraphQL moves the same money**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: A buy through GraphQL moves the same money, and REST sees the same holding.
  - Expected: GraphQL quote BUY net 30000; trade leaves balance - 30000; REST portfolio shows ETH with the same quantity
- **PLANTED BUG bankQuoteExpired: a stale price still fills**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: With the planted bug armed, a quote from years ago still fills.
  - Expected: with bankQuoteExpired armed: a 2020 quote fills 201 and Checking -10000
- **PLANTED BUG bankProfitSign: a gain is shown as a loss**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: With the planted bug armed, a gain on the position shows as a loss of the same size.
  - Expected: at the same instant, the armed (bankProfitSign) unrealised result is minus the clean one, on the total and on the position
- **PLANTED BUG bankFeeHidden: the total leaves the fee out**
  - File: `tests/e2e/app/api-bank-trading.spec.ts`
  - Checks: With the planted bug armed, a sale's total leaves the fee out.
  - Expected: clean: fee > 0 and net = gross - fee; armed (bankFeeHidden): net = gross, more than gross - fee

### File: `tests/e2e/app/api-bank-wallet.spec.ts`

14 tests in this file.

What the file is about: The type of a request context.

- **every coin gets an address, and it checks out**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: Each of the eight coins has an address in the right shape, and the addresses don't change between reads.
  - Expected: 8 wallets, each address pbx1 + the coin + 13 checksum-alphabet characters; the same on a second read
- **two customers never share an address**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: No two customers get the same address for any coin.
  - Expected: for every coin, the two customers' addresses differ
- **sending moves coin from one customer to another, minus a fee**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: Coin sent to another customer arrives in full; the sender also pays a fee.
  - Expected: preview 100000 atoms + a fee; sent 201 delivered; receiver +100000, sender -100000 - fee
- **a mistyped address is refused before anything moves**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: An address with one wrong character fails its checksum and nothing moves.
  - Expected: 400 with a toAddress error mentioning the check; holding unchanged
- **the wrong coin's address, and your own, are both refused**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: Sending to your own address, or to another coin's address, is refused.
  - Expected: 400 'your own' for own BTC address; 400 'ETH address' for the ETH address
- **you cannot send more coin than you hold**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: Sending 99 BTC with far less is refused.
  - Expected: 409 INSUFFICIENT_FUNDS for 99 BTC
- **an amount is read digit by digit, not through a float**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: A typed amount becomes exactly that many atoms (no float rounding), and malformed amounts are refused.
  - Expected: 0.29 -> 29000000, 1.15 -> 115000000, 0.1 -> 10000000, 0.00000001 -> 1; 400 for '', '.', 'abc', '-1', 9 decimals and '1,5'
- **swapping turns one coin into another and keeps the cost**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: A swap turns BTC into ETH, coin for coin, with no bank money moving.
  - Expected: preview ETH > 0 with fee = value x feeBp; swap 201; BTC -100000, ETH = the swap's atoms; newest bank activity still the crypto_buy
- **swapping a coin into itself is refused**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: BTC into BTC is refused.
  - Expected: 400 with a toSymbol error saying 'different'
- **sends and swaps show up in the wallet's history**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: A send and a swap appear in the wallet's history, and the receiver sees the send coming in.
  - Expected: sender: 1 send out, 1 swap to SOL; receiver: 1 send in
- **a signed-out visitor has no wallet**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: The wallet, send and swap all need a signed-in customer.
  - Expected: 401 on wallet, send and swap
- **GraphQL sends and swaps the same way**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: Sending and swapping work through GraphQL too, with readable errors, and REST sees the results.
  - Expected: sendCoin delivered 0.001; a bad address VALIDATION_FAILED; swapCoin to ETH; REST shows 1 send and 1 swap
- **PLANTED BUG bankBadAddress: a mistyped address is accepted and the coin is lost**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: With the planted bug armed, a made-up address is accepted and the coin disappears.
  - Expected: with bankBadAddress armed: send to a made-up address 201, delivered false, sender -100000 - fee
- **PLANTED BUG bankCryptoFloat: a typed amount loses its last atom**
  - File: `tests/e2e/app/api-bank-wallet.spec.ts`
  - Checks: With the planted bug armed, typed amounts go through a float and lose an atom.
  - Expected: clean 0.29 -> 29000000 and 1.15 -> 115000000; armed (bankCryptoFloat) one atom fewer each

### File: `tests/e2e/app/api-bank.spec.ts`

8 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **status says which database runs**
  - File: `tests/e2e/app/api-bank.spec.ts`
  - Checks: The status endpoint names the database the bank is running on.
  - Expected: 200, database pglite or postgres
- **sign up, read the account, sign out**
  - File: `tests/e2e/app/api-bank.spec.ts`
  - Checks: Signing up gives a customer account (never its password hash), /me reads it, and signing out ends the session.
  - Expected: a customer account with no passwordHash; /me 200; logout 200 with a Max-Age=0 cookie; then /me 401
- **log-in answers: wrong password, locked account, missing fields**
  - File: `tests/e2e/app/api-bank.spec.ts`
  - Checks: A wrong password, a locked account and missing fields each get their own answer.
  - Expected: 401 INVALID_CREDENTIALS; 403 ACCOUNT_LOCKED for the locked demo; 400 naming email and password
- **sign-up validates every field and refuses a taken email**
  - File: `tests/e2e/app/api-bank.spec.ts`
  - Checks: Every bad sign-up field is reported at once, and an email already in use (in any letter case) is refused.
  - Expected: 400 naming acceptTerms, email, fullName, password; 409 EMAIL_TAKEN for the demo email in capitals
- **changes must be sent as JSON**
  - File: `tests/e2e/app/api-bank.spec.ts`
  - Checks: A form-encoded log-in is refused: changes must be JSON.
  - Expected: 415 JSON_REQUIRED
- **Bank users: 401 signed out, 403 for customers, 200 for staff**
  - File: `tests/e2e/app/api-bank.spec.ts`
  - Checks: The staff user list: refused signed out, forbidden to customers, open to Support.
  - Expected: 401 signed out; 403 FORBIDDEN for the demo customer; 200 for Support, listing the demo Admin
- **only an Admin changes users, and never itself or a demo account**
  - File: `tests/e2e/app/api-bank.spec.ts`
  - Checks: Support can't change a user; an Admin can, but not themselves or a demo account.
  - Expected: Support 403; Admin promotes the customer to support (200); Admin locking itself 409; changing the demo customer 403 DEMO_READ_ONLY
- **profile and settings updates are validated**
  - File: `tests/e2e/app/api-bank.spec.ts`
  - Checks: Bad profile and settings changes are refused with the fields named; good ones are saved.
  - Expected: profile 400 naming phone and postalCode, then 200 city Lisbon; settings 400, then 200

### File: `tests/e2e/app/api-openapi-contract.spec.ts`

15 tests in this file.

What the file is about: Reads openapi.json from disk, so answers can be checked against the contract.

- **health response conforms to HealthResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **orders response conforms to OrdersResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **products response conforms to ProductsResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **product detail response conforms to ProductResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **users response conforms to UsersResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **session response conforms to SessionResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **flags response conforms to FlagsResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **practice response conforms to PracticeState**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **market response conforms to BankMarketResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **coin detail response conforms to BankCoinDetail**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Expected: 2xx, and the body matches {schema}
- **the served /api/openapi.json matches the repo spec**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Checks: The document the server serves is the same one in the repo.
  - Expected: 2xx, OpenAPI 3.1.0, the same paths as openapi.json
- **a quote, a trade and the portfolio all match the spec**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Checks: A quote, a trade, the portfolio and the trade list each match their schema.
  - Expected: BankTradeQuote, BankTradeResult, BankPortfolio and BankTradesResponse all valid
- **the wallet, a send and a swap all match the spec**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Checks: The wallet, a send preview, a send and a swap each match their schema.
  - Expected: BankWalletResponse, BankSendPreview, BankWalletSend and BankWalletSwap all valid
- **productSchemaDrift makes /api/products violate ProductsResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Checks: With the planted bug armed, products no longer match their schema.
  - Expected: with productSchemaDrift armed, /api/products is NOT valid
- **bankCryptoPriceType makes the market violate BankMarketResponse**
  - File: `tests/e2e/app/api-openapi-contract.spec.ts`
  - Checks: With the planted bug armed, the market and coin page no longer match their schemas.
  - Expected: with bankCryptoPriceType armed, the market and the BTC page are NOT valid

### File: `tests/e2e/app/api-practice-mode.spec.ts`

8 tests in this file.

What the file is about: The type of a request context.

- **is off for a visitor who has not asked for it**
  - File: `tests/e2e/app/api-practice-mode.spec.ts`
  - Checks: A new visitor starts with practice mode off and no runKey.
  - Expected: off, runKey null, more than 20 bugs in the catalogue
- **the catalogue describes every bug it arms**
  - File: `tests/e2e/app/api-practice-mode.spec.ts`
  - Checks: Every planted bug in the catalogue is fully described, once, and never shows the value its flag is set to.
  - Expected: each bug has a flag name, REPORT or HEAL, a kind, a where, and a real title, hint and reveal; no value; each flag once
- **turning it on makes the site buggy, and off makes it clean again**
  - File: `tests/e2e/app/api-practice-mode.spec.ts`
  - Checks: On, the site serves its planted faults (a price as a string); off, it is clean again.
  - Expected: price a number; on with a practice- runKey, price a string; off, price a number again
- **one visitor's practice mode leaves everybody else alone**
  - File: `tests/e2e/app/api-practice-mode.spec.ts`
  - Checks: Practice mode for one visitor doesn't touch another visitor.
  - Expected: this visitor sees a string price; a second visitor is off and sees a number
- **it never arms the shared defaults**
  - File: `tests/e2e/app/api-practice-mode.spec.ts`
  - Checks: Practice mode never changes the flags that everyone without a runKey reads.
  - Expected: the global flags keep productSchemaDrift and bankNegativeTransfer false
- **the mode follows the visitor across the site**
  - File: `tests/e2e/app/api-practice-mode.spec.ts`
  - Checks: The visitor's runKey travels in a cookie, so other parts of the site are armed too.
  - Expected: the market answers a string price; the flag store has bankCryptoPriceType true for the runKey
- **asking for it twice is harmless**
  - File: `tests/e2e/app/api-practice-mode.spec.ts`
  - Checks: Turning it on twice keeps the same runKey.
  - Expected: the same runKey both times, and still on
- **a body without `on` is treated as off**
  - File: `tests/e2e/app/api-practice-mode.spec.ts`
  - Checks: Posting without "on" turns it off.
  - Expected: 200 with on false, and the state reads off

### File: `tests/e2e/app/api-schema-files.spec.ts`

2 tests in this file.

What the file is about: Node's file and path tools.

- **bank/schema.sql and docs/database.md match the migrations**
  - File: `tests/e2e/app/api-schema-files.spec.ts`
  - Checks: The checked-in SQL schema and its doc match what the migrations build.
  - Expected: no stale files (else: run npm run db:schema)
- **bank/schema.graphql matches the schema the server runs**
  - File: `tests/e2e/app/api-schema-files.spec.ts`
  - Checks: The checked-in GraphQL schema matches the one the server runs.
  - Expected: the file equals the printed schema (else: run npm run graphql:schema)

### File: `tests/e2e/app/bank-backoffice-bugs.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankShopRefundTwice: the same order is refunded twice**
  - File: `tests/e2e/app/bank-backoffice-bugs.spec.ts`
  - Checks: The refund never asks whether it already happened.
  - Expected: with bankShopRefundTwice armed: two refunds of sku-039's order both 200; refundedCents twice the total; the balance up by the total once too many
- **bankShopStatusSkip: an order jumps to delivered and back to packed**
  - File: `tests/e2e/app/bank-backoffice-bugs.spec.ts`
  - Checks: Any step from any step.
  - Expected: with bankShopStatusSkip armed: placed -> delivered 200, then delivered -> packed 200
- **bankShopSupportRefund: read-only Support refunds an order**
  - File: `tests/e2e/app/bank-backoffice-bugs.spec.ts`
  - Checks: The refund asks "staff?" instead of "Admin?".
  - Expected: with bankShopSupportRefund armed: Support's refund of sku-041's order is 200 and the order is refunded; moving it is still 403

### File: `tests/e2e/app/bank-card-bugs.spec.ts`

1 test in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankCardLimitPerCharge: many small purchases walk past the daily limit**
  - File: `tests/e2e/app/bank-card-bugs.spec.ts`
  - Checks: With the bug armed, the daily limit is checked against each purchase alone, so two purchases under the limit go over it together.
  - Expected: with bankCardLimitPerCharge armed: two $60 purchases on a $100 limit both approved; spent today 12000; Checking -12000

### File: `tests/e2e/app/bank-data-bugs.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankMemoNoLimit: nothing behind the app stops a 5,000-character memo**
  - File: `tests/e2e/app/bank-data-bugs.spec.ts`
  - Checks: With the bug armed, the app's memo check is skipped and the database keeps a 5,000-character memo.
  - Expected: clean: 400 with a memo error naming 140; armed (bankMemoNoLimit): 201 and the stored memo is 5000 characters
- **bankGraphqlKeyScope: a read-only key can charge a card through GraphQL**
  - File: `tests/e2e/app/bank-data-bugs.spec.ts`
  - Checks: With the bug armed, a read-only key can charge a card through GraphQL, though REST still refuses the same charge.
  - Expected: clean: GraphQL chargeCard 403 KEY_READ_ONLY; armed (bankGraphqlKeyScope): 200 approved for 2500; REST charge still 403
- **bankCursorSkip: paging with cursors loses a row between pages**
  - File: `tests/e2e/app/bank-data-bugs.spec.ts`
  - Checks: With the bug armed, paging through the history with cursors skips rows, though the total still counts them.
  - Expected: clean: every row once; armed (bankCursorSkip): same total, fewer rows, at least one missing

### File: `tests/e2e/app/bank-key-bugs.spec.ts`

1 test in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankKeyScopeLeak: a read-only key can add a payee**
  - File: `tests/e2e/app/bank-key-bugs.spec.ts`
  - Checks: With the bug armed, a read-only key can add a payee, though every other change is still refused.
  - Expected: with bankKeyScopeLeak armed: the read key's scheduled payment 403 KEY_READ_ONLY, but its new payee 201

### File: `tests/e2e/app/bank-money-bugs.spec.ts`

18 tests in this file.

What the file is about: The type of a browser page.

- **bankNegativeTransfer: a negative amount pulls money the wrong way**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, the transfer page accepts a minus sign and the money moves backwards.
  - Expected: with bankNegativeTransfer armed: the summary reads -$500.00, a receipt shows, Checking +50000 and Savings -50000
- **bankDoubleSubmit: a double-click sends the transfer twice**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, a double-click on Confirm sends two transfers.
  - Expected: with bankDoubleSubmit armed: a double-click makes 2 outgoing transfers and Checking -20000
- **without bankDoubleSubmit, a double-click sends one transfer**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: Without the bug, the same double-click sends one transfer.
  - Expected: a double-click makes 1 outgoing transfer and Checking -10000
- **bankTransferRace: two transfers at once overdraw the account**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, two transfers at once both pass the balance check.
  - Expected: with bankTransferRace armed: two 80% transfers at once both 201, Checking down by both
- **bankStaleBalance: the Bank page keeps the old balance after a transfer**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, the Bank page keeps showing the balance from before a transfer until it is reloaded.
  - Expected: with bankStaleBalance armed: the receipt shows the new balance, the overview still the old one, the reload the new one
- **bankDateFilterOffByOne: the date filter leaves out the last day**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, a date range that ends today leaves today out.
  - Expected: today-to-today: 2 rows clean; 0 with bankDateFilterOffByOne armed
- **bankStatementTotal: the statement's total leaves out the last row**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, the statement's total leaves out the last row.
  - Expected: with bankStatementTotal armed: the $42 deposit row is there, but the Total equals the opening amount only
- **bankLoanRounding: the payments don't pay the loan off**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, the monthly payment is cut down instead of rounded, so the schedule never pays the loan off.
  - Expected: for the first amount where the armed payment is lower: same APR; clean schedule ends at 0; armed schedule ends above 0
- **bankPayeeIdor: any customer can delete someone else's payee**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, any customer can delete another customer's payee.
  - Expected: clean delete of the victim's payee 404; armed (bankPayeeIdor) 200 and the victim has no payees
- **bankNotificationCount: reading notifications never lowers the count**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, marking everything read leaves the unread count as it was.
  - Expected: after read-all: unread 0 clean; 1 with bankNotificationCount armed
- **bankRequestDoublePay: a paid request can be paid again**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, a money request can be paid twice.
  - Expected: with bankRequestDoublePay armed: paying the $50 request twice is 200 both times, the asker +10000
- **bankSupportStatus: the customer's reply leaves the ticket on Answered**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, a customer's reply leaves the ticket on Answered instead of opening it again.
  - Expected: clean: the customer's reply reopens the ticket (open); armed (bankSupportStatus): it stays answered
- **bankNegativeTransfer: a negative amount pulls money the wrong way in GraphQL too**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, a negative GraphQL transfer moves money backwards.
  - Expected: clean: VALIDATION_FAILED, balance unchanged; armed: no errors, Checking +50000, Savings -50000
- **bankTransferRace: two GraphQL transfers at once overdraw the account**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, two GraphQL transfers of the whole balance both go through.
  - Expected: with bankTransferRace armed: two full-balance transfers at once, no errors, Checking at minus the balance
- **bankDateFilterOffByOne: the GraphQL history filter leaves out the last day**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, GraphQL's date filter leaves out today too.
  - Expected: today-to-today: more than 0 rows clean; 0 armed
- **bankGraphqlOwnerLeak: a nested field leaks another customer's name and email**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, the counterparty on a transfer shows the other customer's name and email.
  - Expected: clean: counterparty is only the account number; armed (bankGraphqlOwnerLeak): plus the other customer's name and email
- **bankGraphqlErrorDetail: an error leaks the internal message and stack**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, a server error shows the database's message and a stack trace.
  - Expected: clean: 'Something went wrong.' and no stack; armed (bankGraphqlErrorDetail): SERVER_ERROR with 'invalid byte sequence' and a stack naming node_modules
- **bankGraphqlDepth: a query with no depth limit is allowed through**
  - File: `tests/e2e/app/bank-money-bugs.spec.ts`
  - Checks: With the bug armed, a query past the depth limit runs.
  - Expected: clean: QUERY_TOO_DEEP; armed (bankGraphqlDepth): no errors and data comes back

### File: `tests/e2e/app/bank-order-bugs.spec.ts`

1 test in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankSellLimitInverted: a sell order fills below the limit the customer set**
  - File: `tests/e2e/app/bank-order-bugs.spec.ts`
  - Checks: With the bug armed, a sell order fills although the price is far below its limit.
  - Expected: with bankSellLimitInverted armed: a sell at twice the price fills, below its limit

### File: `tests/e2e/app/bank-rules-bugs.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankIdempotencyMismatch: a reused key hides a different transfer**
  - File: `tests/e2e/app/bank-rules-bugs.spec.ts`
  - Checks: A reused key with a different request is answered with the first result.
  - Expected: with bankIdempotencyMismatch armed: $10 then $90 with one key; the second answers 200 replayed with the $10 transfer; only $10 moved
- **bankAuditGraphqlGap: a GraphQL transfer leaves no line in the audit log**
  - File: `tests/e2e/app/bank-rules-bugs.spec.ts`
  - Checks: GraphQL changes are never written to the log.
  - Expected: with bankAuditGraphqlGap armed: a REST and a GraphQL transfer both go through, but the log holds only the REST one
- **bankRefundNoEntry: a refund the statement never shows, caught by the books**
  - File: `tests/e2e/app/bank-rules-bugs.spec.ts`
  - Checks: A refund with no history row: the books catch it.
  - Expected: with bankRefundNoEntry armed: the refund puts the money back but writes no shop_refund row; the books list the account, out by the order's total

### File: `tests/e2e/app/bank-schedule-bugs.spec.ts`

1 test in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankMonthlyRepeatOverflow: a monthly payment set for the 31st skips the short month**
  - File: `tests/e2e/app/bank-schedule-bugs.spec.ts`
  - Checks: With the bug armed, a monthly payment on the 31st rolls past a shorter month instead of landing on its last day.
  - Expected: with bankMonthlyRepeatOverflow armed: after 1 run, next due is not the short month's last day but day 1-3 of the month after

### File: `tests/e2e/app/bank-security-bugs.spec.ts`

1 test in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankEndOthersKeepsOne: log out everywhere else leaves the newest other device signed in**
  - File: `tests/e2e/app/bank-security-bugs.spec.ts`
  - Checks: With the bug armed, "log out everywhere else" ends one device too few.
  - Expected: with bankEndOthersKeepsOne armed: ended 1 of 2; the second device 401, the third (newest) still 200

### File: `tests/e2e/app/bank-shop-bugs.spec.ts`

4 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **bankShopOversell: two customers both buy the last item**
  - File: `tests/e2e/app/bank-shop-bugs.spec.ts`
  - Checks: Two checkouts read the last one at the same time and both win.
  - Expected: with bankShopOversell armed, sku-022 with 1 in stock and two checkouts at once: both 201, two orders, stock 0
- **bankShopClientPrice: checkout charges whatever total is sent**
  - File: `tests/e2e/app/bank-shop-bugs.spec.ts`
  - Checks: The account is charged the total the browser sent.
  - Expected: with bankShopClientPrice armed, sku-024 for $1: 201, totalCents 100, the line still at its list price, the balance down by $1
- **bankShopClientPrice: the same $1 checkout works through GraphQL**
  - File: `tests/e2e/app/bank-shop-bugs.spec.ts`
  - Checks: The same bug through the other door.
  - Expected: with bankShopClientPrice armed, GraphQL checkout of sku-025 for $1: no error, totalCents 100
- **bankShopBackorderBuyable: a backordered product goes in the cart and sells**
  - File: `tests/e2e/app/bank-shop-bugs.spec.ts`
  - Checks: The server never checks Backordered, so the API sells it.
  - Expected: with bankShopBackorderBuyable armed, sku-027 (Backordered): add 201, checkout 201, the order holds it

### File: `tests/e2e/app/react-a11y.spec.ts`

6 tests in this file.

What the file is about: axe-core's Playwright runner, which checks a page for accessibility problems.

- **create-user dialog has no axe violations by default**
  - File: `tests/e2e/app/react-a11y.spec.ts`
  - Checks: The create-user dialog passes axe with nothing armed.
  - Expected: no axe violations inside the create-user dialog
- **REPORT: armed usersA11yBug introduces a missing-label violation**
  - File: `tests/e2e/app/react-a11y.spec.ts`
  - Checks: With the bug armed, a field in the dialog loses its label and axe says so.
  - Expected: with usersA11yBug armed: axe finds a 'label' violation in the dialog
- **the markets page has no axe violations**
  - File: `tests/e2e/app/react-a11y.spec.ts`
  - Checks: The whole markets page passes axe.
  - Expected: no axe violations on /app/markets
- **the wallet has no axe violations**
  - File: `tests/e2e/app/react-a11y.spec.ts`
  - Checks: The whole wallet page passes axe for a signed-in customer.
  - Expected: no axe violations on /app/wallet
- **the practice page has no axe violations**
  - File: `tests/e2e/app/react-a11y.spec.ts`
  - Checks: The whole practice page passes axe.
  - Expected: no axe violations on /app/practice
- **a coin page has no axe violations**
  - File: `tests/e2e/app/react-a11y.spec.ts`
  - Checks: The whole Bitcoin page, chart included, passes axe.
  - Expected: no axe violations on /app/markets/BTC

### File: `tests/e2e/app/react-account.spec.ts`

2 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **shows the anonymous state by default**
  - File: `tests/e2e/app/react-account.spec.ts`
  - Checks: With nothing armed, the page shows the signed-out state.
  - Expected: the account-anon panel is visible
- **REPORT: authRequired surfaces the 401 session-expired state**
  - File: `tests/e2e/app/react-account.spec.ts`
  - Checks: With authRequired armed, the API answers 401 and the page says the session expired.
  - Expected: with authRequired armed: the account-expired panel is visible

### File: `tests/e2e/app/react-bank-accounts.spec.ts`

13 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **signing up creates an account and signs you in**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: Signing up through the form makes the account and lands on its profile, signed in.
  - Expected: lands on /app/profile showing Noa Tester, the email, Customer, and Noa in the account menu
- **sign-up checks the form before sending it**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: The sign-up form shows each field's error before sending anything, and catches a mismatched password confirmation.
  - Expected: an empty submit shows the name, email, password and terms errors; a mismatched confirmation shows 'The passwords don't match.' and stays on /app/signup
- **sign-up refuses an email that already has an account**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: Signing up with an email already in use shows the server's message.
  - Expected: 'An account with this email already exists.'
- **a wrong password shows an error**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: A wrong password on the log-in form shows an error.
  - Expected: 'Wrong email or password.'
- **a page that needs an account asks you to log in, then takes you back**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: Opening a page that needs an account asks to log in, and logging in goes back to that page.
  - Expected: the sign-in prompt on /app/settings; login?next=/settings; after logging in, the settings form on /app/settings
- **editing your profile saves the changes**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: A profile edit is saved and shown on the profile.
  - Expected: back on /app/profile with 'saved', phone +44 20 7946 0958, city London, country United Kingdom
- **the profile form rejects a bad phone number**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: A phone number that isn't one is refused on the form.
  - Expected: a phone error, and the page stays on /app/profile/edit
- **demo accounts are read-only**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: The demo customer's profile can't be changed.
  - Expected: saving shows 'Demo accounts are read-only'
- **settings are saved and shown again after a reload**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: Settings are saved and still there after a reload.
  - Expected: the preview shows €; saved; after a reload EUR, de-DE and email alerts off
- **customers can't open Bank users**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: A customer is refused the staff user page and has no link to it.
  - Expected: admin-forbidden visible; no Bank users link in the sidebar
- **Support sees Bank users, read-only**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: Support sees the user list with a read-only note and no change buttons.
  - Expected: the users table, the read-only note, no toggle buttons, and the Bank users link
- **an Admin can lock an account, which then can't log in**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: An Admin locks a customer from the staff page, and that customer's log-in is refused.
  - Expected: the customer's status reads Locked; their log-in answers 403
- **the account menu shows staff links only to staff**
  - File: `tests/e2e/app/react-bank-accounts.spec.ts`
  - Checks: An Admin's account menu has the staff link, and Edit profile is enabled.
  - Expected: the Bank users entry in the account menu; Edit profile not disabled

### File: `tests/e2e/app/react-bank-backoffice.spec.ts`

5 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **an Admin packs and refunds an order from Shop orders**
  - File: `tests/e2e/app/react-bank-backoffice.spec.ts`
  - Checks: An Admin packs an order, then refunds it.
  - Expected: the order in 'To pack'; its page names the customer; Mark packed -> Packed; Refund -> Refunded with the total refunded; three steps; no actions left
- **Support sees the order read-only**
  - File: `tests/e2e/app/react-bank-backoffice.spec.ts`
  - Checks: Support looks; the actions aren't there.
  - Expected: Support: the read-only note on the list; on the order, 'Only an Admin can move or refund an order.' and no action buttons
- **a customer has no Shop orders page and no link to it**
  - File: `tests/e2e/app/react-bank-backoffice.spec.ts`
  - Checks: A customer has no back office.
  - Expected: a customer: the no-access card, and no Shop orders link
- **the customer is told in the bell when their order moves**
  - File: `tests/e2e/app/react-bank-backoffice.spec.ts`
  - Checks: The customer hears about each step.
  - Expected: after the Admin packs it, the customer's notifications show 'Order SO-… packed' and the receipt
- **an Admin sets a product's stock from its page**
  - File: `tests/e2e/app/react-bank-backoffice.spec.ts`
  - Checks: An Admin restocks from the product page.
  - Expected: sku-038: set to 7, 'Stock set to 7.', the page says 7 in stock

### File: `tests/e2e/app/react-bank-bills-loans.spec.ts`

10 tests in this file.

What the file is about: axe-core's Playwright runner, which checks a page for accessibility problems.

- **save a payee, then pay a bill with a review and a receipt**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: Save a payee on the page, then pay $120.50 through Review and Confirm, and see the receipt and the history.
- **the pay form checks the payee and the amount**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: The pay form needs a payee, and won't review an amount bigger than the balance.
- **delete a payee after confirming**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: A payee is deleted after a confirm dialog.
- **a demo customer sees payees but can't pay or change them**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: The demo customer sees their payees with a note, and no forms or delete buttons.
- **ask for a loan with a live quote and its schedule**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: The loan form shows a live quote that adds up, a 36-month schedule ending at zero, refuses a too-small amount, and sends a pending request.
- **an Admin approves from Loan requests and the customer gets the money**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: The Admin approves a loan on Loan requests, and the money reaches the customer.
- **an Admin rejects with a reason the customer can read**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: A rejection needs a reason, and the customer can read it.
- **Support sees Loan requests read-only; customers can't open it**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: Support sees Loan requests with a read-only note and no Approve button; a customer is refused the page.
- **a demo customer sees their loan and its schedule**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: The demo customer sees their approved loan and its 24-month schedule, with no form.
- **the bill pay and loan pages pass an accessibility scan**
  - File: `tests/e2e/app/react-bank-bills-loans.spec.ts`
  - Checks: Bill pay, Loans and the staff Loan requests page pass axe.

### File: `tests/e2e/app/react-bank-cards.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **get a card, see its details, set a limit, pay, get declined, freeze**
  - File: `tests/e2e/app/react-bank-cards.spec.ts`
  - Checks: The whole card journey on the Cards page: get one, show and hide its details, set a limit, pay, be declined over the limit and when frozen, and find the purchase in the account history.
  - Expected: an Active masked card; details shown then hidden; limit $500.00; $120.50 approved at Cloud Coffee; $400 declined over the limit; frozen declines; active again; 'Card purchase' in the history
- **an Admin freezes a card from the customer's profile, and the customer cannot undo it**
  - File: `tests/e2e/app/react-bank-cards.spec.ts`
  - Checks: The Admin freezes a card from the staff view; the customer sees "Frozen by the bank" and can't unfreeze it; the Admin unfreezes it.
  - Expected: the staff dialog shows Active, then 'Frozen by the bank'; the customer sees the same with a disabled freeze button and a note; back to Active
- **Support sees cards read-only; a demo customer and a visitor see the notes**
  - File: `tests/e2e/app/react-bank-cards.spec.ts`
  - Checks: Support sees the card with no freeze button; the demo customer sees a note; a signed-out visitor is asked to sign in.
  - Expected: Support: the card in the dialog with no freeze button; demo: the note, no issue button; signed out: the sign-in prompt, and the sidebar link opens /app/bank/cards

### File: `tests/e2e/app/react-bank-connected.spec.ts`

7 tests in this file.

What the file is about: axe-core's Playwright runner, which checks a page for accessibility problems.

- **money from another customer lights the bell, which leads to the history**
  - File: `tests/e2e/app/react-bank-connected.spec.ts`
  - Checks: Money from another customer shows a count on the bell, and the notification opens the account history with that payment.
  - Expected: no count; after $42 arrives the bell reads 1; the item says 'Money received' $42.00 and opens the account, where 'Lunch' is listed and the count is gone
- **ask for money, the other customer pays it, and both screens agree**
  - File: `tests/e2e/app/react-bank-connected.spec.ts`
  - Checks: One customer asks for money; the other sees it, pays it, and both pages say Paid.
  - Expected: the asker's row says Waiting; the payer is told, sees the request and pays it; both rows say Paid; the asker is told 'Your request was paid'
- **a declined request shows as Declined for the one who asked**
  - File: `tests/e2e/app/react-bank-connected.spec.ts`
  - Checks: A request the payer declines shows as Declined on both sides.
  - Expected: Declined on the payer's row and on the asker's row
- **report a problem on a transaction, staff answer, the customer sees it**
  - File: `tests/e2e/app/react-bank-connected.spec.ts`
  - Checks: A customer reports a transaction from the history, staff answer and solve it, and the customer sees the answer.
  - Expected: a ticket about 'Opening deposit', Open; staff see it Open, answer (Answered) and solve (Solved); the customer sees the answer, Solved, and 2 notifications
- **the demo customer reads a solved ticket and a welcome note**
  - File: `tests/e2e/app/react-bank-connected.spec.ts`
  - Checks: The demo customer has a welcome notification and one solved, read-only ticket.
  - Expected: 'Welcome to Playground Bank' in notifications; the support demo note, no form; the first ticket Solved with 3 messages, read-only
- **customers can't open the Support inbox**
  - File: `tests/e2e/app/react-bank-connected.spec.ts`
  - Checks: A customer is refused the staff Support inbox, and only has the Support link.
  - Expected: the forbidden panel; no Support inbox link; the customer's Support link
- **the connected pages pass an accessibility scan**
  - File: `tests/e2e/app/react-bank-connected.spec.ts`
  - Checks: Requests, Notifications, Support and a ticket page pass axe.
  - Expected: no axe violations in the main area of requests, notifications, support and the ticket page

### File: `tests/e2e/app/react-bank-devices.spec.ts`

4 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **lists this browser and the other one, and signs the other out**
  - File: `tests/e2e/app/react-bank-devices.spec.ts`
  - Checks: The page lists this browser and a second one, and "sign out the others" signs the second out.
  - Expected: 2 device rows, 1 current, '2 signed-in devices'; after ending the others: 'Signed out 1 other device.', 1 row, the button disabled, the other browser 401
- **ends one device from its own row**
  - File: `tests/e2e/app/react-bank-devices.spec.ts`
  - Checks: One other device can be ended from its own row; this device has no End button.
  - Expected: 2 rows, 1 End button; after ending: 1 row (this one), the other browser 401
- **asks a visitor to log in, and the sidebar links here**
  - File: `tests/e2e/app/react-bank-devices.spec.ts`
  - Checks: Signed out, the page asks to sign in; the sidebar links to it.
  - Expected: the sign-in prompt on /app/devices; the sidebar link opens /app/devices
- **no page, and no dialog, is refused by the policy**
  - File: `tests/e2e/app/react-bank-devices.spec.ts`
  - Checks: Every page and the account menu load with no "Refused to" message from the Content Security Policy.
  - Expected: every route shows the practice banner, the account menu opens, and the console has no CSP refusals

### File: `tests/e2e/app/react-bank-graphql.spec.ts`

8 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **runs the first example and shows the answer**
  - File: `tests/e2e/app/react-bank-graphql.spec.ts`
  - Checks: The explorer opens with an accounts query, and running it shows the customer's account with no errors.
  - Expected: heading GraphQL; the query mentions accounts; Run shows 'No errors' and the Checking number
- **picking an example loads its query and variables**
  - File: `tests/e2e/app/react-bank-graphql.spec.ts`
  - Checks: Choosing an example fills in its query and its variables.
  - Expected: the history example loads 'query History($id: ID!)' with a placeholder id; the loan example loads loanQuote with no variables
- **a query with variables runs against the signed-in customer**
  - File: `tests/e2e/app/react-bank-graphql.spec.ts`
  - Checks: The history example runs with the customer's own account id as its variable.
  - Expected: 'No errors' and the Checking number in the answer
- **the newer examples run: cards with their charges, and history a page at a time**
  - File: `tests/e2e/app/react-bank-graphql.spec.ts`
  - Checks: The cards example and the paged history example both run.
  - Expected: the cards example shows the card's last4 with no errors; the paged history example runs with no errors and an endCursor
- **variables that aren't JSON are caught before anything is sent**
  - File: `tests/e2e/app/react-bank-graphql.spec.ts`
  - Checks: Variables that aren't JSON are caught on the page, and nothing is sent.
  - Expected: 'The variables aren't valid JSON.'; no answer shown; 0 queries sent (apart from the schema lookup)
- **an error from the server is shown, not hidden**
  - File: `tests/e2e/app/react-bank-graphql.spec.ts`
  - Checks: An error from the server is shown on the page.
  - Expected: '1 error' and NOT_SIGNED_IN in the answer
- **the schema panel lists the real Query and Mutation fields**
  - File: `tests/e2e/app/react-bank-graphql.spec.ts`
  - Checks: The schema panel shows the server's real types and fields.
  - Expected: Query has accounts and loanQuote; Mutation has transfer; MoneyAccount has balanceCents: Cents!
- **the Developers group links to the explorer and the REST docs**
  - File: `tests/e2e/app/react-bank-graphql.spec.ts`
  - Checks: The sidebar links to the REST docs and to the explorer, which links to the docs too.
  - Expected: the API docs link goes to /api/docs; the GraphQL link opens /app/graphql, whose docs link goes to /api/docs

### File: `tests/e2e/app/react-bank-keys.spec.ts`

2 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **make a key, see it once, use it, revoke it**
  - File: `tests/e2e/app/react-bank-keys.spec.ts`
  - Checks: On the Developer page a key is made, its token shown once and usable anywhere, listed only by prefix, and then revoked.
  - Expected: a pbk_ token shown with an example; it opens /me (200); the row shows the name, prefix and Read only, never the token; revoked, then /me 401
- **a demo customer and a visitor see the notes, and the sidebar links here**
  - File: `tests/e2e/app/react-bank-keys.spec.ts`
  - Checks: The demo customer sees a note instead of the form; a signed-out visitor reaches the page from the sidebar and is asked to sign in.
  - Expected: demo: the note, no key form; signed out: the sidebar link opens /app/developer with the sign-in prompt

### File: `tests/e2e/app/react-bank-locale.spec.ts`

3 tests in this file.

What the file is about: Playground Bank in the customer's own currency and number format (Settings: currency, and "Language and date format"). Found by the bug hunt with Claude on 2026-11-14, and not planted (both still happened with practice mode off): with EUR and de-DE the transfer form wrote money as "17.771,30 €" but refused "250,00", and the price ticker and the product list showed dollars while the rest of the site showed euros.

- **a German amount (250,00) goes through the transfer form**
  - File: `tests/e2e/app/react-bank-locale.spec.ts`
  - Checks: The transfer form reads money the way the page writes it, and its hint is written the same way.
  - Expected: EUR and de-DE: 'abc' refused with 'Enter an amount like 250,00.'; 250,00 to Savings reviews as 250,00 €
- **the ticker and the Markets table both show euros**
  - File: `tests/e2e/app/react-bank-locale.spec.ts`
  - Checks: The ticker writes the same currency and format as the Markets table below it (the numbers themselves move every few seconds, so only the format is compared).
  - Expected: EUR and de-DE: the ticker and the BTC price show €, never $; the BTC change reads like +2,11 %
- **the product list and a product page show euros**
  - File: `tests/e2e/app/react-bank-locale.spec.ts`
  - Checks: The product list and a product's page write prices in the customer's currency, like the cart and the orders.
  - Expected: EUR and de-DE: the first product card's price and its page's price show €, never $

### File: `tests/e2e/app/react-bank-market.spec.ts`

8 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **lists every coin with a price, a change and a sparkline**
  - File: `tests/e2e/app/react-bank-market.spec.ts`
  - Checks: The market lists all eight coins, each with a price, a change and a sparkline.
  - Expected: heading Markets; 8 rows, each with a money price and a percent change; 8 sparklines
- **the market is open to a visitor who has not signed in**
  - File: `tests/e2e/app/react-bank-market.spec.ts`
  - Checks: The market needs no sign-in.
  - Expected: the market list and a money price for BTC, signed out
- **the top-bar ticker shows the same prices as the list**
  - File: `tests/e2e/app/react-bank-market.spec.ts`
  - Checks: The ticker across the top shows the same BTC price as the list.
  - Expected: the ticker contains the list's BTC price
- **a row opens that coin's page, and back returns to the market**
  - File: `tests/e2e/app/react-bank-market.spec.ts`
  - Checks: A row opens its coin's page, and Back returns to the market.
  - Expected: /app/markets/ETH with 'Ethereum (ETH)', a price and a chart; Back returns to /app/markets
- **the coin page draws a chart with a high and a low**
  - File: `tests/e2e/app/react-bank-market.spec.ts`
  - Checks: Bitcoin's page has a 24-hour chart with its high and low.
  - Expected: 'Bitcoin (BTC)'; the chart labelled for 24 hours; money high and low; the change mentions 24 hours
- **the range buttons change the window and are not dead controls**
  - File: `tests/e2e/app/react-bank-market.spec.ts`
  - Checks: The 30-day button really changes the chart: pressed state, label and high all move.
  - Expected: 24h pressed first; after 30d: 30d pressed, 24h not, the change and chart say 30 days, the high differs from the day's
- **an unknown coin says so instead of breaking**
  - File: `tests/e2e/app/react-bank-market.spec.ts`
  - Checks: An unknown coin shows a message instead of an error page.
  - Expected: 'No such coin.'
- **the exchange is reachable from the sidebar and the home hub**
  - File: `tests/e2e/app/react-bank-market.spec.ts`
  - Checks: The exchange is linked from the home hub and from the sidebar.
  - Expected: the crypto card is not 'Soon'; its link opens /app/markets; the sidebar link shows Markets

### File: `tests/e2e/app/react-bank-mobile.spec.ts`

7 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **the ☰ button opens the menu, and a pick goes there and shuts it**
  - File: `tests/e2e/app/react-bank-mobile.spec.ts`
  - Checks: The menu is shut at first; ☰ opens it with its groups; picking a page goes there and shuts it. Nothing is refused by the security policy.
  - Expected: ☰ on the left of the bar, the logo on the right; menu hidden, ☰ 'Open menu' not expanded; open: menu visible, 'Close menu', expanded; Markets opens /app/markets and the menu shuts; no CSP refusals
- **Escape and a tap beside the menu shut it**
  - File: `tests/e2e/app/react-bank-mobile.spec.ts`
  - Checks: While open the page behind doesn't scroll; Escape shuts it and puts focus back on ☰; a tap on the dark layer shuts it too.
  - Expected: open: html.menu-open; Escape: menu hidden, focus on ☰, no menu-open; open again, tap the backdrop: menu hidden
- **an admin's phone menu shows the staff links**
  - File: `tests/e2e/app/react-bank-mobile.spec.ts`
  - Checks: An admin's menu carries the back-office links.
  - Expected: as the demo admin: Bank users, Audit log and Books in the menu
- **no customer page is wider than the screen**
  - File: `tests/e2e/app/react-bank-mobile.spec.ts`
  - Checks: No customer page is wider than the phone, so nothing scrolls sideways.
  - Expected: all {CUSTOMER_ROUTES.length} customer pages fit in 390 px
- **no back-office page is wider than the screen**
  - File: `tests/e2e/app/react-bank-mobile.spec.ts`
  - Checks: The same for the back office, as the demo admin.
  - Expected: all {ADMIN_ROUTES.length} back-office pages fit in 390 px
- **a table row shows its column names and its actions on screen**
  - File: `tests/e2e/app/react-bank-mobile.spec.ts`
  - Checks: A table row is a card: each cell shows its column's name, and the row's ⋯ button sits inside the screen.
  - Expected: on Bank users, Maya's email cell is labelled 'Email' and shows it; her ⋯ button ends inside 390 px
- **keeps the side menu and normal tables**
  - File: `tests/e2e/app/react-bank-mobile.spec.ts`
  - Checks: At the suite's 1440 px the menu is the side menu as before, the ☰ button is hidden, and a table shows no column names in its cells.
  - Expected: at 1440 px: menu visible, ☰ hidden, Bank users' email cell draws no label

### File: `tests/e2e/app/react-bank-money.spec.ts`

16 tests in this file.

What the file is about: Reads a downloaded file from disk.

- **the Bank page shows a new customer's accounts and total**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: The Bank page shows the customer's two accounts, their total, and the opening deposit.
  - Expected: heading Bank; the total and each balance as money; the Checking number; Bank marked current; 'Opening deposit' in the activity
- **Add funds raises the balance, up to $1,000,000 at a time**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: Add funds refuses more than $1,000,000, and the $1,000 quick button adds that much.
  - Expected: $1,000,000.01 refused naming $1,000,000; the $1,000 button closes the dialog and raises Checking and the total by 100000
- **open an account with a starting amount**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: A new savings account with a name and $500 appears, and the total rises.
  - Expected: 3 account cards, the last 'Holiday fund' with $500.00; the total up by 50000
- **a transfer goes form, review, receipt, and the balances follow**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: A transfer runs from the form to a review to a receipt, and both balances change.
  - Expected: the review shows $1,250.50 to Savings with the memo; the receipt shows the amount and new balance; the Bank page shows Checking -125050, Savings +125050 and the memo
- **the transfer form checks the amount against the balance**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: The transfer form refuses zero, negative, three-decimal and over-balance amounts.
  - Expected: 0 and -5 'above zero'; 12.345 'like 250.00'; a cent over 'Checking holds &lt;balance>'; no summary
- **send money to another customer by account number**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: Money can go to another customer's account number; a malformed number is refused first.
  - Expected: 'PB-123' refused; to the real number the receipt names it and the recipient is up by 7500
- **a transfer to an unknown account number shows the server's answer**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: A number nobody has: the server's message shows, and Back keeps what was typed.
  - Expected: 'There's no account with that number.'; Back keeps PB-0000-0000 in the field
- **history filters by type and amount, and pages through 20 at a time**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: The account history pages 20 at a time and filters by amount and type.
  - Expected: 22 transactions, 20 on page 1 of 2 and 2 on page 2; $10-$15 is 6 with no pager; type out is empty; 'ten' shows an error
- **download the CSV statement**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: The statement downloads as a CSV named after the account, and its rows and total are right.
  - Expected: a statement-&lt;number>-\*.csv with the header, the $42 deposit row with its balance, and the closing Total
- **a demo customer can browse but not move money**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: The demo customer can look around but has no money buttons.
  - Expected: the demo note, 2 account cards, no add-funds or transfer buttons, a sign-up link; the first account PB-1000-0001 with history; the transfer page shows a note, no form
- **the demo note's Sign up leads to your own transfer form**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: The Sign up link on the demo note leads to a new account and straight back to a working transfer form.
  - Expected: sign-up with ?next=; after signing up, /app/bank/transfer with the form, from an account holding the new balance
- **signed-out visitors are asked to log in**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: Signed out, the Bank and Transfer pages ask to log in.
  - Expected: the sign-in prompt on /app/bank and /app/bank/transfer
- **another customer's account page says it doesn't exist**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: Another customer's account page says "not found" and shows no balance.
  - Expected: account-not-found shown, no balance
- **Bank users: staff open a customer's profile from the ⋯ menu**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: Support opens a customer's profile from the ⋯ menu (and can't change it).
  - Expected: the menu says 'Only an Admin' with no toggle; the profile dialog shows the name, 2 accounts and the Checking balance
- **Bank users: an Admin changes a role from the ⋯ menu**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: The Admin changes a customer's role to Support from the ⋯ menu.
  - Expected: the role dialog closes and the badge reads Support
- **the bank pages pass an accessibility scan**
  - File: `tests/e2e/app/react-bank-money.spec.ts`
  - Checks: The Bank, account and transfer pages pass axe.
  - Expected: no axe violations in the main area of /app/bank, the account page and /app/bank/transfer

### File: `tests/e2e/app/react-bank-notifications.spec.ts`

2 tests in this file.

What the file is about: Reads the schema and the web app's kind list from disk, for the guard below.

- **a declined card purchase shows in the bell and on the page**
  - File: `tests/e2e/app/react-bank-notifications.spec.ts`
  - Checks: The crash, as a customer met it: a declined card purchase.
  - Expected: a frozen card's purchase is declined; /app/notifications shows 'declined at Night Kiosk' with the page around it; the bell lists it; no page error
- **every notification kind the database allows has an icon in the app**
  - File: `tests/e2e/app/react-bank-notifications.spec.ts`
  - Checks: The cause, guarded: the web app knows every kind the database allows.
  - Expected: the kinds in bank/schema.sql's bank_notifications_kind_check are exactly the NotificationKind list in web/src/bankApi.ts

### File: `tests/e2e/app/react-bank-orders.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **place a buy order the price already meets, and watch it fill**
  - File: `tests/e2e/app/react-bank-orders.spec.ts`
  - Checks: A buy with a limit above the price fills while the page watches, and the coin then shows on the Portfolio page.
  - Expected: the new order turns Filled 'at $' within 15 s; the portfolio shows BTC and no open orders
- **a price alert fires on the page and an out-of-reach order is cancelled from the portfolio**
  - File: `tests/e2e/app/react-bank-orders.spec.ts`
  - Checks: An alert the price already meets fires on the page; an order far below the price waits on the Portfolio page and can be cancelled there.
  - Expected: the new alert turns Fired within 15 s; the half-price order shows on the portfolio and is cancelled, leaving none open
- **a demo customer sees the lists but no forms**
  - File: `tests/e2e/app/react-bank-orders.spec.ts`
  - Checks: The demo customer sees the orders panel with a note, but no form.
  - Expected: the orders panel and the demo note; no order form

### File: `tests/e2e/app/react-bank-rules.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **an Admin finds a customer's transfer in the Audit log**
  - File: `tests/e2e/app/react-bank-rules.spec.ts`
  - Checks: An Admin finds one customer's transfer in the log.
  - Expected: filtered to the customer: 1 line, money.transfer through REST; filtered to GraphQL: nothing; the CSV link carries the filter
- **the Books page lists an account a refund left out of balance (bankRefundNoEntry)**
  - File: `tests/e2e/app/react-bank-rules.spec.ts`
  - Checks: The Books page lists an account a refund left out of balance.
  - Expected: with bankRefundNoEntry armed for the refund: Books says Out of balance and lists the customer's account, out by the order's total
- **a customer has no Audit log or Books, and no links to them**
  - File: `tests/e2e/app/react-bank-rules.spec.ts`
  - Checks: Customers see neither page, nor a link to one.
  - Expected: both pages show their no-access card; neither link is in the menu

### File: `tests/e2e/app/react-bank-scheduled.spec.ts`

4 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **schedule a bill for tomorrow, move your clock, and watch it get paid**
  - File: `tests/e2e/app/react-bank-scheduled.spec.ts`
  - Checks: Schedule a payment for tomorrow on Bill pay, move the clock day by day on Practice, see it paid, then reset the clock.
  - Expected: the row shows City Power, Scheduled and tomorrow, no money moved; the clock reaches the run day; the row says Paid, 'Water' is in payments, Checking -4500; reset to the real date
- **cancel a scheduled payment from its row**
  - File: `tests/e2e/app/react-bank-scheduled.spec.ts`
  - Checks: A scheduled payment can be cancelled from its row.
  - Expected: the row reads Scheduled and Every month, then Cancelled with no cancel button
- **a demo customer sees the list but no form, and cannot move the clock**
  - File: `tests/e2e/app/react-bank-scheduled.spec.ts`
  - Checks: The demo customer sees the list with no form, and their clock can't move.
  - Expected: Bill pay: today shown, no schedule form; Practice: the real date, no advance button, a 'Demo accounts' note
- **a visitor is told to log in for a clock of their own**
  - File: `tests/e2e/app/react-bank-scheduled.spec.ts`
  - Checks: A signed-out visitor sees the clock card with a "Log in" note and no controls.
  - Expected: the clock card with a 'Log in' note and no advance button

### File: `tests/e2e/app/react-bank-shell.spec.ts`

9 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **shows the practice-site banner on every page**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: Every page carries the banner saying this is a practice site.
  - Expected: on each of the 6 pages, the banner mentions 'QA, agents and platform engineers'
- **the home hub links into the back office**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: The home hub's Bank and Crypto cards are real links, and Orders opens the Orders page.
  - Expected: the bank and crypto cards are not 'Soon' and have links; the Orders link opens /app/orders
- **the sidebar marks the current page**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: The sidebar marks the page you are on, and only that one.
  - Expected: on /app/users, Users has aria-current=page and Home does not
- **the gear shop sells crypto gear**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: The shop's first product is a crypto miner.
  - Expected: sku-001 is the Hashforge S1 Miner, in Compute
- **every product card has its own icon**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: All 48 product cards have an icon, and no two share one.
  - Expected: 48 icons in the grid, 48 different names
- **the guest menu offers log in, profile and settings**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: A signed-out visitor's menu offers Log in and View profile; Edit profile and Settings are greyed out.
  - Expected: Log in and View profile visible; Edit profile and Settings aria-disabled
- **logging in shows the user and role; logging out returns to Guest**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: Each test has its own browser context, so this session cookie stays here. Logging in as the demo customer shows their name and role; logging out goes back to Guest.
  - Expected: /app/profile shows Maya Chen, Customer, and Maya in the menu; after logout the menu says Guest
- **a locked account cannot log in**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: The locked demo account's log-in is refused with a message.
  - Expected: 'This account is locked.'
- **the About page credits the author**
  - File: `tests/e2e/app/react-bank-shell.spec.ts`
  - Checks: The About page names the author.
  - Expected: Asaf Nuri, Quality Platform Engineer

### File: `tests/e2e/app/react-bank-shop.spec.ts`

5 tests in this file.

What the file is about: axe-core's Playwright runner, which checks a page for accessibility problems.

- **a customer buys from the product page and follows the order**
  - File: `tests/e2e/app/react-bank-shop.spec.ts`
  - Checks: The whole purchase, clicked through.
  - Expected: sku-020: your price, 2 added, the top bar says 2; the cart totals 2 x the price; Pay opens the order, Placed, one step; stock 10 -> 8; My orders lists it; the balance down by the total; no cart count left; no axe violations on the cart and the order
- **the cart changes a quantity and removes a line**
  - File: `tests/e2e/app/react-bank-shop.spec.ts`
  - Checks: The cart's own controls.
  - Expected: sku-021 x1 in the cart; + makes it 2 and the total 2 x the price; remove empties the cart
- **a backordered product says why instead of showing Add to cart**
  - File: `tests/e2e/app/react-bank-shop.spec.ts`
  - Checks: No dead button on a product that can't be bought.
  - Expected: sku-018 signed in: 'Backordered' note, no Add to cart button
- **signed out, the product page offers a log-in and there is no cart**
  - File: `tests/e2e/app/react-bank-shop.spec.ts`
  - Checks: Signed out: a way in, not a broken form.
  - Expected: sku-019 signed out: the log-in card, no cart button, no Cart link
- **a demo account sees its price but a read-only note**
  - File: `tests/e2e/app/react-bank-shop.spec.ts`
  - Checks: Demo accounts look but don't buy.
  - Expected: maya@ on sku-019: the read-only note, no Add to cart

### File: `tests/e2e/app/react-bank-trading.spec.ts`

8 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **a visitor who is not signed in is asked to log in**
  - File: `tests/e2e/app/react-bank-trading.spec.ts`
  - Checks: Signed out, the trade panel asks to sign in and has no amount field.
  - Expected: the trade panel with a sign-in prompt and no amount field
- **the panel offers your own bank accounts with their balances**
  - File: `tests/e2e/app/react-bank-trading.spec.ts`
  - Checks: The panel lists the customer's own account and balance, and needs an amount before it can price anything.
  - Expected: the account picker shows Checking's number and balance; the price button is disabled
- **buy: price it, confirm it, and the money leaves the bank account**
  - File: `tests/e2e/app/react-bank-trading.spec.ts`
  - Checks: A $500 buy shows its price and a countdown, then takes $500 out of Checking.
  - Expected: the quote box: total $500.00, a $ price, an amount in BTC, a countdown in seconds; 'Bought'; Checking -50000
- **the portfolio shows the holding, the totals and the trade**
  - File: `tests/e2e/app/react-bank-trading.spec.ts`
  - Checks: After a buy, the Portfolio page shows the cost, the value, the position and the trade, and the position links to its coin.
  - Expected: heading Portfolio; cost $400.00; a $ value; an ETH position with a $ value; 'Bought' and ETH in the trades; the position opens /app/markets/ETH
- **an empty portfolio says so instead of showing nothing**
  - File: `tests/e2e/app/react-bank-trading.spec.ts`
  - Checks: With nothing bought, the Portfolio page says so.
  - Expected: the empty portfolio and empty trades messages; value $0.00
- **sell: the panel knows what you hold and pays the money back**
  - File: `tests/e2e/app/react-bank-trading.spec.ts`
  - Checks: Selling half of a holding through the panel pays some of the money back.
  - Expected: the sell side shows the SOL holding; selling half says 'Sold'; Checking ends between start - 30000 and start
- **the buy also lands in the bank's history and the bell**
  - File: `tests/e2e/app/react-bank-trading.spec.ts`
  - Checks: A buy shows in the bank's activity and as a notification.
  - Expected: 'Bought BTC' in the bank activity; BTC in the notifications
- **the exchange is reachable from the sidebar**
  - File: `tests/e2e/app/react-bank-trading.spec.ts`
  - Checks: The sidebar's Portfolio link works from the market.
  - Expected: the Portfolio link opens a page headed Portfolio

### File: `tests/e2e/app/react-bank-wallet.spec.ts`

10 tests in this file.

What the file is about: The type of a browser page.

- **a signed-out visitor is asked to log in**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: Signed out, the wallet asks to sign in and has no send form.
  - Expected: the sign-in prompt, and no send form
- **the page shows an address for every coin**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: The wallet lists an address for each of the eight coins.
  - Expected: heading Wallet; 8 addresses; BTC, ETH and PLAY in the pbx1 shape; an empty history
- **send: check the address, then send, and the coin arrives**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: Sending: check the address and see the fee and total, then send, and the other customer has the coin.
  - Expected: the preview shows 0.001 BTC, a fee and a total in BTC; 'Sent 0.001 BTC' and a Sent row; the receiver holds 100000 atoms
- **a mistyped address is caught at the check step**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: An address with one wrong character is refused when sending, and nothing goes.
  - Expected: on send, a send-to error mentioning the check, and no 'done' message
- **an amount with too many decimals is refused**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: Nine decimal places are refused.
  - Expected: an amount error for 0.123456789
- **swap: see what you'd get, then swap**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: Swapping BTC for ETH shows what you'd get and the fee, then swaps.
  - Expected: the preview names ETH and a $ fee; 'Swapped' and an ETH row; the portfolio has an ETH position
- **swapping a coin into itself is refused**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: BTC into BTC is refused on the form.
  - Expected: a swap-into error saying 'different'
- **REPORT bankBadAddress: the page says it was sent, and it landed nowhere**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: With the bug armed, a send to a made-up address says it was sent, and the history shows it never arrived.
  - Expected: with bankBadAddress armed: 'no wallet holds that address' after sending, and Landed reads No
- **REPORT bankCryptoFloat: the amount sent is a hair under what was typed**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: With the bug armed, 0.29 typed comes back as 0.28999999.
  - Expected: with bankCryptoFloat armed: 0.29 reads back as 0.28999999 BTC
- **the wallet is reachable from the sidebar**
  - File: `tests/e2e/app/react-bank-wallet.spec.ts`
  - Checks: The sidebar's Wallet link works.
  - Expected: the Wallet link opens a page headed Wallet

### File: `tests/e2e/app/react-flows.spec.ts`

2 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **loads seeded orders from the live API in stable mode**
  - File: `tests/e2e/app/react-flows.spec.ts`
  - Checks: The Orders page loads the three seeded orders, with stable mode selected.
  - Expected: the table shows ORD-1001, -1002 and -1003; the flaky button is there; stable is pressed
- **lists users and validates the create form before submit**
  - File: `tests/e2e/app/react-flows.spec.ts`
  - Checks: The Users page lists users, and its create form refuses an empty name before sending anything.
  - Expected: users table visible; an empty submit shows 'Name must be at least 2 characters.'; Cancel closes the dialog

### File: `tests/e2e/app/react-home-hero.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **the core flips over and over on its upright axis**
  - File: `tests/e2e/app/react-home-hero.spec.ts`
  - Checks: The core flips a full turn, rests, and flips again.
  - Expected: the core runs the hero-flip animation, forever; within one cycle it is seen edge-on or from behind (width below 0.5)
- **the coins travel round the core, behind it and in front**
  - File: `tests/e2e/app/react-home-hero.spec.ts`
  - Checks: The coins go round, one copy each, on both sides of the core.
  - Expected: each coin has exactly one visible copy; at least one coin in front of the core and one behind; every coin's position changes within a second
- **with reduced motion the coins stand still**
  - File: `tests/e2e/app/react-home-hero.spec.ts`
  - Checks: Reduced motion: the picture stands still.
  - Expected: with prefers-reduced-motion: reduce, the coins are placed and do not move over a second, and the core faces front

### File: `tests/e2e/app/react-orders.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **stable mode loads seeded orders**
  - File: `tests/e2e/app/react-orders.spec.ts`
  - Checks: In stable mode the seeded orders load.
  - Expected: the orders table shows ORD-1001
- **flaky mode recovers through the query retry**
  - File: `tests/e2e/app/react-orders.spec.ts`
  - Checks: In flaky mode the first load fails once, and the query's retry recovers it.
  - Expected: after one 503 and a retry, the table shows ORD-1001
- **HEAL: armed ordersRefreshLabel renames the control (selector drift)**
  - File: `tests/e2e/app/react-orders.spec.ts`
  - Checks: With the drift armed, the Refresh button's text changes but its test id doesn't.
  - Expected: with ordersRefreshLabel armed: orders-refresh reads 'Reload'

### File: `tests/e2e/app/react-practice-mode.spec.ts`

7 tests in this file.

What the file is about: The type of a browser page.

- **the switch is in the top bar, off, on every page**
  - File: `tests/e2e/app/react-practice-mode.spec.ts`
  - Checks: The switch is in the top bar of every page, and starts off.
  - Expected: the switch reads off on /app, /app/markets and /app/bank
- **the page lists every planted bug with where to look**
  - File: `tests/e2e/app/react-practice-mode.spec.ts`
  - Checks: The Practice page lists the planted bugs, each with its verdict and where to look.
  - Expected: heading 'What to look for'; bankNegativeTransfer REPORT on /app/bank/transfer; ordersRefreshLabel HEAL; more than 20 cards
- **an answer stays hidden until you ask for it**
  - File: `tests/e2e/app/react-practice-mode.spec.ts`
  - Checks: A bug's answer is hidden until its button is pressed, and hides again.
  - Expected: the bankTransferRace answer hidden; shown with 'Check-then-act' after a click; hidden after another
- **turning it on makes the site buggy, and off makes it clean**
  - File: `tests/e2e/app/react-practice-mode.spec.ts`
  - Checks: On, a planted fault is live (Orders' button reads Reload); off, it is clean again.
  - Expected: 'Practice mode is off', then on; Orders refresh reads Reload; after switching off, Refresh
- **the mode follows you from page to page**
  - File: `tests/e2e/app/react-practice-mode.spec.ts`
  - Checks: Once on, the switch stays on across pages, with no runKey in any URL.
  - Expected: the switch reads on at /app/markets, /app/bank and /app/orders, none with runKey in the URL
- **another visitor still sees the clean site**
  - File: `tests/e2e/app/react-practice-mode.spec.ts`
  - Checks: Practice mode in one browser doesn't reach a second browser.
  - Expected: this browser's Orders reads Reload; a second browser's reads Refresh with the switch off
- **the page is reachable from the sidebar**
  - File: `tests/e2e/app/react-practice-mode.spec.ts`
  - Checks: The sidebar's Practice link opens the page.
  - Expected: the Practice link opens 'What to look for'

### File: `tests/e2e/app/react-products.spec.ts`

57 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **lists all 48 seeded products**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Checks: All 48 products are listed.
  - Expected: '48 products' and 48 items in the grid
- **filters the catalog to Compute (8 items)**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: '8 products' and 8 items after filtering to {category}
- **filters the catalog to Storage (8 items)**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: '8 products' and 8 items after filtering to {category}
- **filters the catalog to Network (8 items)**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: '8 products' and 8 items after filtering to {category}
- **filters the catalog to Security (8 items)**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: '8 products' and 8 items after filtering to {category}
- **filters the catalog to Observability (8 items)**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: '8 products' and 8 items after filtering to {category}
- **filters the catalog to Data (8 items)**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: '8 products' and 8 items after filtering to {category}
- **search shows the empty state for a no-match query**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Checks: A search with no match shows the empty state.
  - Expected: searching 'zzz-no-such-product' shows products-no-results
- **sort toggles between name and price**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Checks: The sort button switches from name to price.
  - Expected: 'Sort: name', then 'Sort: price' after a click
- **product sku-001 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-002 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-003 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-004 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-005 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-006 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-007 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-008 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-009 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-010 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-011 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-012 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-013 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-014 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-015 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-016 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-017 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-018 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-019 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-020 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-021 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-022 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-023 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-024 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-025 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-026 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-027 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-028 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-029 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-030 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-031 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-032 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-033 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-034 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-035 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-036 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-037 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-038 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-039 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-040 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-041 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-042 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-043 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-044 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-045 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-046 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-047 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status
- **product sku-048 detail loads with full metadata**
  - File: `tests/e2e/app/react-products.spec.ts`
  - Expected: the detail for {id}: its SKU, a category, a $ price and a status

### File: `tests/e2e/app/react-shell.spec.ts`

2 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **renders the React home surface and navigates client-side**
  - File: `tests/e2e/app/react-shell.spec.ts`
  - Checks: The home page renders, and the About link moves to /app/about in the browser.
  - Expected: app-root visible with its heading; About link goes to /app/about
- **serves the SPA index on a deep client route (server fallback)**
  - File: `tests/e2e/app/react-shell.spec.ts`
  - Checks: Opening /app/about directly still works: the server sends the app's page.
  - Expected: app-about visible, heading 'About this surface'

### File: `tests/e2e/app/react-users.spec.ts`

4 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **client-side search filters the list by name**
  - File: `tests/e2e/app/react-users.spec.ts`
  - Checks: A search with no match shows the empty state.
  - Expected: searching 'zzz-no-such-user' shows users-no-results
- **REPORT: usersSearchStale applies the previous query (stale closure)**
  - File: `tests/e2e/app/react-users.spec.ts`
  - Checks: With the bug armed, the search applies the previous (empty) text, so a no-match search still shows every row.
  - Expected: with usersSearchStale armed: after a no-match search the table still shows and there is no empty state
- **REPORT: usersLocaleBug renders a de-DE date instead of en-US**
  - File: `tests/e2e/app/react-users.spec.ts`
  - Checks: With the bug armed, the "as of" date is written the German way.
  - Expected: with usersLocaleBug armed: the as-of date has dots and no slashes
- **REPORT: userCreateConflict rolls back the optimistic row**
  - File: `tests/e2e/app/react-users.spec.ts`
  - Checks: With the bug armed, creating a user is refused (409) and the row added ahead of time is taken back.
  - Expected: with userCreateConflict armed: a server error shows and 'Conflicting User' is not on the page

## contracts

1 test in 1 file.

### File: `tests/e2e/contracts/api-contract-governance.spec.ts`

1 test in this file.

What the file is about: Playwright's test tools with the framework's page objects and the [RESULT] block.

- **api contract governance covers the core local endpoints**
  - File: `tests/e2e/contracts/api-contract-governance.spec.ts`
  - Checks: The classic site's core endpoints answer in the shape they promise: health, orders, create-user (good and bad), and a product.
  - Expected: health 200 ok on 4173; 3 stable orders with their fields; create-user 201 with a USR- id; type mismatch 500 problem on phone_number; sku-123 200 with its product fields

## functional

3 tests in 2 files.

### File: `tests/e2e/functional/negative/functional-negative.spec.ts`

2 tests in this file.

What the file is about: The framework's page checker: is the product page whole and readable?

- **functional negative coverage surfaces stale selectors and broken rendering**
  - File: `tests/e2e/functional/negative/functional-negative.spec.ts`
  - Checks: The old "Sign Up" button is gone, and the broken product page fails the page checker for its price and its overlapping parts.
  - Expected: no 'Sign Up' button; the broken product page is not valid, naming a non-finite number and a visual overlap
- **functional negative coverage surfaces validation and retryable service failures**
  - File: `tests/e2e/functional/negative/functional-negative.spec.ts`
  - Checks: A user with bad fields is refused (400), a wrong type is a server error (500), and the flaky dashboard shows its failure.
  - Expected: invalid user 400 naming last_name and email; type mismatch 500 on phone_number (string); flaky dashboard 'Waiting for recovery.', 'Request failed', 0 rows

### File: `tests/e2e/functional/positive/functional-positive.spec.ts`

1 test in this file.

What the file is about: The framework's page checker: is the product page whole and readable?

- **functional positive coverage validates healthy API, stable dashboard, and valid product rendering**
  - File: `tests/e2e/functional/positive/functional-positive.spec.ts`
  - Checks: The happy path of the classic site: the API is healthy, a valid user is created, the dashboard loads its orders, and the product page passes the page checker.
  - Expected: health 200 ok; create-user 201 with the same email and phone; 'Loaded 3 orders'; the product page validates

## generated

1 test in 1 file.

### File: `tests/e2e/generated/home-cta-navigates-to-dashboard.spec.ts`

1 test in this file.

What the file is about: seed: tests/e2e/seed.spec.ts

- **primary call-to-action navigates to the dashboard** (skipped on purpose)
  - File: `tests/e2e/generated/home-cta-navigates-to-dashboard.spec.ts`
  - Checks: Skipped on purpose (fixme): the healer demo described above.
  - Expected: the 'Sign Up' button opens /dashboard with the orders mode control

## infra

18 tests in 2 files.

### File: `tests/e2e/infra/infra-versions.spec.ts`

13 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **versions sort by number, and a release sorts above its pre-release**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: Versions compare as numbers (1.10 is above 1.9), and a release beats its release candidate.
  - Expected: 1.10.0 > 1.9.9; v0.65.0 > 0.64.0; 1.17.0 > 1.17.0-rc2; 2.0.0 = 2.0.0
- **a release counts only once it is 7 days old, and never as a pre-release**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: The newest pick skips releases younger than 7 days and every pre-release.
  - Expected: newest is 1.17.1; newest 1.16.x is 1.16.7; with a 20-day wait, none
- **a caret range moves within its major, or within its minor for 0.x**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: ^1.2.3 allows anything up to (not including) 2.0.0; ^0.5.8 only within 0.5.x.
  - Expected: ^1.2.3 allows 1.9.0, not 2.0.0, not itself, not lower, not a beta; ^0.5.8 allows 0.5.13, not 0.6.0
- **Terraform's ~> reads the way Terraform reads it**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: ~> 1.16 means 1.16 or newer within 1.x; ~> 0.13.0 means 0.13.x only.
  - Expected: ~> 1.16 takes 1.17.1, not 1.15.9 or 2.0.0; ~> 0.13.0 takes 0.13.4, not 0.14.0
- **an env value is read and replaced in place, line endings kept**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: An env value can be read and changed without touching the line endings.
  - Expected: TRIVY_SHA256 reads aaaa, then bbbb; same number of lines; a missing name throws
- **a version is replaced in its value and its comment, never inside a longer number**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: A version changes in its value and in the comment that names it, but not where it is part of a longer number.
  - Expected: the comment and TRIVY_VERSION read 0.76.1; OTHER stays 10.74.0
- **only a whole node-version line changes**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: Only a real `node-version:` line is changed, not text that merely contains it.
  - Expected: node-version: 26, and 'echo node-version: 240' untouched
- **the SHA256 for the right file is read from a checksums list**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: The right file's checksum is picked from a list; a missing file throws.
  - Expected: tflint_linux_amd64.zip -> 2222; nope.zip throws
- **aligned pins pass**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: Pins that agree find no drift.
  - Expected: no drift
- **two Terraform copies that disagree are caught**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: Two Terraform copies that disagree are reported.
  - Expected: drift naming 'TF_VERSION differs'
- **a Playwright image that does not match the package is caught**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: A Playwright image older than the package is reported.
  - Expected: drift naming 'Dockerfile.e2e runs v1.64.0'
- **mixed Node versions are caught, but the hand-kept PR file only warns**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: Mixed Node versions are drift, except that the hand-kept PR workflow only gets a warning.
  - Expected: Dockerfile on 26 alone: drift 'Node: not one version'; everything but pr-validation.yml on 26: no drift, a warning 'pr-validation.yml runs Node 24, the rest Node 26'
- **this repository's own pins agree with each other**
  - File: `tests/e2e/infra/infra-versions.spec.ts`
  - Checks: The guard on every PR: a change that moves one copy of a version and not the others (as Dependabot's PR #82 did with kind) fails here.
  - Expected: no drift in this repository's real pins

### File: `tests/e2e/infra/result-block.spec.ts`

5 tests in this file.

What the file is about: Every spec must take `test` from the [RESULT] block, or it prints no block and nobody notices; this file checks that, and the block's own layout. The block is framework/fixtures/resultBlock.ts (appTest.ts adds the page objects). Offline: it reads files and calls pure functions.

- **every Playwright test file takes test from the result block**
  - File: `tests/e2e/infra/result-block.spec.ts`
  - Checks: Every spec and setup file takes `test` from the result block (directly or through appTest), never from @playwright/test or baseTest.
  - Expected: every .spec.ts and .setup.ts under tests/ imports test from framework/fixtures/resultBlock or appTest
- **tests/ holds only test files**
  - File: `tests/e2e/infra/result-block.spec.ts`
  - Checks: tests/ holds only tests: the shared code lives in framework/.
  - Expected: every .ts file under tests/ is a .spec.ts or a .setup.ts
- **the unit tests' setup prints the block**
  - File: `tests/e2e/infra/result-block.spec.ts`
  - Checks: The unit tests print the same block: their setup starts and prints it, and the verbose reporter shows it.
  - Expected: vitest.config.ts loads web/test/setup.ts with the verbose reporter; setup.ts starts and prints the block
- **a secret-looking query value is never printed**
  - File: `tests/e2e/infra/result-block.spec.ts`
  - Checks: The value of a query parameter whose name looks secret is never printed.
  - Expected: token, key, password, session and code values print as \*\*\*; page and q print as they are
- **the block has the Wix layout**
  - File: `tests/e2e/infra/result-block.spec.ts`
  - Checks: The block keeps the Wix layout: the [RESULT] top line, labels lined up, calls numbered, a known bug marked, and a 42-character bottom line.
  - Expected: top '==== [RESULT] ====', aligned test/spec/status/expected rows, 2 numbered calls, a fact, a page, a 42-character bottom

## non-functional

2 tests in 1 file.

### File: `tests/e2e/non-functional/non-functional-quality.spec.ts`

2 tests in this file.

What the file is about: The framework's page checker: is the product page whole and readable?

- **positive non-functional checks meet local latency and responsive quality expectations**
  - File: `tests/e2e/non-functional/non-functional-quality.spec.ts`
  - Checks: Health answers in under a second, the dashboard loads in under four, and the product page passes the checker at phone size.
  - Expected: health 200 in under 1000 ms; dashboard with 3 orders in under 4000 ms; the product page valid at 390x844
- **negative non-functional checks surface latency degradation and broken render quality**
  - File: `tests/e2e/non-functional/non-functional-quality.spec.ts`
  - Checks: The slow dashboard hasn't loaded rows in 2.5 seconds and shows its spinner, and the broken product page fails the checker for NaN and undefined.
  - Expected: the slow dashboard has no rows after 2500 ms and shows the spinner; the broken product page is not valid, naming NaN and undefined tokens

## sanity

5 tests in 2 files.

### File: `tests/e2e/sanity/new-pages.spec.ts`

4 tests in this file.

What the file is about: Playwright's test tools with the framework's page objects and the [RESULT] block.

- **Orders page loads and passes its page contract**
  - File: `tests/e2e/sanity/new-pages.spec.ts`
  - Checks: The Orders page loads, its page contract passes, and it shows a count.
  - Expected: heading visible, the page contract valid, an orders count shown
- **Admin page loads, clears its log, and passes contract**
  - File: `tests/e2e/sanity/new-pages.spec.ts`
  - Checks: The Admin page loads, its contract passes, and Clear empties its log.
  - Expected: heading visible, the page contract valid, the action count 0 after Clear
- **Profile page loads, enters edit mode, and saves**
  - File: `tests/e2e/sanity/new-pages.spec.ts`
  - Checks: The Profile page loads, its contract passes, and Edit then Save works.
  - Expected: heading visible, the page contract valid, 'Saved profile' after Edit and Save
- **Settings page loads and persists saved values in status**
  - File: `tests/e2e/sanity/new-pages.spec.ts`
  - Checks: The Settings page loads, its contract passes, and saving the dark theme shows it.
  - Expected: heading visible, the page contract valid, 'Theme: dark' after saving

### File: `tests/e2e/sanity/sanity-smoke.spec.ts`

1 test in this file.

What the file is about: Playwright's test tools with the framework's page objects and the [RESULT] block.

- **sanity smoke covers the landing page, dashboard, and valid product view**
  - File: `tests/e2e/sanity/sanity-smoke.spec.ts`
  - Checks: The quickest proof the classic site works: the landing page and its health check, the dashboard's orders, and a valid product page.
  - Expected: the home page loads and its health check says ok; the dashboard loads 3 orders with no error; sku-123 shows its title and a $ price

## scenarios

48 tests in 18 files.

### File: `tests/e2e/scenarios/advanced-locator-healing.spec.ts`

1 test in this file.

What the file is about: The router that picks and runs a recovery strategy.

- **heals dropdown, menu, modal, row-action, and section-scoped field locators on the User Manager page**
  - File: `tests/e2e/scenarios/advanced-locator-healing.spec.ts`
  - Checks: Six stale selectors on User Manager, each a different kind of control (a select, a menu button, a menu item, a dialog field, a dialog button and a table row button), each fail and are healed in turn.
  - Expected: all six heals recover: role filter Admin (1 row), the bulk menu opens, the invite dialog opens, the email is filled, 'Prepared invite', 'Viewing Bob Harbor'; report recovered

### File: `tests/e2e/scenarios/api-error-diagnosis.spec.ts`

1 test in this file.

What the file is about: The agent under test: it explains why an API call failed.

- **diagnoses the create-user phone number type mismatch**
  - File: `tests/e2e/scenarios/api-error-diagnosis.spec.ts`
  - Checks: A string phone number makes create-user answer 500; the diagnosis agent finds the field and the types, and the report and trace are saved.
  - Expected: create-user 500; root cause phone_number, expected integer, received string; report status diagnosed

### File: `tests/e2e/scenarios/auth-session.spec.ts`

4 tests in this file.

What the file is about: seed: tests/e2e/seed.spec.ts

- **signs in from the login page and lands on the dashboard**
  - File: `tests/e2e/scenarios/auth-session.spec.ts`
  - Checks: The login page signs Alice in and goes to the dashboard.
  - Expected: after logging in, the page is /dashboard
- **rejects wrong credentials with an inline error**
  - File: `tests/e2e/scenarios/auth-session.spec.ts`
  - Checks: A wrong password shows an error on the login page.
  - Expected: 'Invalid email or password.'
- **authenticated admin sees the session banner on a protected page**
  - File: `tests/e2e/scenarios/auth-session.spec.ts`
  - Checks: The saved Admin session shows its banner on a protected page.
  - Expected: 'Signed in as Alice Northwind (Admin)' on /profile, with no redirect
- **an expired session redirects a protected page to login (auth-or-session)**
  - File: `tests/e2e/scenarios/auth-session.spec.ts`
  - Checks: With an expired session armed for this test, a protected page sends you to login.
  - Expected: with authRequired and sessionExpired armed: /profile redirects to /login

### File: `tests/e2e/scenarios/dynamic-content-validation.spec.ts`

1 test in this file.

What the file is about: The framework's page checker: is the product page whole and readable?

- **validates both valid and broken dynamic product states**
  - File: `tests/e2e/scenarios/dynamic-content-validation.spec.ts`
  - Checks: The product page passes the checker in its valid state and fails it in its broken state for four reasons; the report and trace are saved.
  - Expected: valid state passes; broken state fails naming a non-finite number, a NaN token, an undefined token and a visual overlap; report status validated

### File: `tests/e2e/scenarios/execution-planner.spec.ts`

2 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **orders recovery strategies and worker steps for stale-locator incidents**
  - File: `tests/e2e/scenarios/execution-planner.spec.ts`
  - Checks: For a stale locator in QA, the plan may recover, heals first, re-checks the contract second, and lists the worker steps in order.
  - Expected: can attempt recovery, needs validation; strategies locator-heal then contract-recheck; steps classify, evidence-collect, locator-heal, contract-recheck, validate, memory-record
- **keeps diagnosis-only chains from attempting UI recovery**
  - File: `tests/e2e/scenarios/execution-planner.spec.ts`
  - Checks: An API timeout is diagnosis-only: no UI recovery is attempted, and the plan says why.
  - Expected: cannot attempt recovery; no strategies; escalation says diagnosis-only; steps classify, evidence-collect, api-diagnose, patch-propose, memory-record

### File: `tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts`

1 test in this file.

What the file is about: The agents under test: API diagnosis, failure classification, patch proposals.

- **classifies UI render failures and API contract drift and produces deterministic patch proposals**
  - File: `tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts`
  - Checks: A broken product page is classed as a UI render problem with a fix the QA pipeline may apply; a type-mismatch API error is classed as contract drift with a fix it may not.
  - Expected: UI: ui-contract-or-render, auto-mitigation eligible, targets public/product.js; API: api-contract-drift, not eligible, targets server.js

### File: `tests/e2e/scenarios/failure-classifier-expansion.spec.ts`

1 test in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **classifies the new auth, modal, navigation, timeout, empty-state, delayed-data, and RBAC branches**
  - File: `tests/e2e/scenarios/failure-classifier-expansion.spec.ts`
  - Checks: Each failure signal lands in its own category. No page or server: the classifier is given the signals directly.
  - Expected: auth-or-session, permissions-or-rbac, ui-modal-not-opened, ui-route-or-navigation, api-timeout, ui-empty-state, ui-delayed-data, api-server-error

### File: `tests/e2e/scenarios/flaky-network-recovery.spec.ts`

1 test in this file.

What the file is about: The recovery agent, and the tracker that watches the page's orders requests.

- **recovers a retryable orders failure through live dashboard state**
  - File: `tests/e2e/scenarios/flaky-network-recovery.spec.ts`
  - Checks: The flaky dashboard fails its first orders request; the recovery agent brings the orders back, and the scenario's report and trace are saved.
  - Expected: no orders within 1.5 s at first; after the agent recovers, 3 order rows and no error; report status recovered

### File: `tests/e2e/scenarios/generic-self-healing.spec.ts`

1 test in this file.

What the file is about: The router that picks and runs a recovery strategy.

- **heals stale button, link, and input locators through the generic router**
  - File: `tests/e2e/scenarios/generic-self-healing.spec.ts`
  - Checks: Three stale selectors on the landing page (a button, a link and an input) each fail, and the same generic router heals all three.
  - Expected: button heal recovers to /dashboard; link heal recovers to /dashboard; input heal recovers and the triage output contains 'Checkout alerts'; report recovered

### File: `tests/e2e/scenarios/incident-memory-and-evidence.spec.ts`

2 tests in this file.

What the file is about: Node's file tools (async) and path tools.

- **records incident memory entries in a deterministic local file**
  - File: `tests/e2e/scenarios/incident-memory-and-evidence.spec.ts`
  - Checks: The memory store writes one incident to its own file, reads it back, and reports which strategy worked for that kind of failure.
  - Expected: 1 entry, id incident-memory-test; successful strategies for ui-missing-locator = [locator-heal]
- **collects page evidence and writes local incident artifacts**
  - File: `tests/e2e/scenarios/incident-memory-and-evidence.spec.ts`
  - Checks: The evidence collector reads the live landing page and writes its three artifact files.
  - Expected: engine deterministic; contract home-page; 3 artifact files, each on disk

### File: `tests/e2e/scenarios/narrative-enricher.spec.ts`

8 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **returns deterministic engine when OPENAI_API_KEY is missing**
  - File: `tests/e2e/scenarios/narrative-enricher.spec.ts`
  - Checks: With no key set, nothing is sent and the diagnosis comes back unchanged.
  - Expected: engine deterministic, text unchanged, 0 fetch calls
- **falls back to deterministic when the OpenAI request returns a non-ok status**
  - File: `tests/e2e/scenarios/narrative-enricher.spec.ts`
  - Checks: A 500 from OpenAI falls back to the original text.
  - Expected: engine deterministic, text unchanged
- **falls back to deterministic when the OpenAI payload contains no output text**
  - File: `tests/e2e/scenarios/narrative-enricher.spec.ts`
  - Checks: An answer with no text falls back to the original text.
  - Expected: engine deterministic, text unchanged
- **returns enriched text from output_text when OpenAI succeeds**
  - File: `tests/e2e/scenarios/narrative-enricher.spec.ts`
  - Checks: A good answer's output_text is used, trimmed, and the engine names the model.
  - Expected: engine openai:gpt-test-model, text 'Concise enriched diagnosis.'
- **flattens structured output[].content[].text into the enriched narrative**
  - File: `tests/e2e/scenarios/narrative-enricher.spec.ts`
  - Checks: Text spread over output[].content[] is joined, one piece per line.
  - Expected: text 'Line one.\nLine two.', engine openai:...
- **posts to the /v1/responses endpoint**
  - File: `tests/e2e/scenarios/narrative-enricher.spec.ts`
  - Checks: Endpoint lock: NarrativeEnricher targets the OpenAI Responses endpoint. This keeps the provider surface explicit if the integration changes later.
  - Expected: one POST to https://api.openai.com/v1/responses with a Bearer key and JSON content type
- **sends the configured model and prompt in the request body**
  - File: `tests/e2e/scenarios/narrative-enricher.spec.ts`
  - Checks: The body carries the configured model and a prompt holding the diagnosis.
  - Expected: body model gpt-test-model; input contains the diagnosis and '2-3 direct sentences'
- **falls back to deterministic when the OpenAI request aborts or throws**
  - File: `tests/e2e/scenarios/narrative-enricher.spec.ts`
  - Checks: A network error falls back to the original text.
  - Expected: engine deterministic, text unchanged

### File: `tests/e2e/scenarios/orchestrated-recovery.spec.ts`

1 test in this file.

What the file is about: The router that runs a failure through the whole agent chain.

- **routes a stale-locator failure through IncidentRouter and recovers on the User Manager page**
  - File: `tests/e2e/scenarios/orchestrated-recovery.spec.ts`
  - Checks: A click on a stale button selector fails; the IncidentRouter classifies it, heals the locator, validates the page, and the incident is mitigated.
  - Expected: the stale click fails; recovered, ui-missing-locator, chain includes locator-heal and validate, strategy [locator-heal], an evidence-collect step, mitigated; report recovered

### File: `tests/e2e/scenarios/page-contract-validation.spec.ts`

1 test in this file.

What the file is about: The page contracts: what the home, dashboard and product pages must contain.

- **validates reusable page contracts across home, dashboard, and product pages**
  - File: `tests/e2e/scenarios/page-contract-validation.spec.ts`
  - Checks: One checker, several contracts: the home page, the dashboard and a valid product pass theirs; the broken product page fails for three reasons.
  - Expected: home, dashboard and the valid product pass their contracts; the broken product fails naming a non-finite number, an undefined token and a visual overlap

### File: `tests/e2e/scenarios/policy-engine.spec.ts`

3 tests in this file.

What the file is about: Playwright's test tools, with the [RESULT] block printed after every test.

- **allows QA locator healing with strong classifier confidence**
  - File: `tests/e2e/scenarios/policy-engine.spec.ts`
  - Checks: In QA, with a confident classification, both strategies are approved.
  - Expected: environment qa, auto-mitigation allowed, approved [locator-heal, extend-wait], none blocked
- **blocks interactive UI recovery strategies in production by default**
  - File: `tests/e2e/scenarios/policy-engine.spec.ts`
  - Checks: In production, clicking a healed target and repeating a UI action are both denied.
  - Expected: environment production, no auto-mitigation, nothing approved; locator-heal and refresh-and-retry denied, each with its reason
- **requires approval when runtime confidence is below the auto-mitigation threshold**
  - File: `tests/e2e/scenarios/policy-engine.spec.ts`
  - Checks: An unsure classification needs a person's approval even in QA; a reversible feature-flag switch-off is allowed in production.
  - Expected: QA at 0.62 confidence: locator-heal needs approval (below 0.70); production feature-flag-disable: allow

### File: `tests/e2e/scenarios/rbac.spec.ts`

5 tests in this file.

What the file is about: seed: tests/e2e/seed.spec.ts

- **Viewer cannot create a user (permissions-or-rbac 403)**
  - File: `tests/e2e/scenarios/rbac.spec.ts`
  - Checks: With RBAC on, a Viewer is refused when creating a user.
  - Expected: 403 RBAC_FORBIDDEN with permissionDenied true
- **Editor cannot delete a user (permissions-or-rbac 403)**
  - File: `tests/e2e/scenarios/rbac.spec.ts`
  - Checks: With RBAC on, an Editor is refused when deleting a user; only an Admin may.
  - Expected: Admin creates (201); Editor's delete 403 with requiredRole Admin
- **INTENTIONAL DEFECT: Editor is wrongly allowed to delete (server returns 200)**
  - File: `tests/e2e/scenarios/rbac.spec.ts`
  - Checks: The planted over-permission defect: with rbacBug armed, the Editor's delete goes through. This test proves the defect is there; the defect stays.
  - Expected: with rbacBug editor-delete armed: the Editor's delete answers 200 'User deleted.' (the planted defect)
- **Admin can create and delete (positive control)**
  - File: `tests/e2e/scenarios/rbac.spec.ts`
  - Checks: An Admin can create a user and delete it.
  - Expected: Admin create 201, delete 200
- **Admin audit is forbidden for non-admins and when the gate is locked**
  - File: `tests/e2e/scenarios/rbac.spec.ts`
  - Checks: The audit is for Admins only, and even an Admin is refused while the gate is locked.
  - Expected: Viewer 403 with requiredRole Admin; with adminGate locked, the Admin 403 too

### File: `tests/e2e/scenarios/real-agent-proof.spec.ts`

9 tests in this file.

What the file is about: Node's file tools (async) and path tools.

- **real self-healing LLM agent recovers a stale CTA against the live app**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: With a fake LLM that picks "Join Now", the agent clicks it on the live landing page and reaches the dashboard.
  - Expected: one provider call offered 'Join Now'; recovered, acted, engine llm:fake:test-model:bounded-action; the page is /dashboard
- **Obsidian memory agent writes a real healing run log into the vault**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: The memory agent writes a healing-run note into the vault, with the agent, the backend and the decision in it.
  - Expected: a note under obsidian-vault/Reports/Healing/ titled 'Healing Run: real-agent-proof', naming the agent, the backend and selectedCandidateIndex
- **Obsidian memory agent writes a workspace state log for session handoff**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: The memory agent writes a workspace-state note for handing a session over.
  - Expected: a note under obsidian-vault/Reports/Workspace/ titled 'Workspace State: real-agent-session', listing the changed file, 'README updated: yes', AGENT_MEMORY.md and the next action
- **Obsidian memory agent updates a task Result section**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: The memory agent replaces a task note's Result section.
  - Expected: the Result section holds the new line, and the old placeholder text is gone
- **Obsidian closeout agent writes a workspace report when required docs are updated**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: With code, a test, the README and the vault notes all changed, the closeout passes and writes its report.
  - Expected: status passed, nothing missing; README, AGENT_MEMORY and 02 Test Map required; a report under Reports/Workspace/ saying 'Closeout status: passed'
- **Obsidian closeout agent blocks when code or tests lack required docs**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: With code and a test changed but no docs, the closeout blocks and lists what is missing.
  - Expected: status blocked, no report; missing README, AGENT_MEMORY, 02 Test Map and the task note; a next action naming AGENT_MEMORY.md
- **self-healing LLM agent rejects unsafe provider output without acting**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: A provider that picks a candidate outside the list is rejected, and the agent does nothing.
  - Expected: rejected, not acted, reason selected-candidate-out-of-range; still on /classic
- **disabled self-healing LLM mode makes no provider call**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: In disabled mode the agent never asks the provider.
  - Expected: disabled, not acted, 0 provider calls
- **@live-openai live OpenAI provider returns a bounded structured self-healing decision**
  - File: `tests/e2e/scenarios/real-agent-proof.spec.ts`
  - Checks: Opt-in only (skipped unless asked for, with a real key): the live OpenAI provider gives a bounded decision in report-only mode, and both vault notes are written.
  - Expected: advisory, not acted, engine llm:openai:...; a numeric candidate index and act or reject; a healing note and a workspace note in the vault

### File: `tests/e2e/scenarios/repair-flow.spec.ts`

5 tests in this file.

What the file is about: Node's file tools (async).

- **PatchPlanner blocks production environments and approves QA repairs**
  - File: `tests/e2e/scenarios/repair-flow.spec.ts`
  - Checks: The planner refuses a repair in production and approves the same one in QA.
  - Expected: production: not permitted, reason mentions QA; QA: permitted, includes a rerun-suite step, risk low
- **PatchApplier writes patch artifact only when plan is permitted**
  - File: `tests/e2e/scenarios/repair-flow.spec.ts`
  - Checks: The applier writes nothing for a blocked plan, and writes a patch file for a permitted one.
  - Expected: blocked: not applied, no file; permitted: applied, a file whose incidentId matches
- **RepairVerifier reports skip when no page context is provided**
  - File: `tests/e2e/scenarios/repair-flow.spec.ts`
  - Checks: With no page to check, the verifier says it skipped rather than passing.
  - Expected: not passed, reason 'Verification skipped'
- **IncidentRouter runs end-to-end repair flow on User Manager**
  - File: `tests/e2e/scenarios/repair-flow.spec.ts`
  - Checks: In QA, the router plans, applies and verifies a repair for the stale "Add Member" selector on User Manager.
  - Expected: a QA repair plan that is permitted, applied, and verified as passed
- **IncidentRouter skips repair flow on production**
  - File: `tests/e2e/scenarios/repair-flow.spec.ts`
  - Checks: In production, the router does no repair at all.
  - Expected: no repair plan, no apply, no verification

### File: `tests/e2e/scenarios/ui-change-healing.spec.ts`

1 test in this file.

What the file is about: The router that picks and runs a recovery strategy.

- **heals the outdated Join CTA selector and navigates to the dashboard**
  - File: `tests/e2e/scenarios/ui-change-healing.spec.ts`
  - Checks: The old "Sign Up" selector fails on the landing page; the recovery router finds the renamed Join button, clicks it, and lands on the dashboard.
  - Expected: the 'Sign Up' click fails; recovery recovered; the page is /dashboard with the 'Orders Recovery Console' heading; report recovered

## setup

2 tests in 2 files.

### File: `tests/e2e/auth.setup.ts`

1 test in this file.

What the file is about: Playwright's test tools as `setup`, with the [RESULT] block printed after it.

- **authenticate as admin**
  - File: `tests/e2e/auth.setup.ts`
  - Checks: Setup project: mint a REAL Admin session and persist it as storageState. The `authenticated` project depends on this and loads the cookie via use.storageState. We intentionally do NOT reset here — the webServer starts fresh, and a broad reset could race default-project specs that run in parallel.
  - Expected: set-session 2xx for Admin, and the cookie saved to .artifacts/auth/admin.json

### File: `tests/e2e/seed.spec.ts`

1 test in this file.

What the file is about: tests/e2e/seed.spec.ts Seed for the official Playwright agents (planner / generator / healer). Its ONLY job: leave the app on a known, warm, clean page so that when the MCP runs this file (planner_setup_page / generator_setup_page) with pauseAtEnd, the agent drives a deterministic live page. There is NO auth in this app and nothing is stored client-side, so this seed captures NO credentials and needs NO storageState — determinism comes from the reset hook + stable API modes. Keep this side-effect-only: NO business assertions (those belong in generated tests).

- **seed**
  - File: `tests/e2e/seed.spec.ts`
  - Expected: reset-users 2xx, health 2xx, and /classic loaded

## Planted bugs

Each one is off until practice mode (or a test's own run key) switches it
on, for that session only. The site is right with it off.

### 1. An Editor is allowed to delete a user

`rbacBug` · Access control · where: /user-manager, signed in as an Editor

- What goes wrong: The page hides the delete button for an Editor, but the server answers 200 and deletes the user anyway. Hiding a control is not a permission check: anything the UI refuses must also be refused by the API, because a request can be sent without the UI.
- How to see it: Sign in as an Editor and try to delete somebody. Watch what the server answers, not what the page shows.
- Caught by: the tests in `tests/e2e/scenarios/rbac.spec.ts`

### 2. A new user appears in the table, then vanishes

`userCreateConflict` · Async / state · where: /app/users — create a user

- What goes wrong: The page adds the row before the server has agreed (an optimistic update). The server answers 409, so the row rolls back. The bug is that nothing tells the person it failed — the row simply disappears.
- How to see it: Create a user and watch the row closely for a second after you submit.
- Caught by: "REPORT: userCreateConflict rolls back the optimistic row" (`tests/e2e/app/react-users.spec.ts`)

### 3. Search shows the results for what you typed a moment ago

`usersSearchStale` · Async / closure · where: /app/users — the search box

- What goes wrong: The debounced search closes over the previous query, so it always runs one keystroke behind. It looks right if you type slowly, which is why it survives manual testing.
- How to see it: Type a few letters quickly, then a few more. Compare what is in the box with what is in the table.
- Caught by: "REPORT: usersSearchStale applies the previous query (stale closure)" (`tests/e2e/app/react-users.spec.ts`)

### 4. A date is formatted in the wrong country's style

`usersLocaleBug` · Internationalisation · where: /app/users — the 'Directory as of' line

- What goes wrong: The date is formatted as de-DE (15.01.26) while the rest of the page is en-US. 01.02.26 is the first of February in one and the second of January in the other, so the same string means two different days.
- How to see it: Look at how the date is punctuated, and compare it with the rest of the site.
- Caught by: "REPORT: usersLocaleBug renders a de-DE date instead of en-US" (`tests/e2e/app/react-users.spec.ts`)

### 5. A form field has no name a screen reader can use

`usersA11yBug` · Accessibility · where: /app/users — the New user dialog

- What goes wrong: The Name input has visible text beside it but nothing connecting the two — no `for`/`id` pair and no `aria-label`. Anyone not looking at the screen hears an unnamed text box. axe reports it as a `label` violation.
- How to see it: The field looks labelled on screen. Run an accessibility check over the dialog, or try it with a screen reader.
- Caught by: "REPORT: armed usersA11yBug introduces a missing-label violation" (`tests/e2e/app/react-a11y.spec.ts`)

### 6. A button's text changes, but nothing else does

`ordersRefreshLabel` · DOM / selector · where: /app/orders — the Refresh button

- What goes wrong: Refresh becomes Reload. The button still works and its `data-testid` is unchanged, so this is not a fault to report — it is a test that should have been written against the test id instead of the visible text. The one case here where the right answer is to fix the test.
- How to see it: Nothing is broken for a person here. Think about what it does to a test that finds the button by its words.
- Caught by: "HEAL: armed ordersRefreshLabel renames the control (selector drift)" (`tests/e2e/app/react-orders.spec.ts`)

### 7. A price comes back as text instead of a number

`productSchemaDrift` · API contract · where: GET /api/products

- What goes wrong: `price` is sent as "19.99" rather than 19.99. JavaScript hides it — the page prints it the same either way — but anything doing arithmetic concatenates instead of adding, and the response violates the OpenAPI schema the API publishes about itself.
- How to see it: The page still looks fine. Read the raw JSON, and compare it with the published schema at /api/docs.
- Caught by: "productSchemaDrift makes /api/products violate ProductsResponse" (`tests/e2e/app/api-openapi-contract.spec.ts`)

### 8. Sending a negative amount pulls money the other way

`bankNegativeTransfer` · Validation · where: /app/bank/transfer

- What goes wrong: The amount is checked for "not zero" instead of "above zero", in the form and again on the server. Send -50 and the sender gains 50 while the recipient loses it.
- How to see it: Try an amount that is not a sensible amount of money.
- Caught by: "bankNegativeTransfer: a negative amount pulls money the wrong way" (`tests/e2e/app/bank-money-bugs.spec.ts`); "bankNegativeTransfer: a negative amount pulls money the wrong way in GraphQL too" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 9. One transfer, charged twice

`bankDoubleSubmit` · Async / state · where: /app/bank/transfer — the Confirm button

- What goes wrong: The button stays enabled while the request is in flight, and each click sends a fresh idempotency key, so the server treats them as two separate transfers. The key exists precisely to stop this, and the page defeats it.
- How to see it: Press Confirm twice, quickly, the way an impatient person does on a slow connection.
- Caught by: "bankDoubleSubmit: a double-click sends the transfer twice" (`tests/e2e/app/bank-money-bugs.spec.ts`); "without bankDoubleSubmit, a double-click sends one transfer" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 10. Two transfers at once overdraw the account

`bankTransferRace` · Concurrency · where: POST /api/bank/transfers

- What goes wrong: Check-then-act: the balance is read, checked, and written back later without an "only if there is still enough" condition. Both requests read the same balance, both pass, and the account goes negative. Clicking slowly never finds this.
- How to see it: One at a time is always fine. Send two large ones at the same instant.
- Caught by: "bankTransferRace: two transfers at once overdraw the account" (`tests/e2e/app/bank-money-bugs.spec.ts`); "bankTransferRace: two GraphQL transfers at once overdraw the account" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 11. The balance does not change after you move money

`bankStaleBalance` · Async / cache · where: /app/bank — after making a transfer

- What goes wrong: The transfer really happened — the receipt is right and a reload shows the truth. The cached balances are simply never refreshed, so the page keeps showing numbers that are no longer true.
- How to see it: Make a transfer, then go back to the overview without reloading the page.
- Caught by: "bankStaleBalance: the Bank page keeps the old balance after a transfer" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 12. A date range quietly leaves out its last day

`bankDateFilterOffByOne` · Off-by-one · where: /app/bank/accounts/{id} — the history filter, and the CSV

- What goes wrong: The period ends at the start of the "to" day instead of the start of the day after, so everything on that final day is dropped. The answer looks completely reasonable, which is why it survives.
- How to see it: Filter to a range whose last day you know has a transaction in it.
- Caught by: "bankDateFilterOffByOne: the date filter leaves out the last day" (`tests/e2e/app/bank-money-bugs.spec.ts`); "bankDateFilterOffByOne: the GraphQL history filter leaves out the last day" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 13. The statement's total does not match its own rows

`bankStatementTotal` · Reporting · where: /app/bank/accounts/{id} — download the CSV

- What goes wrong: The total skips the last row. On a statement with many rows the difference is small enough to look like a rounding quirk rather than a missing entry.
- How to see it: Add the rows up by hand and compare with the Total line.
- Caught by: "bankStatementTotal: the statement's total leaves out the last row" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 14. The loan's payments never actually pay it off

`bankLoanRounding` · Rounding · where: /app/bank/loans — ask for a quote and open the schedule

- What goes wrong: The monthly payment is cut off rather than rounded, so every month is a fraction short and the final month never settles. A balance is still owed at the end of the term.
- How to see it: Scroll to the last month of the schedule and look at what is left.
- Caught by: "bankLoanRounding: the payments don't pay the loan off" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 15. You can delete somebody else's saved payee

`bankPayeeIdor` · Security / IDOR · where: DELETE /api/bank/payees/{id}

- What goes wrong: The delete looks the payee up by id and never checks whose it is. Knowing the id is enough. This is an IDOR: the object is referenced directly, and ownership is assumed rather than verified.
- How to see it: Two customers, one payee id. The UI will never offer you this — send the request yourself.
- Caught by: "bankPayeeIdor: any customer can delete someone else's payee" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 16. The unread badge never goes down

`bankNotificationCount` · Async / state · where: The bell in the top bar, and /app/notifications

- What goes wrong: The count query counts every notification rather than the unread ones, so marking them read changes nothing. The list is right; only the number is wrong.
- How to see it: Read your notifications, then look at the badge again.
- Caught by: "bankNotificationCount: reading notifications never lowers the count" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 17. A money request can be paid twice

`bankRequestDoublePay` · Concurrency / state · where: /app/bank/requests

- What goes wrong: The claim updates the request without the condition "only while it is still pending", so a second payment goes through and the money moves twice for one request.
- How to see it: Pay a request, then try to pay the same one again.
- Caught by: "bankRequestDoublePay: a paid request can be paid again" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 18. A customer's reply never reaches support

`bankSupportStatus` · Workflow / state · where: /app/support — reply to an answered ticket

- What goes wrong: The reply keeps the ticket on "answered" instead of setting it back to "open", so it never returns to the support queue. The customer sees their message; staff never do.
- How to see it: Reply to a ticket that staff have already answered, then look at it from the support inbox.
- Caught by: "bankSupportStatus: the customer's reply leaves the ticket on Answered" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 19. A nested field returns another customer's name and email

`bankGraphqlOwnerLeak` · Access control · where: POST /api/bank/graphql, and the explorer at /app/graphql

- What goes wrong: The nested resolver loads the counterparty without checking who is asking. The top-level query is guarded; the field underneath it is not. In GraphQL the caller picks the shape, so every field needs its own check.
- How to see it: Ask a transaction for the details of whoever is on the other side of it.
- Caught by: "bankGraphqlOwnerLeak: a nested field leaks another customer's name and email" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 20. An error replies with the server's own stack trace

`bankGraphqlErrorDetail` · Information leak · where: POST /api/bank/graphql

- What goes wrong: The error shaper passes the original error straight through, so the answer carries the internal message and a stack trace — file paths, library versions, and the shape of the database.
- How to see it: Make something fail unexpectedly and read the whole error, not just its message.
- Caught by: "bankGraphqlErrorDetail: an error leaks the internal message and stack" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 21. A deeply nested query is run instead of refused

`bankGraphqlDepth` · Resource exhaustion · where: POST /api/bank/graphql

- What goes wrong: The depth limit is skipped, and the cost limit beside it. Because the caller writes the query and types can point back at each other, a short request can ask for an enormous amount of work. A depth limit is the cheapest guard against that, and a cost limit catches the wide queries it misses.
- How to see it: Follow a relationship back and forth: account to transaction to account, and keep going.
- Caught by: "bankGraphqlDepth: a query with no depth limit is allowed through" (`tests/e2e/app/bank-money-bugs.spec.ts`)

### 22. A price comes back as text instead of a number

`bankCryptoPriceType` · API contract · where: GET /api/bank/market

- What goes wrong: `priceMicros` is sent with quotes around it. The page renders it identically, so only a schema check or arithmetic catches it — which is exactly what a contract test is for.
- How to see it: The market page looks fine. Read the raw JSON and check it against the published schema.
- Caught by: "PLANTED BUG bankCryptoPriceType: the price comes back as a string" (`tests/e2e/app/api-bank-market.spec.ts`); "bankCryptoPriceType makes the market violate BankMarketResponse" (`tests/e2e/app/api-openapi-contract.spec.ts`)

### 23. A price you were quoted minutes ago still goes through

`bankQuoteExpired` · Time / state · where: /app/markets/{coin} — the trade panel

- What goes wrong: The expiry on the quote is never checked, so a stale price is honoured. In a market that moves every second, that is money made or lost for free — and in the right direction, every time.
- How to see it: Ask for a price, then wait past the countdown before confirming.
- Caught by: "PLANTED BUG bankQuoteExpired: a stale price still fills" (`tests/e2e/app/api-bank-trading.spec.ts`)

### 24. A gain is shown as a loss, and a loss as a gain

`bankProfitSign` · Sign / display · where: /app/portfolio

- What goes wrong: The sign on the unrealised figure is flipped. The size is right, which is what makes it slip past: the number looks plausible, and only the direction is wrong.
- How to see it: Buy something, then compare what you paid with what the page says you are up or down.
- Caught by: "PLANTED BUG bankProfitSign: a gain is shown as a loss" (`tests/e2e/app/api-bank-trading.spec.ts`)

### 25. The total on a quote leaves the fee out

`bankFeeHidden` · Money / display · where: /app/markets/{coin} — sell something

- What goes wrong: The quote shows the value before the fee as the total, while the trade charges the real one. The customer agrees to one number and gets another.
- How to see it: Note what the quote says you will receive, then check what actually arrives in your account.
- Caught by: "PLANTED BUG bankFeeHidden: the total leaves the fee out" (`tests/e2e/app/api-bank-trading.spec.ts`)

### 26. A mistyped address is accepted and the coin is lost

`bankBadAddress` · Validation · where: /app/wallet — send

- What goes wrong: The address's checksum is never verified. The send reports success, the coin leaves your wallet, and no wallet holds that address — the history row says it never landed. This is the one bug here that cannot be undone.
- How to see it: Change one character in the middle of a valid address and send to it.
- Caught by: "PLANTED BUG bankBadAddress: a mistyped address is accepted and the coin is lost" (`tests/e2e/app/api-bank-wallet.spec.ts`); "REPORT bankBadAddress: the page says it was sent, and it landed nowhere" (`tests/e2e/app/react-bank-wallet.spec.ts`)

### 27. You send slightly less than you typed

`bankCryptoFloat` · Floating point · where: /app/wallet — send or swap

- What goes wrong: The decimal is multiplied as a float and then cut off, so 0.29 becomes 0.28999999. Binary floating point cannot hold most decimals exactly — the same reason 0.1 + 0.2 is 0.30000000000000004. The fix is to read the digits as text, which is what the correct path does.
- How to see it: Type 0.29 and read back what the preview says you are sending.
- Caught by: "PLANTED BUG bankCryptoFloat: a typed amount loses its last atom" (`tests/e2e/app/api-bank-wallet.spec.ts`); "REPORT bankCryptoFloat: the amount sent is a hair under what was typed" (`tests/e2e/app/react-bank-wallet.spec.ts`)

### 28. "Log out everywhere else" leaves one device signed in

`bankEndOthersKeepsOne` · Off-by-one · where: /app/devices — signed in from two other browsers

- What goes wrong: The query that ends the other sessions skips the most recently used one, so the number the page reports is one short and a device the customer meant to sign out stays signed in. With one other device it looks like nothing happened at all; the gap only shows with two or more.
- How to see it: Sign in from three browsers, press the button in one, and count what is left on the other two.
- Caught by: "bankEndOthersKeepsOne: log out everywhere else leaves the newest other device signed in" (`tests/e2e/app/bank-security-bugs.spec.ts`)

### 29. A monthly payment set for the 31st skips February

`bankMonthlyRepeatOverflow` · Dates and time · where: /app/bank/bills — a monthly scheduled payment, with your clock moved past the 31st on /app/practice

- What goes wrong: The next date is worked out by adding one to the month and keeping the day, and JavaScript rolls a 31st that does not exist over into the month after: January 31 plus one month becomes March 3, so February is never paid. The fix is to clamp the day to the length of the next month, which is what the correct path does.
- How to see it: Schedule a monthly payment for the 31st of a month, advance your clock past it, and read the next date it shows.
- Caught by: "bankMonthlyRepeatOverflow: a monthly payment set for the 31st skips the short month" (`tests/e2e/app/bank-schedule-bugs.spec.ts`)

### 30. Many small purchases walk past a card's daily limit

`bankCardLimitPerCharge` · Validation · where: /app/bank/cards — spend with a card

- What goes wrong: The limit is compared with the single purchase instead of the day's total, so every purchase under the limit goes through and the day's spending climbs past it. The correct path adds today's approved purchases first. A limit that only looks at one transaction is the most common way a 'daily' limit turns out not to be daily.
- How to see it: Set a daily limit, then pay a few amounts that are each below it but together above it.
- Caught by: "bankCardLimitPerCharge: many small purchases walk past the daily limit" (`tests/e2e/app/bank-card-bugs.spec.ts`)

### 31. A sell order fills below the limit you set

`bankSellLimitInverted` · Validation · where: /app/markets/BTC — place a sell order with a limit well above the price

- What goes wrong: The comparison for a sell points the wrong way: it fills when the price is at or below the limit instead of at or above it. The customer asked for at least that price and gets less. A buy order is unaffected, which is why it is easy to miss until somebody sells.
- How to see it: Buy some coin, then place a sell order with a limit far above today's price and watch what happens on your next click.
- Caught by: "bankSellLimitInverted: a sell order fills below the limit the customer set" (`tests/e2e/app/bank-order-bugs.spec.ts`)

### 32. A read-only API key can add a payee

`bankKeyScopeLeak` · Access control · where: /app/developer — make a read key, then POST /api/bank/payees with it

- What goes wrong: The scope check skips one write endpoint, POST /api/bank/payees, so a key that may only read can add a payee. Every other change is refused. A permission check with one exception is the hardest kind to notice, because the rule works everywhere you happen to try first.
- How to see it: Make a key with the read scope and try each write endpoint with it. All but one answer 403.
- Caught by: "bankKeyScopeLeak: a read-only key can add a payee" (`tests/e2e/app/bank-key-bugs.spec.ts`)

### 33. A transfer memo of any length is stored

`bankMemoNoLimit` · Data integrity · where: /app/bank/transfer, or POST /api/bank/transfers with a very long memo

- What goes wrong: The server's length check is skipped, and nothing behind it says no: the memo columns in the database have no length constraint of their own (bank/schema.sql). One check in the app is the only line of defence, so when it slips, 5,000 characters land in the history and the statement. A constraint in the database would have refused it.
- How to see it: The page says how long a memo may be. Send a much longer one through the API, then read it back from the history.
- Caught by: "bankMemoNoLimit: nothing behind the app stops a 5,000-character memo" (`tests/e2e/app/bank-data-bugs.spec.ts`)

### 34. A read-only API key can pay with a card through GraphQL

`bankGraphqlKeyScope` · Access control · where: POST /api/bank/graphql with a read key, the chargeCard mutation

- What goes wrong: GraphQL refuses mutations to a read key by reading the document, and one mutation, chargeCard, is let through. REST still answers 403 for the very same charge, so a test that only checks REST never sees it. Two doors to one rule need the rule in both.
- How to see it: Make a read key on /app/developer. REST refuses every change it tries; try the same changes as GraphQL mutations.
- Caught by: "bankGraphqlKeyScope: a read-only key can charge a card through GraphQL" (`tests/e2e/app/bank-data-bugs.spec.ts`)

### 35. Paging the history with cursors loses a row

`bankCursorSkip` · Off-by-one · where: POST /api/bank/graphql, MoneyAccount.history with first and after

- What goes wrong: The page after a cursor starts one row late, so the first row of every next page is on no page at all. Each page looks complete and total is right, which is what hides it: only collecting every page and counting shows the gap.
- How to see it: Page through an account's history two rows at a time, collect every id, and compare with total.
- Caught by: "bankCursorSkip: paging with cursors loses a row between pages" (`tests/e2e/app/bank-data-bugs.spec.ts`)

### 36. The last item in stock sells twice

`bankShopOversell` · Concurrency · where: /app/products/&lt;a product with 1 in stock> — two customers check out at the same moment

- What goes wrong: The stock is read before the payment with no lock, the request waits, and the new stock is written as 'what I read minus what I bought'. Both checkouts read 1, both pass, both write 0: two orders, two payments, one item. The stock still reads 0, so nothing on the page looks wrong; only counting the orders shows it. The correct path locks the product row and takes the stock 'only if there is still enough'.
- How to see it: One checkout at a time is always fine. Put the last one in two customers' carts and pay with both at the same instant.
- Caught by: "bankShopOversell: two customers both buy the last item" (`tests/e2e/app/bank-shop-bugs.spec.ts`)

### 37. Checkout charges whatever total the browser sends

`bankShopClientPrice` · Access control · where: POST /api/bank/shop/checkout — the expectedTotalCents field

- What goes wrong: The total the page showed is meant as a check: if it differs from the server's own total, nothing is charged and the new total comes back. With the bug the server charges the number the browser sent instead, so editing the request buys an $820 miner for $1. The order's lines still say $820, which is how a reviewer spots it. Never trust a price that came from the client.
- How to see it: Checkout sends the total you were shown. Send a different one and read what your account was charged.
- Caught by: "bankShopClientPrice: checkout charges whatever total is sent" (`tests/e2e/app/bank-shop-bugs.spec.ts`); "bankShopClientPrice: the same $1 checkout works through GraphQL" (`tests/e2e/app/bank-shop-bugs.spec.ts`)

### 38. A backordered product can still be bought

`bankShopBackorderBuyable` · Validation · where: POST /api/bank/shop/cart with a Backordered product (sku-009, say)

- What goes wrong: The rule lives only in the page: the button is hidden, and the server never checks the status, so the API takes it into the cart and checkout sells it. A rule enforced only in the browser is not a rule; the server has to say no too.
- How to see it: The page hides Add to cart on a Backordered product. Try adding one through the API.
- Caught by: "bankShopBackorderBuyable: a backordered product goes in the cart and sells" (`tests/e2e/app/bank-shop-bugs.spec.ts`)

### 39. One shop order, refunded twice

`bankShopRefundTwice` · Business logic · where: /app/admin/shop-orders, or POST /api/bank/admin/shop/orders/&lt;id>/refund twice

- What goes wrong: The refund does not check whether the order was already refunded, so the second one pays the whole total back again and puts the stock back twice. refundedCents ends up at twice the total, which is the evidence.
- How to see it: Refund an order, then send the same refund again.
- Caught by: "bankShopRefundTwice: the same order is refunded twice" (`tests/e2e/app/bank-backoffice-bugs.spec.ts`)

### 40. An order jumps steps, or goes backwards

`bankShopStatusSkip` · State machine · where: PATCH /api/bank/admin/shop/orders/&lt;id> with a status

- What goes wrong: Any of the four steps is accepted from any step, so a placed order becomes delivered without ever being packed or shipped, and a delivered one can go back to packed -- which also makes it refundable again. The correct path allows only the next step.
- How to see it: An order goes placed, packed, shipped, delivered, one step at a time. Ask for a step that is not the next one.
- Caught by: "bankShopStatusSkip: an order jumps to delivered and back to packed" (`tests/e2e/app/bank-backoffice-bugs.spec.ts`)

### 41. Read-only Support staff can refund an order

`bankShopSupportRefund` · Access control · where: POST /api/bank/admin/shop/orders/&lt;id>/refund, signed in as Support (sam@)

- What goes wrong: The refund route checks 'is this staff?' instead of 'is this an Admin?', so Support -- read-only everywhere else -- can send money back. Moving an order still refuses Support, which is why it is easy to miss: the rule is right everywhere you look first.
- How to see it: The page hides Refund from Support. Send the refund through the API while signed in as Support.
- Caught by: "bankShopSupportRefund: read-only Support refunds an order" (`tests/e2e/app/bank-backoffice-bugs.spec.ts`)

### 42. A reused Idempotency-Key hides a different payment

`bankIdempotencyMismatch` · API contract · where: POST /api/bank/transfers (or any money request) with an Idempotency-Key

- What goes wrong: A key is tied to the request it was first used with. The same key with a different amount should be refused (422), because the client is asking for a new payment by mistake. With the bug the first result comes back as if the new payment went through -- the client believes money moved that never did.
- How to see it: Send a transfer with an Idempotency-Key. Then send a different amount with the same key and read the answer.
- Caught by: "bankIdempotencyMismatch: a reused key hides a different transfer" (`tests/e2e/app/bank-rules-bugs.spec.ts`)

### 43. Changes made through GraphQL leave no trace in the audit log

`bankAuditGraphqlGap` · Logging / audit · where: /app/admin/audit after a transfer made with POST /api/bank/graphql

- What goes wrong: GraphQL requests are never written to the log, so only the REST transfer shows up. The log looks complete to anyone who tests one door. Two doors to one action need the record in both -- the same lesson as every other GraphQL bug here.
- How to see it: Make the same transfer once through REST and once through GraphQL, then read the audit log as an Admin.
- Caught by: "bankAuditGraphqlGap: a GraphQL transfer leaves no line in the audit log" (`tests/e2e/app/bank-rules-bugs.spec.ts`)

### 44. A refund the statement never shows

`bankRefundNoEntry` · Data integrity · where: /app/admin/books after a shop refund

- What goes wrong: The money goes back to the account but no history row is written, so the balance no longer equals the sum of the history. The customer's statement is short by the refund, and the books check lists the account as out of balance. Every balance change needs its record in the same transaction.
- How to see it: Refund a shop order, then compare the account's balance with its history, or open the Books page as an Admin.
- Caught by: "bankRefundNoEntry: a refund the statement never shows, caught by the books" (`tests/e2e/app/bank-rules-bugs.spec.ts`); "the Books page lists an account a refund left out of balance (bankRefundNoEntry)" (`tests/e2e/app/react-bank-rules.spec.ts`)
