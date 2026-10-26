// Limit orders and price alerts on the exchange (phase A4).
//
// Prices are in micro-dollars like the rest of the market. An order or an
// alert is checked against the customer's own price whenever they make a
// request, so a page that polls is also the thing that lets fills happen.
import { request } from "./api";
import { withRunKey } from "./bankApi";
import { MICROS_PER_DOLLAR } from "./marketApi";

export type OrderSide = "buy" | "sell";
export type OrderStatus = "open" | "filled" | "cancelled" | "failed";
export type AlertDirection = "above" | "below";
export type AlertStatus = "armed" | "fired" | "cancelled";

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

function withSymbol(path: string, runKey: string, symbol?: string): string {
  const base = withRunKey(path, runKey);
  if (!symbol) return base;
  return `${base}${base.includes("?") ? "&" : "?"}symbol=${encodeURIComponent(symbol)}`;
}

export function listOrders(
  runKey: string,
  symbol?: string,
): Promise<{ orders: LimitOrder[] }> {
  return request(withSymbol("/api/bank/orders", runKey, symbol));
}

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

export function cancelOrder(
  id: string,
  runKey: string,
): Promise<{ order: LimitOrder }> {
  return request(
    withRunKey(`/api/bank/orders/${encodeURIComponent(id)}`, runKey),
    { method: "DELETE" },
  );
}

export function listAlerts(
  runKey: string,
  symbol?: string,
): Promise<{ alerts: PriceAlert[] }> {
  return request(withSymbol("/api/bank/alerts", runKey, symbol));
}

export function createAlert(
  input: { symbol: string; direction: AlertDirection; limitMicros: number },
  runKey: string,
): Promise<{ alert: PriceAlert }> {
  return request(withRunKey("/api/bank/alerts", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

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
export function parsePriceMicros(input: string): number | null {
  const value = input.trim().replace(/,/g, "");
  if (!/^\d*(\.\d{1,6})?$/.test(value) || value === "" || value === ".") {
    return null;
  }
  const [whole, fraction = ""] = value.split(".");
  const micros =
    Number(whole || "0") * MICROS_PER_DOLLAR + Number(fraction.padEnd(6, "0"));
  return micros > 0 && Number.isSafeInteger(micros) ? micros : null;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  open: "Open",
  filled: "Filled",
  cancelled: "Cancelled",
  failed: "Not filled",
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  armed: "Watching",
  fired: "Fired",
  cancelled: "Cancelled",
};
