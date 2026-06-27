import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOrders } from "../api";
import { useAppFlags, useRunKey } from "../useAppFlags";

const MODES = ["stable", "slow", "flaky"] as const;
type Mode = (typeof MODES)[number];

export function OrdersPage() {
  const runKey = useRunKey();
  const flags = useAppFlags(runKey);
  const [mode, setMode] = useState<Mode>("stable");

  // INTENTIONAL DEFECT hook: armed ordersRefreshLabel="Reload" renames the
  // control. data-testid stays stable, so a text-based selector drifts (HEAL).
  const refreshLabel = flags?.ordersRefreshLabel ?? "Refresh";

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["orders", mode, runKey],
    queryFn: () => getOrders(mode, runKey),
  });

  return (
    <section data-testid="orders-page">
      <h1 data-testid="app-heading">Orders</h1>

      <div data-testid="orders-controls">
        {MODES.map((m) => (
          <button
            key={m}
            data-testid={`orders-mode-${m}`}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        <button data-testid="orders-refresh" onClick={() => refetch()}>
          {refreshLabel}
        </button>
        {isFetching && !isPending && (
          <span data-testid="orders-refetching">updating…</span>
        )}
      </div>

      {isPending && <p data-testid="orders-loading">Loading orders…</p>}

      {isError && (
        <div data-testid="orders-error" role="alert">
          <p data-testid="orders-error-message">{(error as Error).message}</p>
          <button data-testid="orders-retry" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <table data-testid="orders-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((order) => (
              <tr key={order.id} data-testid={`order-row-${order.id}`}>
                <td>{order.id}</td>
                <td>{order.customer}</td>
                <td data-testid={`order-status-${order.id}`}>{order.status}</td>
                <td>{order.total}</td>
                <td>{order.region}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
