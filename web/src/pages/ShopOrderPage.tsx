// One of the customer's shop orders: what it holds, what it cost, and every
// step it has taken ("a more real back end", phase 2).

// The router's link and address, and the data cache.
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
// The order call, the order view, the sign-in card and heading, who is signed
// in, and the runKey.
import { getMyShopOrder } from "../bankApi";
import { ShopOrderView } from "../components/ShopOrderView";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// The breadcrumb back to My orders, then the order.
export function ShopOrderPage() {
  // The order's id, who is signed in, the runKey, and the order.
  const { id = "" } = useParams();
  const { user, account, isLoading } = useBankSession();
  const runKey = useRunKey();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["bank", "shop", "order", id],
    queryFn: () => getMyShopOrder(id),
    enabled: Boolean(user && id),
  });

  // The heading, then the sign-in card, loading, an error, or the order.
  return (
    <section data-testid="shop-order-page" className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link
          to={bankPath("/shop/orders", runKey)}
          data-testid="shop-order-back"
        >
          My orders
        </Link>{" "}
        / <span className="mono">{data?.order.number ?? "Order"}</span>
      </nav>
      <PageHeader eyebrow="Gear shop" title="Your order" />

      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt
          next={`/shop/orders/${id}`}
          title="Log in to see this order"
        />
      )}

      {/* Loading, an error, or the order. */}
      {user && isPending && <p className="state">Loading the order…</p>}
      {isError && (
        <p role="alert" className="callout" data-testid="shop-order-error">
          {(error as Error).message}
        </p>
      )}
      {data && (
        <ShopOrderView order={data.order} settings={account?.settings} />
      )}
    </section>
  );
}
