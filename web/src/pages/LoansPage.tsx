import { useDeferredValue, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import {
  fieldErrors,
  formatApr,
  formatMoney,
  formatUtc,
  getLoan,
  LOAN_STATUS_LABELS,
  LOAN_TERMS,
  listLoans,
  loanQuote,
  MAX_LOAN_CENTS,
  MIN_LOAN_CENTS,
  parseAmount,
  requestLoan,
  type BankSettings,
  type Loan,
  type RateReasons,
  type ScheduleRow,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { MONEY_KEY, useMoneyAccounts, useRefreshMoney } from "../useMoney";

// There is no rate table here on purpose. The bank publishes no rate card: an
// APR belongs to the customer asking, and the only place it exists is the
// quote the server sends back. A copy kept here would go stale the moment the
// server changed how it works one out.

// Why this customer got this rate. The bank has no rate card, so an offer
// that just appeared as a number would look arbitrary; this says what moved it.
export function RateExplainer({
  rate,
  settings,
}: {
  rate: RateReasons;
  settings: BankSettings | undefined;
}) {
  const reasons: string[] = [];
  if (rate.discountBp > 0) {
    reasons.push(
      `${formatApr(rate.discountBp)} off for your standing: ` +
        `${formatMoney(rate.balanceCents, settings)} with us, ` +
        `${rate.tenureDays} ${rate.tenureDays === 1 ? "day" : "days"} as a customer` +
        (rate.loansApproved > 0
          ? `, ${rate.loansApproved} loan${rate.loansApproved === 1 ? "" : "s"} approved`
          : ""),
    );
  }
  if (rate.exposureBp > 0) {
    reasons.push(
      `${formatApr(rate.exposureBp)} added because this loan is large next to what you hold`,
    );
  }

  return (
    <div className="rate-why" data-testid="quote-why">
      <p className="muted">
        Your rate, not a published one. It starts at {formatApr(rate.termBp)}{" "}
        for this term.
      </p>
      {reasons.length > 0 && (
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <p className="muted">
        Move money in or out and your next offer moves with it.
      </p>
    </div>
  );
}

export function ScheduleTable({
  schedule,
  settings,
  testId,
}: {
  schedule: ScheduleRow[];
  settings: BankSettings | undefined;
  testId: string;
}) {
  return (
    <div className="table-wrap schedule-wrap">
      <table data-testid={testId}>
        <thead>
          <tr>
            <th>Month</th>
            <th className="cell-num">Payment</th>
            <th className="cell-num">Interest</th>
            <th className="cell-num">Principal</th>
            <th className="cell-num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row) => (
            <tr key={row.month} data-testid={`${testId}-row-${row.month}`}>
              <td>{row.month}</td>
              <td className="cell-num cell-mono">
                {formatMoney(row.paymentCents, settings)}
              </td>
              <td className="cell-num cell-mono">
                {formatMoney(row.interestCents, settings)}
              </td>
              <td className="cell-num cell-mono">
                {formatMoney(row.principalCents, settings)}
              </td>
              <td
                className="cell-num cell-mono"
                data-testid={`${testId}-balance-${row.month}`}
              >
                {formatMoney(row.balanceCents, settings)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoanScheduleDialog({
  loan,
  runKey,
  settings,
}: {
  loan: Loan;
  runKey: string;
  settings: BankSettings | undefined;
}) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: [...MONEY_KEY, "loan", loan.id, runKey],
    queryFn: () => getLoan(loan.id, runKey),
    enabled: open,
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="btn btn-sm" data-testid={`loan-schedule-${loan.id}`}>
          Schedule
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-wide"
          data-testid="loan-schedule-dialog"
        >
          <Dialog.Title>
            {formatMoney(loan.amountCents, settings)} over {loan.termMonths}{" "}
            months
          </Dialog.Title>
          <Dialog.Description>
            {formatApr(loan.aprBasisPoints)} a year,{" "}
            {formatMoney(loan.monthlyPaymentCents, settings)} a month.
          </Dialog.Description>
          {detail.isPending && <p className="state">Loading the schedule…</p>}
          {detail.data && (
            <ScheduleTable
              schedule={detail.data.schedule}
              settings={settings}
              testId="loan-schedule-table"
            />
          )}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="btn" data-testid="loan-schedule-close">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Loans: ask for one with a live quote and schedule, then follow it while an
// Admin decides. Approved loans are paid into the account picked here.
export function LoansPage() {
  const runKey = useRunKey();
  const { account: me, user, isLoading } = useBankSession();
  const settings = me?.settings;
  const canChange = Boolean(user && !user.isDemo);
  const accounts = useMoneyAccounts(runKey, Boolean(user));
  const loans = useQuery({
    queryKey: [...MONEY_KEY, "loans", runKey],
    queryFn: () => listLoans(runKey),
    enabled: Boolean(user),
  });
  const refreshMoney = useRefreshMoney();

  const accountList = accounts.data?.accounts ?? [];
  const [amount, setAmount] = useState("10,000");
  const [term, setTerm] = useState(24);
  const [accountId, setAccountId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [sent, setSent] = useState<Loan | null>(null);

  useEffect(() => {
    if (!accountId && accountList.length > 0) setAccountId(accountList[0].id);
  }, [accountList, accountId]);

  // The quote follows the typing, a moment behind it.
  const amountCents = parseAmount(useDeferredValue(amount));
  const amountOk =
    amountCents !== null &&
    amountCents >= MIN_LOAN_CENTS &&
    amountCents <= MAX_LOAN_CENTS;
  const quote = useQuery({
    queryKey: [...MONEY_KEY, "quote", amountCents, term, runKey],
    queryFn: () => loanQuote(amountCents ?? 0, term, runKey),
    enabled: Boolean(user) && amountOk,
  });

  const mutation = useMutation({
    mutationFn: () =>
      requestLoan(
        {
          accountId,
          amountCents: amountCents ?? 0,
          termMonths: term,
          purpose: purpose.trim(),
        },
        runKey,
      ),
    onSuccess: async (result) => {
      await refreshMoney();
      setSent(result.loan);
      setPurpose("");
    },
  });
  const serverErrors = mutation.isError ? fieldErrors(mutation.error) : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    setSent(null);
    if (amountOk && accountId) {
      mutation.mutate();
    }
  }

  return (
    <section data-testid="loans-page" className="page">
      <PageHeader
        eyebrow="Money"
        title="Loans"
        description={
          <p className="page-sub">
            Ask for $1,000 to $1,000,000. An Admin approves or rejects it, and
            the money lands in the account you pick.
          </p>
        }
      />

      {!isLoading && !user && (
        <SignInPrompt next="/bank/loans" title="Log in to see your loans" />
      )}

      {user?.isDemo && (
        <div
          className="callout callout-info demo-note"
          data-testid="loans-demo-note"
        >
          <span>
            Demo accounts can look at their loans, but can't ask for one. Sign
            up for your own account to try it.
          </span>
          <Link
            className="btn btn-primary btn-sm"
            data-testid="loans-demo-signup"
            to="/signup?next=/bank/loans"
          >
            Sign up
          </Link>
        </div>
      )}

      {canChange && accountList.length > 0 && (
        <div className="money-columns">
          <form
            className="card card-pad"
            data-testid="loan-form"
            onSubmit={submit}
            noValidate
          >
            <h2>Ask for a loan</h2>
            <div className="field">
              <label htmlFor="loan-amount">Amount</label>
              <input
                id="loan-amount"
                data-testid="loan-amount"
                inputMode="decimal"
                aria-invalid={!amountOk ? true : undefined}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {(!amountOk || serverErrors.amountCents) && (
                <p role="alert" data-testid="loan-amount-error">
                  {serverErrors.amountCents ?? "Ask for $1,000 to $1,000,000."}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="loan-term">Term</label>
              <select
                id="loan-term"
                data-testid="loan-term"
                value={term}
                onChange={(event) => setTerm(Number(event.target.value))}
              >
                {LOAN_TERMS.map((months) => (
                  <option key={months} value={months}>
                    {months} months
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="loan-account">Pay it into</label>
              <select
                id="loan-account"
                data-testid="loan-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                {accountList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.number}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="loan-purpose">What it's for (optional)</label>
              <input
                id="loan-purpose"
                data-testid="loan-purpose"
                placeholder="Car, kitchen, studies…"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
              />
            </div>
            {mutation.isError && !serverErrors.amountCents && (
              <p role="alert" className="callout" data-testid="loan-error">
                {(mutation.error as Error).message}
              </p>
            )}
            {sent && (
              <p
                className="callout callout-success"
                data-testid="loan-sent"
                role="status"
              >
                Sent. Your request for {formatMoney(sent.amountCents, settings)}{" "}
                is waiting for an Admin.
              </p>
            )}
            <div className="btn-row">
              <button
                className="btn btn-primary"
                type="submit"
                data-testid="loan-submit"
                disabled={mutation.isPending || !amountOk}
              >
                <HandCoins aria-hidden="true" />
                {mutation.isPending ? "Sending…" : "Ask for this loan"}
              </button>
            </div>
          </form>

          <div className="card card-pad" data-testid="loan-quote">
            <h2>What you'd pay</h2>
            {!amountOk && (
              <p className="muted">
                Enter an amount from $1,000 to $1,000,000.
              </p>
            )}
            {amountOk && quote.data && (
              <>
                <p className="balance-total" data-testid="quote-monthly">
                  {formatMoney(quote.data.monthlyPaymentCents, settings)}
                </p>
                <p className="muted">
                  a month for {quote.data.termMonths} months
                </p>
                <dl className="detail-list">
                  <div>
                    <dt>Yearly rate (APR)</dt>
                    <dd data-testid="quote-apr">
                      {formatApr(quote.data.aprBasisPoints)}
                    </dd>
                  </div>
                  <div>
                    <dt>Total interest</dt>
                    <dd data-testid="quote-interest">
                      {formatMoney(quote.data.totalInterestCents, settings)}
                    </dd>
                  </div>
                  <div>
                    <dt>Total you pay back</dt>
                    <dd data-testid="quote-total">
                      {formatMoney(quote.data.totalRepaidCents, settings)}
                    </dd>
                  </div>
                </dl>
                <RateExplainer rate={quote.data.rate} settings={settings} />
                <button
                  type="button"
                  className="btn btn-sm"
                  data-testid="quote-toggle-schedule"
                  aria-expanded={showSchedule}
                  onClick={() => setShowSchedule(!showSchedule)}
                >
                  {showSchedule ? "Hide the schedule" : "See every month"}
                </button>
                {showSchedule && (
                  <ScheduleTable
                    schedule={quote.data.schedule}
                    settings={settings}
                    testId="quote-schedule"
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {user && loans.data && (
        <>
          <div className="section-head">
            <h2>Your loans</h2>
          </div>
          {loans.data.loans.length === 0 ? (
            <p className="empty" data-testid="loans-empty">
              No loans yet.
            </p>
          ) : (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="loans-table">
                  <thead>
                    <tr>
                      <th>Asked (UTC)</th>
                      <th className="cell-num">Amount</th>
                      <th>Term</th>
                      <th className="cell-num">A month</th>
                      <th>Into</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.data.loans.map((loan) => (
                      <tr key={loan.id} data-testid={`loan-row-${loan.id}`}>
                        <td className="cell-mono">
                          {formatUtc(loan.createdAt)}
                        </td>
                        <td className="cell-num cell-mono">
                          {formatMoney(loan.amountCents, settings)}
                        </td>
                        <td>
                          {loan.termMonths} months
                          {loan.purpose && (
                            <span className="cell-sub">{loan.purpose}</span>
                          )}
                        </td>
                        <td className="cell-num cell-mono">
                          {formatMoney(loan.monthlyPaymentCents, settings)}
                        </td>
                        <td className="cell-mono">{loan.accountNumber}</td>
                        <td data-testid={`loan-status-${loan.id}`}>
                          <Badge value={LOAN_STATUS_LABELS[loan.status]} />
                          {loan.decisionNote && (
                            <span className="cell-sub">
                              {loan.decisionNote}
                            </span>
                          )}
                        </td>
                        <td>
                          <LoanScheduleDialog
                            loan={loan}
                            runKey={runKey}
                            settings={settings}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
