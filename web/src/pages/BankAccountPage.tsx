// One account's page: its balance, its history with filters and pages, a CSV
// statement, and Report a problem on each line.

// React state, the router, the data cache, Radix's menu and the icons.
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronLeft, ChevronRight, Download, LifeBuoy } from "lucide-react";
// The API error type, and the account calls, formats and words.
import { ApiError } from "../api";
import {
  accountMeta,
  amountExample,
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
// The Add funds dialog, the sign-in card, the badge and the page heading.
import { AddFundsDialog } from "../components/MoneyDialogs";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
// The test's runKey, who is signed in, the money helpers, and the Bank page's
// account icon and signed amount.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, MONEY_KEY } from "../useMoney";
import { AccountKindIcon, SignedAmount } from "./BankPage";

// The history's Type filter.
const TYPE_OPTIONS: { value: "" | HistoryType; label: string }[] = [
  { value: "", label: "All types" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
  { value: "deposit", label: "Deposits" },
  { value: "transfer", label: "Transfers" },
  { value: "bill", label: "Bill payments" },
  { value: "loan", label: "Loans" },
];

// The filter form as typed, before Apply.
interface Draft {
  from: string;
  to: string;
  type: "" | HistoryType;
  min: string;
  max: string;
}

// An empty filter form.
const EMPTY: Draft = { from: "", to: "", type: "", min: "", max: "" };

// One account: its balance, its full history with filters and pages, and a
// CSV statement.
export function BankAccountPage() {
  // The account from the address, the runKey, the router, who is signed in, and
  // their settings.
  const { id = "" } = useParams();
  const runKey = useRunKey();
  const navigate = useNavigate();
  const { account: me, user, isLoading } = useBankSession();
  const settings = me?.settings;

  // The filters typed, the filters applied, the page, and the filter form's
  // errors.
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filters, setFilters] = useState<HistoryFilters>({});
  const [page, setPage] = useState(1);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});

  // The account; a 404 is an answer, so no retry.
  const accountQuery = useQuery({
    queryKey: [...MONEY_KEY, "account", id, runKey],
    queryFn: () => getMoneyAccount(id, runKey),
    enabled: Boolean(user),
    retry: false,
  });
  // One page of its history; the last page stays on screen while the next one
  // loads.
  const history = useQuery({
    queryKey: [...MONEY_KEY, "history", id, runKey, filters, page],
    queryFn: () => listTransactions(id, filters, page, runKey),
    enabled: Boolean(user) && accountQuery.isSuccess,
    placeholderData: keepPreviousData,
  });

  function apply(event: FormEvent) {
    event.preventDefault();
    // Check the amounts and the dates, with a plain message for each problem.
    // Amounts are read, and hinted, in the customer's own number format.
    const errors: Record<string, string> = {};
    const locale = settings?.locale ?? "en-US";
    const hint = `Enter an amount like ${amountExample(10000, locale)}.`;
    const minCents = draft.min
      ? parseAmount(draft.min, false, locale)
      : undefined;
    const maxCents = draft.max
      ? parseAmount(draft.max, false, locale)
      : undefined;
    if (minCents === null) errors.min = hint;
    if (maxCents === null) errors.max = hint;
    if (draft.from && draft.to && draft.from > draft.to) {
      errors.to = "The end date can't be before the start date.";
    }
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    // Apply the filters, from the first page.
    setFilters({
      from: draft.from || undefined,
      to: draft.to || undefined,
      type: draft.type || undefined,
      minCents: minCents ?? undefined,
      maxCents: maxCents ?? undefined,
    });
    setPage(1);
  }

  // Clear every filter, back to the first page.
  function clear() {
    setDraft(EMPTY);
    setDraftErrors({});
    setFilters({});
    setPage(1);
  }

  // Not found, the account, and the history page.
  const notFound =
    accountQuery.error instanceof ApiError && accountQuery.error.status === 404;
  const account = accountQuery.data?.account;
  const data = history.data;

  // The breadcrumb, the heading with Add funds and Send money, then the
  // account.
  return (
    <section data-testid="account-page" className="page">
      {/* Bank / this account. */}
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

      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt
          next={`/bank/accounts/${id}`}
          title="Log in to see this account"
        />
      )}

      {/* No such account, or not theirs. */}
      {notFound && (
        <div className="card card-pad" data-testid="account-not-found">
          <p className="account-title">There's no such account.</p>
          <p className="muted">
            It doesn't exist, or it isn't yours.{" "}
            <Link to={bankPath("/bank", runKey)}>Back to your accounts</Link>.
          </p>
        </div>
      )}

      {/* The account: balance, filters, history, pages. */}
      {account && (
        <>
          {/* The balance. */}
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

          {/* The filters: dates, type, amount range, Apply and Clear. */}
          <form
            className="card card-pad filter-bar"
            data-testid="history-filters"
            onSubmit={apply}
            noValidate
          >
            {/* The dates, with an error when the end is first. */}
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
            {/* The type. */}
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
            {/* The amount range, each with its error. */}
            <div className="field">
              <label htmlFor="history-min">Amount from</label>
              <input
                id="history-min"
                data-testid="history-min"
                inputMode="decimal"
                placeholder={amountExample(0, settings?.locale)}
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
            {/* Apply and Clear. */}
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

          {/* How many lines match, and the CSV download. */}
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

          {/* The history didn't load. */}
          {history.isError && (
            <p role="alert" className="callout" data-testid="history-error">
              {(history.error as Error).message}
            </p>
          )}

          {/* Nothing matches. */}
          {data && data.transactions.length === 0 && (
            <p className="empty" data-testid="history-empty">
              No transactions match these filters.
            </p>
          )}

          {/* The history: one row per line, with its ⋯ menu. */}
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
                      <th>Actions</th>
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
                        {/* Report a problem opens Support about this line. */}
                        <td className="cell-actions">
                          <DropdownMenu.Root modal={false}>
                            <DropdownMenu.Trigger asChild>
                              <button
                                data-testid={`history-actions-${row.id}`}
                                aria-label={`Actions for ${row.description}`}
                              >
                                ⋯
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                className="dropdown-content"
                                sideOffset={4}
                                align="end"
                              >
                                <DropdownMenu.Item
                                  data-testid={`history-report-${row.id}`}
                                  onSelect={() =>
                                    navigate(
                                      bankPath(
                                        `/support?transaction=${row.id}&about=${encodeURIComponent(row.description)}`,
                                        runKey,
                                      ),
                                    )
                                  }
                                >
                                  <LifeBuoy aria-hidden="true" />
                                  Report a problem
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Previous and Next, when there is more than one page. */}
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
