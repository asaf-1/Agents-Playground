import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api";
import { fieldErrors, formatMoney, formatUtc } from "../bankApi";
import { CoinMark } from "../components/CoinMark";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { formatPrice } from "../marketApi";
import {
  formatAtoms,
  formatFeeRate,
  getPortfolio,
  getWallet,
  previewSend,
  previewSwap,
  sendCoin,
  swapCoin,
  type SendPreview,
  type SwapPreview,
} from "../tradingApi";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { MONEY_KEY } from "../useMoney";

// Wallets: receive an address, send coin to somebody else's, and swap one coin
// straight into another. None of this touches a bank account -- it is coin
// moving between holdings.
export function WalletPage() {
  const runKey = useRunKey();
  const queryClient = useQueryClient();
  const { account, user, isLoading } = useBankSession();
  const settings = account?.settings;

  const wallet = useQuery({
    queryKey: [...MONEY_KEY, "wallet", runKey],
    queryFn: () => getWallet(runKey),
    enabled: Boolean(user),
  });
  const portfolio = useQuery({
    queryKey: [...MONEY_KEY, "portfolio", runKey],
    queryFn: () => getPortfolio(runKey),
    enabled: Boolean(user),
  });

  const held = portfolio.data?.positions ?? [];
  const wallets = wallet.data?.wallets ?? [];

  // --- Send ---------------------------------------------------------------
  const [sendSymbol, setSendSymbol] = useState("BTC");
  const [toAddress, setToAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [quote, setQuote] = useState<SendPreview | null>(null);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<string | null>(null);

  const checking = useMutation({
    mutationFn: () =>
      previewSend({ symbol: sendSymbol, quantity: sendAmount }, runKey),
    onSuccess: (next) => {
      setQuote(next);
      setSendErrors({});
      setSent(null);
    },
    onError: (error: Error) =>
      setSendErrors(
        error instanceof ApiError
          ? fieldErrors(error)
          : { quantity: error.message },
      ),
  });

  const sending = useMutation({
    mutationFn: () =>
      sendCoin(
        { symbol: sendSymbol, toAddress, quantity: sendAmount, memo },
        runKey,
      ),
    onSuccess: (result) => {
      setQuote(null);
      setToAddress("");
      setSendAmount("");
      setMemo("");
      setSendErrors({});
      setSent(
        result.delivered
          ? `Sent ${result.quantity} ${result.symbol}.`
          : `Sent ${result.quantity} ${result.symbol}, but no wallet holds that address.`,
      );
      queryClient.invalidateQueries({ queryKey: MONEY_KEY });
    },
    onError: (error: Error) =>
      setSendErrors(
        error instanceof ApiError
          ? fieldErrors(error)
          : { toAddress: error.message },
      ),
  });

  // --- Swap ---------------------------------------------------------------
  const [fromSymbol, setFromSymbol] = useState("BTC");
  const [intoSymbol, setIntoSymbol] = useState("ETH");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<SwapPreview | null>(null);
  const [swapErrors, setSwapErrors] = useState<Record<string, string>>({});
  const [swapped, setSwapped] = useState<string | null>(null);

  const pricingSwap = useMutation({
    mutationFn: () =>
      previewSwap(
        { fromSymbol, toSymbol: intoSymbol, quantity: swapAmount },
        runKey,
      ),
    onSuccess: (next) => {
      setSwapQuote(next);
      setSwapErrors({});
      setSwapped(null);
    },
    onError: (error: Error) =>
      setSwapErrors(
        error instanceof ApiError
          ? fieldErrors(error)
          : { quantity: error.message },
      ),
  });

  const doingSwap = useMutation({
    mutationFn: () =>
      swapCoin(
        { fromSymbol, toSymbol: intoSymbol, quantity: swapAmount },
        runKey,
      ),
    onSuccess: (result) => {
      setSwapQuote(null);
      setSwapAmount("");
      setSwapErrors({});
      setSwapped(
        `Swapped ${result.fromQuantity} ${result.fromSymbol} into ${result.toQuantity} ${result.toSymbol}.`,
      );
      queryClient.invalidateQueries({ queryKey: MONEY_KEY });
    },
    onError: (error: Error) =>
      setSwapErrors(
        error instanceof ApiError
          ? fieldErrors(error)
          : { quantity: error.message },
      ),
  });

  if (!isLoading && !user) {
    return (
      <section data-testid="wallet-page" className="page">
        <PageHeader
          eyebrow="Exchange"
          title="Wallet"
          description={
            <p className="page-sub">Send coin, receive it, and swap it.</p>
          }
        />
        <SignInPrompt next="/wallet" title="Log in to see your wallet" />
      </section>
    );
  }

  const holdingOf = (symbol: string) =>
    held.find((position) => position.symbol === symbol);

  return (
    <section data-testid="wallet-page" className="page">
      <PageHeader
        eyebrow="Exchange"
        title="Wallet"
        description={
          <p className="page-sub">
            Your addresses, sending to somebody else, and swapping one coin into
            another. Practice money only.
          </p>
        }
      />

      <div className="wallet-grid">
        <article className="card card-pad" data-testid="wallet-send">
          <h2>Send</h2>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (quote) {
                sending.mutate();
              } else {
                checking.mutate();
              }
            }}
          >
            <div className="field">
              <label htmlFor="send-symbol">Coin</label>
              <select
                id="send-symbol"
                data-testid="send-symbol"
                value={sendSymbol}
                onChange={(event) => {
                  setSendSymbol(event.target.value);
                  setQuote(null);
                }}
              >
                {wallets.map((entry) => (
                  <option key={entry.symbol} value={entry.symbol}>
                    {entry.symbol} · you hold{" "}
                    {holdingOf(entry.symbol)?.quantity ?? "0"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="send-to">To address</label>
              <input
                id="send-to"
                data-testid="send-to"
                autoComplete="off"
                spellCheck={false}
                placeholder="pbx1btc…"
                value={toAddress}
                onChange={(event) => {
                  setToAddress(event.target.value);
                  setQuote(null);
                }}
              />
              {sendErrors.toAddress && (
                <p className="field-error" data-testid="send-to-error">
                  {sendErrors.toAddress}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="send-amount">Amount</label>
              <input
                id="send-amount"
                data-testid="send-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.05"
                value={sendAmount}
                onChange={(event) => {
                  setSendAmount(event.target.value);
                  setQuote(null);
                }}
              />
              {sendErrors.quantity && (
                <p className="field-error" data-testid="send-amount-error">
                  {sendErrors.quantity}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="send-memo">Memo (optional)</label>
              <input
                id="send-memo"
                data-testid="send-memo"
                autoComplete="off"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </div>

            {quote && (
              <dl className="detail-list" data-testid="send-preview">
                <div>
                  {/* What the server read the typed amount as. Shown back so a
                      customer can see it agreed with them before sending. */}
                  <dt>Sending</dt>
                  <dd data-testid="send-amount-parsed">
                    {formatAtoms(quote.quantityAtoms)} {quote.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Network fee</dt>
                  <dd data-testid="send-fee">
                    {formatAtoms(quote.feeAtoms)} {quote.symbol} ·{" "}
                    {formatMoney(quote.feeCents, settings)}
                  </dd>
                </div>
                <div>
                  <dt>Leaves your wallet</dt>
                  <dd data-testid="send-total">
                    {formatAtoms(quote.totalAtoms)} {quote.symbol}
                  </dd>
                </div>
              </dl>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              data-testid={quote ? "send-confirm" : "send-check"}
              disabled={checking.isPending || sending.isPending}
            >
              {quote ? "Send it" : "Check the address"}
            </button>
          </form>
          {sent && (
            <p className="form-ok" data-testid="send-done" role="status">
              {sent}
            </p>
          )}
        </article>

        <article className="card card-pad" data-testid="wallet-swap">
          <h2>Swap</h2>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (swapQuote) {
                doingSwap.mutate();
              } else {
                pricingSwap.mutate();
              }
            }}
          >
            <div className="field">
              <label htmlFor="swap-from">From</label>
              <select
                id="swap-from"
                data-testid="swap-from"
                value={fromSymbol}
                onChange={(event) => {
                  setFromSymbol(event.target.value);
                  setSwapQuote(null);
                }}
              >
                {wallets.map((entry) => (
                  <option key={entry.symbol} value={entry.symbol}>
                    {entry.symbol} · you hold{" "}
                    {holdingOf(entry.symbol)?.quantity ?? "0"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="swap-into">Into</label>
              <select
                id="swap-into"
                data-testid="swap-into"
                value={intoSymbol}
                onChange={(event) => {
                  setIntoSymbol(event.target.value);
                  setSwapQuote(null);
                }}
              >
                {wallets.map((entry) => (
                  <option key={entry.symbol} value={entry.symbol}>
                    {entry.symbol}
                  </option>
                ))}
              </select>
              {swapErrors.toSymbol && (
                <p className="field-error" data-testid="swap-into-error">
                  {swapErrors.toSymbol}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="swap-amount">Amount</label>
              <input
                id="swap-amount"
                data-testid="swap-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.01"
                value={swapAmount}
                onChange={(event) => {
                  setSwapAmount(event.target.value);
                  setSwapQuote(null);
                }}
              />
              {swapErrors.quantity && (
                <p className="field-error" data-testid="swap-amount-error">
                  {swapErrors.quantity}
                </p>
              )}
            </div>

            {swapQuote && (
              <dl className="detail-list" data-testid="swap-preview">
                <div>
                  <dt>You get</dt>
                  <dd data-testid="swap-gets">
                    {formatAtoms(swapQuote.toAtoms)} {swapQuote.toSymbol}
                  </dd>
                </div>
                <div>
                  <dt>Worth</dt>
                  <dd>{formatMoney(swapQuote.valueCents, settings)}</dd>
                </div>
                <div>
                  <dt>Fee ({formatFeeRate(swapQuote.feeBasisPoints)})</dt>
                  <dd data-testid="swap-fee">
                    {formatMoney(swapQuote.feeCents, settings)}
                  </dd>
                </div>
              </dl>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              data-testid={swapQuote ? "swap-confirm" : "swap-check"}
              disabled={pricingSwap.isPending || doingSwap.isPending}
            >
              {swapQuote ? "Swap it" : "See what you'd get"}
            </button>
          </form>
          {swapped && (
            <p className="form-ok" data-testid="swap-done" role="status">
              {swapped}
            </p>
          )}
        </article>
      </div>

      <h2 className="section-title">Your addresses</h2>
      <p className="muted">
        Give one of these to somebody else so they can send you coin. The last
        three characters are a checksum, so a typo is caught rather than losing
        the coin.
      </p>
      <ul className="market-list" data-testid="wallet-addresses">
        {wallets.map((entry) => (
          <li className="market-row" key={entry.symbol}>
            <div className="market-link address-row">
              <CoinMark symbol={entry.symbol} />
              <span className="market-name">
                <strong>{entry.symbol}</strong>
                <span className="market-full">{entry.name}</span>
              </span>
              <code
                className="wallet-address"
                data-testid={`wallet-address-${entry.symbol}`}
              >
                {entry.address}
              </code>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Sends and swaps</h2>
      {wallet.data &&
        wallet.data.sends.length === 0 &&
        wallet.data.swaps.length === 0 && (
          <p className="muted" data-testid="wallet-history-empty">
            Nothing sent or swapped yet.
          </p>
        )}
      {wallet.data && wallet.data.sends.length > 0 && (
        <div className="table-wrap">
          <table className="table" data-testid="sends-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Way</th>
                <th scope="col">Amount</th>
                <th scope="col">Address</th>
                <th scope="col">Landed</th>
              </tr>
            </thead>
            <tbody>
              {wallet.data.sends.map((row) => (
                <tr key={row.id} data-testid={`send-row-${row.id}`}>
                  <td>{formatUtc(row.createdAt)}</td>
                  <td>{row.direction === "out" ? "Sent" : "Received"}</td>
                  <td>
                    {row.quantity} {row.symbol}
                  </td>
                  <td className="wallet-address">{row.toAddress}</td>
                  <td
                    className={row.delivered ? "amount-in" : "amount-out"}
                    data-testid={`send-landed-${row.id}`}
                  >
                    {row.delivered ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {wallet.data && wallet.data.swaps.length > 0 && (
        <div className="table-wrap">
          <table className="table" data-testid="swaps-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">From</th>
                <th scope="col">Into</th>
                <th scope="col">Worth</th>
                <th scope="col">Fee</th>
              </tr>
            </thead>
            <tbody>
              {wallet.data.swaps.map((row) => (
                <tr key={row.id} data-testid={`swap-row-${row.id}`}>
                  <td>{formatUtc(row.createdAt)}</td>
                  <td>
                    {row.fromQuantity} {row.fromSymbol}
                  </td>
                  <td>
                    {row.toQuantity} {row.toSymbol}
                  </td>
                  <td>{formatMoney(row.valueCents, settings)}</td>
                  <td>{formatMoney(row.feeCents, settings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
