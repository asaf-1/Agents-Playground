import { expect, test } from "@playwright/test";
import {
  addPayee,
  balanceOf,
  DEMO,
  errorCode,
  graphql,
  moneyAccounts,
  requestLoan,
  signIn,
  signUpCustomer,
  type MoneyAccount,
} from "./_bank";

// Playground Bank's GraphQL API (phase 2d) at POST /api/bank/graphql. It runs on
// the same modules, session and rules as REST, so these tests check both that it
// answers correctly and that it agrees with the REST API.

test.describe("Playground Bank GraphQL API", () => {
  test("a GraphQL answer is HTTP 200; signed out, the error says so", async ({
    request,
  }) => {
    const answer = await graphql(request, "{ me { email } }");
    expect(errorCode(answer)).toBe("NOT_SIGNED_IN");
    expect(answer.errors?.[0].message).toBe("Sign in first.");
    expect(answer.data).toBeNull();
  });

  test("me and accounts match what REST returns", async ({ request }) => {
    const customer = await signUpCustomer(request, "Query Customer");
    const rest = await moneyAccounts(request);
    const answer = await graphql<{
      me: { email: string; fullName: string; role: string; isDemo: boolean };
      accounts: MoneyAccount[];
    }>(
      request,
      `
        {
          me {
            id
            email
            fullName
            role
            status
            isDemo
          }
          accounts {
            id
            number
            kind
            name
            balanceCents
          }
        }
      `,
    );
    expect(answer.errors).toBeUndefined();
    expect(answer.data?.me).toMatchObject({
      email: customer.email,
      fullName: "Query Customer",
      role: "customer",
      isDemo: false,
    });
    expect(answer.data?.accounts.map((a) => a.number)).toEqual(
      rest.accounts.map((a) => a.number),
    );
    expect(answer.data?.accounts[0].balanceCents).toBe(
      rest.accounts[0].balanceCents,
    );
  });

  test("you get back only the fields you asked for", async ({ request }) => {
    await signUpCustomer(request, "Picky Customer");
    const answer = await graphql<{ accounts: Record<string, unknown>[] }>(
      request,
      "{ accounts { number } }",
    );
    expect(Object.keys(answer.data!.accounts[0])).toEqual(["number"]);
  });

  test("an account carries its own history, with filters and pages", async ({
    request,
  }) => {
    await signUpCustomer(request, "History Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    for (const amountCents of [1_000, 2_000, 3_000]) {
      await request.post("/api/bank/transfers", {
        data: {
          fromAccountId: checking.id,
          toAccountNumber: savings.number,
          amountCents,
        },
      });
    }

    const answer = await graphql<{
      account: {
        number: string;
        transactions: {
          total: number;
          page: number;
          pageSize: number;
          totalPages: number;
          transactions: { amountCents: number; counterparty: string }[];
        };
      };
    }>(
      request,
      `
        query History($id: ID!) {
          account(id: $id) {
            number
            transactions(type: "out", page: 1, pageSize: 2) {
              total
              page
              pageSize
              totalPages
              transactions {
                amountCents
                counterparty
              }
            }
          }
        }
      `,
      { id: checking.id },
    );
    const page = answer.data!.account.transactions;
    expect(answer.data!.account.number).toBe(checking.number);
    expect(page).toMatchObject({
      total: 3,
      page: 1,
      pageSize: 2,
      totalPages: 2,
    });
    expect(page.transactions).toHaveLength(2);
    expect(page.transactions[0].amountCents).toBe(-3_000);
    expect(page.transactions[0].counterparty).toBe(savings.number);

    // GraphQL keeps REST's page-size limit, so it is not a weaker door.
    const huge = await graphql(
      request,
      `
        query P($id: ID!) {
          account(id: $id) {
            transactions(pageSize: 5000) {
              total
            }
          }
        }
      `,
      { id: checking.id },
    );
    expect(errorCode(huge)).toBe("VALIDATION_FAILED");
  });

  test("someone else's account answers as not found", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Nosy GraphQL Customer");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Private GraphQL Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;

    const answer = await graphql(
      request,
      `
        query Peek($id: ID!) {
          account(id: $id) {
            number
            balanceCents
          }
        }
      `,
      { id: theirs.id },
    );
    expect(errorCode(answer)).toBe("ACCOUNT_NOT_FOUND");
    await other.dispose();
  });

  test("a nested counterparty never carries the other customer's name or email", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Sending GraphQL Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    const them = await signUpCustomer(other, "Receiving GraphQL Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;
    await request.post("/api/bank/transfers", {
      data: {
        fromAccountId: checking.id,
        toAccountNumber: theirs.number,
        amountCents: 5_000,
      },
    });

    const answer = await graphql<{
      account: {
        transactions: {
          transactions: {
            counterpartyDetails: {
              accountNumber: string;
              fullName: string | null;
              email: string | null;
            };
          }[];
        };
      };
    }>(
      request,
      `
        query Who($id: ID!) {
          account(id: $id) {
            transactions(type: "out") {
              transactions {
                counterpartyDetails {
                  accountNumber
                  fullName
                  email
                }
              }
            }
          }
        }
      `,
      { id: checking.id },
    );
    const details =
      answer.data!.account.transactions.transactions[0].counterpartyDetails;
    expect(details.accountNumber).toBe(theirs.number);
    expect(details.fullName).toBeNull();
    expect(details.email).toBeNull();
    expect(JSON.stringify(answer)).not.toContain(them.email);
    await other.dispose();
  });

  test("addFunds and transfer move real money, seen by REST", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Mutating Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Receiving Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;

    const added = await graphql<{ addFunds: { balanceCents: number } }>(
      request,
      `
        mutation Add($id: ID!, $cents: Cents!) {
          addFunds(accountId: $id, amountCents: $cents) {
            number
            balanceCents
          }
        }
      `,
      { id: checking.id, cents: 150_000 },
    );
    expect(added.data!.addFunds.balanceCents).toBe(
      checking.balanceCents + 150_000,
    );

    const sent = await graphql<{
      transfer: {
        replayed: boolean;
        transfer: { id: string; amountCents: number };
        fromAccount: { balanceCents: number };
      };
    }>(
      request,
      `
        mutation Send($from: ID!, $to: String!, $cents: Cents!) {
          transfer(
            fromAccountId: $from
            toAccountNumber: $to
            amountCents: $cents
            memo: "From GraphQL"
          ) {
            replayed
            transfer {
              id
              amountCents
            }
            fromAccount {
              balanceCents
            }
          }
        }
      `,
      { from: checking.id, to: theirs.number, cents: 50_000 },
    );
    expect(sent.data!.transfer.replayed).toBe(false);
    expect(sent.data!.transfer.transfer.amountCents).toBe(50_000);
    // REST and GraphQL read the same database.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents + 100_000,
    );
    expect(await balanceOf(other, theirs.id)).toBe(
      theirs.balanceCents + 50_000,
    );
    await other.dispose();
  });

  test("a transfer keeps every rule REST has", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Careful Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Bystander Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;
    const send = `mutation Send($from: ID!, $to: String!, $cents: Cents!) {
        transfer(fromAccountId: $from, toAccountNumber: $to, amountCents: $cents) { replayed }
      }`;

    const cases: [Record<string, unknown>, string][] = [
      [{ from: checking.id, to: theirs.number, cents: 0 }, "VALIDATION_FAILED"],
      [
        { from: checking.id, to: theirs.number, cents: -5_000 },
        "VALIDATION_FAILED",
      ],
      [{ from: checking.id, to: "nonsense", cents: 100 }, "VALIDATION_FAILED"],
      [
        { from: checking.id, to: "PB-0000-0000", cents: 100 },
        "RECIPIENT_NOT_FOUND",
      ],
      [{ from: checking.id, to: "PB-1000-0001", cents: 100 }, "DEMO_ACCOUNT"],
      [
        { from: theirs.id, to: savings.number, cents: 100 },
        "ACCOUNT_NOT_FOUND",
      ],
      [
        {
          from: checking.id,
          to: theirs.number,
          cents: checking.balanceCents + 1,
        },
        "INSUFFICIENT_FUNDS",
      ],
    ];
    for (const [variables, code] of cases) {
      const answer = await graphql(request, send, variables);
      expect(errorCode(answer), JSON.stringify(variables)).toBe(code);
    }
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
    await other.dispose();
  });

  test("demo accounts can read everything but change nothing", async ({
    request,
  }) => {
    await signIn(request, DEMO.customer);
    const read = await graphql<{
      me: { isDemo: boolean };
      accounts: MoneyAccount[];
    }>(request, "{ me { isDemo } accounts { id number balanceCents } }");
    expect(read.data!.me.isDemo).toBe(true);
    expect(read.data!.accounts.length).toBeGreaterThan(0);

    const write = await graphql(
      request,
      `
        mutation Add($id: ID!) {
          addFunds(accountId: $id, amountCents: 100) {
            balanceCents
          }
        }
      `,
      { id: read.data!.accounts[0].id },
    );
    expect(errorCode(write)).toBe("DEMO_READ_ONLY");
  });

  test("bill pay: payees and a payment through GraphQL", async ({
    request,
  }) => {
    await signUpCustomer(request, "Billing GraphQL Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const payee = await addPayee(request, "City Power", "ACC-100234");

    const paid = await graphql<{
      payBill: {
        payment: { payeeName: string; amountCents: number };
        fromAccount: { balanceCents: number };
      };
    }>(
      request,
      `
        mutation Pay($from: ID!, $payee: ID!, $cents: Cents!) {
          payBill(
            fromAccountId: $from
            payeeId: $payee
            amountCents: $cents
            memo: "October"
          ) {
            payment {
              payeeName
              payeeReference
              amountCents
              memo
            }
            fromAccount {
              balanceCents
            }
          }
        }
      `,
      { from: checking.id, payee: payee.id, cents: 12_500 },
    );
    expect(paid.data!.payBill.payment).toMatchObject({
      payeeName: "City Power",
      amountCents: 12_500,
    });
    expect(paid.data!.payBill.fromAccount.balanceCents).toBe(
      checking.balanceCents - 12_500,
    );

    const listed = await graphql<{ payees: { name: string }[] }>(
      request,
      "{ payees { id name reference } }",
    );
    expect(listed.data!.payees.map((p) => p.name)).toEqual(["City Power"]);
  });

  test("a loan quote matches the REST quote, to the cent", async ({
    request,
  }) => {
    await signUpCustomer(request, "Quoting Customer");
    const rest = await (
      await request.get(
        "/api/bank/loans/quote?amountCents=1500000&termMonths=24",
      )
    ).json();
    const answer = await graphql<{
      loanQuote: {
        monthlyPaymentCents: number;
        totalInterestCents: number;
        aprBasisPoints: number;
        schedule: { month: number; balanceCents: number }[];
      };
    }>(
      request,
      `
        {
          loanQuote(amountCents: 1500000, termMonths: 24) {
            aprBasisPoints
            monthlyPaymentCents
            totalInterestCents
            totalRepaidCents
            schedule {
              month
              paymentCents
              balanceCents
            }
          }
        }
      `,
    );
    const quote = answer.data!.loanQuote;
    expect(quote.monthlyPaymentCents).toBe(rest.monthlyPaymentCents);
    expect(quote.totalInterestCents).toBe(rest.totalInterestCents);
    // Both doors work the rate out for the same customer, so they agree,
    // whatever that customer's own rate happens to be.
    expect(quote.aprBasisPoints).toBe(rest.aprBasisPoints);
    expect(quote.schedule).toHaveLength(24);
    // The last month settles the rest, so the loan ends at exactly zero.
    expect(quote.schedule[23].balanceCents).toBe(0);
  });

  test("a loan asked for in REST is visible in GraphQL, with its schedule", async ({
    request,
  }) => {
    await signUpCustomer(request, "Borrowing GraphQL Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);

    const answer = await graphql<{
      loans: {
        id: string;
        status: string;
        schedule: { month: number; balanceCents: number }[];
      }[];
      loan: {
        amountCents: number;
        status: string;
        customer: unknown;
        schedule: { month: number }[];
      };
    }>(
      request,
      `
        query Loan($id: ID!) {
          loans {
            id
            status
            schedule {
              month
              balanceCents
            }
          }
          loan(id: $id) {
            amountCents
            termMonths
            status
            customer {
              email
            }
            schedule {
              month
            }
          }
        }
      `,
      { id: loan.id },
    );
    expect(answer.data!.loans.map((l) => l.id)).toEqual([loan.id]);
    expect(answer.data!.loan).toMatchObject({
      amountCents: 1_200_000,
      status: "pending",
    });
    // A customer never sees the borrower block; only staff do.
    expect(answer.data!.loan.customer).toBeNull();
    expect(answer.data!.loan.schedule).toHaveLength(12);
    // The schedule is real in the list too, not an empty placeholder, and the
    // last month settles the loan to exactly zero.
    const listed = answer.data!.loans[0].schedule;
    expect(listed).toHaveLength(12);
    expect(listed[11].balanceCents).toBe(0);
  });

  test("notifications, requests and support come through one query", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Connected GraphQL Customer");
    const [mine] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Paying GraphQL Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;

    const asked = await graphql<{
      askForMoney: { id: string; status: string; amountCents: number };
    }>(
      request,
      `
        mutation Ask($to: ID!, $from: String!, $cents: Cents!) {
          askForMoney(
            toAccountId: $to
            fromAccountNumber: $from
            amountCents: $cents
            memo: "Concert"
          ) {
            id
            status
            amountCents
            requesterName
          }
        }
      `,
      { to: mine.id, from: theirs.number, cents: 2_500 },
    );
    expect(asked.data!.askForMoney).toMatchObject({
      status: "pending",
      amountCents: 2_500,
    });

    // The other customer sees it and pays, all through GraphQL.
    const theirView = await graphql<{
      notifications: { unread: number; notifications: { kind: string }[] };
      requests: { incoming: { id: string }[] };
    }>(
      other,
      `
        {
          notifications {
            unread
            notifications {
              kind
              title
              amountCents
            }
          }
          requests {
            incoming {
              id
              status
            }
          }
        }
      `,
    );
    expect(theirView.data!.notifications.unread).toBe(1);
    expect(theirView.data!.notifications.notifications[0].kind).toBe(
      "request_received",
    );
    expect(theirView.data!.requests.incoming[0].id).toBe(
      asked.data!.askForMoney.id,
    );

    const paid = await graphql<{
      payRequest: {
        request: { status: string };
        fromAccount: { balanceCents: number };
      };
    }>(
      other,
      `
        mutation Pay($id: ID!, $from: ID!) {
          payRequest(id: $id, fromAccountId: $from) {
            request {
              status
            }
            transfer {
              amountCents
            }
            fromAccount {
              balanceCents
            }
          }
        }
      `,
      { id: asked.data!.askForMoney.id, from: theirs.id },
    );
    expect(paid.data!.payRequest.request.status).toBe("paid");
    expect(await balanceOf(request, mine.id)).toBe(mine.balanceCents + 2_500);

    // Paying it twice is still refused.
    const again = await graphql(
      other,
      `
        mutation Pay($id: ID!, $from: ID!) {
          payRequest(id: $id, fromAccountId: $from) {
            request {
              status
            }
          }
        }
      `,
      { id: asked.data!.askForMoney.id, from: theirs.id },
    );
    expect(errorCode(again)).toBe("REQUEST_NOT_PENDING");
    await other.dispose();
  });

  test("a ticket opened in GraphQL reaches the staff inbox", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Asking GraphQL Customer");
    const opened = await graphql<{
      openTicket: {
        ticket: { id: string; status: string; subject: string };
        messages: { body: string; fromStaff: boolean }[];
      };
    }>(
      request,
      `
        mutation Open($subject: String!, $body: String!) {
          openTicket(subject: $subject, body: $body) {
            ticket {
              id
              subject
              status
            }
            messages {
              body
              fromStaff
            }
          }
        }
      `,
      { subject: "A GraphQL question", body: "Does this reach support?" },
    );
    const ticket = opened.data!.openTicket.ticket;
    expect(ticket.status).toBe("open");
    expect(opened.data!.openTicket.messages[0].fromStaff).toBe(false);

    const staff = await playwright.request.newContext({ baseURL });
    await signIn(staff, DEMO.support);
    const answered = await graphql<{
      replyToTicket: { ticket: { status: string } };
    }>(
      staff,
      `
        mutation Reply($id: ID!, $body: String!) {
          replyToTicket(id: $id, body: $body) {
            ticket {
              status
            }
            messages {
              fromStaff
            }
          }
        }
      `,
      { id: ticket.id, body: "Yes, it does." },
    );
    expect(answered.data!.replyToTicket.ticket.status).toBe("answered");

    // The customer is told, and REST shows the same thread.
    const told = await (await request.get("/api/bank/notifications")).json();
    expect(told.notifications[0].kind).toBe("support_reply");
    const thread = await (
      await request.get(`/api/bank/support/${ticket.id}`)
    ).json();
    expect(thread.messages).toHaveLength(2);
    await staff.dispose();
  });

  test("someone else's ticket, request and notification stay private", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Owner GraphQL Customer");
    const { ticket } = await (
      await request.post("/api/bank/support", {
        data: { subject: "Private matter", body: "Only for the bank." },
      })
    ).json();
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Stranger GraphQL Customer");

    const peek = await graphql(
      other,
      `
        query T($id: ID!) {
          ticket(id: $id) {
            ticket {
              subject
            }
          }
        }
      `,
      { id: ticket.id },
    );
    expect(errorCode(peek)).toBe("TICKET_NOT_FOUND");

    const mark = await graphql(
      other,
      `
        mutation M($id: ID!) {
          markNotificationRead(id: $id) {
            read
          }
        }
      `,
      { id: "11111111-1111-4111-8111-111111111111" },
    );
    expect(errorCode(mark)).toBe("NOTIFICATION_NOT_FOUND");
    await other.dispose();
  });

  test("introspection describes the schema, for the explorer", async ({
    request,
  }) => {
    const answer = await graphql<{
      __schema: {
        queryType: { name: string };
        mutationType: { name: string };
        types: { name: string; fields: { name: string }[] | null }[];
      };
    }>(
      request,
      `
        {
          __schema {
            queryType {
              name
            }
            mutationType {
              name
            }
            types {
              name
              fields {
                name
                type {
                  name
                  kind
                  ofType {
                    name
                  }
                }
              }
            }
          }
        }
      `,
    );
    expect(answer.errors).toBeUndefined();
    expect(answer.data!.__schema.queryType.name).toBe("Query");
    expect(answer.data!.__schema.mutationType.name).toBe("Mutation");
    const names = answer.data!.__schema.types.map((type) => type.name);
    expect(names).toContain("MoneyAccount");
    expect(names).toContain("Cents");
  });

  test("a broken query is refused with a readable message", async ({
    request,
  }) => {
    const unknown = await graphql(request, "{ nope }");
    expect(errorCode(unknown)).toBe("GRAPHQL_VALIDATION_FAILED");
    expect(unknown.errors?.[0].message).toContain("nope");

    const syntax = await graphql(request, "{ accounts {");
    expect(errorCode(syntax)).toBe("GRAPHQL_VALIDATION_FAILED");

    const empty = await graphql(request, "   ");
    expect(errorCode(empty)).toBe("VALIDATION_FAILED");

    // Cents takes whole cents, never a decimal.
    const fraction = await graphql(
      request,
      'mutation { addFunds(accountId: "x", amountCents: 1.5) { balanceCents } }',
    );
    expect(errorCode(fraction)).toBe("GRAPHQL_VALIDATION_FAILED");
  });

  test("a query deeper than the limit is refused", async ({ request }) => {
    await signUpCustomer(request, "Deep GraphQL Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const answer = await graphql(
      request,
      `
        query Deep($id: ID!) {
          account(id: $id) {
            transactions {
              transactions {
                transfer {
                  fromAccount {
                    transactions {
                      transactions {
                        transfer {
                          fromAccount {
                            number
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { id: checking.id },
    );
    expect(errorCode(answer)).toBe("QUERY_TOO_DEEP");
    expect(answer.errors?.[0].message).toContain("8");
  });

  test("Cents carries money past the 32-bit Int limit", async ({ request }) => {
    // GraphQL's Int stops at 2,147,483,647, which is only $21,474,836.47 in
    // cents, and Postgres hands bigint back as a string through the pg driver.
    // That is why Cents is a custom scalar; this test fails if it becomes Int.
    const INT_MAX = 2 ** 31 - 1;
    await signUpCustomer(request, "Wealthy GraphQL Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const topUp = `mutation Add($id: ID!, $cents: Cents!) {
        addFunds(accountId: $id, amountCents: $cents) { balanceCents }
      }`;

    let balance = 0;
    for (let i = 0; i < 22; i += 1) {
      const answer = await graphql<{ addFunds: { balanceCents: number } }>(
        request,
        topUp,
        { id: checking.id, cents: 100_000_000 },
      );
      expect(answer.errors).toBeUndefined();
      balance = answer.data!.addFunds.balanceCents;
    }

    expect(balance).toBe(checking.balanceCents + 22 * 100_000_000);
    expect(balance).toBeGreaterThan(INT_MAX);
    expect(typeof balance).toBe("number");

    // It survives a read back, and REST agrees to the cent.
    const read = await graphql<{ account: { balanceCents: number } }>(
      request,
      `
        query A($id: ID!) {
          account(id: $id) {
            balanceCents
          }
        }
      `,
      { id: checking.id },
    );
    expect(read.data!.account.balanceCents).toBe(balance);
    expect(await balanceOf(request, checking.id)).toBe(balance);
  });

  test("the endpoint takes JSON only", async ({ request }) => {
    const response = await request.post("/api/bank/graphql", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: "query={ me { id } }",
    });
    expect(response.status()).toBe(415);
    expect((await response.json()).code).toBe("JSON_REQUIRED");
  });

  test("an unexpected failure never leaks how the server works", async ({
    request,
  }) => {
    await signUpCustomer(request, "Breaking GraphQL Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    // A null byte is rejected by Postgres itself, below the bank's own checks.
    const answer = await graphql(
      request,
      `
        mutation Send($from: ID!, $to: String!, $memo: String) {
          transfer(
            fromAccountId: $from
            toAccountNumber: $to
            amountCents: 100
            memo: $memo
          ) {
            replayed
          }
        }
      `,
      { from: checking.id, to: savings.number, memo: "bad\u0000memo" },
    );
    expect(errorCode(answer)).toBe("SERVER_ERROR");
    expect(answer.errors?.[0].message).toBe("Something went wrong.");
    expect(answer.errors?.[0].extensions?.stacktrace).toBeUndefined();
    expect(JSON.stringify(answer)).not.toContain("bank_transfers");
  });
});
