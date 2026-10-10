import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accountMeta,
  formatMoney,
  parseAmount,
  type BankSettings,
} from "../bankApi";
import {
  formatAtoms,
  formatFeeRate,
  getPortfolio,
  makeTrade,
  parseAtoms,
  priceTrade,
  type TradeQuote,
  type TradeSide,
} from "../tradingApi";
import { formatPrice } from "../marketApi";
import { bankPath, MONEY_KEY, useMoneyAccounts } from "../useMoney";

// Buying and selling one coin with bank money.
//
// A price is not acted on the moment it is shown: the customer asks for a
// quote, the bank holds that price for a few seconds, and only then do they
// confirm. That gap is the whole point -- it is where "the price moved while I
// was deciding" lives, and it is what the expiry bug plays with.
export function TradePanel({
  symbol,
  name,
  runKey,
  settings,
  signedIn,
}: {
  symbol: string;
  name: string;
  runKey: string;
  settings: BankSettings | undefined;
  signedIn: boolean;
}) {
  const queryClient = useQueryClient();
  const [side, setSide] = useState<TradeSide>("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const accounts = useMoneyAccounts(runKey, signedIn);
  const [accountId, setAccountId] = useState("");
  const portfolio = useQuery({
    queryKey: [...MONEY_KEY, "portfolio", runKey],
    queryFn: () => getPortfolio(runKey),
    enabled: signedIn,
  });

  const accountList = accounts.data?.accounts ?? [];
  const holding = portfolio.data?.positions.find(
    (position) => position.symbol === symbol,
  );

  useEffect(() => {
    if (accountList.length > 0 && !accountId) {
      setAccountId(accountList[0].id);
    }
  }, [accountList, accountId]);

  // The countdown. A quote that runs out is cleared, so nobody can confirm a
  // price the bank is no longer offering.
  useEffect(() => {
    if (!quote) {
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(quote.expiresAt).getTime() - Date.now()) / 1000),
      );
      setLeft(remaining);
      if (remaining === 0) {
        setQuote(null);
        setError("That price expired. Ask for a new one.");
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [quote]);

  const asking = useMutation({
    mutationFn: () => {
      const input =
        side === "buy"
          ? { symbol, side, spendCents: parseAmount(amount) ?? 0 }
          : { symbol, side, quantityAtoms: parseAtoms(amount) ?? 0 };
      return priceTrade(input, runKey);
    },
    onSuccess: (next) => {
      setQuote(next);
      setError("");
      setDone(null);
    },
    onError: (failure: Error) => setError(failure.message),
  });

  const confirming = useMutation({
    mutationFn: () => makeTrade({ quoteId: quote!.id, accountId }, runKey),
    onSuccess: (result) => {
      setQuote(null);
      setAmount("");
      setError("");
      setDone(
        `${result.trade.side === "buy" ? "Bought" : "Sold"} ${result.trade.quantity} ${symbol}.`,
      );
      // A trade moves money, changes a holding and writes history, so every
      // money query is refreshed rather than just this panel's.
      queryClient.invalidateQueries({ queryKey: MONEY_KEY });
      queryClient.invalidateQueries({ queryKey: ["bank", "market"] });
    },
    onError: (failure: Error) => setError(failure.message),
  });

  if (!signedIn) {
    return (
      <aside className="card trade-panel" data-testid="trade-panel">
        <h2>Trade {symbol}</h2>
        <p className="muted">
          <Link to={bankPath("/login", runKey)} data-testid="trade-sign-in">
            Log in
          </Link>{" "}
          to buy and sell with practice money from your bank accounts.
        </p>
      </aside>
    );
  }

  const amountValid =
    side === "buy" ? parseAmount(amount) !== null : parseAtoms(amount) !== null;

  return (
    <aside className="card trade-panel" data-testid="trade-panel">
      <h2>Trade {symbol}</h2>

      <div className="trade-sides" role="group" aria-label="Buy or sell">
        {(["buy", "sell"] as TradeSide[]).map((option) => (
          <button
            key={option}
            type="button"
            className={`btn btn-side${option === side ? " is-active" : ""}`}
            aria-pressed={option === side}
            data-testid={`trade-side-${option}`}
            onClick={() => {
              setSide(option);
              setQuote(null);
              setAmount("");
              setError("");
              setDone(null);
            }}
          >
            {option === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {side === "sell" && (
        <p className="muted" data-testid="trade-holding">
          You hold {holding ? holding.quantity : "0"} {symbol}
        </p>
      )}

      <div className="field">
        <label htmlFor="trade-amount">
          {side === "buy" ? "Amount to spend" : `How much ${symbol} to sell`}
        </label>
        <input
          id="trade-amount"
          data-testid="trade-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder={side === "buy" ? "250.00" : "0.05"}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setQuote(null);
            setDone(null);
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="trade-account">
          {side === "buy" ? "Pay from" : "Pay into"}
        </label>
        <select
          id="trade-account"
          data-testid="trade-account"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        >
          {accountList.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {accountMeta(account)} ·{" "}
              {formatMoney(account.balanceCents, settings)}
            </option>
          ))}
        </select>
      </div>

      {!quote && (
        <button
          type="button"
          className="btn btn-primary"
          data-testid="trade-quote"
          disabled={!amountValid || asking.isPending}
          onClick={() => asking.mutate()}
        >
          {asking.isPending ? "Pricing…" : "Get a price"}
        </button>
      )}

      {quote && (
        <div className="trade-quote" data-testid="trade-quote-box">
          <dl className="detail-list">
            <div>
              <dt>Price</dt>
              <dd data-testid="trade-quote-price">
                {formatPrice(
                  quote.priceMicros,
                  settings?.locale,
                  settings?.currency,
                )}
              </dd>
            </div>
            <div>
              <dt>You {quote.side === "buy" ? "get" : "sell"}</dt>
              <dd data-testid="trade-quote-amount">
                {formatAtoms(quote.filledAtoms)} {symbol}
              </dd>
            </div>
            <div>
              <dt>Fee ({formatFeeRate(quote.feeBasisPoints)})</dt>
              <dd data-testid="trade-quote-fee">
                {formatMoney(quote.feeCents, settings)}
              </dd>
            </div>
            <div>
              <dt>{quote.side === "buy" ? "You pay" : "You receive"}</dt>
              <dd data-testid="trade-quote-total">
                {formatMoney(quote.netCents, settings)}
              </dd>
            </div>
          </dl>
          <p className="muted" data-testid="trade-countdown">
            This price holds for {left} second{left === 1 ? "" : "s"}.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="trade-confirm"
            disabled={confirming.isPending}
            onClick={() => confirming.mutate()}
          >
            {confirming.isPending
              ? "Working…"
              : `Confirm ${quote.side === "buy" ? "buy" : "sell"}`}
          </button>
        </div>
      )}

      {error && (
        <p className="form-error" data-testid="trade-error" role="alert">
          {error}
        </p>
      )}

      {done && (
        <p className="form-ok" data-testid="trade-done" role="status">
          {done}{" "}
          <Link to={bankPath("/portfolio", runKey)}>See your portfolio</Link>
        </p>
      )}
    </aside>
  );
}
