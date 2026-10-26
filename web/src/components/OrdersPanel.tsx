import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatMoney, parseAmount, type BankSettings } from "../bankApi";
import {
  ALERT_STATUS_LABELS,
  cancelAlert,
  cancelOrder,
  createAlert,
  createOrder,
  listAlerts,
  listOrders,
  ORDER_STATUS_LABELS,
  parsePriceMicros,
  type AlertDirection,
  type LimitOrder,
  type OrderSide,
} from "../exchangeApi";
import { formatPrice } from "../marketApi";
import { parseAtoms } from "../tradingApi";
import { bankPath, MONEY_KEY, useMoneyAccounts } from "../useMoney";

// Orders and alerts for one coin: "buy $500 if it drops to…", "sell what I
// hold if it reaches…", "tell me when it goes above…". The lists poll, and
// every poll is a request, so it is also what lets the server fill and fire.
const POLL_MS = 4000;

export function OrdersPanel({
  symbol,
  runKey,
  settings,
  signedIn,
  canChange,
}: {
  symbol: string;
  runKey: string;
  settings: BankSettings | undefined;
  signedIn: boolean;
  canChange: boolean;
}) {
  const queryClient = useQueryClient();
  const locale = settings?.locale ?? "en-US";
  const currency = settings?.currency ?? "USD";

  const orders = useQuery({
    queryKey: [...MONEY_KEY, "orders", symbol, runKey],
    queryFn: () => listOrders(runKey, symbol),
    enabled: signedIn,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
  const alerts = useQuery({
    queryKey: [...MONEY_KEY, "alerts", symbol, runKey],
    queryFn: () => listAlerts(runKey, symbol),
    enabled: signedIn,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
  const accounts = useMoneyAccounts(runKey, signedIn);
  const accountList = accounts.data?.accounts ?? [];

  const [side, setSide] = useState<OrderSide>("buy");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [limit, setLimit] = useState("");
  const [orderError, setOrderError] = useState("");
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertError, setAlertError] = useState("");

  useEffect(() => {
    if (!accountId && accountList.length > 0) setAccountId(accountList[0].id);
  }, [accountList, accountId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: MONEY_KEY });
  };

  const place = useMutation({
    mutationFn: (input: Parameters<typeof createOrder>[0]) =>
      createOrder(input, runKey),
    onSuccess: () => {
      setAmount("");
      setLimit("");
      setOrderError("");
      refresh();
    },
    onError: (failure: Error) => setOrderError(failure.message),
  });
  const cancelOne = useMutation({
    mutationFn: (id: string) => cancelOrder(id, runKey),
    onSuccess: refresh,
  });
  const arm = useMutation({
    mutationFn: (input: Parameters<typeof createAlert>[0]) =>
      createAlert(input, runKey),
    onSuccess: () => {
      setAlertPrice("");
      setAlertError("");
      refresh();
    },
    onError: (failure: Error) => setAlertError(failure.message),
  });
  const disarm = useMutation({
    mutationFn: (id: string) => cancelAlert(id, runKey),
    onSuccess: refresh,
  });

  function submitOrder(event: FormEvent) {
    event.preventDefault();
    const limitMicros = parsePriceMicros(limit);
    if (limitMicros === null) {
      setOrderError("Enter a limit price like 61234.50.");
      return;
    }
    if (!accountId) {
      setOrderError("Pick an account.");
      return;
    }
    if (side === "buy") {
      const spendCents = parseAmount(amount);
      if (spendCents === null || spendCents <= 0) {
        setOrderError("Enter how much to spend, like 500.00.");
        return;
      }
      place.mutate({ symbol, side, accountId, spendCents, limitMicros });
    } else {
      const quantityAtoms = parseAtoms(amount);
      if (quantityAtoms === null || quantityAtoms <= 0) {
        setOrderError("Enter how much coin to sell, like 0.05.");
        return;
      }
      place.mutate({ symbol, side, accountId, quantityAtoms, limitMicros });
    }
  }

  function submitAlert(event: FormEvent) {
    event.preventDefault();
    const limitMicros = parsePriceMicros(alertPrice);
    if (limitMicros === null) {
      setAlertError("Enter a price like 61234.50.");
      return;
    }
    arm.mutate({ symbol, direction, limitMicros });
  }

  if (!signedIn) {
    return null;
  }

  const orderRows = orders.data?.orders ?? [];
  const alertRows = alerts.data?.alerts ?? [];

  function describe(order: LimitOrder): string {
    if (order.side === "buy") {
      return `Buy ${formatMoney(order.spendCents ?? 0, settings)} of ${order.symbol} at or below ${formatPrice(order.limitMicros, locale, currency)}`;
    }
    return `Sell ${order.quantity} ${order.symbol} at or above ${formatPrice(order.limitMicros, locale, currency)}`;
  }

  return (
    <div className="card card-pad orders-panel" data-testid="orders-panel">
      <h2>Orders and alerts</h2>
      <p className="muted">
        The exchange acting without a click: an order fills when your own price
        reaches its limit, an alert tells you once when a price is crossed. Both
        are checked whenever you are here.
      </p>

      {canChange ? (
        <div className="form-grid orders-forms">
          <form onSubmit={submitOrder} noValidate data-testid="order-form">
            <h3 className="dialog-subhead">Limit order</h3>
            <div className="field">
              <label htmlFor={`order-side-${symbol}`}>Side</label>
              <select
                id={`order-side-${symbol}`}
                data-testid="order-side"
                value={side}
                onChange={(event) => setSide(event.target.value as OrderSide)}
              >
                <option value="buy">Buy, at or below</option>
                <option value="sell">Sell, at or above</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`order-amount-${symbol}`}>
                {side === "buy" ? "Spend" : `Sell (${symbol})`}
              </label>
              <input
                id={`order-amount-${symbol}`}
                data-testid="order-amount"
                inputMode="decimal"
                placeholder={side === "buy" ? "500.00" : "0.05"}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`order-limit-${symbol}`}>Limit price</label>
              <input
                id={`order-limit-${symbol}`}
                data-testid="order-limit"
                inputMode="decimal"
                placeholder="61234.50"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`order-account-${symbol}`}>Account</label>
              <select
                id={`order-account-${symbol}`}
                data-testid="order-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                {accountList.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ·{" "}
                    {formatMoney(account.balanceCents, settings)}
                  </option>
                ))}
              </select>
            </div>
            {orderError && (
              <p role="alert" className="callout" data-testid="order-error">
                {orderError}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              data-testid="order-place"
              disabled={place.isPending}
            >
              Place order
            </button>
          </form>

          <form onSubmit={submitAlert} noValidate data-testid="alert-form">
            <h3 className="dialog-subhead">Price alert</h3>
            <div className="field">
              <label htmlFor={`alert-direction-${symbol}`}>Tell me when</label>
              <select
                id={`alert-direction-${symbol}`}
                data-testid="alert-direction"
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as AlertDirection)
                }
              >
                <option value="above">it goes above</option>
                <option value="below">it goes below</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`alert-price-${symbol}`}>Price</label>
              <input
                id={`alert-price-${symbol}`}
                data-testid="alert-price"
                inputMode="decimal"
                placeholder="65000.00"
                value={alertPrice}
                onChange={(event) => setAlertPrice(event.target.value)}
              />
            </div>
            {alertError && (
              <p role="alert" className="callout" data-testid="alert-error">
                {alertError}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-sm"
              data-testid="alert-set"
              disabled={arm.isPending}
            >
              Set alert
            </button>
          </form>
        </div>
      ) : (
        <p className="muted" data-testid="orders-demo-note">
          Demo accounts can look but not place orders or alerts.{" "}
          <Link to={bankPath("/signup", runKey)}>Sign up</Link> to try them.
        </p>
      )}

      <h3 className="dialog-subhead">Your orders for {symbol}</h3>
      {orders.data && orderRows.length === 0 && (
        <p className="muted" data-testid="orders-empty">
          No orders yet.
        </p>
      )}
      {orderRows.length > 0 && (
        <ul className="mini-list" data-testid="orders-list">
          {orderRows.map((order) => (
            <li
              key={order.id}
              data-testid={`order-row-${order.id}`}
              data-status={order.status}
            >
              <span>
                {describe(order)}
                <span className="cell-sub">
                  <span data-testid={`order-status-${order.id}`}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  {order.fillPriceMicros !== null &&
                    order.status === "filled" &&
                    ` at ${formatPrice(order.fillPriceMicros, locale, currency)}`}
                  {order.failReasonText && ` · ${order.failReasonText}`}
                </span>
              </span>
              {canChange && order.status === "open" && (
                <button
                  type="button"
                  className="btn btn-sm"
                  data-testid={`order-cancel-${order.id}`}
                  disabled={cancelOne.isPending}
                  onClick={() => cancelOne.mutate(order.id)}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="dialog-subhead">Your alerts for {symbol}</h3>
      {alerts.data && alertRows.length === 0 && (
        <p className="muted" data-testid="alerts-empty">
          No alerts yet.
        </p>
      )}
      {alertRows.length > 0 && (
        <ul className="mini-list" data-testid="alerts-list">
          {alertRows.map((alert) => (
            <li
              key={alert.id}
              data-testid={`alert-row-${alert.id}`}
              data-status={alert.status}
            >
              <span>
                {alert.symbol} {alert.direction}{" "}
                {formatPrice(alert.limitMicros, locale, currency)}
                <span className="cell-sub">
                  <span data-testid={`alert-status-${alert.id}`}>
                    {ALERT_STATUS_LABELS[alert.status]}
                  </span>
                  {alert.firedMicros !== null &&
                    ` at ${formatPrice(alert.firedMicros, locale, currency)}`}
                </span>
              </span>
              {canChange && alert.status === "armed" && (
                <button
                  type="button"
                  className="btn btn-sm"
                  data-testid={`alert-cancel-${alert.id}`}
                  disabled={disarm.isPending}
                  onClick={() => disarm.mutate(alert.id)}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Every open order across coins, for the Portfolio page.
export function OpenOrdersList({
  runKey,
  settings,
  canChange,
}: {
  runKey: string;
  settings: BankSettings | undefined;
  canChange: boolean;
}) {
  const queryClient = useQueryClient();
  const locale = settings?.locale ?? "en-US";
  const currency = settings?.currency ?? "USD";
  const orders = useQuery({
    queryKey: [...MONEY_KEY, "orders", "all", runKey],
    queryFn: () => listOrders(runKey),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
  const cancelOne = useMutation({
    mutationFn: (id: string) => cancelOrder(id, runKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MONEY_KEY }),
  });
  const open = (orders.data?.orders ?? []).filter(
    (order) => order.status === "open",
  );

  return (
    <div className="card card-pad" data-testid="portfolio-orders">
      <h2>Open orders</h2>
      {orders.data && open.length === 0 && (
        <p className="muted" data-testid="portfolio-orders-empty">
          No open orders. Place one from a coin's page.
        </p>
      )}
      {open.length > 0 && (
        <ul className="mini-list">
          {open.map((order) => (
            <li key={order.id} data-testid={`portfolio-order-${order.id}`}>
              <span>
                <Link to={bankPath(`/markets/${order.symbol}`, runKey)}>
                  {order.symbol}
                </Link>{" "}
                {order.side === "buy"
                  ? `buy ${formatMoney(order.spendCents ?? 0, settings)} at or below`
                  : `sell ${order.quantity} at or above`}{" "}
                {formatPrice(order.limitMicros, locale, currency)}
              </span>
              {canChange && (
                <button
                  type="button"
                  className="btn btn-sm"
                  data-testid={`portfolio-order-cancel-${order.id}`}
                  disabled={cancelOne.isPending}
                  onClick={() => cancelOne.mutate(order.id)}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
