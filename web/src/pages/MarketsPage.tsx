// The Markets page: every coin's price, its 24-hour move and a sparkline,
// refreshed every few seconds.

// The router's link, and the data cache.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
// The coin icon, the sparkline and the page heading.
import { CoinMark } from "../components/CoinMark";
import { Sparkline } from "../components/PriceChart";
import { PageHeader } from "../components/ui";
// The market call and its formats.
import {
  changeDirection,
  formatChange,
  formatPrice,
  getMarket,
  type MarketCoin,
} from "../marketApi";
// The test's runKey, who is signed in, and links that keep the runKey.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// How often the page asks for new prices. Short enough that the market is
// visibly alive, long enough that it is not a load test.
const REFRESH_MS = 5000;

// One coin's row: a link to its page, with its icon, name, price, move and
// sparkline.
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
  // Up, down or flat, for the colour.
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
          {formatChange(coin.changeBasisPoints, locale)}
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
  // The runKey, and the customer's number format and currency.
  const runKey = useRunKey();
  const { account } = useBankSession();
  const locale = account?.settings.locale ?? "en-US";
  const currency = account?.settings.currency ?? "USD";

  // Ask for the market every few seconds.
  const market = useQuery({
    queryKey: ["bank", "market", runKey],
    queryFn: () => getMarket(runKey),
    refetchInterval: REFRESH_MS,
    // A market that stops moving when the tab is in the background is fine;
    // it catches up the moment the tab is looked at again.
    refetchIntervalInBackground: false,
  });

  // The coins to show.
  const coins = market.data?.coins ?? [];

  // The heading, then loading, an error, or the list.
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

      {/* Loading. */}
      {market.isLoading && (
        <p className="muted" data-testid="markets-loading">
          Opening the market…
        </p>
      )}

      {/* The error. */}
      {market.isError && (
        <p className="form-error" data-testid="markets-error" role="alert">
          The market did not load. Try again in a moment.
        </p>
      )}

      {/* The column names, the coins, and how often they update. */}
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
