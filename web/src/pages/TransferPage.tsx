// The Transfer page: fill in the form, check the details, confirm, then see the
// receipt.

// React effects, memo and state, the router, the form and its rules (Zod), the
// data cache and the icons.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftRight, CircleCheck } from "lucide-react";
// The transfer call, formats and field errors.
import {
  amountExample,
  fieldErrors,
  formatMoney,
  formatUtc,
  makeTransfer,
  parseAmount,
  type MoneyAccount,
  type TransferResult,
} from "../bankApi";
// The sign-in card, the page heading, the test's runKey and flags, who is
// signed in, and the money helpers.
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useAppFlags, useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, useMoneyAccounts, useRefreshMoney } from "../useMoney";

// An account number like PB-1234-5678, with its two halves.
const NUMBER = /^PB-?(\d{4})-?(\d{4})$/i;

// Signs and ranges are checked on submit, where the account's balance and the
// planted-bug flags are known. Built for the customer's number format, so
// "250,00" reads as money in de-DE and the hint is written their way.
const schemaFor = (locale: string) =>
  z
    .object({
      // The account to send from, and whether it goes to their own account or
      // someone else's.
      fromAccountId: z.string().min(1, "Pick the account to send from."),
      mode: z.enum(["own", "other"]),
      // Their own account, or another customer's number.
      toAccountId: z.string(),
      toNumber: z.string().trim(),
      // An amount that reads as money (a minus is let through here, and checked
      // on submit).
      amount: z
        .string()
        .refine(
          (value) => parseAmount(value, true, locale) !== null,
          `Enter an amount like ${amountExample(25000, locale)}.`,
        ),
      // An optional memo of up to 140 characters.
      memo: z.string().trim().max(140, "Keep the memo under 140 characters."),
    })
    .superRefine((values, context) => {
      // Their own account needs one picked.
      if (values.mode === "own" && !values.toAccountId) {
        context.addIssue({
          code: "custom",
          path: ["toAccountId"],
          message: "Pick the account to send to.",
        });
      }
      // Another customer's number must look like one.
      if (values.mode === "other" && !NUMBER.test(values.toNumber)) {
        context.addIssue({
          code: "custom",
          path: ["toNumber"],
          message: "Enter an account number like PB-1234-5678.",
        });
      }
    });

// The form's values.
type FormValues = z.infer<ReturnType<typeof schemaFor>>;

// What is sent to the server.
interface TransferInput {
  fromAccountId: string;
  toAccountNumber: string;
  amountCents: number;
  memo: string;
}

// The details shown for checking, with the transfer's key.
interface Review {
  input: TransferInput;
  from: MoneyAccount;
  toLabel: string;
  key: string;
}

// An account number written the bank's way, PB-1234-5678.
function normalizeNumber(value: string): string {
  const match = value.trim().match(NUMBER);
  return match ? `PB-${match[1]}-${match[2]}` : value.trim();
}

// The page: the form, the check step, and the receipt.
export function TransferPage() {
  // The runKey, its flags, the address's ?from=, who is signed in, their
  // settings and accounts.
  const runKey = useRunKey();
  const flags = useAppFlags(runKey);
  const [params] = useSearchParams();
  const { account: me, user, isLoading } = useBankSession();
  const settings = me?.settings;
  const locale = settings?.locale ?? "en-US";
  const schema = useMemo(() => schemaFor(locale), [locale]);
  const accounts = useMoneyAccounts(runKey, Boolean(user));
  const refreshMoney = useRefreshMoney();
  const list = useMemo(() => accounts.data?.accounts ?? [], [accounts.data]);

  // The transfer being checked, and the receipt once it is sent.
  const [review, setReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<{
    result: TransferResult;
    review: Review;
  } | null>(null);

  // The form, checked against the rules.
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fromAccountId: "",
      mode: "own",
      toAccountId: "",
      toNumber: "",
      amount: "",
      memo: "",
    },
  });
  // The mode and the source account, as they change.
  const [mode, fromAccountId] = useWatch({
    control,
    name: ["mode", "fromAccountId"],
  });

  // Start from ?from=<id> when it is one of the accounts, else the first.
  useEffect(() => {
    if (list.length > 0 && !fromAccountId) {
      const wanted = params.get("from");
      setValue(
        "fromAccountId",
        list.some((item) => item.id === wanted)
          ? (wanted as string)
          : list[0].id,
      );
    }
  }, [list, fromAccountId, params, setValue]);

  // The source account, and the other accounts to send to.
  const from = list.find((item) => item.id === fromAccountId);
  const ownTargets = list.filter((item) => item.id !== fromAccountId);

  // Check what the rules can't: the amount against zero and the balance, and a
  // target that isn't the source.
  function toReview(values: FormValues) {
    const source = list.find((item) => item.id === values.fromAccountId);
    if (!source) {
      setError("fromAccountId", { message: "Pick the account to send from." });
      return;
    }
    const cents = parseAmount(values.amount, true, locale) ?? 0;
    // INTENTIONAL DEFECT (bankNegativeTransfer, REPORT): with the flag armed
    // the form only refuses zero, so a minus sign gets through to the server.
    const allowed = flags?.bankNegativeTransfer ? cents !== 0 : cents > 0;
    if (!allowed) {
      setError("amount", { message: "Enter an amount above zero." });
      return;
    }
    if (cents > source.balanceCents) {
      setError("amount", {
        message: `${source.name} holds ${formatMoney(source.balanceCents, settings)}.`,
      });
      return;
    }
    // The target: one of their own accounts, or the number typed.
    const target =
      values.mode === "own"
        ? list.find((item) => item.id === values.toAccountId)
        : undefined;
    const toNumber = target ? target.number : normalizeNumber(values.toNumber);
    if (toNumber === source.number) {
      setError(values.mode === "own" ? "toAccountId" : "toNumber", {
        message: "Pick a different account from the one sending.",
      });
      return;
    }
    // Show the details for checking.
    setReview({
      input: {
        fromAccountId: source.id,
        toAccountNumber: toNumber,
        amountCents: cents,
        memo: values.memo,
      },
      from: source,
      toLabel: target ? `${target.name} · ${target.number}` : toNumber,
      // One key per transfer: a second click, or a retry, sends the same key,
      // and the server moves the money only once.
      key: crypto.randomUUID(),
    });
  }

  // The planted bugs this page reads.
  const doubleSubmit = flags?.bankDoubleSubmit ?? false;
  const staleBalance = flags?.bankStaleBalance ?? false;

  // Send the transfer with its key; refresh the balances, then show the
  // receipt.
  const mutation = useMutation({
    mutationFn: ({ input, key }: { input: TransferInput; key: string }) =>
      makeTransfer(input, key, runKey),
    onSuccess: async (result) => {
      // INTENTIONAL DEFECT (bankStaleBalance, REPORT): skips the refresh, so
      // the overview keeps showing the old balances until the page reloads.
      if (!staleBalance) {
        await refreshMoney();
      }
      setReceipt((current) => current ?? { result, review: review as Review });
    },
  });

  // Send the checked transfer.
  function confirm() {
    if (!review) {
      return;
    }
    // INTENTIONAL DEFECT (bankDoubleSubmit, REPORT): every click makes a new
    // key and the button never disables, so a double-click sends two
    // transfers.
    const key = doubleSubmit ? crypto.randomUUID() : review.key;
    mutation.mutate({ input: review.input, key });
  }

  // Clear everything for a new transfer from the same account.
  function startOver() {
    setReview(null);
    setReceipt(null);
    mutation.reset();
    reset({
      fromAccountId: receipt?.review.from.id ?? "",
      mode: "own",
      toAccountId: "",
      toNumber: "",
      amount: "",
      memo: "",
    });
  }

  // The server's first field message, or its general one.
  const serverMessage = mutation.isError
    ? Object.values(fieldErrors(mutation.error))[0] ||
      (mutation.error as Error).message
    : null;

  // The heading, then the sign-in card, the demo note, and the form, the check
  // step or the receipt.
  return (
    <section data-testid="transfer-page" className="page">
      <PageHeader
        eyebrow="Money"
        title="Transfer"
        description={
          <p className="page-sub">
            Move money between your accounts, or send it to another customer by
            account number.
          </p>
        }
      />

      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt next="/bank/transfer" title="Log in to send money" />
      )}

      {/* A demo account: a note and a Sign up link. */}
      {user?.isDemo && (
        <div
          className="callout callout-info demo-note"
          data-testid="transfer-demo-note"
        >
          <span>
            Demo accounts can't send money, so they stay the same for everyone.
            Sign up for your own account to try transfers.
          </span>
          <Link
            className="btn btn-primary btn-sm"
            data-testid="transfer-demo-signup"
            to="/signup?next=/bank/transfer"
          >
            Sign up
          </Link>
        </div>
      )}

      {/* No accounts yet. */}
      {user && !user.isDemo && accounts.data && list.length === 0 && (
        <p className="empty" data-testid="transfer-no-accounts">
          Open an account first, on the{" "}
          <Link to={bankPath("/bank", runKey)}>Bank page</Link>.
        </p>
      )}

      {/* Step 1, the form: from, to, amount, memo. */}
      {user && !user.isDemo && list.length > 0 && !review && (
        <form
          className="card card-pad form-card"
          data-testid="transfer-form"
          onSubmit={handleSubmit(toReview)}
          noValidate
        >
          <div className="form-grid">
            {/* From, with each account's balance. */}
            <div className="field field-wide">
              <label htmlFor="transfer-from">From</label>
              <select
                id="transfer-from"
                data-testid="transfer-from"
                {...register("fromAccountId")}
              >
                {list.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.number} ·{" "}
                    {formatMoney(item.balanceCents, settings)}
                  </option>
                ))}
              </select>
            </div>

            {/* To: my accounts or another customer. */}
            <div className="field field-wide">
              <span className="field-label" id="transfer-to-label">
                To
              </span>
              <div
                className="segmented"
                role="group"
                aria-labelledby="transfer-to-label"
              >
                <button
                  type="button"
                  data-testid="transfer-to-own"
                  aria-pressed={mode === "own"}
                  onClick={() => setValue("mode", "own")}
                >
                  My accounts
                </button>
                <button
                  type="button"
                  data-testid="transfer-to-other"
                  aria-pressed={mode === "other"}
                  onClick={() => setValue("mode", "other")}
                >
                  Another customer
                </button>
              </div>
            </div>

            {/* The account to send to, or the number typed. */}
            {mode === "own" ? (
              <div className="field field-wide">
                <label htmlFor="transfer-to-account">Account to send to</label>
                <select
                  id="transfer-to-account"
                  data-testid="transfer-to-account"
                  aria-invalid={errors.toAccountId ? true : undefined}
                  {...register("toAccountId")}
                >
                  <option value="">Choose an account</option>
                  {ownTargets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.number}
                    </option>
                  ))}
                </select>
                {errors.toAccountId && (
                  <p data-testid="transfer-to-account-error" role="alert">
                    {errors.toAccountId.message}
                  </p>
                )}
              </div>
            ) : (
              <div className="field field-wide">
                <label htmlFor="transfer-to-number">Account number</label>
                <input
                  id="transfer-to-number"
                  data-testid="transfer-to-number"
                  className="mono"
                  placeholder="PB-1234-5678"
                  autoComplete="off"
                  aria-invalid={errors.toNumber ? true : undefined}
                  {...register("toNumber")}
                />
                {errors.toNumber && (
                  <p data-testid="transfer-to-number-error" role="alert">
                    {errors.toNumber.message}
                  </p>
                )}
              </div>
            )}

            {/* The amount, its error, and what is available. */}
            <div className="field">
              <label htmlFor="transfer-amount">Amount</label>
              <input
                id="transfer-amount"
                data-testid="transfer-amount"
                inputMode="decimal"
                placeholder={amountExample(25000, locale)}
                aria-invalid={errors.amount ? true : undefined}
                {...register("amount")}
              />
              {errors.amount && (
                <p data-testid="transfer-amount-error" role="alert">
                  {errors.amount.message}
                </p>
              )}
              {from && (
                <p className="muted field-hint">
                  Available: {formatMoney(from.balanceCents, settings)}
                </p>
              )}
            </div>

            {/* The memo, with its error. */}
            <div className="field">
              <label htmlFor="transfer-memo">Memo (optional)</label>
              <input
                id="transfer-memo"
                data-testid="transfer-memo"
                placeholder="Rent, savings, a gift…"
                aria-invalid={errors.memo ? true : undefined}
                {...register("memo")}
              />
              {errors.memo && (
                <p data-testid="transfer-memo-error" role="alert">
                  {errors.memo.message}
                </p>
              )}
            </div>
          </div>

          {/* Review transfer, and Cancel. */}
          <div className="btn-row">
            <button
              className="btn btn-primary"
              type="submit"
              data-testid="transfer-review"
            >
              Review transfer
            </button>
            <Link className="btn" to={bankPath("/bank", runKey)}>
              Cancel
            </Link>
          </div>
        </form>
      )}

      {/* Step 2, the check: from, to, amount, memo; Confirm or Back. */}
      {review && !receipt && (
        <div className="card card-pad form-card" data-testid="transfer-summary">
          <h2>Check the details</h2>
          <dl className="detail-list">
            <div>
              <dt>From</dt>
              <dd data-testid="summary-from">
                {review.from.name} · {review.from.number}
              </dd>
            </div>
            <div>
              <dt>To</dt>
              <dd data-testid="summary-to">{review.toLabel}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd data-testid="summary-amount">
                {formatMoney(review.input.amountCents, settings)}
              </dd>
            </div>
            <div>
              <dt>Memo</dt>
              <dd data-testid="summary-memo">
                {review.input.memo || <span className="not-set">None</span>}
              </dd>
            </div>
          </dl>
          {/* The server's answer, when it refuses. */}
          {serverMessage && (
            <p data-testid="transfer-error" role="alert" className="callout">
              {serverMessage}
            </p>
          )}
          <div className="btn-row">
            <button
              className="btn btn-primary"
              data-testid="transfer-confirm"
              disabled={doubleSubmit ? false : mutation.isPending}
              onClick={confirm}
            >
              <ArrowLeftRight aria-hidden="true" />
              {mutation.isPending ? "Sending…" : "Confirm transfer"}
            </button>
            <button
              className="btn"
              data-testid="transfer-back"
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

      {/* Step 3, the receipt: replayed or not, the details, what next. */}
      {receipt && (
        <div className="card card-pad form-card" data-testid="transfer-receipt">
          <div className="receipt-head">
            <CircleCheck aria-hidden="true" />
            <h2>Transfer sent</h2>
          </div>
          {receipt.result.replayed && (
            <p className="callout callout-info" data-testid="receipt-replayed">
              This transfer was already sent, so nothing moved twice.
            </p>
          )}
          <dl className="detail-list">
            <div>
              <dt>Amount</dt>
              <dd data-testid="receipt-amount">
                {formatMoney(receipt.result.transfer.amountCents, settings)}
              </dd>
            </div>
            <div>
              <dt>To</dt>
              <dd data-testid="receipt-to">{receipt.review.toLabel}</dd>
            </div>
            <div>
              <dt>{receipt.review.from.name} now holds</dt>
              <dd data-testid="receipt-from-balance">
                {formatMoney(receipt.result.fromAccount.balanceCents, settings)}
              </dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd className="mono" data-testid="receipt-id">
                {receipt.result.transfer.id}
              </dd>
            </div>
            <div>
              <dt>Time (UTC)</dt>
              <dd className="mono">
                {formatUtc(receipt.result.transfer.createdAt)}
              </dd>
            </div>
          </dl>
          <div className="btn-row">
            <Link
              className="btn btn-primary"
              data-testid="transfer-done"
              to={bankPath("/bank", runKey)}
            >
              Back to Bank
            </Link>
            <button
              className="btn"
              data-testid="transfer-again"
              onClick={startOver}
            >
              Make another transfer
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
