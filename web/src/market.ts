// Simulated market strip for the top bar. Static numbers and no network calls,
// so no page gains an API request; fake prices only, nothing here is real.
export interface Ticker {
  symbol: string;
  price: string;
  change: number;
}

export const TICKERS: Ticker[] = [
  { symbol: "BTC", price: "67,420.15", change: 2.41 },
  { symbol: "ETH", price: "3,512.80", change: 1.12 },
  { symbol: "SOL", price: "172.44", change: -0.84 },
  { symbol: "ADA", price: "0.4521", change: 0.37 },
  { symbol: "AVAX", price: "36.18", change: -2.05 },
  { symbol: "LINK", price: "17.92", change: 3.36 },
  { symbol: "DOT", price: "7.04", change: -1.18 },
  { symbol: "PLAY", price: "1.00", change: 0 },
];
