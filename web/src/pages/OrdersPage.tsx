import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOrders } from "../api";
import { Badge, PageHeader } from "../components/ui";
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
    <section data-testid="orders-page" className="page">
      <PageHeader
        eyebrow="Back office"
        title="Orders"
        description={
          <p className="page-sub">
            Merchant orders from the order service. Switch the response mode to
            practice slow and flaky networks.
          </p>
        }
      />

      <div data-testid="orders-controls" className="toolbar">
        <div className="segmented" role="group" aria-label="Response mode">
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
        </div>
        <button data-testid="orders-refresh" onClick={() => refetch()}>
          {refreshLabel}
        </button>
        {isFetching && !isPending && (
          <span data-testid="orders-refetching" className="chip-live">
            updating…
          </span>
        )}
      </div>

      {isPending && (
        <p data-testid="orders-loading" className="state">
          Loading orders…
        </p>
      )}

      {isError && (
        <div data-testid="orders-error" role="alert" className="callout">
          <p data-testid="orders-error-message">{(error as Error).message}</p>
          <button data-testid="orders-retry" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="card table-card">
          <div className="table-wrap">
            <table data-testid="orders-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="num-col">Total</th>
                  <th>Region</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.id} data-testid={`order-row-${order.id}`}>
                    <td className="cell-id">{order.id}</td>
                    <td className="cell-strong">{order.customer}</td>
                    <td data-testid={`order-status-${order.id}`}>
                      <Badge value={order.status} />
                    </td>
                    <td className="cell-num">{order.total}</td>
                    <td>
                      <span className="region">{order.region}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
