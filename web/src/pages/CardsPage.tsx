// The Cards page: a virtual card per account, with freeze, a daily limit,
// paying a merchant, and its purchases.

// React state, the router's link, the data cache and the icons.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Snowflake } from "lucide-react";
// The card calls, merchants, formats and types.
import {
  cardDetails,
  chargeCard,
  createCard,
  fieldErrors,
  formatMoney,
  formatUtc,
  listCardCharges,
  listCards,
  MERCHANTS,
  parseAmount,
  updateCard,
  type BankCard,
  type BankSettings,
  type CardCharge,
  type MoneyAccount,
} from "../bankApi";
// The sign-in card, the page heading, the test's runKey and who is signed in.
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
// The money helpers.
import {
  bankPath,
  MONEY_KEY,
  useMoneyAccounts,
  useRefreshMoney,
} from "../useMoney";

// Cards: one virtual debit card per account. Freeze it, set its daily limit,
// pay a simulated merchant with it, and read its purchases. The number and
// the CVV are shown only on request, never in the list.

// The card's status in words: Active, Frozen, or Frozen by the bank.
function statusLabel(card: BankCard): string {
  if (card.status === "active") return "Active";
  return card.frozenBy === "admin" ? "Frozen by the bank" : "Frozen";
}

// One card: its number, status, limit, buttons, details, forms, the last
// payment's result, and its purchases.
function CardPanel({
  card,
  runKey,
  settings,
  canChange,
}: {
  card: BankCard;
  runKey: string;
  settings: BankSettings | undefined;
  canChange: boolean;
}) {
  // The money refresh, and the panel's state: details shown, the two forms'
  // fields and errors, and the last payment.
  const refreshMoney = useRefreshMoney();
  const [showDetails, setShowDetails] = useState(false);
  const [limit, setLimit] = useState("");
  const [limitError, setLimitError] = useState("");
  const [merchant, setMerchant] = useState(MERCHANTS[0]);
  const [amount, setAmount] = useState("");
  const [spendError, setSpendError] = useState("");
  const [result, setResult] = useState<CardCharge | null>(null);

  // The full details, only once asked for.
  const details = useQuery({
    queryKey: [...MONEY_KEY, "card-details", card.id, runKey],
    queryFn: () => cardDetails(card.id, runKey),
    enabled: showDetails,
  });
  // The card's purchases.
  const charges = useQuery({
    queryKey: [...MONEY_KEY, "card-charges", card.id, runKey],
    queryFn: () => listCardCharges(card.id, runKey),
  });

  // Freeze an active card, or unfreeze a frozen one.
  const freeze = useMutation({
    mutationFn: () =>
      updateCard(
        card.id,
        { status: card.status === "active" ? "frozen" : "active" },
        runKey,
      ),
    onSuccess: () => refreshMoney(),
  });
  // Save a daily limit; a problem with it goes under the field.
  const saveLimit = useMutation({
    mutationFn: (limitCents: number) =>
      updateCard(card.id, { limitCents }, runKey),
    onSuccess: async () => {
      await refreshMoney();
      setLimit("");
      setLimitError("");
    },
    onError: (error) =>
      setLimitError(fieldErrors(error).limitCents ?? (error as Error).message),
  });
  // Pay a merchant; the answer says approved or declined, and why.
  const spend = useMutation({
    mutationFn: (amountCents: number) =>
      chargeCard(card.id, { merchant, amountCents }, runKey),
    onSuccess: async (answer) => {
      await refreshMoney();
      setResult(answer.charge);
      setAmount("");
      setSpendError("");
    },
    onError: (error) =>
      setSpendError(
        fieldErrors(error).amountCents ??
          fieldErrors(error).merchant ??
          (error as Error).message,
      ),
  });

  // Check the limit here first (at least 1.00), then save it.
  function submitLimit(event: FormEvent) {
    event.preventDefault();
    const cents = parseAmount(limit);
    if (cents === null || cents < 100) {
      setLimitError("Enter a daily limit of at least 1.00.");
      return;
    }
    saveLimit.mutate(cents);
  }

  // Check the amount here first, then pay.
  function submitSpend(event: FormEvent) {
    event.preventDefault();
    const cents = parseAmount(amount);
    if (cents === null || cents <= 0) {
      setSpendError("Enter an amount like 24.50.");
      return;
    }
    setResult(null);
    spend.mutate(cents);
  }

  // Frozen by the bank: the customer can't unfreeze it.
  const bankFrozen = card.status === "frozen" && card.frozenBy === "admin";
  // The purchases to list.
  const rows = charges.data?.charges ?? [];

  // The card, then its controls and purchases.
  return (
    <div
      className={`card card-pad bank-card ${card.status === "frozen" ? "is-frozen" : ""}`}
      data-testid={`card-${card.id}`}
      data-status={card.status}
    >
      {/* The account, the masked number, and the status. */}
      <div className="bank-card-head">
        <div>
          <p className="eyebrow">
            <CreditCard aria-hidden="true" /> {card.accountName} ·{" "}
            <span className="mono">{card.accountNumber}</span>
          </p>
          <p
            className="bank-card-number mono"
            data-testid={`card-masked-${card.id}`}
          >
            •••• •••• •••• {card.last4}
          </p>
        </div>
        <span
          className={`badge ${card.status === "active" ? "badge-success" : "badge-warning"}`}
          data-testid={`card-status-${card.id}`}
        >
          {statusLabel(card)}
        </span>
      </div>

      {/* The daily limit, spent today, and the expiry. */}
      <p className="muted" data-testid={`card-limit-${card.id}`}>
        Daily limit {formatMoney(card.limitCents, settings)} · spent today{" "}
        <span data-testid={`card-spent-${card.id}`}>
          {formatMoney(card.spentTodayCents, settings)}
        </span>
        {" · "}expires {card.expires}
      </p>

      {/* Show details, and Freeze or Unfreeze. */}
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-sm"
          data-testid={`card-details-${card.id}`}
          onClick={() => setShowDetails((was) => !was)}
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
        {canChange && (
          <button
            type="button"
            className="btn btn-sm"
            data-testid={`card-freeze-${card.id}`}
            disabled={freeze.isPending || bankFrozen}
            onClick={() => freeze.mutate()}
          >
            <Snowflake aria-hidden="true" />{" "}
            {card.status === "active" ? "Freeze" : "Unfreeze"}
          </button>
        )}
      </div>
      {/* Frozen by the bank, or a failed freeze. */}
      {bankFrozen && (
        <p className="callout" data-testid={`card-bank-frozen-${card.id}`}>
          The bank froze this card. Only the bank can unfreeze it.
        </p>
      )}
      {freeze.isError && (
        <p
          role="alert"
          className="callout"
          data-testid={`card-freeze-error-${card.id}`}
        >
          {(freeze.error as Error).message}
        </p>
      )}

      {/* The full number, expiry and CVV, when shown. */}
      {showDetails && details.data && (
        <dl
          className="detail-list bank-card-details"
          data-testid={`card-details-panel-${card.id}`}
        >
          <div>
            <dt>Number</dt>
            <dd className="mono" data-testid={`card-number-${card.id}`}>
              {details.data.number}
            </dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd className="mono" data-testid={`card-expires-${card.id}`}>
              {details.data.expires}
            </dd>
          </div>
          <div>
            <dt>CVV</dt>
            <dd className="mono" data-testid={`card-cvv-${card.id}`}>
              {details.data.cvv}
            </dd>
          </div>
        </dl>
      )}

      {/* The two forms: the daily limit, and paying a merchant. */}
      {canChange && (
        <div className="form-grid bank-card-forms">
          {/* The daily limit, with its error. */}
          <form
            onSubmit={submitLimit}
            noValidate
            data-testid={`card-limit-form-${card.id}`}
          >
            <div className="field">
              <label htmlFor={`limit-${card.id}`}>Daily limit</label>
              <input
                id={`limit-${card.id}`}
                data-testid={`card-limit-input-${card.id}`}
                inputMode="decimal"
                placeholder={(card.limitCents / 100).toFixed(2)}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
              {limitError && (
                <p role="alert" data-testid={`card-limit-error-${card.id}`}>
                  {limitError}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-sm"
              data-testid={`card-limit-save-${card.id}`}
              disabled={saveLimit.isPending}
            >
              Set limit
            </button>
          </form>

          {/* Pay a merchant an amount, with its error. */}
          <form
            onSubmit={submitSpend}
            noValidate
            data-testid={`spend-form-${card.id}`}
          >
            <div className="field">
              <label htmlFor={`merchant-${card.id}`}>Pay</label>
              <select
                id={`merchant-${card.id}`}
                data-testid={`spend-merchant-${card.id}`}
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
              >
                {MERCHANTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`amount-${card.id}`}>Amount</label>
              <input
                id={`amount-${card.id}`}
                data-testid={`spend-amount-${card.id}`}
                inputMode="decimal"
                placeholder="24.50"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {spendError && (
                <p role="alert" data-testid={`spend-error-${card.id}`}>
                  {spendError}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              data-testid={`spend-submit-${card.id}`}
              disabled={spend.isPending}
            >
              {spend.isPending ? "Paying…" : "Pay with card"}
            </button>
          </form>
        </div>
      )}

      {/* The last payment: approved, or declined and why. */}
      {result && (
        <p
          className={`callout ${result.status === "approved" ? "callout-success" : ""}`}
          data-testid={`spend-result-${card.id}`}
          data-status={result.status}
        >
          {result.status === "approved"
            ? `Approved: ${formatMoney(result.amountCents, settings)} at ${result.merchant}.`
            : `Declined: ${result.reasonText} (${formatMoney(result.amountCents, settings)} at ${result.merchant})`}
        </p>
      )}

      {/* The card's purchases. */}
      <h3 className="dialog-subhead">Purchases</h3>
      {charges.data && rows.length === 0 && (
        <p className="muted" data-testid={`charges-empty-${card.id}`}>
          No purchases yet.
        </p>
      )}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table data-testid={`charges-${card.id}`}>
            <thead>
              <tr>
                <th>When (UTC)</th>
                <th>Merchant</th>
                <th>Result</th>
                <th className="cell-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`charge-row-${row.id}`}
                  data-status={row.status}
                >
                  <td className="cell-mono">{formatUtc(row.createdAt)}</td>
                  <td>{row.merchant}</td>
                  <td>
                    {row.status === "approved" ? "Approved" : "Declined"}
                    {row.reasonText && (
                      <span className="cell-sub">{row.reasonText}</span>
                    )}
                  </td>
                  <td className="cell-num">
                    <span
                      className={`amount ${row.status === "approved" ? "amount-out" : "muted"}`}
                    >
                      {formatMoney(-row.amountCents, settings)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// The page: Get a card, then one panel per card.
export function CardsPage() {
  // The runKey, who is signed in, their settings, and whether they can change
  // things.
  const runKey = useRunKey();
  const { account: me, user, isLoading } = useBankSession();
  const settings = me?.settings;
  const canChange = Boolean(user && !user.isDemo);
  // Their accounts and cards.
  const accounts = useMoneyAccounts(runKey, Boolean(user));
  const cards = useQuery({
    queryKey: [...MONEY_KEY, "cards", runKey],
    queryFn: () => listCards(runKey),
    enabled: Boolean(user),
  });
  // Issue a card for an account, then refresh.
  const refreshMoney = useRefreshMoney();
  const issue = useMutation({
    mutationFn: (accountId: string) => createCard(accountId, runKey),
    onSuccess: () => refreshMoney(),
  });

  // The cards, and the accounts that don't have one yet.
  const cardList = cards.data?.cards ?? [];
  const withoutCard = (accounts.data?.accounts ?? []).filter(
    (account: MoneyAccount) =>
      !cardList.some((card) => card.accountId === account.id),
  );

  // The heading, then the sign-in card, the demo note, today's date, Get a
  // card, and the cards.
  return (
    <section data-testid="cards-page" className="page">
      <PageHeader
        eyebrow="Money"
        title="Cards"
        description={
          <p className="page-sub">
            A virtual debit card for each account. Freeze it, set what it may
            spend in a day, and pay a shop with it.
          </p>
        }
      />

      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt next="/bank/cards" title="Log in to see your cards" />
      )}

      {/* A demo account: why it has no cards. */}
      {user?.isDemo && (
        <div
          className="callout callout-info demo-note"
          data-testid="cards-demo-note"
        >
          <p>
            Demo accounts have no cards and cannot get one, because they are
            shared. <Link to={bankPath("/signup", runKey)}>Sign up</Link> to try
            a card of your own.
          </p>
        </div>
      )}

      {/* The customer's date, which the daily limit counts. */}
      {user && cards.data && (
        <p className="muted" data-testid="cards-today">
          Today for you is {cards.data.today}; the daily limit counts that day.{" "}
          <Link to={bankPath("/practice", runKey)}>Move your clock</Link>
        </p>
      )}

      {/* Get a card, for each account that has none. */}
      {canChange && withoutCard.length > 0 && (
        <div className="card card-pad" data-testid="cards-issue">
          <h2 className="form-section">Get a card</h2>
          <div className="btn-row">
            {withoutCard.map((account: MoneyAccount) => (
              <button
                key={account.id}
                type="button"
                className="btn"
                data-testid={`card-get-${account.id}`}
                disabled={issue.isPending}
                onClick={() => issue.mutate(account.id)}
              >
                <CreditCard aria-hidden="true" /> Card for {account.name}
              </button>
            ))}
          </div>
          {issue.isError && (
            <p role="alert" className="callout" data-testid="cards-issue-error">
              {(issue.error as Error).message}
            </p>
          )}
        </div>
      )}

      {/* No cards yet. */}
      {user && cards.data && cardList.length === 0 && (
        <p className="empty" data-testid="cards-empty">
          No cards yet.
        </p>
      )}

      {/* One panel per card. */}
      {cardList.map((card) => (
        <CardPanel
          key={card.id}
          card={card}
          runKey={runKey}
          settings={settings}
          canChange={canChange}
        />
      ))}
    </section>
  );
}
