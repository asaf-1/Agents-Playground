// The Settings page: currency, number and date format, and email choices, with
// a live preview.

// React state and effects, the form, and the data cache.
import { useEffect, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
// The currencies, formats and the save call.
import {
  CURRENCIES,
  LOCALES,
  updateSettings,
  type BankSettings,
} from "../bankApi";
// The sign-in card, the page heading, and who is signed in.
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useBankSession, useSetBankAccount } from "../useBankSession";

// The sample date and amount the preview formats.
const SAMPLE_DATE = "2026-03-14T12:00:00Z";
const SAMPLE_AMOUNT = 1234.5;

// Shows how dates and money will look with the chosen settings.
function Preview({ control }: { control: Control<BankSettings> }) {
  // The currency and format picked, as they change.
  const [currency, locale] = useWatch({
    control,
    name: ["currency", "locale"],
  });
  // Nothing picked yet: no preview.
  if (!currency || !locale) {
    return null;
  }
  // The sample date and amount in those choices.
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
  // Who is signed in, the way to store the account, and whether it was just
  // saved.
  const { account, isLoading } = useBankSession();
  const setAccount = useSetBankAccount();
  const [saved, setSaved] = useState(false);

  // The form.
  const { register, handleSubmit, reset, control } = useForm<BankSettings>();

  // Fill the form with the saved settings once they arrive.
  useEffect(() => {
    if (account) {
      reset(account.settings);
    }
  }, [account, reset]);

  // Save; on success, store the new account and say so.
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (updated) => {
      setAccount(updated);
      setSaved(true);
    },
  });

  // The heading, then the sign-in card or the form.
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

      {/* Signed out: the sign-in card. */}
      {!isLoading && !account && (
        <SignInPrompt next="/settings" title="Log in to change your settings" />
      )}

      {/* The form: display, the preview, emails, and Save. */}
      {account && (
        <form
          data-testid="settings-form"
          className="card card-pad form-card"
          onSubmit={handleSubmit((values) => {
            setSaved(false);
            mutation.mutate(values);
          })}
        >
          {/* Display: currency and format. */}
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
          {/* How it will look. */}
          <Preview control={control} />

          {/* Emails. */}
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

          {/* Saved, or what went wrong. */}
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

          {/* Save. */}
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
