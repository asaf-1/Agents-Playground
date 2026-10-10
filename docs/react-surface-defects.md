# React Surface (/app) — Injected Defect Catalog

Diagnostician classification of the deliberate defects on the React `/app`
surface. All are flag-armed per `runKey` via `POST /api/test/flags`; defaults are
non-drifted, so nothing fires unless a test arms it. Verdict semantics:

- **HEAL** — test drift (selector/text). The healer repairs the test, not the app.
- **REPORT** — real/by-design defect a correct test should record. Never "fixed".

| Flag (default)                 | Surface                                                                             | Category                | Armed behavior                                                                      | Verdict    | Root cause                                                                                               | Covering test                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `ordersRefreshLabel="Refresh"` | `/app/orders`                                                                       | DOM / selector          | Refresh button text → "Reload" (testid stable)                                      | **HEAL**   | Visible label changed; a text selector is stale                                                          | `react-orders.spec.ts`                                    |
| `userCreateConflict=false`     | `/app/users`                                                                        | Async / state           | `POST /api/users` → 409; optimistic row rolls back                                  | **REPORT** | Server rejects create; optimistic UI reverts                                                             | `react-users.spec.ts`                                     |
| `usersSearchStale=false`       | `/app/users`                                                                        | Async / closure         | Debounced search applies the previous query                                         | **REPORT** | Stale-closure off-by-one in the debounce                                                                 | `react-users.spec.ts`                                     |
| `usersLocaleBug=false`         | `/app/users`                                                                        | i18n / locale           | "Directory as of" renders de-DE (15.01.26) vs en-US                                 | **REPORT** | Wrong locale passed to `Intl.DateTimeFormat`                                                             | `react-users.spec.ts`                                     |
| `usersA11yBug=false`           | `/app/users`                                                                        | Accessibility           | Create-user name input loses its label association                                  | **REPORT** | No `<label>`/`id`/`aria-label` → no accessible name                                                      | `react-a11y.spec.ts` (axe `label`)                        |
| `authRequired=true`            | `/app/account`                                                                      | Auth / session          | `GET /api/session` → 401 session-expired state                                      | **REPORT** | Protected session required; UI surfaces 401                                                              | `react-account.spec.ts`                                   |
| `productSchemaDrift=false`     | `/api/products`                                                                     | API contract            | `price` emitted as string, not number                                               | **REPORT** | Response violates the OpenAPI `ProductsResponse` schema                                                  | `api-openapi-contract.spec.ts` (ajv)                      |
| `bankNegativeTransfer=false`   | `/app/bank/transfer`, `POST /api/bank/transfers`, GraphQL `transfer`                | Validation              | A negative amount goes through: the sender gains, the recipient loses               | **REPORT** | The amount is checked for "not zero" instead of "above zero", in the form and on the server              | `bank-money-bugs.spec.ts`                                 |
| `bankDoubleSubmit=false`       | `/app/bank/transfer`                                                                | Async / state           | A double-click on Confirm sends two transfers                                       | **REPORT** | The button stays enabled and each click sends a new `Idempotency-Key`                                    | `bank-money-bugs.spec.ts`                                 |
| `bankTransferRace=false`       | `POST /api/bank/transfers`, GraphQL `transfer`                                      | Concurrency             | Two transfers sent at once both pass and overdraw the account                       | **REPORT** | Check-then-act: the balance is read, then written later without the "only if there is enough" condition  | `bank-money-bugs.spec.ts`                                 |
| `bankStaleBalance=false`       | `/app/bank`                                                                         | Async / cache           | After a transfer the overview keeps the old balances until a reload                 | **REPORT** | The cached money queries aren't refreshed after a transfer                                               | `bank-money-bugs.spec.ts`                                 |
| `bankDateFilterOffByOne=false` | `GET /api/bank/accounts/{id}/transactions`, `statement.csv`, GraphQL `transactions` | Off-by-one              | A date range leaves out its last day                                                | **REPORT** | The period ends at the start of the "to" day instead of the start of the next one                        | `bank-money-bugs.spec.ts`                                 |
| `bankStatementTotal=false`     | `GET /api/bank/accounts/{id}/statement.csv`                                         | Data / reporting        | The statement's Total doesn't match its rows                                        | **REPORT** | The total skips the last row                                                                             | `bank-money-bugs.spec.ts`                                 |
| `bankLoanRounding=false`       | `GET /api/bank/loans/quote`, `POST /api/bank/loans`                                 | Rounding                | The monthly payments don't pay the loan off: a balance is left at the end           | **REPORT** | The payment's cents are cut off instead of rounded, and the last month never settles                     | `bank-money-bugs.spec.ts`                                 |
| `bankPayeeIdor=false`          | `DELETE /api/bank/payees/{id}`                                                      | Security / IDOR         | Any signed-in customer can delete another customer's payee by its id                | **REPORT** | The delete forgets to check whose payee it is                                                            | `bank-money-bugs.spec.ts`                                 |
| `bankNotificationCount=false`  | `GET /api/bank/notifications`, the bell                                             | Async / state           | The unread count never goes down after reading                                      | **REPORT** | The count query counts every notification, not the unread ones                                           | `bank-money-bugs.spec.ts`                                 |
| `bankRequestDoublePay=false`   | `POST /api/bank/requests/{id}/pay`                                                  | Concurrency / state     | A paid request can be paid again                                                    | **REPORT** | The claim forgets "only while it is pending"                                                             | `bank-money-bugs.spec.ts`                                 |
| `bankSupportStatus=false`      | `POST /api/bank/support/{id}/messages`                                              | Workflow / state        | The customer's reply leaves the ticket on Answered, so staff never see it come back | **REPORT** | The reply keeps the old status instead of setting "open"                                                 | `bank-money-bugs.spec.ts`                                 |
| `bankGraphqlOwnerLeak=false`   | `POST /api/bank/graphql`                                                            | Access control          | A nested `counterpartyDetails` field returns another customer's name and email      | **REPORT** | The nested resolver reads the owner without checking who is asking                                       | `bank-money-bugs.spec.ts`                                 |
| `bankGraphqlErrorDetail=false` | `POST /api/bank/graphql`                                                            | Information leak        | An unexpected error answers with the internal message and a stack trace             | **REPORT** | The error shaper sends the original error instead of a generic message                                   | `bank-money-bugs.spec.ts`                                 |
| `bankGraphqlDepth=false`       | `POST /api/bank/graphql`                                                            | Resource exhaustion     | A query nested past 8 levels is executed instead of refused                         | **REPORT** | The depth check is skipped, so one request can ask for unbounded work                                    | `bank-money-bugs.spec.ts`                                 |
| `bankCryptoPriceType=false`    | `GET /api/bank/market`, `GET /api/bank/market/{symbol}`                             | API contract            | `priceMicros` emitted as a string, not a number                                     | **REPORT** | The response violates the OpenAPI `BankMarketResponse` / `BankCoinDetail` schemas                        | `api-bank-market.spec.ts`, `api-openapi-contract.spec.ts` |
| `bankQuoteExpired=false`       | `POST /api/bank/trades`, GraphQL `trade`                                            | Time / state            | A price that expired minutes ago still fills                                        | **REPORT** | The expiry on the quote is never checked, so a stale price is honoured                                   | `api-bank-trading.spec.ts`                                |
| `bankProfitSign=false`         | `GET /api/bank/portfolio`, `/app/portfolio`, GraphQL `portfolio`                    | Sign / display          | A gain shows as a loss and a loss as a gain                                         | **REPORT** | The sign on the unrealised figure is flipped; the size is right, which hides it                          | `api-bank-trading.spec.ts`                                |
| `bankFeeHidden=false`          | `POST /api/bank/trades/quote`, GraphQL `quoteTrade`                                 | Money / display         | The total on a quote leaves the fee out, so the receipt disagrees                   | **REPORT** | The quote shows the gross as the total; the row keeps the real net, which is what is charged             | `api-bank-trading.spec.ts`                                |
| `bankBadAddress=false`         | `POST /api/bank/wallet/send`, `/app/wallet`, GraphQL `sendCoin`                     | Validation / money loss | A mistyped address is accepted and the coin reaches nobody                          | **REPORT** | The address checksum is never verified, so coin leaves the sender and lands nowhere (`delivered: false`) | `api-bank-wallet.spec.ts`, `react-bank-wallet.spec.ts`    |
| `bankCryptoFloat=false`        | `POST /api/bank/wallet/send`, `/swap`, `/app/wallet`, GraphQL `sendCoin`            | Floating point          | A typed amount loses its last unit: 0.29 is sent as 0.28999999                      | **REPORT** | The decimal is multiplied as a float instead of read digit by digit, then truncated                      | `api-bank-wallet.spec.ts`, `react-bank-wallet.spec.ts`    |

## Practice mode (phase 4)

One switch in the top bar arms every flag below for the visitor who flipped it,
and nobody else. The catalogue it reads lives in `practice.js` — one row per
bug, with where to look, a hint and a reveal — and `/app/practice` renders the
same rows, so the switch and the page cannot drift apart. This table stays the
written reference; `practice.js` is the one the code reads.

- `GET /api/practice` returns the state and the catalogue;
  `POST /api/practice` with `{ "on": true }` arms it.
- The visitor is told apart by a run key in a **session cookie**, so the bugs
  follow them from page to page and end when the browser closes. Nothing is
  stored: turn it on, practise, leave, start over.
- It never writes to the shared `global` flags. If it did, one visitor would
  turn the site buggy for everybody, and this suite would fail everywhere at
  once — `api-practice-mode.spec.ts` guards exactly that.
- `authRequired`, `sessionExpired`, `rbacEnforce`, `adminGate` and
  `loginSubmitLabel` are policy switches rather than planted faults, so the
  catalogue leaves them out.

## Notes

- Legacy intentional defects (RBAC editor-delete, broken product state, layout
  overlap, inactive Carol) are unchanged and out of scope here.
- Isolation: each test navigates `/app/...?runKey=<unique>` and arms flags for
  that `runKey` only, so armed drift never leaks across the parallel suite.
- The twenty `bank*` flags are Playground Bank's bugs (phases 2b, 2c, 2d, 3a, 3b
  and 3c).
  A bug that lives in shared bank code fires through REST **and** GraphQL, so
  practice mode (phase 4) turns the whole site buggy at once rather than one
  door only. Four are REST- or UI-only because GraphQL has no equivalent:
  `bankDoubleSubmit` and `bankStaleBalance` are front-end, `bankStatementTotal`
  is the CSV statement, and `bankPayeeIdor` needs a delete-payee mutation that
  doesn't exist. `bankCryptoPriceType` is REST-only for a different reason: the
  GraphQL `Micros` scalar coerces the string straight back to a number, so the
  bug cannot survive that door, and forcing it through would mean hanging
  per-request state on a scalar shared by every concurrent request. The three
  trading bugs (`bankQuoteExpired`, `bankProfitSign`, `bankFeeHidden`) all live
  in `bank/trading.js`, and the two wallet bugs (`bankBadAddress`,
  `bankCryptoFloat`) live in `bank/wallet.js`, so all five fire through REST
  **and** GraphQL. The server
  reads them per `runKey` too (`?runKey=` or the `qa_runkey` cookie); without
  them the same steps are correct, which `api-bank-money.spec.ts` and
  `react-bank-money.spec.ts` check.
- The single HEAL case (`ordersRefreshLabel`) is the only one a healer should
  touch; the rest are REPORT (by-design) and must not be "fixed".
