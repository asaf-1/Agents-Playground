import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CoinMark } from "../components/CoinMark";
import { Sparkline } from "../components/PriceChart";
import { PageHeader } from "../components/ui";
import {
  changeDirection,
  formatChange,
  formatPrice,
  getMarket,
  type MarketCoin,
} from "../marketApi";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// How often the page asks for new prices. Short enough that the market is
// visibly alive, long enough that it is not a load test.
const REFRESH_MS = 5000;

export function MarketRow({
  coin,
  runKey,
  locale,
  currency,
}: {
  coin: MarketCoin;
  runKey: string;
  locale: string;
  currency: string;
}) {
  const direction = changeDirection(coin.changeBasisPoints);
  return (
    <li className="market-row" data-testid={`market-row-${coin.symbol}`}>
      <Link
        className="market-link"
        to={bankPath(`/markets/${coin.symbol}`, runKey)}
        data-testid={`market-link-${coin.symbol}`}
      >
        <CoinMark symbol={coin.symbol} />
        <span className="market-name">
          <strong>{coin.symbol}</strong>
          <span className="market-full">{coin.name}</span>
        </span>
        <span
          className="market-price"
          data-testid={`market-price-${coin.symbol}`}
        >
          {formatPrice(coin.priceMicros, locale, currency)}
        </span>
        <span
          className={`market-change change-${direction}`}
          data-testid={`market-change-${coin.symbol}`}
        >
          {formatChange(coin.changeBasisPoints)}
        </span>
        <Sparkline values={coin.spark} direction={direction} />
      </Link>
    </li>
  );
}

// The exchange's front page. Every price on it belongs to whoever is looking:
// the same coin at the same second is a different number for somebody else,
// and it keeps moving while the page is open.
export function MarketsPage() {
  const runKey = useRunKey();
  const { account } = useBankSession();
  const locale = account?.settings.locale ?? "en-US";
  const currency = account?.settings.currency ?? "USD";

  const market = useQuery({
    queryKey: ["bank", "market", runKey],
    queryFn: () => getMarket(runKey),
    refetchInterval: REFRESH_MS,
    // A market that stops moving when the tab is in the background is fine;
    // it catches up the moment the tab is looked at again.
    refetchIntervalInBackground: false,
  });

  const coins = market.data?.coins ?? [];

  return (
    <section data-testid="markets-page" className="page">
      <PageHeader
        eyebrow="Exchange"
        title="Markets"
        description={
          <p className="page-sub">
            Practice prices, and they are yours alone: everyone who opens this
            page gets their own market on its own path. Nothing here is real and
            no price is stored.
          </p>
        }
      />

      {market.isLoading && (
        <p className="muted" data-testid="markets-loading">
          Opening the market…
        </p>
      )}

      {market.isError && (
        <p className="form-error" data-testid="markets-error" role="alert">
          The market did not load. Try again in a moment.
        </p>
      )}

      {coins.length > 0 && (
        <>
          <div className="market-head" aria-hidden="true">
            <span>Coin</span>
            <span className="market-head-price">Price</span>
            <span className="market-head-change">24h</span>
            <span className="market-head-spark">Last day</span>
          </div>
          <ul className="market-list" data-testid="market-list">
            {coins.map((coin) => (
              <MarketRow
                key={coin.symbol}
                coin={coin}
                runKey={runKey}
                locale={locale}
                currency={currency}
              />
            ))}
          </ul>
          <p className="muted market-foot" data-testid="market-updated">
            Updating every {REFRESH_MS / 1000} seconds.
          </p>
        </>
      )}
    </section>
  );
}
