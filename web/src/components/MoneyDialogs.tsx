import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { CirclePlus, Wallet } from "lucide-react";
import {
  addFunds,
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

// A money amount typed as text, between min and max cents.
function amountField(min: number, message: string) {
  return z.string().refine((value) => {
    const cents = parseAmount(value);
    return cents !== null && cents >= min && cents <= MAX_TOP_UP_CENTS;
  }, message);
}

const QUICK_AMOUNTS = [100_000, 1_000_000, 10_000_000];

const addFundsSchema = z.object({
  amount: amountField(1, "Enter an amount from $0.01 to $1,000,000."),
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
  const [open, setOpen] = useState(false);
  const refreshMoney = useRefreshMoney();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof addFundsSchema>>({
    resolver: zodResolver(addFundsSchema),
    defaultValues: { amount: "" },
  });

  const mutation = useMutation({
    mutationFn: (amount: string) =>
      addFunds(account.id, parseAmount(amount) ?? 0, runKey),
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
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="add-funds-dialog"
        >
          <Dialog.Title>Add funds to {account.name}</Dialog.Title>
          <Dialog.Description>
            Practice money, up to $1,000,000 at a time. It lands in{" "}
            {account.number} right away.
          </Dialog.Description>
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
                placeholder="1,000.00"
                aria-invalid={errors.amount ? true : undefined}
                {...register("amount")}
              />
              {errors.amount && (
                <p data-testid="add-funds-amount-error" role="alert">
                  {errors.amount.message}
                </p>
              )}
            </div>
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
            {mutation.isError && !fieldErrors(mutation.error).amountCents && (
              <p data-testid="add-funds-error" role="alert" className="callout">
                {(mutation.error as Error).message}
              </p>
            )}
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

const openAccountSchema = z.object({
  kind: z.enum(["checking", "savings"]),
  name: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (value.length >= 2 && value.length <= 40),
      "Name the account in 2 to 40 characters.",
    ),
  amount: amountField(0, "Enter a starting amount from $0 to $1,000,000."),
});

export function OpenAccountDialog({ runKey }: { runKey: string }) {
  const [open, setOpen] = useState(false);
  const refreshMoney = useRefreshMoney();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof openAccountSchema>>({
    resolver: zodResolver(openAccountSchema),
    defaultValues: { kind: "savings", name: "", amount: "0" },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof openAccountSchema>) =>
      openMoneyAccount(
        {
          kind: values.kind as AccountKind,
          name: values.name || undefined,
          openingCents: parseAmount(values.amount) ?? 0,
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
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="open-account-dialog"
        >
          <Dialog.Title>Open an account</Dialog.Title>
          <Dialog.Description>
            Pick a type and how much it starts with, up to $1,000,000.
          </Dialog.Description>
          <form
            data-testid="open-account-form"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            noValidate
          >
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
