// Limit orders and price alerts on the exchange (phase A4).
//
// Prices are in micro-dollars like the rest of the market. An order or an
// alert is checked against the customer's own price whenever they make a
// request, so a page that polls is also the thing that lets fills happen.

// The shared call helper, the runKey helper, and micro-dollars per dollar.
import { request } from "./api";
import { plainNumber, withRunKey } from "./bankApi";
import { MICROS_PER_DOLLAR } from "./marketApi";

// The words an order or an alert can carry.
export type OrderSide = "buy" | "sell";
export type OrderStatus = "open" | "filled" | "cancelled" | "failed";
export type AlertDirection = "above" | "below";
export type AlertStatus = "armed" | "fired" | "cancelled";

// One limit order: what to buy or sell, at what price, and what became of it.
export interface LimitOrder {
  id: string;
  symbol: string;
  coinName: string;
  accountId: string;
  accountNumber: string;
  side: OrderSide;
  spendCents: number | null;
  quantityAtoms: number | null;
  quantity: string | null;
  limitMicros: number;
  status: OrderStatus;
  fillPriceMicros: number | null;
  tradeId: string | null;
  failReason: string | null;
  failReasonText: string | null;
  createdAt: string;
  filledAt: string | null;
}

// One price alert: the coin, above or below what price, and whether it fired.
export interface PriceAlert {
  id: string;
  symbol: string;
  coinName: string;
  direction: AlertDirection;
  limitMicros: number;
  status: AlertStatus;
  firedMicros: number | null;
  firedAt: string | null;
  createdAt: string;
}

// A path with the runKey, and the coin when one is given.
function withSymbol(path: string, runKey: string, symbol?: string): string {
  const base = withRunKey(path, runKey);
  if (!symbol) return base;
  return `${base}${base.includes("?") ? "&" : "?"}symbol=${encodeURIComponent(symbol)}`;
}

// The visitor's orders, for one coin or for all.
export function listOrders(
  runKey: string,
  symbol?: string,
): Promise<{ orders: LimitOrder[] }> {
  return request(withSymbol("/api/bank/orders", runKey, symbol));
}

// Place a limit order: spend an amount (buy) or sell a quantity, at a limit
// price.
export function createOrder(
  input: {
    symbol: string;
    side: OrderSide;
    accountId: string;
    spendCents?: number;
    quantityAtoms?: number;
    limitMicros: number;
  },
  runKey: string,
): Promise<{ order: LimitOrder }> {
  return request(withRunKey("/api/bank/orders", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Cancel an open order.
export function cancelOrder(
  id: string,
  runKey: string,
): Promise<{ order: LimitOrder }> {
  return request(
    withRunKey(`/api/bank/orders/${encodeURIComponent(id)}`, runKey),
    { method: "DELETE" },
  );
}

// The visitor's alerts, for one coin or for all.
export function listAlerts(
  runKey: string,
  symbol?: string,
): Promise<{ alerts: PriceAlert[] }> {
  return request(withSymbol("/api/bank/alerts", runKey, symbol));
}

// Set an alert for when a coin goes above or below a price.
export function createAlert(
  input: { symbol: string; direction: AlertDirection; limitMicros: number },
  runKey: string,
): Promise<{ alert: PriceAlert }> {
  return request(withRunKey("/api/bank/alerts", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Cancel an alert.
export function cancelAlert(
  id: string,
  runKey: string,
): Promise<{ alert: PriceAlert }> {
  return request(
    withRunKey(`/api/bank/alerts/${encodeURIComponent(id)}`, runKey),
    { method: "DELETE" },
  );
}

// "61234.5" -> 61234500000 micros. Read as text, never through a float, so a
// typed price means exactly what it says. null when it isn't a price.
export function parsePriceMicros(
  input: string,
  locale = "en-US",
): number | null {
  // Written the customer's way first ("61.234,50" in de-DE), drop the commas
  // that group thousands in en-US, then refuse anything that isn't a price
  // with up to 6 decimals.
  const value = plainNumber(input, locale).replace(/,/g, "");
  if (!/^\d*(\.\d{1,6})?$/.test(value) || value === "" || value === ".") {
    return null;
  }
  // Whole dollars and the fraction, turned into micro-dollars as whole numbers.
  const [whole, fraction = ""] = value.split(".");
  const micros =
    Number(whole || "0") * MICROS_PER_DOLLAR + Number(fraction.padEnd(6, "0"));
  // Only a positive price that fits a safe whole number.
  return micros > 0 && Number.isSafeInteger(micros) ? micros : null;
}

// The words the order table shows for each status.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  open: "Open",
  filled: "Filled",
  cancelled: "Cancelled",
  failed: "Not filled",
};

// The words the alert table shows for each status.
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  armed: "Watching",
  fired: "Fired",
  cancelled: "Cancelled",
};
