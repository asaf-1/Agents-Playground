// Buying and selling coin with bank money.
//
// Quantities arrive as "atoms": hundred-millionths of a coin, as whole
// numbers, so adding two amounts is exact. Money stays in cents and prices in
// micro-dollars, exactly as the bank and the market use them.

// The shared call helper, and the runKey helper.
import { request } from "./api";
import { plainNumber, withRunKey } from "./bankApi";

// How many atoms make one coin.
export const ATOMS_PER_COIN = 100_000_000;

// Buy or sell.
export type TradeSide = "buy" | "sell";

// A price for a trade, good for a few seconds: the coin's price, the fee and
// what moves.
export interface TradeQuote {
  id: string;
  symbol: string;
  name: string;
  side: TradeSide;
  priceMicros: number;
  /** What the coin is worth before the fee. */
  grossCents: number;
  feeCents: number;
  /** The fee in basis points. It falls the more you trade. */
  feeBasisPoints: number;
  /** What leaves your account on a buy, or arrives on a sell. */
  netCents: number;
  filledAtoms: number;
  expiresAt: string;
  expiresInSeconds: number;
}

// One trade made, with its fee and any profit taken.
export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  accountNumber?: string;
  quantityAtoms: number;
  quantity: string;
  priceMicros: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
  realisedCents: number;
  createdAt: string;
}

// One coin the customer holds: how much, what it cost, and what it is worth
// now.
export interface Position {
  symbol: string;
  name: string;
  quantityAtoms: number;
  quantity: string;
  costCents: number;
  priceMicros: number;
  averagePriceMicros: number;
  valueCents: number;
  unrealisedCents: number;
  unrealisedBasisPoints: number;
}

// Everything the customer holds, with its value and profit, taken and not yet
// taken.
export interface Portfolio {
  positions: Position[];
  valueCents: number;
  costCents: number;
  unrealisedCents: number;
  realisedCents: number;
  at: string;
}

// Ask for a price: spend an amount (buy) or sell a quantity.
export function priceTrade(
  input: {
    symbol: string;
    side: TradeSide;
    spendCents?: number;
    quantityAtoms?: number;
  },
  runKey: string,
): Promise<TradeQuote> {
  return request(withRunKey("/api/bank/trades/quote", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Make the trade at that price, from or into an account.
export function makeTrade(
  input: { quoteId: string; accountId: string },
  runKey: string,
): Promise<{ trade: Trade; balanceAfterCents: number }> {
  return request(withRunKey("/api/bank/trades", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// What the customer holds now.
export function getPortfolio(runKey: string): Promise<Portfolio> {
  return request(withRunKey("/api/bank/portfolio", runKey));
}

// Every trade the customer made.
export function listTrades(
  runKey: string,
): Promise<{ trades: Trade[]; total: number }> {
  return request(withRunKey("/api/bank/trades", runKey));
}

// "0.05419477" from 5419477 atoms. Trailing zeros go, and the whole thing is
// built from integers, so no amount is ever bent by floating point.
export function formatAtoms(atoms: number): string {
  // Whole coins, then the rest as 8 digits.
  const whole = Math.trunc(atoms / ATOMS_PER_COIN);
  const part = String(Math.abs(atoms) % ATOMS_PER_COIN).padStart(8, "0");
  // Drop the trailing zeros, and the dot if nothing is left after it.
  const trimmed = part.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : String(whole);
}

// "0.054" -> 5400000 atoms. Read as text, never through a float, so a typed
// amount means exactly what it says. null when it isn't a number.
export function parseAtoms(input: string, locale = "en-US"): number | null {
  // Written the customer's way first ("0,05" in de-DE), then refuse anything
  // that isn't a number with up to 8 decimals.
  const value = plainNumber(input, locale);
  if (!/^\d*(\.\d{1,8})?$/.test(value) || value === "" || value === ".") {
    return null;
  }
  // Whole coins and the fraction, turned into atoms as whole numbers.
  const [whole, fraction = ""] = value.split(".");
  const padded = fraction.padEnd(8, "0");
  return Number(whole || "0") * ATOMS_PER_COIN + Number(padded);
}

// The fee as a percentage, from basis points: 30 -> "0.30%".
export function formatFeeRate(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

// --- Wallets: sending and swapping (phase 3c) -------------------------------

// A wallet address for one coin.
export interface Wallet {
  symbol: string;
  name: string;
  /** pbx1btc7KZJ3E8B2RTDM — the last three characters are a checksum. */
  address: string;
}

// One coin send, to or from another wallet.
export interface WalletSend {
  id: string;
  symbol: string;
  direction: "in" | "out";
  toAddress: string;
  quantityAtoms: number;
  quantity: string;
  feeAtoms: number;
  memo: string;
  /** False when the address belonged to nobody, which should be impossible. */
  delivered: boolean;
  createdAt: string;
}

// One swap of one coin for another.
export interface WalletSwap {
  id: string;
  fromSymbol: string;
  toSymbol: string;
  fromQuantity: string;
  toQuantity: string;
  valueCents: number;
  feeCents: number;
  createdAt: string;
}

// What a send would take: the amount, the network fee and the total.
export interface SendPreview {
  symbol: string;
  priceMicros: number;
  quantityAtoms: number;
  feeAtoms: number;
  totalAtoms: number;
  feeCents: number;
}

// What a swap would give: the amounts both ways, the prices, and the fee.
export interface SwapPreview {
  fromSymbol: string;
  toSymbol: string;
  fromAtoms: number;
  toAtoms: number;
  fromPriceMicros: number;
  toPriceMicros: number;
  valueCents: number;
  feeCents: number;
  feeBasisPoints: number;
}

// The customer's wallets, with their sends and swaps.
export function getWallet(
  runKey: string,
): Promise<{ wallets: Wallet[]; sends: WalletSend[]; swaps: WalletSwap[] }> {
  return request(withRunKey("/api/bank/wallet", runKey));
}

// What a send of this amount would cost, before it is made.
export function previewSend(
  input: { symbol: string; quantity: string },
  runKey: string,
): Promise<SendPreview> {
  return request(withRunKey("/api/bank/wallet/send/preview", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Send coin to a wallet address.
export function sendCoin(
  input: { symbol: string; toAddress: string; quantity: string; memo?: string },
  runKey: string,
): Promise<WalletSend & { totalAtoms: number }> {
  return request(withRunKey("/api/bank/wallet/send", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// What a swap of this amount would give, before it is made.
export function previewSwap(
  input: { fromSymbol: string; toSymbol: string; quantity: string },
  runKey: string,
): Promise<SwapPreview> {
  return request(withRunKey("/api/bank/wallet/swap/preview", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Swap one coin for another.
export function swapCoin(
  input: { fromSymbol: string; toSymbol: string; quantity: string },
  runKey: string,
): Promise<WalletSwap & { fromQuantity: string; toQuantity: string }> {
  return request(withRunKey("/api/bank/wallet/swap", runKey), {
    method: "POST",
    body: JSON.stringify(input),
  });
}
