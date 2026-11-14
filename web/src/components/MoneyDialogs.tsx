// Two dialogs on the bank pages: Add funds to an account, and Open a new
// account.

// React state, Radix's dialog, the form and its rules (Zod), the data cache and
// the icons.
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { CirclePlus, Wallet } from "lucide-react";
// The bank's money calls, formats and limits, and the money refresh.
import {
  addFunds,
  amountExample,
  fieldErrors,
  formatMoney,
  KIND_LABELS,
  MAX_TOP_UP_CENTS,
  openMoneyAccount,
  parseAmount,
  type AccountKind,
  type BankSettings,
  type MoneyAccount,
} from "../bankApi";
import { useRefreshMoney } from "../useMoney";

// A money amount typed as text, between min and max cents, read in the
// customer's own number format ("1.000,50" in de-DE).
function amountField(min: number, message: string, locale: string) {
  return z.string().refine((value) => {
    const cents = parseAmount(value, false, locale);
    return cents !== null && cents >= min && cents <= MAX_TOP_UP_CENTS;
  }, message);
}

// The quick picks: $1,000, $10,000 and $100,000.
const QUICK_AMOUNTS = [100_000, 1_000_000, 10_000_000];

// Add funds: an amount from 1 cent to the most allowed. Built for the
// customer's settings, so the limits read in their own currency and format.
const addFundsSchemaFor = (settings: BankSettings | undefined) =>
  z.object({
    amount: amountField(
      1,
      `Enter an amount from ${formatMoney(1, settings)} to ${formatMoney(MAX_TOP_UP_CENTS, settings)}.`,
      settings?.locale ?? "en-US",
    ),
  });

// Add funds: practice money, up to $1,000,000 at a time.
export function AddFundsDialog({
  account,
  runKey,
  settings,
}: {
  account: MoneyAccount;
  runKey: string;
  settings: BankSettings | undefined;
}) {
  // Whether the dialog is open, the money refresh, and the form.
  const [open, setOpen] = useState(false);
  const refreshMoney = useRefreshMoney();
  const locale = settings?.locale ?? "en-US";
  const schema = useMemo(() => addFundsSchemaFor(settings), [settings]);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<z.infer<ReturnType<typeof addFundsSchemaFor>>>({
    resolver: zodResolver(schema),
    defaultValues: { amount: "" },
  });

  // Add the money. On success, refresh every balance and close; a field error
  // from the server goes under the field.
  const mutation = useMutation({
    mutationFn: (amount: string) =>
      addFunds(account.id, parseAmount(amount, false, locale) ?? 0, runKey),
    onSuccess: async () => {
      await refreshMoney();
      reset();
      setOpen(false);
    },
    onError: (error) => {
      const message = fieldErrors(error).amountCents;
      if (message) {
        setError("amount", { message });
      }
    },
  });

  // The Add funds button and its dialog; closing it clears the form.
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          mutation.reset();
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="btn btn-sm"
          data-testid={`account-add-funds-${account.id}`}
        >
          <CirclePlus aria-hidden="true" />
          Add funds
        </button>
      </Dialog.Trigger>
      {/* The backdrop and the dialog. */}
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="add-funds-dialog"
        >
          <Dialog.Title>Add funds to {account.name}</Dialog.Title>
          <Dialog.Description>
            Practice money, up to {formatMoney(MAX_TOP_UP_CENTS, settings)} at a
            time. It lands in {account.number} right away.
          </Dialog.Description>
          {/* The form: amount, quick picks, any error, and the buttons. */}
          <form
            data-testid="add-funds-form"
            onSubmit={handleSubmit((values) => mutation.mutate(values.amount))}
            noValidate
          >
            <div className="field">
              <label htmlFor="add-funds-amount">Amount</label>
              <input
                id="add-funds-amount"
                data-testid="add-funds-amount"
                inputMode="decimal"
                placeholder={amountExample(100_000, locale)}
                aria-invalid={errors.amount ? true : undefined}
                {...register("amount")}
              />
              {errors.amount && (
                <p data-testid="add-funds-amount-error" role="alert">
                  {errors.amount.message}
                </p>
              )}
            </div>
            {/* Quick picks fill in the amount. */}
            <div className="chips" role="group" aria-label="Quick amounts">
              {QUICK_AMOUNTS.map((cents) => (
                <button
                  key={cents}
                  type="button"
                  className="chip-btn"
                  data-testid={`add-funds-quick-${cents / 100}`}
                  onClick={() =>
                    setValue("amount", String(cents / 100), {
                      shouldValidate: true,
                    })
                  }
                >
                  {formatMoney(cents, settings)}
                </button>
              ))}
            </div>
            {/* A server error that isn't about the amount. */}
            {mutation.isError && !fieldErrors(mutation.error).amountCents && (
              <p data-testid="add-funds-error" role="alert" className="callout">
                {(mutation.error as Error).message}
              </p>
            )}
            {/* Add funds (locked while adding) and Cancel. */}
            <div className="dialog-actions">
              <button
                data-testid="add-funds-submit"
                className="btn btn-primary"
                type="submit"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Adding…" : "Add funds"}
              </button>
              <Dialog.Close asChild>
                <button type="button" data-testid="add-funds-cancel">
                  Cancel
                </button>
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Open account: checking or savings, an optional name of 2 to 40 characters,
// and a starting amount. Built for the customer's settings, so the limits read
// in their own currency and format.
const openAccountSchemaFor = (settings: BankSettings | undefined) =>
  z.object({
    kind: z.enum(["checking", "savings"]),
    name: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || (value.length >= 2 && value.length <= 40),
        "Name the account in 2 to 40 characters.",
      ),
    amount: amountField(
      0,
      `Enter a starting amount from ${formatMoney(0, settings)} to ${formatMoney(MAX_TOP_UP_CENTS, settings)}.`,
      settings?.locale ?? "en-US",
    ),
  });

// Open a checking or savings account.
export function OpenAccountDialog({
  runKey,
  settings,
}: {
  runKey: string;
  settings?: BankSettings;
}) {
  // Whether the dialog is open, the money refresh, and the form (a savings
  // account starting at 0).
  const [open, setOpen] = useState(false);
  const refreshMoney = useRefreshMoney();
  const locale = settings?.locale ?? "en-US";
  const schema = useMemo(() => openAccountSchemaFor(settings), [settings]);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.infer<ReturnType<typeof openAccountSchemaFor>>>({
    resolver: zodResolver(schema),
    defaultValues: { kind: "savings", name: "", amount: "0" },
  });

  // Open the account. On success, refresh every balance and close; field errors
  // from the server go under their fields.
  const mutation = useMutation({
    mutationFn: (values: z.infer<ReturnType<typeof openAccountSchemaFor>>) =>
      openMoneyAccount(
        {
          kind: values.kind as AccountKind,
          name: values.name || undefined,
          openingCents: parseAmount(values.amount, false, locale) ?? 0,
        },
        runKey,
      ),
    onSuccess: async () => {
      await refreshMoney();
      reset();
      setOpen(false);
    },
    onError: (error) => {
      const errors = fieldErrors(error);
      if (errors.name) setError("name", { message: errors.name });
      if (errors.openingCents) {
        setError("amount", { message: errors.openingCents });
      }
    },
  });

  // The Open account button and its dialog; closing it clears the form.
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          mutation.reset();
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button className="btn" data-testid="bank-open-account">
          <Wallet aria-hidden="true" />
          Open account
        </button>
      </Dialog.Trigger>
      {/* The backdrop and the dialog. */}
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="open-account-dialog"
        >
          <Dialog.Title>Open an account</Dialog.Title>
          <Dialog.Description>
            Pick a type and how much it starts with, up to{" "}
            {formatMoney(MAX_TOP_UP_CENTS, settings)}.
          </Dialog.Description>
          {/* The form: type, name, starting amount, any error, buttons. */}
          <form
            data-testid="open-account-form"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            noValidate
          >
            {/* The type. */}
            <div className="field">
              <label htmlFor="open-account-kind">Type</label>
              <select
                id="open-account-kind"
                data-testid="open-account-kind"
                {...register("kind")}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {/* The name, with its error. */}
            <div className="field">
              <label htmlFor="open-account-name">Name (optional)</label>
              <input
                id="open-account-name"
                data-testid="open-account-name"
                placeholder="Holiday fund"
                aria-invalid={errors.name ? true : undefined}
                {...register("name")}
              />
              {errors.name && (
                <p data-testid="open-account-name-error" role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>
            {/* The starting amount, with its error. */}
            <div className="field">
              <label htmlFor="open-account-amount">Starting amount</label>
              <input
                id="open-account-amount"
                data-testid="open-account-amount"
                inputMode="decimal"
                aria-invalid={errors.amount ? true : undefined}
                {...register("amount")}
              />
              {errors.amount && (
                <p data-testid="open-account-amount-error" role="alert">
                  {errors.amount.message}
                </p>
              )}
            </div>
            {/* A server error that isn't about a field. */}
            {mutation.isError &&
              !fieldErrors(mutation.error).openingCents &&
              !fieldErrors(mutation.error).name && (
                <p
                  data-testid="open-account-error"
                  role="alert"
                  className="callout"
                >
                  {(mutation.error as Error).message}
                </p>
              )}
            {/* Open account (locked while opening) and Cancel. */}
            <div className="dialog-actions">
              <button
                data-testid="open-account-submit"
                className="btn btn-primary"
                type="submit"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Opening…" : "Open account"}
              </button>
              <Dialog.Close asChild>
                <button type="button" data-testid="open-account-cancel">
                  Cancel
                </button>
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
