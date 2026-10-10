import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { CoinMark } from "../components/CoinMark";
import { TradePanel } from "../components/TradePanel";
import { PriceChart } from "../components/PriceChart";
import { PageHeader } from "../components/ui";
import {
  changeDirection,
  formatChange,
  formatPrice,
  getCoin,
  RANGE_LABELS,
  RANGES,
  type Range,
} from "../marketApi";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

const REFRESH_MS = 5000;

// One coin, on the viewer's own price line. The chart is drawn from the same
// function that produced the live price, so the history and the number at the
// top can never disagree.
export function CoinPage() {
  const runKey = useRunKey();
  const { symbol = "" } = useParams();
  const [range, setRange] = useState<Range>("24h");
  const { account, user } = useBankSession();
  const locale = account?.settings.locale ?? "en-US";
  const currency = account?.settings.currency ?? "USD";

  const coin = useQuery({
    queryKey: ["bank", "market", runKey, symbol, range],
    queryFn: () => getCoin(symbol, range, runKey),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const data = coin.data;
  const direction = changeDirection(data?.rangeChangeBasisPoints ?? 0);

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

      {coin.isError && (
        <p className="form-error" data-testid="coin-error" role="alert">
          No such coin.
        </p>
      )}

      {data && (
        <>
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

          <PriceChart
            series={data.series}
            direction={direction}
            label={`${data.name} price over ${RANGE_LABELS[data.range]}`}
          />

          <TradePanel
            symbol={data.symbol}
            name={data.name}
            runKey={runKey}
            settings={account?.settings}
            signedIn={Boolean(user)}
          />

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
