// Typed client for the crypto exchange's market endpoints.
//
// A price arrives in micro-dollars (1,000,000 micros = $1.00) because cents
// are too coarse for a market: a penny on a $0.39 coin is a 2.5% jump. Nothing
// here is a stored list — every price belongs to the person asking and is
// computed fresh, so two people never see the same number.

// The shared call helper, and the one that adds a runKey to a path.
import { request } from "./api";
import { withRunKey } from "./bankApi";

// How many micro-dollars make one dollar.
export const MICROS_PER_DOLLAR = 1_000_000;

// One coin's price now, and its move over 24 hours.
export interface CoinQuote {
  symbol: string;
  name: string;
  priceMicros: number;
  changeMicros: number;
  /** The 24-hour move in basis points: 250 is +2.50%. */
  changeBasisPoints: number;
  at: string;
}

// A coin as the market list shows it, with its sparkline.
export interface MarketCoin extends CoinQuote {
  /** 24 prices across the last day, for the row's sparkline. */
  spark: number[];
}

// The market answer: every coin, how many, and when.
export interface MarketResponse {
  coins: MarketCoin[];
  total: number;
  at: string;
}

// One point on a price chart.
export interface PricePoint {
  at: string;
  priceMicros: number;
}

// The chart's time ranges, and their names on the buttons.
export const RANGES = ["1h", "24h", "7d", "30d"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_LABELS: Record<Range, string> = {
  "1h": "1 hour",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

// A coin's page: its price now, and its move, high, low and chart over the
// chosen range.
export interface CoinDetail extends CoinQuote {
  range: Range;
  rangeChangeMicros: number;
  rangeChangeBasisPoints: number;
  highMicros: number;
  lowMicros: number;
  series: PricePoint[];
}

// The whole market, priced for this visitor.
export function getMarket(runKey: string): Promise<MarketResponse> {
  return request(withRunKey("/api/bank/market", runKey));
}

// One coin, with its chart over the chosen range.
export function getCoin(
  symbol: string,
  range: Range,
  runKey: string,
): Promise<CoinDetail> {
  return request(
    withRunKey(`/api/bank/market/${encodeURIComponent(symbol)}`, runKey, {
      range,
    }),
  );
}

// A price needs more decimals the cheaper the coin is: $67,420.15 reads wrong
// with six decimals, and $0.45 reads wrong with two.
export function formatPrice(
  micros: number,
  locale = "en-US",
  currency = "USD",
): string {
  // Dollars, then how many decimals a price this size needs.
  const value = micros / MICROS_PER_DOLLAR;
  const decimals = value >= 1000 ? 2 : value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  // The price as money in the given locale and currency.
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// 250 -> "+2.50%". Kept as basis points all the way from the server so the
// percentage is never recomputed from a rounded price.
export function formatChange(basisPoints: number): string {
  // A + for up, a minus sign for down, nothing for no change.
  const sign = basisPoints > 0 ? "+" : basisPoints < 0 ? "−" : "";
  return `${sign}${(Math.abs(basisPoints) / 100).toFixed(2)}%`;
}

// Up, down or flat, for the price's colour.
export function changeDirection(basisPoints: number): "up" | "down" | "flat" {
  if (basisPoints > 0) return "up";
  if (basisPoints < 0) return "down";
  return "flat";
}
