// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// A status check that says what the server answered.
import { expectStatus } from "../../../framework/helpers/apiCheck";
// The bank helpers: sign up, accounts, history, payees, the cart, GraphQL,
// money as the pages print it.
import {
  addPayee,
  addToCart,
  errorCode,
  graphql,
  historyOf,
  moneyAccounts,
  signUpCustomer,
  usd,
} from "../../../framework/helpers/bank";
// Lets a payment reach the bank, then drops its answer.
import { loseNextAnswer } from "../../../framework/helpers/lostAnswer";

// A lost answer never charges twice (Part 6 of the Codex review plan). Each
// browser test lets a payment reach the bank and be done there, then drops
// the answer before the page sees it, as if the connection broke on the way
// back. The page must say so plainly, the visitor tries again, and the bank
// must have moved the money once. Amounts come from the customer's own
// balance; nothing the bank decides is written here.

// What a payment page says after a lost answer, naming its own button
// (web/src/bankApi.ts lostAnswerMessage).
const lostMessage = (button: string) =>
  `We couldn't confirm the payment. Pressing ${button} again is safe: it won't charge twice.`;

// The rows of one account's history that carry this memo.
async function rowsWithMemo(
  request: Parameters<typeof historyOf>[0],
  accountId: string,
  memo: string,
) {
  const rows = await historyOf(request, accountId);
  return rows.filter((row) => (row as { memo?: string }).memo === memo);
}

// A unique memo, so a test finds only its own rows.
function memoFor(what: string): string {
  return `${what} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

test.describe("A lost answer never charges twice", () => {
  // Transfer: the review keeps its key, so Confirm again is a replay.
  test("a transfer whose answer is lost says Confirm again is safe, and moves the money once", async ({
    page,
  }) => {
    expected(
      "the first Confirm is done by the bank but its answer is dropped: the page says it couldn't confirm and Confirm transfer again is safe; Confirm again shows the receipt; Checking falls and Savings rises by the amount once; one row each",
    );
    const memo = memoFor("Lost transfer");
    const { checking, savings, amountCents } =
      await test.step("a new customer, and a tenth of their Checking", async () => {
        await signUpCustomer(page.request, "Lost Transfer");
        const [checking, savings] = (await moneyAccounts(page.request))
          .accounts;
        const amountCents = Math.floor(checking.balanceCents / 10);
        fact("amount", amountCents);
        return { checking, savings, amountCents };
      });

    await test.step("fill in the transfer and review it", async () => {
      await page.goto("/app/bank");
      await page.getByTestId(`account-transfer-${checking.id}`).click();
      await page.getByTestId("transfer-to-account").selectOption(savings.id);
      await page
        .getByTestId("transfer-amount")
        .fill((amountCents / 100).toFixed(2));
      await page.getByTestId("transfer-memo").fill(memo);
      await page.getByTestId("transfer-review").click();
    });

    await test.step("press Confirm: the bank moves the money, the answer is lost", async () => {
      const lost = await loseNextAnswer(page, /^\/api\/bank\/transfers$/);
      await page.getByTestId("transfer-confirm").click();
      await expect(
        page.getByTestId("transfer-error"),
        "the page says it couldn't confirm, and that Confirm again is safe",
      ).toHaveText(lostMessage("Confirm transfer"));
      fact("bank answered the lost one", lost.bankStatus());
      expect(lost.dropped(), "one answer was dropped").toBe(1);
      expect(lost.bankStatus(), "the bank did the transfer").toBe(201);
    });

    await test.step("press Confirm again", async () => {
      await page.getByTestId("transfer-confirm").click();
      await expect(
        page.getByTestId("receipt-amount"),
        "the receipt shows the amount",
      ).toHaveText(usd(amountCents));
    });

    await test.step("the bank moved the money once", async () => {
      const [after, saved] = (await moneyAccounts(page.request)).accounts;
      expect(after.balanceCents, "Checking fell by the amount once").toBe(
        checking.balanceCents - amountCents,
      );
      expect(saved.balanceCents, "Savings rose by the amount once").toBe(
        savings.balanceCents + amountCents,
      );
      expect(
        (await rowsWithMemo(page.request, checking.id, memo)).length,
        "one history row on Checking",
      ).toBe(1);
      expect(
        (await rowsWithMemo(page.request, savings.id, memo)).length,
        "one history row on Savings",
      ).toBe(1);
    });
  });

  // Checkout: the cart keeps its key and its lines after a lost answer, so
  // Pay again gets the order the bank already made.
  test("a checkout whose answer is lost says Pay again is safe, and Pay again opens the one order", async ({
    page,
  }) => {
    expected(
      "the first Pay is done by the bank but its answer is dropped: the cart stays, saying it couldn't confirm and Pay again is safe; Pay again opens the order; one charge of the cart's total, one order",
    );
    const { checking, totalCents } =
      await test.step("a new customer with one product in the cart", async () => {
        await signUpCustomer(page.request, "Lost Checkout");
        const [checking] = (await moneyAccounts(page.request)).accounts;
        const list = await (
          await page.request.get("/api/bank/shop/products")
        ).json();
        const product = list.products.find(
          (item: { stock: number; status: string }) =>
            item.stock > 5 && item.status === "Available",
        );
        fact("product", product.id);
        expect(
          (await addToCart(page.request, product.id, 1)).status(),
          "the product goes in the cart",
        ).toBe(201);
        const cart = await (
          await page.request.get("/api/bank/shop/cart")
        ).json();
        fact("cart total", cart.totalCents);
        return { checking, totalCents: cart.totalCents as number };
      });

    await test.step("press Pay: the bank charges, the answer is lost", async () => {
      await page.goto("/app/shop/cart");
      await page.getByTestId("cart-account").selectOption(checking.id);
      const lost = await loseNextAnswer(page, /^\/api\/bank\/shop\/checkout$/);
      await page.getByTestId("cart-pay").click();
      await expect(
        page.getByTestId("cart-pay-error"),
        "the cart says it couldn't confirm, and that Pay again is safe",
      ).toHaveText(lostMessage("Pay"));
      await expect(
        page.getByTestId("cart-pay"),
        "Pay is still there to press again",
      ).toBeEnabled();
      fact("bank answered the lost one", lost.bankStatus());
      expect(lost.bankStatus(), "the bank did the checkout").toBe(201);
    });

    await test.step("press Pay again: the order the bank already made opens", async () => {
      await page.getByTestId("cart-pay").click();
      await expect(page, "the order page opens").toHaveURL(
        /\/app\/shop\/orders\/[^/]+$/,
      );
      await expect(
        page.getByTestId("shop-order-total"),
        "the order is for the cart's total",
      ).toHaveText(usd(totalCents));
    });

    await test.step("the bank charged once and made one order", async () => {
      const [after] = (await moneyAccounts(page.request)).accounts;
      expect(after.balanceCents, "Checking fell by the total once").toBe(
        checking.balanceCents - totalCents,
      );
      const orders = await (
        await page.request.get("/api/bank/shop/orders")
      ).json();
      fact("orders", orders.orders.length);
      expect(orders.orders.length, "one order").toBe(1);
    });
  });

  // Bill pay: the review keeps its key, so Pay bill again is a replay.
  test("a bill payment whose answer is lost says Pay bill again is safe, and pays once", async ({
    page,
  }) => {
    expected(
      "the first Pay bill is done by the bank but its answer is dropped: the page says it couldn't confirm and Pay bill again is safe; Pay bill again shows the receipt; Checking falls by the amount once; one row",
    );
    const memo = memoFor("Lost bill");
    const { checking, amountCents } =
      await test.step("a new customer with a payee, and a tenth of their Checking", async () => {
        await signUpCustomer(page.request, "Lost Bill");
        await addPayee(page.request, "City Power", "ACC-LOST-1");
        const [checking] = (await moneyAccounts(page.request)).accounts;
        const amountCents = Math.floor(checking.balanceCents / 10);
        fact("amount", amountCents);
        return { checking, amountCents };
      });

    await test.step("fill in the bill and review it", async () => {
      await page.goto("/app/bank/bills");
      await page
        .getByTestId("pay-payee")
        .selectOption({ label: "City Power · ACC-LOST-1" });
      await page.getByTestId("pay-amount").fill((amountCents / 100).toFixed(2));
      await page.getByTestId("pay-memo").fill(memo);
      await page.getByTestId("pay-review").click();
    });

    await test.step("press Pay bill: the bank pays, the answer is lost", async () => {
      const lost = await loseNextAnswer(page, /^\/api\/bank\/bill-payments$/);
      await page.getByTestId("pay-confirm").click();
      await expect(
        page.getByTestId("pay-error"),
        "the page says it couldn't confirm, and that Pay bill again is safe",
      ).toHaveText(lostMessage("Pay bill"));
      fact("bank answered the lost one", lost.bankStatus());
      expect(lost.bankStatus(), "the bank paid the bill").toBe(201);
    });

    await test.step("press Pay bill again", async () => {
      await page.getByTestId("pay-confirm").click();
      await expect(
        page.getByTestId("pay-receipt"),
        "the receipt shows",
      ).toBeVisible();
    });

    await test.step("the bank paid once", async () => {
      const [after] = (await moneyAccounts(page.request)).accounts;
      expect(after.balanceCents, "Checking fell by the amount once").toBe(
        checking.balanceCents - amountCents,
      );
      expect(
        (await rowsWithMemo(page.request, checking.id, memo)).length,
        "one history row",
      ).toBe(1);
    });
  });

  // Paying a request: the dialog keeps its key, and the bank answers the
  // same key with the first payment, so Pay now again closes it as Paid.
  test("paying a request whose answer is lost says Pay now again is safe, and moves the money once", async ({
    page,
    browser,
    baseURL,
  }) => {
    expected(
      "the first Pay now is done by the bank but its answer is dropped: the dialog says it couldn't confirm and Pay now again is safe; Pay now again closes it and the row says Paid; the payer falls and the asker rises by the amount once",
    );
    const memo = memoFor("Lost request");
    // The payer is this page; the asker has a browser of their own.
    const askerContext = await browser.newContext({ baseURL });
    try {
      const { payerBefore, askerBefore, amountCents } =
        await test.step("the asker asks the payer for a tenth of the payer's Checking", async () => {
          await signUpCustomer(page.request, "Lost Payer");
          await signUpCustomer(askerContext.request, "Lost Asker");
          const [payerChecking] = (await moneyAccounts(page.request)).accounts;
          const [askerChecking] = (await moneyAccounts(askerContext.request))
            .accounts;
          const amountCents = Math.floor(payerChecking.balanceCents / 10);
          const asked = await askerContext.request.post("/api/bank/requests", {
            data: {
              toAccountId: askerChecking.id,
              fromAccountNumber: payerChecking.number,
              amountCents,
              memo,
            },
          });
          await expectStatus(asked, 201, "the request is made");
          fact("amount", amountCents);
          return {
            payerBefore: payerChecking,
            askerBefore: askerChecking,
            amountCents,
          };
        });

      await test.step("press Pay now: the bank pays, the answer is lost", async () => {
        await page.goto("/app/bank/requests");
        const incoming = page.locator('[data-testid^="incoming-row-"]');
        await incoming.locator('[data-testid^="request-pay-"]').click();
        const lost = await loseNextAnswer(
          page,
          /^\/api\/bank\/requests\/[^/]+\/pay$/,
        );
        await page.getByTestId("request-pay-confirm").click();
        await expect(
          page.getByTestId("request-pay-error"),
          "the dialog says it couldn't confirm, and that Pay now again is safe",
        ).toHaveText(lostMessage("Pay now"));
        fact("bank answered the lost one", lost.bankStatus());
        expect(lost.bankStatus(), "the bank paid the request").toBe(200);
      });

      await test.step("press Pay now again", async () => {
        await page.getByTestId("request-pay-confirm").click();
        await expect(
          page.getByTestId("request-pay-dialog"),
          "the dialog closes",
        ).toHaveCount(0);
        await expect(
          page.locator('[data-testid^="incoming-row-"]'),
          "the row says Paid",
        ).toContainText("Paid");
      });

      await test.step("the bank moved the money once", async () => {
        const payer = (await moneyAccounts(page.request)).accounts.find(
          (account) => account.id === payerBefore.id,
        )!;
        const asker = (await moneyAccounts(askerContext.request)).accounts.find(
          (account) => account.id === askerBefore.id,
        )!;
        expect(payer.balanceCents, "the payer fell by the amount once").toBe(
          payerBefore.balanceCents - amountCents,
        );
        expect(asker.balanceCents, "the asker rose by the amount once").toBe(
          askerBefore.balanceCents + amountCents,
        );
        expect(
          (await rowsWithMemo(page.request, payerBefore.id, memo)).length,
          "one history row for the payer",
        ).toBe(1);
      });
    } finally {
      await askerContext.close();
    }
  });

  // The bank's side of paying a request, through both doors: the same key
  // again gets the first payment back; the same key for another request is
  // refused, as everywhere in the bank.
  test("paying a request twice with one key answers with the first payment, through REST and GraphQL", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "REST: the same Idempotency-Key twice: 200 both times, the same transfer, the money moved once; that key on another request: 422 IDEMPOTENCY_KEY_REUSED; GraphQL: the same idempotencyKey twice: the same transfer",
    );
    // The payer is `request`; the asker has a context of their own.
    const asker = await playwright.request.newContext({ baseURL });
    try {
      const { payerChecking, askerChecking } =
        await test.step("a payer and an asker", async () => {
          await signUpCustomer(request, "Key Payer");
          await signUpCustomer(asker, "Key Asker");
          const [payerChecking] = (await moneyAccounts(request)).accounts;
          const [askerChecking] = (await moneyAccounts(asker)).accounts;
          return { payerChecking, askerChecking };
        });
      // The asker asks for a hundredth of the payer's Checking.
      const amountCents = Math.floor(payerChecking.balanceCents / 100);
      fact("amount", amountCents);
      const ask = async (memo: string) => {
        const asked = await asker.post("/api/bank/requests", {
          data: {
            toAccountId: askerChecking.id,
            fromAccountNumber: payerChecking.number,
            amountCents,
            memo,
          },
        });
        await expectStatus(asked, 201, "the request is made");
        return (await asked.json()).request.id as string;
      };
      const key = `lost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const pay = (id: string) =>
        request.post(`/api/bank/requests/${id}/pay`, {
          data: { fromAccountId: payerChecking.id },
          headers: { "Idempotency-Key": key },
        });

      const firstId =
        await test.step("REST: pay one request twice with one key", async () => {
          const id = await ask(memoFor("Key one"));
          const first = await pay(id);
          await expectStatus(first, 200, "the first pay is done");
          const again = await pay(id);
          await expectStatus(
            again,
            200,
            "the same key again answers with the first payment",
          );
          const one = await first.json();
          const two = await again.json();
          fact("transfer", one.transfer.id);
          expect(two.transfer.id, "the same transfer comes back").toBe(
            one.transfer.id,
          );
          expect(two.request.status, "the request says paid").toBe("paid");
          const [after] = (await moneyAccounts(request)).accounts;
          expect(after.balanceCents, "the money moved once").toBe(
            payerChecking.balanceCents - amountCents,
          );
          return id;
        });
      fact("first request", firstId);

      await test.step("REST: the same key on another request is refused", async () => {
        const otherId = await ask(memoFor("Key two"));
        const reused = await pay(otherId);
        await expectStatus(
          reused,
          422,
          "a key that paid one request can't pay another",
        );
        expect(
          (await reused.json()).code,
          "the code says the key was reused",
        ).toBe("IDEMPOTENCY_KEY_REUSED");
      });

      await test.step("GraphQL: pay a request twice with one idempotencyKey", async () => {
        const id = await ask(memoFor("Key three"));
        const gqlKey = `${key}-gql`;
        const payOnce = () =>
          graphql<{ payRequest: { transfer: { id: string } } }>(
            request,
            `
              mutation Pay($id: ID!, $from: ID!, $key: String) {
                payRequest(
                  id: $id
                  fromAccountId: $from
                  idempotencyKey: $key
                ) {
                  transfer {
                    id
                  }
                }
              }
            `,
            { id, from: payerChecking.id, key: gqlKey },
          );
        const one = await payOnce();
        const two = await payOnce();
        expect(errorCode(one), "the first pay has no error").toBeUndefined();
        expect(
          errorCode(two),
          "the same key again has no error",
        ).toBeUndefined();
        expect(
          two.data!.payRequest.transfer.id,
          "the same transfer comes back",
        ).toBe(one.data!.payRequest.transfer.id);
      });
    } finally {
      await asker.dispose();
    }
  });
});
