import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck, Receipt, Trash2, UserPlus } from "lucide-react";
import {
  addPayee,
  deletePayee,
  fieldErrors,
  formatMoney,
  formatUtc,
  listBillPayments,
  listPayees,
  parseAmount,
  payBill,
  type BillPayment,
  type MoneyAccount,
  type Payee,
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
