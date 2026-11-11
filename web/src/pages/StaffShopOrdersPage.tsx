// Shop orders, for staff: every customer's order, by status. Support can look;
// an Admin opens an order to move it along or refund it ("a more real back
// end", phase 3).

// React state, the router's link and the data cache.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
// The staff order call, formats and step words.
import {
  formatMoney,
  formatUtc,
  listStaffShopOrders,
  SHOP_STATUS_LABELS,
  type ShopOrderStatus,
} from "../bankApi";
// The sign-in card, the badge and heading, who is signed in, and the runKey.
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// The filter buttons; "To pack" (placed) is picked at the start, because that
// is the work waiting.
const FILTERS: { value: ShopOrderStatus | "all"; label: string }[] = [
  { value: "placed", label: "To pack" },
  { value: "packed", label: "To ship" },
  { value: "shipped", label: "On the way" },
  { value: "delivered", label: "Delivered" },
  { value: "refunded", label: "Refunded" },
  { value: "all", label: "All" },
];

// The filter, then the orders, each linking to its staff page.
export function StaffShopOrdersPage() {
  // Who is signed in, whether they are staff, the runKey, and the filter.
  const { user, account, isLoading } = useBankSession();
  const settings = account?.settings;
  const staff = user?.role === "support" || user?.role === "admin";
  const runKey = useRunKey();
  const [filter, setFilter] = useState<ShopOrderStatus | "all">("placed");

  // The orders for the filter.
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["bank", "shop", "staff-orders", filter],
    queryFn: () => listStaffShopOrders(filter === "all" ? undefined : filter),
    enabled: staff,
  });

  // The heading, then the sign-in card, a no-access note, or the list.
  return (
    <section data-testid="staff-shop-orders-page" className="page">
      <PageHeader
        eyebrow="Back office"
        title="Shop orders"
        description={
          <p className="page-sub">
            Every order from the gear shop. Support can look; an Admin moves an
            order one step at a time or refunds it, and never their own.
          </p>
        }
      />

      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt
          next="/admin/shop-orders"
          title="Log in as staff to see this"
        />
      )}

      {/* A customer: no access. */}
      {user && !staff && (
        <div
          className="card card-pad"
          data-testid="staff-shop-orders-forbidden"
        >
          <p className="account-title">You don't have access to this page.</p>
          <p className="muted">
            Shop orders is for Support and Admin. Your own orders are on{" "}
            <Link to="/shop/orders">My orders</Link>.
          </p>
        </div>
      )}

      {/* Staff: a read-only note for Support, the filter, the table. */}
      {staff && user && (
        <>
          {user.role !== "admin" && (
            <p
              className="callout callout-info"
              data-testid="staff-shop-orders-readonly"
            >
              You're signed in as Support, so this list is read-only.
            </p>
          )}
          <div
            className="segmented"
            role="group"
            aria-label="Show orders"
            data-testid="staff-shop-filter"
          >
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`staff-shop-filter-${option.value}`}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Loading, an error, or none. */}
          {isPending && <p className="state">Loading orders…</p>}
          {isError && (
            <p role="alert" className="callout">
              {(error as Error).message}
            </p>
          )}
          {data && data.orders.length === 0 && (
            <p className="empty" data-testid="staff-shop-orders-empty">
              No orders here.
            </p>
          )}

          {/* The orders. */}
          {data && data.orders.length > 0 && (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="staff-shop-orders-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Placed (UTC)</th>
                      <th>Customer</th>
                      <th className="cell-num">Items</th>
                      <th className="cell-num">Charged</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order) => (
                      <tr
                        key={order.id}
                        data-testid={`staff-shop-order-row-${order.id}`}
                      >
                        <td className="cell-mono">
                          <Link
                            to={bankPath(
                              `/admin/shop-orders/${order.id}`,
                              runKey,
                            )}
                            data-testid={`staff-shop-order-link-${order.id}`}
                          >
                            {order.number}
                          </Link>
                        </td>
                        <td className="cell-mono">
                          {formatUtc(order.createdAt)}
                        </td>
                        <td>
                          {order.customer.fullName}
                          <span className="cell-sub">
                            {order.customer.email}
                          </span>
                        </td>
                        <td className="cell-num">{order.itemCount}</td>
                        <td className="cell-num cell-mono">
                          {formatMoney(order.totalCents, settings)}
                        </td>
                        <td data-testid={`staff-shop-order-status-${order.id}`}>
                          <Badge value={SHOP_STATUS_LABELS[order.status]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
