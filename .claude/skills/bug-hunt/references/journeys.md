# Where to look, and what to ask (bug-hunt)

A tester's map of Playground Bank: the areas, and the questions worth asking on
each kind of page. It names no planted fault; it is the checklist any tester
would bring to a bank and a shop.

## The areas

| Area              | Pages                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Bank              | `/app/bank`, an account (`/app/bank/accounts/<id>`), transfer, bill pay, cards, loans, requests                                |
| Markets           | `/app/markets`, a coin, `/app/portfolio`, `/app/wallet`                                                                        |
| Shop              | `/app/products`, a product, `/app/shop/cart`, `/app/shop/orders`                                                               |
| You               | `/app/profile`, `/app/settings`, `/app/devices`, `/app/notifications`, `/app/support`                                          |
| Developers        | `/app/developer` (API keys), `/app/graphql` (the explorer), `/api/docs`                                                        |
| Older pages       | `/app/orders`, `/app/users`                                                                                                    |
| Staff (look only) | `/app/admin/users`, `/app/admin/loans`, `/app/admin/support`, `/app/admin/shop-orders`, `/app/admin/audit`, `/app/admin/books` |

## The questions

**Money**

- Write the balance down before an action and check it after: did exactly the
  right amount move, once, from the right account to the right one?
- Do a list's rows add up to its total, on the page and in a download?
- Edges: zero, a negative amount, more than the balance, many decimals, a very
  large number, the same form sent twice quickly, two actions at once.
- Does a fee, a discount or interest come out to the amount it says?
- Does a schedule (payments, a loan) really end where it says it does?

**Whose data**

- With customer B's ids (an account, a payee, a request, a ticket, an order),
  can customer A see it, change it or delete it, through the page or the API?
- Does any answer (REST or GraphQL, including nested fields) carry another
  customer's name, email or numbers?
- Can a role do what its page hides? Try the API directly when the button is
  missing.

**State**

- After an action, does every page that shows it agree (the balance, the
  history, the bell, a list), with and without a reload?
- Does a counter (unread, items in the cart) go down when it should?
- Does a status move only along its steps, and only for the people allowed to
  move it?
- Does a reply, a refund or a cancellation reach the other side?

**Dates and lists**

- Does a date range include both its first and its last day?
- Does paging (next, cursors) skip or repeat a row?
- Does a filter or a search show what its label says?

**Limits and input**

- Is a length, an amount or a rate limit really kept by the server, not only
  by the form?
- Does the same request with the same idempotency key, or a reused key with a
  different body, do the right thing?
- Is a GraphQL query's depth or size limited?

**Errors**

- Does an error show the server's insides (a stack trace, SQL, file paths)?
- Does an error say what to do, without saying too much?

## Working rules

- Note the endpoint and the `X-Request-Id` of the request behind anything odd.
- Compare REST and GraphQL for the same thing when both exist.
- A question that finds nothing is fine: write nothing.
