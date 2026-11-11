// One product's page: a breadcrumb back, its icon and details, then the buy
// panel (your price, how many, Add to cart) and, for an Admin, the restock
// form ("a more real back end", phases 2 and 3).

// React state, the router's link and the address's id, and the data cache.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// The product call, its icon and the status badge.
import { getProduct } from "../api";
import { ProductIcon } from "../components/ProductIcon";
import { Badge } from "../components/ui";
// The shop calls and formats, the cart's cache key, who is signed in, and the
// runKey a test may carry.
import {
  addToCart,
  fieldErrors,
  formatMoney,
  formatShare,
  getShopProduct,
  restockProduct,
} from "../bankApi";
import { CART_KEY } from "../components/CartButton";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// The cache key for one product's signed-in view.
const shopProductKey = (id: string) => ["bank", "shop", "product", id];

// What a signed-in customer can do with the product: see their price, pick how
// many, and put it in the cart. A Backordered product, or one with none left,
// shows why it can't be bought instead of a button that would fail.
function BuyPanel({ id }: { id: string }) {
  // Who is signed in, the cache, the runKey, how many, and the last result.
  const { user, account } = useBankSession();
  const settings = account?.settings;
  const queryClient = useQueryClient();
  const runKey = useRunKey();
  const [quantity, setQuantity] = useState("1");
  const [added, setAdded] = useState<number | null>(null);

  // The product as this customer sees it: their price and their cart.
  const detail = useQuery({
    queryKey: shopProductKey(id),
    queryFn: () => getShopProduct(id),
    enabled: Boolean(user),
  });

  // Add to the cart; on success refresh the cart, this product and its stock.
  const mutation = useMutation({
    mutationFn: (count: number) => addToCart(id, count, runKey),
    onSuccess: async (_cart, count) => {
      setAdded(count);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CART_KEY }),
        queryClient.invalidateQueries({ queryKey: shopProductKey(id) }),
      ]);
    },
  });

  // Signed out: a link to log in and come back.
  if (!user) {
    return (
      <div className="card card-pad" data-testid="buy-signed-out">
        <p className="account-title">Want one?</p>
        <p className="muted">
          <Link to={`/login?next=${encodeURIComponent(`/products/${id}`)}`}>
            Log in
          </Link>{" "}
          to buy it with money from one of your bank accounts.
        </p>
      </div>
    );
  }

  // Loading this customer's view.
  if (!detail.data) {
    return <p className="state">Loading your price…</p>;
  }
  const { product, loyalty, yourPriceCents, inCart } = detail.data;
  const count = Number(quantity);
  const countOk = Number.isInteger(count) && count >= 1 && count <= 99;

  // The price, the discount, then the reason it can't be bought or the form.
  return (
    <div className="card card-pad" data-testid="buy-panel">
      <p className="account-title">Your price</p>
      <p className="money-balance" data-testid="buy-your-price">
        {formatMoney(yourPriceCents ?? product.listPriceCents, settings)}
      </p>
      {/* The loyalty tier, and what unlocks the next one. */}
      {loyalty && (
        <p className="muted" data-testid="buy-loyalty">
          {loyalty.basisPoints > 0
            ? `Includes your ${formatShare(loyalty.basisPoints)} loyalty discount.`
            : "No loyalty discount yet."}
          {loyalty.next &&
            ` Spend ${formatMoney(loyalty.next.atCents - loyalty.spentCents, settings)} more in the shop for ${formatShare(loyalty.next.basisPoints)} off.`}
        </p>
      )}

      {/* Why it can't be bought: a demo account, backordered, or none left. */}
      {user.isDemo ? (
        <p className="callout callout-info" data-testid="buy-demo">
          Demo accounts are read-only. Sign up for your own account to buy.
        </p>
      ) : product.status === "Backordered" ? (
        <p className="callout callout-info" data-testid="buy-backordered">
          Backordered: it can't be bought until it is back in stock.
        </p>
      ) : product.stock === 0 ? (
        <p className="callout callout-info" data-testid="buy-sold-out">
          Sold out. Check back after the next delivery.
        </p>
      ) : (
        <form
          className="btn-row"
          data-testid="buy-form"
          onSubmit={(event) => {
            event.preventDefault();
            setAdded(null);
            if (countOk) mutation.mutate(count);
          }}
        >
          {/* How many, then the button. */}
          <div className="field">
            <label htmlFor="buy-quantity">Quantity</label>
            <input
              id="buy-quantity"
              className="input input-sm"
              data-testid="buy-quantity"
              type="number"
              min={1}
              max={Math.min(99, product.stock)}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            data-testid="buy-add"
            disabled={!countOk || mutation.isPending}
          >
            {mutation.isPending ? "Adding…" : "Add to cart"}
          </button>
        </form>
      )}

      {/* What happened: added, or why not. */}
      {added !== null && (
        <p className="callout callout-success" data-testid="buy-added">
          Added {added} to your cart.{" "}
          <Link to={bankPath("/shop/cart", runKey)} data-testid="buy-go-cart">
            Go to cart
          </Link>
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="callout" data-testid="buy-error">
          {fieldErrors(mutation.error).quantity ??
            (mutation.error as Error).message}
        </p>
      )}
      {(inCart ?? 0) > 0 && (
        <p className="muted" data-testid="buy-in-cart">
          {inCart} already in your cart.
        </p>
      )}
    </div>
  );
}

// An Admin sets how many are in stock (a delivery came in, or a count was
// wrong).
function RestockPanel({ id, stock }: { id: string; stock: number }) {
  // The cache, the number typed, and the call.
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(stock));
  const mutation = useMutation({
    mutationFn: () => restockProduct(id, Number(value)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product", id] }),
        queryClient.invalidateQueries({ queryKey: shopProductKey(id) }),
      ]);
    },
  });

  // The form, then what happened.
  return (
    <div className="card card-pad" data-testid="restock-panel">
      <p className="account-title">Back office: stock</p>
      <form
        className="btn-row"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="field">
          <label htmlFor="restock-stock">In stock</label>
          <input
            id="restock-stock"
            className="input input-sm"
            data-testid="restock-stock"
            type="number"
            min={0}
            max={9999}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn"
          data-testid="restock-save"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Set stock"}
        </button>
      </form>
      {mutation.isSuccess && (
        <p className="callout callout-success" data-testid="restock-saved">
          Stock set to {mutation.data.product.stock}.
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="callout" data-testid="restock-error">
          {fieldErrors(mutation.error).stock ??
            (mutation.error as Error).message}
        </p>
      )}
    </div>
  );
}

export function ProductDetailPage() {
  // The product's id from the address, and who is signed in.
  const { id = "" } = useParams();
  const { user } = useBankSession();

  // Ask for the product once there is an id.
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => getProduct(id),
    enabled: Boolean(id),
  });

  // The breadcrumb, then loading, an error, or the product.
  return (
    <section data-testid="product-detail-page" className="page">
      {/* Products / this SKU. */}
      <nav
        data-testid="product-breadcrumb"
        className="breadcrumb"
        aria-label="Breadcrumb"
      >
        <Link data-testid="product-back" to="/products">
          Products
        </Link>{" "}
        / <span className="mono">{id}</span>
      </nav>

      {/* Loading. */}
      {isPending && (
        <p data-testid="product-loading" className="state">
          Loading product…
        </p>
      )}

      {/* The error. */}
      {isError && (
        <p data-testid="product-error" role="alert" className="callout">
          {(error as Error).message}
        </p>
      )}

      {/* The product: its icon, then SKU, category, price, stock and
          status. */}
      {data && (
        <article data-testid="product-detail" className="detail">
          <div
            className={`product-art detail-art art-${data.product.category.toLowerCase()}`}
            aria-hidden="true"
          >
            <ProductIcon
              id={data.product.id}
              category={data.product.category}
            />
          </div>
          <div className="detail-info">
            <p className="eyebrow">Gear shop · {data.product.category}</p>
            <h1 data-testid="app-heading">{data.product.name}</h1>
            <p className="page-sub">
              A simulated product for testing practice. Prices are in fake
              dollars.
            </p>
            <dl className="spec-grid">
              <div className="spec">
                <dt>SKU</dt>
                <dd data-testid="product-sku" className="mono">
                  {data.product.id}
                </dd>
              </div>
              <div className="spec">
                <dt>Category</dt>
                <dd data-testid="product-category">{data.product.category}</dd>
              </div>
              <div className="spec spec-price">
                <dt>Price</dt>
                <dd data-testid="product-detail-price">
                  ${data.product.price}
                </dd>
              </div>
              <div className="spec">
                <dt>Stock</dt>
                <dd data-testid="product-stock">
                  {data.product.stock} in stock
                </dd>
              </div>
              <div className="spec">
                <dt>Status</dt>
                <dd data-testid="product-detail-status">
                  <Badge value={data.product.status} />
                </dd>
              </div>
            </dl>

            {/* Buying it, and for an Admin, its stock. */}
            <BuyPanel id={data.product.id} />
            {user?.role === "admin" && (
              <RestockPanel id={data.product.id} stock={data.product.stock} />
            )}
          </div>
        </article>
      )}
    </section>
  );
}
