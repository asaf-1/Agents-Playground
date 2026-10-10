import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { ApiError } from "../api";
import {
  accountMeta,
  formatMoney,
  formatUtc,
  getMoneyAccount,
  listTransactions,
  parseAmount,
  statementUrl,
  TRANSACTION_LABELS,
  type HistoryFilters,
  type HistoryType,
} from "../bankApi";
import { AddFundsDialog } from "../components/MoneyDialogs";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, MONEY_KEY } from "../useMoney";
import { AccountKindIcon, SignedAmount } from "./BankPage";

const TYPE_OPTIONS: { value: "" | HistoryType; label: string }[] = [
  { value: "", label: "All types" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
  { value: "deposit", label: "Deposits" },
  { value: "transfer", label: "Transfers" },
  { value: "bill", label: "Bill payments" },
  { value: "loan", label: "Loans" },
];

interface Draft {
  from: string;
  to: string;
  type: "" | HistoryType;
  min: string;
  max: string;
}

const EMPTY: Draft = { from: "", to: "", type: "", min: "", max: "" };

// One account: its balance, its full history with filters and pages, and a
// CSV statement.
export function BankAccountPage() {
  const { id = "" } = useParams();
  const runKey = useRunKey();
  const { account: me, user, isLoading } = useBankSession();
  const settings = me?.settings;

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filters, setFilters] = useState<HistoryFilters>({});
  const [page, setPage] = useState(1);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});

  const accountQuery = useQuery({
    queryKey: [...MONEY_KEY, "account", id, runKey],
    queryFn: () => getMoneyAccount(id, runKey),
    enabled: Boolean(user),
    retry: false,
  });
  const history = useQuery({
    queryKey: [...MONEY_KEY, "history", id, runKey, filters, page],
    queryFn: () => listTransactions(id, filters, page, runKey),
    enabled: Boolean(user) && accountQuery.isSuccess,
    placeholderData: keepPreviousData,
  });

  function apply(event: FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    const minCents = draft.min ? parseAmount(draft.min) : undefined;
    const maxCents = draft.max ? parseAmount(draft.max) : undefined;
    if (minCents === null) errors.min = "Enter an amount like 100.00.";
    if (maxCents === null) errors.max = "Enter an amount like 100.00.";
    if (draft.from && draft.to && draft.from > draft.to) {
      errors.to = "The end date can't be before the start date.";
    }
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setFilters({
      from: draft.from || undefined,
      to: draft.to || undefined,
      type: draft.type || undefined,
      minCents: minCents ?? undefined,
      maxCents: maxCents ?? undefined,
    });
    setPage(1);
  }

  function clear() {
    setDraft(EMPTY);
    setDraftErrors({});
    setFilters({});
    setPage(1);
  }

  const notFound =
    accountQuery.error instanceof ApiError && accountQuery.error.status === 404;
  const account = accountQuery.data?.account;
  const data = history.data;

  return (
    <section data-testid="account-page" className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to={bankPath("/bank", runKey)} data-testid="account-back">
          Bank
        </Link>
        <span aria-hidden="true">/</span>
        <span>{account?.name ?? "Account"}</span>
      </nav>
      <PageHeader
        eyebrow="Money"
        title={account ? account.name : "Account"}
        description={
          account && (
            <p className="page-sub mono" data-testid="account-number">
              {accountMeta(account)}
            </p>
          )
        }
        actions={
          account &&
          user &&
          !user.isDemo && (
            <>
              <AddFundsDialog
                account={account}
                runKey={runKey}
                settings={settings}
              />
              <Link
                className="btn btn-primary"
                data-testid="account-send"
                to={bankPath(`/bank/transfer?from=${account.id}`, runKey)}
              >
                Send money
              </Link>
            </>
          )
        }
      />

      {!isLoading && !user && (
        <SignInPrompt
          next={`/bank/accounts/${id}`}
          title="Log in to see this account"
        />
      )}

      {notFound && (
        <div className="card card-pad" data-testid="account-not-found">
          <p className="account-title">There's no such account.</p>
          <p className="muted">
            It doesn't exist, or it isn't yours.{" "}
            <Link to={bankPath("/bank", runKey)}>Back to your accounts</Link>.
          </p>
        </div>
      )}

      {account && (
        <>
          <div className="card card-pad balance-card">
            <div className="money-card-head">
              <span className="hub-icon">
                <AccountKindIcon kind={account.kind} />
              </span>
              <div>
                <p className="eyebrow">Balance</p>
                <p className="balance-total" data-testid="account-balance">
                  {formatMoney(account.balanceCents, settings)}
                </p>
              </div>
            </div>
          </div>

          <form
            className="card card-pad filter-bar"
            data-testid="history-filters"
            onSubmit={apply}
            noValidate
          >
            <div className="field">
              <label htmlFor="history-from">From</label>
              <input
                id="history-from"
                data-testid="history-from"
                type="date"
                value={draft.from}
                onChange={(event) =>
                  setDraft({ ...draft, from: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="history-to">To</label>
              <input
                id="history-to"
                data-testid="history-to"
                type="date"
                aria-invalid={draftErrors.to ? true : undefined}
                value={draft.to}
                onChange={(event) =>
                  setDraft({ ...draft, to: event.target.value })
                }
              />
              {draftErrors.to && (
                <p data-testid="history-to-error" role="alert">
                  {draftErrors.to}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="history-type">Type</label>
              <select
                id="history-type"
                data-testid="history-type"
                value={draft.type}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    type: event.target.value as Draft["type"],
                  })
                }
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="history-min">Amount from</label>
              <input
                id="history-min"
                data-testid="history-min"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={draftErrors.min ? true : undefined}
                value={draft.min}
                onChange={(event) =>
                  setDraft({ ...draft, min: event.target.value })
                }
              />
              {draftErrors.min && (
                <p data-testid="history-min-error" role="alert">
                  {draftErrors.min}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="history-max">Amount to</label>
              <input
                id="history-max"
                data-testid="history-max"
                inputMode="decimal"
                placeholder="Any"
                aria-invalid={draftErrors.max ? true : undefined}
                value={draft.max}
                onChange={(event) =>
                  setDraft({ ...draft, max: event.target.value })
                }
              />
              {draftErrors.max && (
                <p data-testid="history-max-error" role="alert">
                  {draftErrors.max}
                </p>
              )}
            </div>
            <div className="btn-row filter-actions">
              <button
                className="btn btn-primary"
                type="submit"
                data-testid="history-apply"
              >
                Apply
              </button>
              <button
                className="btn"
                type="button"
                data-testid="history-clear"
                onClick={clear}
              >
                Clear
              </button>
            </div>
          </form>

          <div className="section-head">
            <h2>History</h2>
            <p className="muted" data-testid="history-count">
              {data
                ? `${data.total} transaction${data.total === 1 ? "" : "s"}. Dates are UTC.`
                : "Loading…"}
            </p>
            <a
              className="btn btn-sm"
              data-testid="statement-download"
              href={statementUrl(account.id, filters, runKey)}
              download
            >
              <Download aria-hidden="true" />
              Download CSV
            </a>
          </div>
          <p className="muted statement-hint">
            The statement covers the dates above, or the last 30 days.
          </p>

          {history.isError && (
            <p role="alert" className="callout" data-testid="history-error">
              {(history.error as Error).message}
            </p>
          )}

          {data && data.transactions.length === 0 && (
            <p className="empty" data-testid="history-empty">
              No transactions match these filters.
            </p>
          )}

          {data && data.transactions.length > 0 && (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="history-table">
                  <thead>
                    <tr>
                      <th>Date (UTC)</th>
                      <th>Description</th>
                      <th>Type</th>
                      <th className="cell-num">Amount</th>
                      <th className="cell-num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((row) => (
                      <tr key={row.id} data-testid={`history-row-${row.id}`}>
                        <td className="cell-mono">
                          {formatUtc(row.createdAt)}
                        </td>
                        <td>
                          {row.description}
                          {row.memo && (
                            <span className="cell-sub">{row.memo}</span>
                          )}
                        </td>
                        <td>
                          <Badge
                            value={TRANSACTION_LABELS[row.kind]}
                            tone={row.amountCents < 0 ? "danger" : "success"}
                          />
                        </td>
                        <td className="cell-num">
                          <SignedAmount
                            cents={row.amountCents}
                            text={formatMoney(row.amountCents, settings)}
                            testId={`history-amount-${row.id}`}
                          />
                        </td>
                        <td className="cell-num cell-mono">
                          {formatMoney(row.balanceAfterCents, settings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data && data.totalPages > 1 && (
            <div className="pager" data-testid="history-pager">
              <button
                className="btn btn-sm"
                data-testid="history-prev"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft aria-hidden="true" />
                Previous
              </button>
              <span data-testid="history-page">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                className="btn btn-sm"
                data-testid="history-next"
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
