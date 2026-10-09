import { useEffect, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
  CURRENCIES,
  LOCALES,
  updateSettings,
  type BankSettings,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useBankSession, useSetBankAccount } from "../useBankSession";

const SAMPLE_DATE = "2026-03-14T12:00:00Z";
const SAMPLE_AMOUNT = 1234.5;

// Shows how dates and money will look with the chosen settings.
function Preview({ control }: { control: Control<BankSettings> }) {
  const [currency, locale] = useWatch({
    control,
    name: ["currency", "locale"],
  });
  if (!currency || !locale) {
    return null;
  }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(SAMPLE_DATE),
  );
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(SAMPLE_AMOUNT);
  return (
    <p className="settings-preview" data-testid="settings-preview">
      Dates look like <strong>{date}</strong>, and amounts like{" "}
      <strong>{amount}</strong>.
    </p>
  );
}

export function SettingsPage() {
  const { account, isLoading } = useBankSession();
  const setAccount = useSetBankAccount();
  const [saved, setSaved] = useState(false);

  const { register, handleSubmit, reset, control } = useForm<BankSettings>();

  useEffect(() => {
    if (account) {
      reset(account.settings);
    }
  }, [account, reset]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (updated) => {
      setAccount(updated);
      setSaved(true);
    },
  });

  return (
    <section data-testid="settings-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Settings"
        description={
          <p className="page-sub">
            How Playground Bank shows money and dates, and what it emails you.
          </p>
        }
      />

      {!isLoading && !account && (
        <SignInPrompt next="/settings" title="Log in to change your settings" />
      )}

      {account && (
        <form
          data-testid="settings-form"
          className="card card-pad form-card"
          onSubmit={handleSubmit((values) => {
            setSaved(false);
            mutation.mutate(values);
          })}
        >
          <h2 className="form-section">Display</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="settings-currency">Currency</label>
              <select
                id="settings-currency"
                data-testid="settings-currency"
                {...register("currency")}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-locale">Language and date format</label>
              <select
                id="settings-locale"
                data-testid="settings-locale"
                {...register("locale")}
              >
                {LOCALES.map((locale) => (
                  <option key={locale.value} value={locale.value}>
                    {locale.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Preview control={control} />

          <h2 className="form-section">Emails</h2>
          <label className="check-field" htmlFor="settings-email-alerts">
            <input
              id="settings-email-alerts"
              data-testid="settings-email-alerts"
              type="checkbox"
              {...register("emailAlerts")}
            />
            <span>Email me when money moves in or out of my accounts.</span>
          </label>
          <label className="check-field" htmlFor="settings-statement-emails">
            <input
              id="settings-statement-emails"
              data-testid="settings-statement-emails"
              type="checkbox"
              {...register("statementEmails")}
            />
            <span>Email me a monthly statement.</span>
          </label>

          {saved && (
            <p className="callout callout-success" data-testid="settings-saved">
              Settings saved.
            </p>
          )}
          {mutation.isError && (
            <p data-testid="settings-error" role="alert" className="callout">
              {(mutation.error as Error).message}
            </p>
          )}

          <div className="btn-row">
            <button
              data-testid="settings-save"
              className="btn btn-primary"
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
