import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatMoney, formatUtc } from "../bankApi";
import { CoinMark } from "../components/CoinMark";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { changeDirection, formatChange, formatPrice } from "../marketApi";
import { getPortfolio, listTrades } from "../tradingApi";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, MONEY_KEY } from "../useMoney";

const REFRESH_MS = 5000;

// What you hold, what it is worth on your own prices right now, and what that
// is against what you paid. The value moves while the page is open, because
// the prices do.
export function PortfolioPage() {
  const runKey = useRunKey();
  const { account, user, isLoading } = useBankSession();
  const settings = account?.settings;
  const locale = settings?.locale ?? "en-US";
  const currency = settings?.currency ?? "USD";

  const portfolio = useQuery({
    queryKey: [...MONEY_KEY, "portfolio", runKey],
    queryFn: () => getPortfolio(runKey),
    enabled: Boolean(user),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  const trades = useQuery({
    queryKey: [...MONEY_KEY, "trades", runKey],
    queryFn: () => listTrades(runKey),
    enabled: Boolean(user),
  });

  if (!isLoading && !user) {
    return (
      <section data-testid="portfolio-page" className="page">
        <PageHeader
          eyebrow="Exchange"
          title="Portfolio"
          description={
            <p className="page-sub">
              What you hold and what it is worth right now.
            </p>
          }
        />
        <SignInPrompt next="/portfolio" title="Log in to see your portfolio" />
      </section>
    );
  }

  const data = portfolio.data;
  const positions = data?.positions ?? [];
  const direction = changeDirection(data?.unrealisedCents ?? 0);

  return (
    <section data-testid="portfolio-page" className="page">
      <PageHeader
        eyebrow="Exchange"
        title="Portfolio"
        description={
          <p className="page-sub">
            Your coin, valued on your own live prices. Practice money only.
          </p>
        }
        actions={
          <Link className="btn" to={bankPath("/markets", runKey)}>
            Markets
          </Link>
        }
      />

      {data && (
        <div className="portfolio-totals" data-testid="portfolio-totals">
          <div>
            <dt>Worth now</dt>
            <dd data-testid="portfolio-value">
              {formatMoney(data.valueCents, settings)}
            </dd>
          </div>
          <div>
            <dt>What it cost</dt>
            <dd data-testid="portfolio-cost">
              {formatMoney(data.costCents, settings)}
            </dd>
          </div>
          <div>
            <dt>Up or down</dt>
            <dd
              className={`change-${direction}`}
              data-testid="portfolio-unrealised"
            >
              {formatMoney(data.unrealisedCents, settings)}
            </dd>
          </div>
          <div>
            <dt>Made by selling</dt>
            <dd data-testid="portfolio-realised">
              {formatMoney(data.realisedCents, settings)}
            </dd>
          </div>
        </div>
      )}

      {data && positions.length === 0 && (
        <p className="muted" data-testid="portfolio-empty">
          You don't hold any coin yet.{" "}
          <Link to={bankPath("/markets", runKey)}>Pick one from Markets</Link>{" "}
          and buy some with practice money.
        </p>
      )}

      {positions.length > 0 && (
        <ul className="market-list" data-testid="portfolio-list">
          {positions.map((position) => {
            const way = changeDirection(position.unrealisedBasisPoints);
            return (
              <li
                className="market-row"
                key={position.symbol}
                data-testid={`position-${position.symbol}`}
              >
                <Link
                  className="market-link position-link"
                  to={bankPath(`/markets/${position.symbol}`, runKey)}
                  data-testid={`position-link-${position.symbol}`}
                >
                  <CoinMark symbol={position.symbol} />
                  <span className="market-name">
                    <strong>
                      {position.quantity} {position.symbol}
                    </strong>
                    <span className="market-full">
                      bought around{" "}
                      {formatPrice(
                        position.averagePriceMicros,
                        locale,
                        currency,
                      )}
                    </span>
                  </span>
                  <span
                    className="market-price"
                    data-testid={`position-value-${position.symbol}`}
                  >
                    {formatMoney(position.valueCents, settings)}
                  </span>
                  <span
                    className={`market-change change-${way}`}
                    data-testid={`position-change-${position.symbol}`}
                  >
                    {formatChange(position.unrealisedBasisPoints)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="section-title">Your trades</h2>
      {trades.data && trades.data.trades.length === 0 && (
        <p className="muted" data-testid="trades-empty">
          No trades yet.
        </p>
      )}
      {trades.data && trades.data.trades.length > 0 && (
        <div className="table-wrap">
          <table className="table" data-testid="trades-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col">Price</th>
                <th scope="col">Fee</th>
                <th scope="col">Money</th>
              </tr>
            </thead>
            <tbody>
              {trades.data.trades.map((trade) => (
                <tr key={trade.id} data-testid={`trade-row-${trade.id}`}>
                  <td>{formatUtc(trade.createdAt)}</td>
                  <td>
                    {trade.side === "buy" ? "Bought" : "Sold"} {trade.quantity}{" "}
                    {trade.symbol}
                  </td>
                  <td>{formatPrice(trade.priceMicros, locale, currency)}</td>
                  <td>{formatMoney(trade.feeCents, settings)}</td>
                  <td
                    className={
                      trade.side === "buy" ? "amount-out" : "amount-in"
                    }
                  >
                    {trade.side === "buy" ? "−" : "+"}
                    {formatMoney(trade.netCents, settings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
