import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck, Receipt, Trash2, UserPlus } from "lucide-react";
import {
  addPayee,
  cancelScheduledPayment,
  createScheduledPayment,
  deletePayee,
  fieldErrors,
  formatMoney,
  formatUtc,
  listBillPayments,
  listPayees,
  listScheduledPayments,
  parseAmount,
  payBill,
  REPEATS,
  weekdayOf,
  type BillPayment,
  type MoneyAccount,
  type Payee,
  type RepeatKind,
  type ScheduledPayment,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import {
  bankPath,
  MONEY_KEY,
  useMoneyAccounts,
  useRefreshMoney,
} from "../useMoney";

interface Review {
  from: MoneyAccount;
  payee: Payee;
  amountCents: number;
  memo: string;
  key: string;
}

// "YYYY-MM-DD" plus a number of days, in UTC, for the schedule form's default.
function plusDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const STATUS_LABELS: Record<ScheduledPayment["status"], string> = {
  active: "Scheduled",
  done: "Paid",
  failed: "Not paid",
  cancelled: "Cancelled",
};

// Scheduled payments: a bill for a date, once or on a repeat, paid on the
// customer's own clock (see the clock card on the Practice page). The list
// shows the scheduled date and, when that is a weekend, the Monday it runs.
function ScheduledPayments({
  runKey,
  accounts,
  payees,
  canChange,
  settings,
}: {
  runKey: string;
  accounts: MoneyAccount[];
  payees: Payee[];
  canChange: boolean;
  settings: Parameters<typeof formatMoney>[1];
}) {
  const refreshMoney = useRefreshMoney();
  const schedules = useQuery({
    queryKey: [...MONEY_KEY, "scheduled", runKey],
    queryFn: () => listScheduledPayments(runKey),
  });
  const today = schedules.data?.today;

  const [fromId, setFromId] = useState("");
  const [payeeId, setPayeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [firstDue, setFirstDue] = useState("");
  const [repeat, setRepeat] = useState<RepeatKind>("once");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!fromId && accounts.length > 0) setFromId(accounts[0].id);
  }, [accounts, fromId]);
  useEffect(() => {
    if (!firstDue && today) setFirstDue(plusDays(today, 1));
  }, [today, firstDue]);
  useEffect(() => {
    if (payeeId && !payees.some((payee) => payee.id === payeeId)) {
      setPayeeId("");
    }
  }, [payees, payeeId]);

  const create = useMutation({
    mutationFn: (input: Parameters<typeof createScheduledPayment>[0]) =>
      createScheduledPayment(input, runKey),
    onSuccess: async () => {
      await refreshMoney();
      setAmount("");
      setMemo("");
      setErrors({});
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelScheduledPayment(id, runKey),
    onSuccess: () => refreshMoney(),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const from = accounts.find((item) => item.id === fromId);
    const payee = payees.find((item) => item.id === payeeId);
    const cents = parseAmount(amount);
    if (!from) next.fromAccountId = "Pick the account to pay from.";
    if (!payee) next.payeeId = "Pick who to pay.";
    if (cents === null || cents <= 0) {
      next.amountCents = "Enter an amount like 120.00.";
    }
    if (!firstDue) next.firstDue = "Pick a date.";
    if (memo.trim().length > 140) {
      next.memo = "Keep the memo under 140 characters.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !from || !payee || cents === null) {
      return;
    }
    create.mutate({
      fromAccountId: from.id,
      payeeId: payee.id,
      amountCents: cents,
      memo: memo.trim(),
      repeat,
      firstDue,
    });
  }

  const rows = schedules.data?.payments ?? [];

  return (
    <>
      <div className="section-head">
        <h2>Scheduled payments</h2>
        {today && (
          <p className="muted" data-testid="sched-today">
            Today for you is {today} ·{" "}
            <Link to={bankPath("/practice", runKey)}>move your clock</Link>
          </p>
        )}
      </div>

      {canChange && (
        <div className="card card-pad" data-testid="sched-card">
          {payees.length === 0 ? (
            <p className="muted" data-testid="sched-needs-payee">
              Save a payee first, then you can schedule a payment to them.
            </p>
          ) : (
            <form data-testid="sched-form" onSubmit={submit} noValidate>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="sched-from">From</label>
                  <select
                    id="sched-from"
                    data-testid="sched-from"
                    value={fromId}
                    onChange={(event) => setFromId(event.target.value)}
                  >
                    {accounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {formatMoney(item.balanceCents, settings)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sched-payee">To</label>
                  <select
                    id="sched-payee"
                    data-testid="sched-payee"
                    value={payeeId}
                    onChange={(event) => setPayeeId(event.target.value)}
                  >
                    <option value="">Pick a payee</option>
                    {payees.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.reference}
                      </option>
                    ))}
                  </select>
                  {errors.payeeId && (
                    <p role="alert" data-testid="sched-payee-error">
                      {errors.payeeId}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="sched-amount">Amount</label>
                  <input
                    id="sched-amount"
                    data-testid="sched-amount"
                    inputMode="decimal"
                    placeholder="120.00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  {errors.amountCents && (
                    <p role="alert" data-testid="sched-amount-error">
                      {errors.amountCents}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="sched-date">First date</label>
                  <input
                    id="sched-date"
                    data-testid="sched-date"
                    type="date"
                    min={today}
                    value={firstDue}
                    onChange={(event) => setFirstDue(event.target.value)}
                  />
                  {errors.firstDue && (
                    <p role="alert" data-testid="sched-date-error">
                      {errors.firstDue}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="sched-repeat">Repeat</label>
                  <select
                    id="sched-repeat"
                    data-testid="sched-repeat"
                    value={repeat}
                    onChange={(event) =>
                      setRepeat(event.target.value as RepeatKind)
                    }
                  >
                    {REPEATS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sched-memo">Memo (optional)</label>
                  <input
                    id="sched-memo"
                    data-testid="sched-memo"
                    value={memo}
                    onChange={(event) => setMemo(event.target.value)}
                  />
                  {errors.memo && (
                    <p role="alert" data-testid="sched-memo-error">
                      {errors.memo}
                    </p>
                  )}
                </div>
              </div>
              <p className="muted">
                A payment due on a Saturday or Sunday is paid on the Monday
                after. It runs when your day reaches it.
              </p>
              {create.isError && Object.keys(errors).length === 0 && (
                <p role="alert" className="callout" data-testid="sched-error">
                  {(create.error as Error).message}
                </p>
              )}
              <div className="btn-row">
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="sched-add"
                  disabled={create.isPending}
                >
                  {create.isPending ? "Scheduling…" : "Schedule payment"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {schedules.data && rows.length === 0 && (
        <p className="empty" data-testid="sched-empty">
          Nothing scheduled.
        </p>
      )}
      {rows.length > 0 && (
        <div className="card table-card">
          <div className="table-wrap">
            <table data-testid="sched-table">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Next date</th>
                  <th>Repeat</th>
                  <th>Status</th>
                  <th className="cell-num">Amount</th>
                  {canChange && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    data-testid={`sched-row-${row.id}`}
                    data-status={row.status}
                  >
                    <td>
                      {row.payeeName}
                      <span className="cell-sub">
                        {row.memo || row.payeeReference}
                      </span>
                    </td>
                    <td className="cell-mono">
                      {row.status === "active" ? (
                        <>
                          {row.nextDue}
                          <span className="cell-sub">
                            {weekdayOf(row.nextDue)}
                            {row.runsOn !== row.nextDue &&
                              ` · runs ${weekdayOf(row.runsOn)} ${row.runsOn}`}
                          </span>
                        </>
                      ) : (
                        <>
                          {row.lastRunOn ?? "—"}
                          {row.runs > 0 && (
                            <span className="cell-sub">
                              {row.runs} {row.runs === 1 ? "run" : "runs"}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {REPEATS.find((option) => option.value === row.repeat)
                        ?.label ?? row.repeat}
                      {row.repeat !== "once" && row.runs > 0 && (
                        <span className="cell-sub">{row.runs} paid so far</span>
                      )}
                    </td>
                    <td data-testid={`sched-status-${row.id}`}>
                      {STATUS_LABELS[row.status]}
                    </td>
                    <td className="cell-num">
                      <span className="amount amount-out">
                        {formatMoney(-row.amountCents, settings)}
                      </span>
                    </td>
                    {canChange && (
                      <td className="cell-num">
                        {row.status === "active" && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            data-testid={`sched-cancel-${row.id}`}
                            disabled={cancel.isPending}
                            onClick={() => cancel.mutate(row.id)}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function DeletePayeeButton({
  payee,
  runKey,
}: {
  payee: Payee;
  runKey: string;
}) {
  const [open, setOpen] = useState(false);
  const refreshMoney = useRefreshMoney();
  const mutation = useMutation({
    mutationFn: () => deletePayee(payee.id, runKey),
    onSuccess: async () => {
      await refreshMoney();
      setOpen(false);
    },
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="btn btn-sm"
          data-testid={`payee-delete-${payee.id}`}
          aria-label={`Delete ${payee.name}`}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="payee-delete-dialog"
        >
          <Dialog.Title>Delete {payee.name}?</Dialog.Title>
          <Dialog.Description>
            Past payments to {payee.name} stay in your history.
          </Dialog.Description>
          {mutation.isError && (
            <p
              role="alert"
              className="callout"
              data-testid="payee-delete-error"
            >
              {(mutation.error as Error).message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="btn btn-primary"
              data-testid="payee-delete-confirm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Deleting…" : "Delete payee"}
            </button>
            <Dialog.Close asChild>
              <button type="button" data-testid="payee-delete-cancel">
                Cancel
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddPayeeForm({ runKey }: { runKey: string }) {
  const refreshMoney = useRefreshMoney();
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const mutation = useMutation({
    mutationFn: () => addPayee({ name, reference }, runKey),
    onSuccess: async () => {
      await refreshMoney();
      setName("");
      setReference("");
    },
  });
  const errors = mutation.isError ? fieldErrors(mutation.error) : {};
  const other =
    mutation.isError && !errors.name && !errors.reference
      ? (mutation.error as Error).message
      : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="payee-form" data-testid="payee-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="payee-name">Payee name</label>
        <input
          id="payee-name"
          data-testid="payee-name"
          placeholder="City Power"
          aria-invalid={errors.name ? true : undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {errors.name && (
          <p role="alert" data-testid="payee-name-error">
            {errors.name}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="payee-reference">Their reference</label>
        <input
          id="payee-reference"
          data-testid="payee-reference"
          className="mono"
          placeholder="ACC-100234"
          aria-invalid={errors.reference ? true : undefined}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
        {errors.reference && (
          <p role="alert" data-testid="payee-reference-error">
            {errors.reference}
          </p>
        )}
      </div>
      {other && (
        <p role="alert" className="callout" data-testid="payee-error">
          {other}
        </p>
      )}
      <div className="btn-row">
        <button
          className="btn"
          type="submit"
          data-testid="payee-add"
          disabled={mutation.isPending}
        >
          <UserPlus aria-hidden="true" />
          {mutation.isPending ? "Saving…" : "Save payee"}
        </button>
      </div>
    </form>
  );
}

// Bill pay: saved payees, a payment with a review step and a receipt, and the
// latest payments.
export function BillPayPage() {
  const runKey = useRunKey();
  const { account: me, user, isLoading } = useBankSession();
  const settings = me?.settings;
  const canChange = Boolean(user && !user.isDemo);
  const accounts = useMoneyAccounts(runKey, Boolean(user));
  const payees = useQuery({
    queryKey: [...MONEY_KEY, "payees", runKey],
    queryFn: () => listPayees(runKey),
    enabled: Boolean(user),
  });
  const payments = useQuery({
    queryKey: [...MONEY_KEY, "bill-payments", runKey],
    queryFn: () => listBillPayments(runKey),
    enabled: Boolean(user),
  });
  const refreshMoney = useRefreshMoney();

  const accountList = accounts.data?.accounts ?? [];
  const payeeList = payees.data?.payees ?? [];
  const [fromId, setFromId] = useState("");
  const [payeeId, setPayeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<{
    payment: BillPayment;
    fromAccount: MoneyAccount;
  } | null>(null);

  useEffect(() => {
    if (!fromId && accountList.length > 0) setFromId(accountList[0].id);
  }, [accountList, fromId]);
  useEffect(() => {
    if (payeeId && !payeeList.some((payee) => payee.id === payeeId)) {
      setPayeeId("");
    }
  }, [payeeList, payeeId]);

  const mutation = useMutation({
    mutationFn: (current: Review) =>
      payBill(
        {
          fromAccountId: current.from.id,
          payeeId: current.payee.id,
          amountCents: current.amountCents,
          memo: current.memo,
        },
        current.key,
        runKey,
      ),
    onSuccess: async (result) => {
      await refreshMoney();
      setReceipt({ payment: result.payment, fromAccount: result.fromAccount });
    },
  });

  function toReview(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const from = accountList.find((item) => item.id === fromId);
    const payee = payeeList.find((item) => item.id === payeeId);
    const cents = parseAmount(amount);
    if (!from) next.from = "Pick the account to pay from.";
    if (!payee) next.payee = "Pick who to pay.";
    if (cents === null || cents <= 0) {
      next.amount = "Enter an amount like 120.00.";
    } else if (from && cents > from.balanceCents) {
      next.amount = `${from.name} holds ${formatMoney(from.balanceCents, settings)}.`;
    }
    if (memo.trim().length > 140) {
      next.memo = "Keep the memo under 140 characters.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !from || !payee || cents === null) {
      return;
    }
    setReview({
      from,
      payee,
      amountCents: cents,
      memo: memo.trim(),
      key: crypto.randomUUID(),
    });
  }

  function startOver() {
    setReview(null);
    setReceipt(null);
    setAmount("");
    setMemo("");
    mutation.reset();
  }

  return (
    <section data-testid="bills-page" className="page">
      <PageHeader
        eyebrow="Money"
        title="Bill pay"
        description={
          <p className="page-sub">
            Save the people you pay, then pay a bill from any of your accounts.
          </p>
        }
      />

      {!isLoading && !user && (
        <SignInPrompt next="/bank/bills" title="Log in to pay bills" />
      )}

      {user?.isDemo && (
        <div
          className="callout callout-info demo-note"
          data-testid="bills-demo-note"
        >
          <span>
            Demo accounts can look at their payees and payments, but can't pay
            or change anything. Sign up for your own account to pay bills.
          </span>
          <Link
            className="btn btn-primary btn-sm"
            data-testid="bills-demo-signup"
            to="/signup?next=/bank/bills"
          >
            Sign up
          </Link>
        </div>
      )}

      {user && (
        <div className="money-columns">
          <div className="card card-pad" data-testid="payees-card">
            <h2>Payees</h2>
            {payees.data && payeeList.length === 0 && (
              <p className="muted" data-testid="payees-empty">
                No payees yet. Save one below.
              </p>
            )}
            {payeeList.length > 0 && (
              <ul className="mini-list" data-testid="payees-list">
                {payeeList.map((payee) => (
                  <li key={payee.id} data-testid={`payee-row-${payee.id}`}>
                    <span>
                      {payee.name}{" "}
                      <span className="mono muted">{payee.reference}</span>
                    </span>
                    {canChange && (
                      <DeletePayeeButton payee={payee} runKey={runKey} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canChange && <AddPayeeForm runKey={runKey} />}
          </div>

          <div className="card card-pad" data-testid="pay-card">
            <h2>Pay a bill</h2>
            {!canChange && (
              <p className="muted">Sign up for your own account to pay.</p>
            )}
            {canChange && payeeList.length === 0 && payees.data && (
              <p className="muted" data-testid="pay-needs-payee">
                Save a payee first.
              </p>
            )}
            {canChange && payeeList.length > 0 && !review && (
              <form data-testid="pay-form" onSubmit={toReview} noValidate>
                <div className="field">
                  <label htmlFor="pay-from">From</label>
                  <select
                    id="pay-from"
                    data-testid="pay-from"
                    value={fromId}
                    onChange={(event) => setFromId(event.target.value)}
                  >
                    {accountList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.number} ·{" "}
                        {formatMoney(item.balanceCents, settings)}
                      </option>
                    ))}
                  </select>
                  {errors.from && <p role="alert">{errors.from}</p>}
                </div>
                <div className="field">
                  <label htmlFor="pay-payee">Pay to</label>
                  <select
                    id="pay-payee"
                    data-testid="pay-payee"
                    aria-invalid={errors.payee ? true : undefined}
                    value={payeeId}
                    onChange={(event) => setPayeeId(event.target.value)}
                  >
                    <option value="">Choose a payee</option>
                    {payeeList.map((payee) => (
                      <option key={payee.id} value={payee.id}>
                        {payee.name} · {payee.reference}
                      </option>
                    ))}
                  </select>
                  {errors.payee && (
                    <p role="alert" data-testid="pay-payee-error">
                      {errors.payee}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="pay-amount">Amount</label>
                  <input
                    id="pay-amount"
                    data-testid="pay-amount"
                    inputMode="decimal"
                    placeholder="120.00"
                    aria-invalid={errors.amount ? true : undefined}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  {errors.amount && (
                    <p role="alert" data-testid="pay-amount-error">
                      {errors.amount}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="pay-memo">Memo (optional)</label>
                  <input
                    id="pay-memo"
                    data-testid="pay-memo"
                    placeholder="October bill"
                    value={memo}
                    onChange={(event) => setMemo(event.target.value)}
                  />
                  {errors.memo && <p role="alert">{errors.memo}</p>}
                </div>
                <div className="btn-row">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    data-testid="pay-review"
                  >
                    Review payment
                  </button>
                </div>
              </form>
            )}

            {review && !receipt && (
              <div data-testid="pay-summary">
                <dl className="detail-list">
                  <div>
                    <dt>From</dt>
                    <dd>
                      {review.from.name} · {review.from.number}
                    </dd>
                  </div>
                  <div>
                    <dt>To</dt>
                    <dd data-testid="pay-summary-payee">
                      {review.payee.name} · {review.payee.reference}
                    </dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd data-testid="pay-summary-amount">
                      {formatMoney(review.amountCents, settings)}
                    </dd>
                  </div>
                </dl>
                {mutation.isError && (
                  <p role="alert" className="callout" data-testid="pay-error">
                    {(mutation.error as Error).message}
                  </p>
                )}
                <div className="btn-row">
                  <button
                    className="btn btn-primary"
                    data-testid="pay-confirm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(review)}
                  >
                    <Receipt aria-hidden="true" />
                    {mutation.isPending ? "Paying…" : "Pay bill"}
                  </button>
                  <button
                    className="btn"
                    data-testid="pay-back"
                    disabled={mutation.isPending}
                    onClick={() => {
                      setReview(null);
                      mutation.reset();
                    }}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {receipt && (
              <div data-testid="pay-receipt">
                <div className="receipt-head">
                  <CircleCheck aria-hidden="true" />
                  <h3>Bill paid</h3>
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>Paid</dt>
                    <dd data-testid="pay-receipt-amount">
                      {formatMoney(receipt.payment.amountCents, settings)} to{" "}
                      {receipt.payment.payeeName}
                    </dd>
                  </div>
                  <div>
                    <dt>{receipt.fromAccount.name} now holds</dt>
                    <dd data-testid="pay-receipt-balance">
                      {formatMoney(receipt.fromAccount.balanceCents, settings)}
                    </dd>
                  </div>
                </dl>
                <div className="btn-row">
                  <button
                    className="btn btn-primary"
                    data-testid="pay-again"
                    onClick={startOver}
                  >
                    Pay another bill
                  </button>
                  <Link className="btn" to={bankPath("/bank", runKey)}>
                    Back to Bank
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {user && (
        <ScheduledPayments
          runKey={runKey}
          accounts={accountList}
          payees={payeeList}
          canChange={canChange}
          settings={settings}
        />
      )}

      {user && payments.data && (
        <>
          <div className="section-head">
            <h2>Recent payments</h2>
          </div>
          {payments.data.payments.length === 0 ? (
            <p className="empty" data-testid="payments-empty">
              No bills paid yet.
            </p>
          ) : (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="payments-table">
                  <thead>
                    <tr>
                      <th>Date (UTC)</th>
                      <th>Payee</th>
                      <th>Memo</th>
                      <th className="cell-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.data.payments.map((row) => (
                      <tr key={row.id} data-testid={`payment-row-${row.id}`}>
                        <td className="cell-mono">
                          {formatUtc(row.createdAt)}
                        </td>
                        <td>
                          {row.payeeName}
                          <span className="cell-sub">{row.payeeReference}</span>
                        </td>
                        <td>{row.memo}</td>
                        <td className="cell-num">
                          <span className="amount amount-out">
                            {formatMoney(-row.amountCents, settings)}
                          </span>
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
