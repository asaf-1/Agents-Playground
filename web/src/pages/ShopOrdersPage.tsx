// My orders: every order the customer placed in the gear shop, newest first,
// with where each one is now ("a more real back end", phase 2).

// The router's link and the data cache.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
// The order calls, formats and step words.
import {
  formatMoney,
  formatUtc,
  listMyShopOrders,
  SHOP_STATUS_LABELS,
} from "../bankApi";
// The sign-in card, the badge and heading, who is signed in, and the runKey.
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// The list, each row linking to its order.
export function ShopOrdersPage() {
  // Who is signed in, the runKey, and the orders.
  const { user, account, isLoading } = useBankSession();
  const settings = account?.settings;
  const runKey = useRunKey();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["bank", "shop", "orders"],
    queryFn: listMyShopOrders,
    enabled: Boolean(user),
  });

  // The heading, then the sign-in card, none yet, or the table.
  return (
    <section data-testid="shop-orders-page" className="page">
      <PageHeader
        eyebrow="Gear shop"
        title="My orders"
        description={
          <p className="page-sub">
            Each order moves placed, packed, shipped, delivered. You get a
            notification at every step.
          </p>
        }
      />

      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt next="/shop/orders" title="Log in to see your orders" />
      )}

      {/* Loading, an error, or none yet. */}
      {user && isPending && <p className="state">Loading your orders…</p>}
      {isError && (
        <p role="alert" className="callout">
          {(error as Error).message}
        </p>
      )}
      {data && data.orders.length === 0 && (
        <p className="empty" data-testid="shop-orders-empty">
          No orders yet. <Link to="/products">Visit the gear shop.</Link>
        </p>
      )}

      {/* The orders, newest first. */}
      {data && data.orders.length > 0 && (
        <div className="card table-card">
          <div className="table-wrap">
            <table data-testid="shop-orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed (UTC)</th>
                  <th className="cell-num">Items</th>
                  <th className="cell-num">Charged</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.id} data-testid={`shop-order-row-${order.id}`}>
                    <td className="cell-mono">
                      <Link
                        to={bankPath(`/shop/orders/${order.id}`, runKey)}
                        data-testid={`shop-order-link-${order.id}`}
                      >
                        {order.number}
                      </Link>
                    </td>
                    <td className="cell-mono">{formatUtc(order.createdAt)}</td>
                    <td className="cell-num">{order.itemCount}</td>
                    <td className="cell-num cell-mono">
                      {formatMoney(order.totalCents, settings)}
                    </td>
                    <td>
                      <Badge value={SHOP_STATUS_LABELS[order.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
