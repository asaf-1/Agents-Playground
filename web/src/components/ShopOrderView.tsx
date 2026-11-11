// One shop order in full: its summary, what it holds, and every step it took.
// The customer's order page and the staff order page both show it
// ("a more real back end", phases 2 and 3).

// The money and time formats, the step words, and the order's types.
import {
  formatMoney,
  formatShare,
  formatUtc,
  SHOP_STATUS_LABELS,
  type BankSettings,
  type ShopOrder,
} from "../bankApi";
// The status badge.
import { Badge } from "./ui";

// The order: number, status, totals, the lines, then the steps oldest first.
export function ShopOrderView({
  order,
  settings,
  showCustomer = false,
}: {
  order: ShopOrder;
  settings: BankSettings | undefined;
  showCustomer?: boolean;
}) {
  return (
    <div className="money-columns" data-testid="shop-order">
      {/* The summary: status, who paid, from where, and the money. */}
      <div className="card card-pad">
        <div className="section-head">
          <h2 className="section-title" data-testid="shop-order-number">
            {order.number}
          </h2>
          <span data-testid="shop-order-status">
            <Badge value={SHOP_STATUS_LABELS[order.status]} />
          </span>
        </div>
        <dl className="detail-list">
          {/* The customer, only for staff. */}
          {showCustomer && (
            <div>
              <dt>Customer</dt>
              <dd data-testid="shop-order-customer">
                {order.customer.fullName}
                <span className="cell-sub">{order.customer.email}</span>
              </dd>
            </div>
          )}
          <div>
            <dt>Paid from</dt>
            <dd className="mono" data-testid="shop-order-account">
              {order.accountNumber}
            </dd>
          </div>
          <div>
            <dt>Placed (UTC)</dt>
            <dd className="mono">{formatUtc(order.createdAt)}</dd>
          </div>
          <div>
            <dt>Subtotal</dt>
            <dd className="mono" data-testid="shop-order-subtotal">
              {formatMoney(order.subtotalCents, settings)}
            </dd>
          </div>
          <div>
            <dt>Loyalty discount</dt>
            <dd className="mono" data-testid="shop-order-discount">
              {order.discountCents > 0
                ? `−${formatMoney(order.discountCents, settings)} (${formatShare(order.discountBasisPoints)})`
                : "None"}
            </dd>
          </div>
          <div>
            <dt>Charged</dt>
            <dd className="mono cell-strong" data-testid="shop-order-total">
              {formatMoney(order.totalCents, settings)}
            </dd>
          </div>
          {/* What went back, once something has. */}
          {order.refundedCents > 0 && (
            <div>
              <dt>Refunded</dt>
              <dd className="mono" data-testid="shop-order-refunded">
                {formatMoney(order.refundedCents, settings)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* What it holds, and the steps it took. */}
      <div className="card card-pad">
        <h2 className="section-title">Items</h2>
        <div className="table-wrap">
          <table data-testid="shop-order-lines">
            <thead>
              <tr>
                <th>Product</th>
                <th className="cell-num">Qty</th>
                <th className="cell-num">Each</th>
                <th className="cell-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.lines ?? []).map((line) => (
                <tr
                  key={line.productId}
                  data-testid={`shop-order-line-${line.productId}`}
                >
                  <td>
                    {line.name}
                    <span className="cell-sub mono">{line.productId}</span>
                  </td>
                  <td className="cell-num">{line.quantity}</td>
                  <td className="cell-num cell-mono">
                    {formatMoney(line.unitPriceCents, settings)}
                  </td>
                  <td className="cell-num cell-mono">
                    {formatMoney(line.lineTotalCents, settings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Every step, oldest first, with who took it. */}
        <h2 className="section-title">History</h2>
        <ol className="check-list" data-testid="shop-order-events">
          {(order.events ?? []).map((event, index) => (
            <li key={`${event.status}-${index}`} data-testid="shop-order-event">
              <Badge value={SHOP_STATUS_LABELS[event.status]} />{" "}
              <span className="mono">{formatUtc(event.createdAt)}</span>
              {event.actorName && (
                <span className="muted">
                  {" "}
                  · by {event.actorName}
                  {event.actorRole && event.actorRole !== "customer"
                    ? ` (${event.actorRole})`
                    : ""}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
