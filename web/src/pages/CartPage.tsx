// The Cart page: what is in the cart, the loyalty discount, the account to pay
// from, and checkout ("a more real back end", phase 2).

// React state, the router, the data cache and the icons.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2 } from "lucide-react";
// The shop calls, formats and error helpers.
import {
  checkout,
  fieldErrors,
  formatMoney,
  formatShare,
  newIdempotencyKey,
  setCartQuantity,
} from "../bankApi";
import { ApiError } from "../api";
// The cart's cache and hook, the sign-in card, the page heading, who is signed
// in, the runKey, and the money accounts.
import { CART_KEY, useCart } from "../components/CartButton";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, useMoneyAccounts, useRefreshMoney } from "../useMoney";

// The cart, priced; the account picker; and Pay.
export function CartPage() {
  // Who is signed in, the runKey, the cache, the router, the cart and the
  // accounts.
  const { user, account, isLoading } = useBankSession();
  const settings = account?.settings;
  const runKey = useRunKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refreshMoney = useRefreshMoney();
  const cart = useCart(Boolean(user));
  const accounts = useMoneyAccounts(runKey, Boolean(user));
  const [accountId, setAccountId] = useState("");
  // One Idempotency-Key per attempt at paying: a second click sends the same
  // key, so it can never pay twice. A new key is made after a refusal.
  const keyRef = useRef(newIdempotencyKey());

  // Pick the first account once they arrive.
  useEffect(() => {
    if (!accountId && accounts.data?.accounts.length) {
      setAccountId(accounts.data.accounts[0].id);
    }
  }, [accountId, accounts.data]);

  // Change how many of one line; 0 takes it out.
  const change = useMutation({
    mutationFn: ({
      productId,
      quantity,
    }: {
      productId: string;
      quantity: number;
    }) => setCartQuantity(productId, quantity, runKey),
    onSuccess: (updated) => queryClient.setQueryData(CART_KEY, updated),
  });

  // Pay: on success, refresh the money and the cart and open the order; on a
  // refusal, refresh the cart (a price or the stock may have moved) and make
  // a new key for the next try.
  const pay = useMutation({
    mutationFn: () =>
      checkout(
        { accountId, expectedTotalCents: cart.data?.totalCents ?? 0 },
        keyRef.current,
        runKey,
      ),
    onSuccess: async (result) => {
      await Promise.all([
        refreshMoney(),
        queryClient.invalidateQueries({ queryKey: CART_KEY }),
        queryClient.invalidateQueries({ queryKey: ["bank", "shop"] }),
      ]);
      navigate(bankPath(`/shop/orders/${result.order.id}`, runKey));
    },
    onError: async () => {
      keyRef.current = newIdempotencyKey();
      await queryClient.invalidateQueries({ queryKey: CART_KEY });
    },
  });

  // The error from paying, in words: the new total when it changed.
  const payError = (() => {
    if (!pay.isError) return null;
    const error = pay.error;
    if (
      error instanceof ApiError &&
      error.body &&
      typeof error.body === "object"
    ) {
      const body = error.body as { code?: string; totalCents?: number };
      if (
        body.code === "PRICE_CHANGED" &&
        typeof body.totalCents === "number"
      ) {
        return `The total changed to ${formatMoney(body.totalCents, settings)}. Check it and pay again.`;
      }
    }
    return fieldErrors(error).accountId ?? (error as Error).message;
  })();

  const data = cart.data;
  const blocked = data?.lines.some((line) => !line.buyable) ?? false;

  // The heading, then the sign-in card, the empty cart, or the cart.
  return (
    <section data-testid="cart-page" className="page">
      <PageHeader
        eyebrow="Gear shop"
        title="Cart"
        description={
          <p className="page-sub">
            Pay from one of your bank accounts. The more you spend in the shop,
            the bigger your loyalty discount.
          </p>
        }
        actions={
          <Link className="btn" to={bankPath("/shop/orders", runKey)}>
            My orders
          </Link>
        }
      />

      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt next="/shop/cart" title="Log in to see your cart" />
      )}

      {/* Loading, an error, or empty. */}
      {user && cart.isPending && <p className="state">Loading your cart…</p>}
      {cart.isError && (
        <p role="alert" className="callout">
          {(cart.error as Error).message}
        </p>
      )}
      {data && data.lines.length === 0 && (
        <div className="card card-pad" data-testid="cart-empty">
          <p className="account-title">Your cart is empty.</p>
          <p className="muted">
            <Link to="/products">Browse the gear shop</Link> and add something.
          </p>
        </div>
      )}

      {/* The lines, the money, and Pay. */}
      {data && data.lines.length > 0 && (
        <div className="money-columns">
          <div className="card table-card">
            <div className="table-wrap">
              <table data-testid="cart-lines">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th className="cell-num">Each</th>
                    <th className="cell-num">Total</th>
                    <th>
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => (
                    <tr
                      key={line.productId}
                      data-testid={`cart-line-${line.productId}`}
                    >
                      <td>
                        <Link to={`/products/${line.productId}`}>
                          {line.name}
                        </Link>
                        <span className="cell-sub">
                          {line.buyable
                            ? `${line.stock} in stock`
                            : line.status === "Backordered"
                              ? "Backordered: remove it to pay"
                              : `Only ${line.stock} in stock: lower the quantity`}
                        </span>
                      </td>
                      <td className="cell-actions">
                        {/* One less, how many, one more. */}
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`One less ${line.name}`}
                          data-testid={`cart-less-${line.productId}`}
                          disabled={change.isPending}
                          onClick={() =>
                            change.mutate({
                              productId: line.productId,
                              quantity: line.quantity - 1,
                            })
                          }
                        >
                          <Minus aria-hidden="true" />
                        </button>
                        <span
                          className="mono"
                          data-testid={`cart-qty-${line.productId}`}
                        >
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`One more ${line.name}`}
                          data-testid={`cart-more-${line.productId}`}
                          disabled={change.isPending || line.quantity >= 99}
                          onClick={() =>
                            change.mutate({
                              productId: line.productId,
                              quantity: line.quantity + 1,
                            })
                          }
                        >
                          <Plus aria-hidden="true" />
                        </button>
                      </td>
                      <td className="cell-num cell-mono">
                        {formatMoney(line.unitPriceCents, settings)}
                      </td>
                      <td className="cell-num cell-mono">
                        {formatMoney(line.lineTotalCents, settings)}
                      </td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${line.name}`}
                          data-testid={`cart-remove-${line.productId}`}
                          disabled={change.isPending}
                          onClick={() =>
                            change.mutate({
                              productId: line.productId,
                              quantity: 0,
                            })
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {change.isError && (
              <p
                role="alert"
                className="callout"
                data-testid="cart-change-error"
              >
                {(change.error as Error).message}
              </p>
            )}
          </div>

          {/* The money and Pay. */}
          <div className="card card-pad" data-testid="cart-summary">
            <dl className="detail-list">
              <div>
                <dt>Items</dt>
                <dd data-testid="cart-items">{data.itemCount}</dd>
              </div>
              <div>
                <dt>Subtotal</dt>
                <dd className="mono" data-testid="cart-subtotal">
                  {formatMoney(data.subtotalCents, settings)}
                </dd>
              </div>
              <div>
                <dt>Loyalty discount</dt>
                <dd className="mono" data-testid="cart-discount">
                  {data.discountCents > 0
                    ? `−${formatMoney(data.discountCents, settings)} (${formatShare(data.discountBasisPoints)})`
                    : "None yet"}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd className="mono cell-strong" data-testid="cart-total">
                  {formatMoney(data.totalCents, settings)}
                </dd>
              </div>
            </dl>
            {data.loyalty.next && (
              <p className="muted" data-testid="cart-next-tier">
                Spend{" "}
                {formatMoney(
                  data.loyalty.next.atCents - data.loyalty.spentCents,
                  settings,
                )}{" "}
                more in the shop for{" "}
                {formatShare(data.loyalty.next.basisPoints)} off.
              </p>
            )}

            {/* The account to pay from, then Pay. */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                pay.mutate();
              }}
            >
              <div className="field">
                <label htmlFor="cart-account">Pay from</label>
                <select
                  id="cart-account"
                  data-testid="cart-account"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  {(accounts.data?.accounts ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatMoney(item.balanceCents, settings)}
                    </option>
                  ))}
                </select>
              </div>
              {user?.isDemo && (
                <p className="callout callout-info" data-testid="cart-demo">
                  Demo accounts are read-only. Sign up for your own account to
                  buy.
                </p>
              )}
              {blocked && (
                <p className="callout callout-info" data-testid="cart-blocked">
                  Something in your cart can't be bought as it is. Fix the lines
                  marked above to pay.
                </p>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-block"
                data-testid="cart-pay"
                disabled={
                  pay.isPending ||
                  !accountId ||
                  blocked ||
                  Boolean(user?.isDemo)
                }
              >
                {pay.isPending
                  ? "Paying…"
                  : `Pay ${formatMoney(data.totalCents, settings)}`}
              </button>
              {payError && (
                <p
                  role="alert"
                  className="callout"
                  data-testid="cart-pay-error"
                >
                  {payError}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
