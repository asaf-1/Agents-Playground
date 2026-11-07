// One coin's page: its price, a chart over a chosen range, the trade panel,
// orders and alerts, and the range's high and low.

// React state, the router's link and the address's symbol, the data cache and
// the back icon.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
// The coin icon, the trade and orders panels, the chart and the page heading.
import { CoinMark } from "../components/CoinMark";
import { OrdersPanel } from "../components/OrdersPanel";
import { TradePanel } from "../components/TradePanel";
import { PriceChart } from "../components/PriceChart";
import { PageHeader } from "../components/ui";
// The coin call, its formats and the chart ranges.
import {
  changeDirection,
  formatChange,
  formatPrice,
  getCoin,
  RANGE_LABELS,
  RANGES,
  type Range,
} from "../marketApi";
// The test's runKey, who is signed in, and links that keep the runKey.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// How often the price refreshes, in milliseconds.
const REFRESH_MS = 5000;

// One coin, on the viewer's own price line. The chart is drawn from the same
// function that produced the live price, so the history and the number at the
// top can never disagree.
export function CoinPage() {
  // The runKey, the coin from the address, the range picked, and the customer's
  // settings.
  const runKey = useRunKey();
  const { symbol = "" } = useParams();
  const [range, setRange] = useState<Range>("24h");
  const { account, user } = useBankSession();
  const locale = account?.settings.locale ?? "en-US";
  const currency = account?.settings.currency ?? "USD";

  // Ask for the coin every few seconds; an unknown coin is an answer, so no
  // retry.
  const coin = useQuery({
    queryKey: ["bank", "market", runKey, symbol, range],
    queryFn: () => getCoin(symbol, range, runKey),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });

  // The coin, and whether it went up over the range.
  const data = coin.data;
  const direction = changeDirection(data?.rangeChangeBasisPoints ?? 0);

  // The heading with a link back, then the coin.
  return (
    <section data-testid="coin-page" className="page">
      <PageHeader
        eyebrow="Exchange"
        title={
          <span className="coin-title">
            <CoinMark symbol={data?.symbol ?? symbol} />
            {data ? `${data.name} (${data.symbol})` : symbol.toUpperCase()}
          </span>
        }
        description={
          <p className="page-sub">
            Your own price line for this coin. Practice money, nothing real.
          </p>
        }
        actions={
          <Link
            className="btn"
            to={bankPath("/markets", runKey)}
            data-testid="coin-back"
          >
            <ArrowLeft aria-hidden="true" /> All markets
          </Link>
        }
      />

      {/* Not a coin. */}
      {coin.isError && (
        <p className="form-error" data-testid="coin-error" role="alert">
          No such coin.
        </p>
      )}

      {/* The coin: price, ranges, chart, trading, orders and stats. */}
      {data && (
        <>
          {/* The price now, and its move over the range. */}
          <div className="coin-summary">
            <p className="coin-price" data-testid="coin-price">
              {formatPrice(data.priceMicros, locale, currency)}
            </p>
            <p
              className={`coin-change change-${direction}`}
              data-testid="coin-change"
            >
              {formatChange(data.rangeChangeBasisPoints)}
              <span className="muted"> over {RANGE_LABELS[data.range]}</span>
            </p>
          </div>

          {/* The range buttons. */}
          <div
            className="range-picker"
            role="group"
            aria-label="Chart range"
            data-testid="coin-ranges"
          >
            {RANGES.map((option) => (
              <button
                key={option}
                type="button"
                className={`btn btn-range${option === range ? " is-active" : ""}`}
                aria-pressed={option === range}
                onClick={() => setRange(option)}
                data-testid={`coin-range-${option}`}
              >
                {option}
              </button>
            ))}
          </div>

          {/* The chart. */}
          <PriceChart
            series={data.series}
            direction={direction}
            label={`${data.name} price over ${RANGE_LABELS[data.range]}`}
          />

          {/* Buy and sell. */}
          <TradePanel
            symbol={data.symbol}
            name={data.name}
            runKey={runKey}
            settings={account?.settings}
            signedIn={Boolean(user)}
          />

          {/* Orders and alerts; demo accounts can only look. */}
          <OrdersPanel
            symbol={data.symbol}
            runKey={runKey}
            settings={account?.settings}
            signedIn={Boolean(user)}
            canChange={Boolean(user && !user.isDemo)}
          />

          {/* The range's high and low. */}
          <dl className="coin-stats" data-testid="coin-stats">
            <div>
              <dt>High</dt>
              <dd data-testid="coin-high">
                {formatPrice(data.highMicros, locale, currency)}
              </dd>
            </div>
            <div>
              <dt>Low</dt>
              <dd data-testid="coin-low">
                {formatPrice(data.lowMicros, locale, currency)}
              </dd>
            </div>
            <div>
              <dt>Range</dt>
              <dd>{RANGE_LABELS[data.range]}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
