import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Snowflake } from "lucide-react";
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

// Cards: one virtual debit card per account. Freeze it, set its daily limit,
// pay a simulated merchant with it, and read its purchases. The number and
// the CVV are shown only on request, never in the list.

function statusLabel(card: BankCard): string {
  if (card.status === "active") return "Active";
  return card.frozenBy === "admin" ? "Frozen by the bank" : "Frozen";
}

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
  const refreshMoney = useRefreshMoney();
  const [showDetails, setShowDetails] = useState(false);
  const [limit, setLimit] = useState("");
  const [limitError, setLimitError] = useState("");
  const [merchant, setMerchant] = useState(MERCHANTS[0]);
  const [amount, setAmount] = useState("");
  const [spendError, setSpendError] = useState("");
  const [result, setResult] = useState<CardCharge | null>(null);

  const details = useQuery({
    queryKey: [...MONEY_KEY, "card-details", card.id, runKey],
    queryFn: () => cardDetails(card.id, runKey),
    enabled: showDetails,
  });
  const charges = useQuery({
    queryKey: [...MONEY_KEY, "card-charges", card.id, runKey],
    queryFn: () => listCardCharges(card.id, runKey),
  });

  const freeze = useMutation({
    mutationFn: () =>
      updateCard(
        card.id,
        { status: card.status === "active" ? "frozen" : "active" },
        runKey,
      ),
    onSuccess: () => refreshMoney(),
  });
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

  function submitLimit(event: FormEvent) {
    event.preventDefault();
    const cents = parseAmount(limit);
    if (cents === null || cents < 100) {
      setLimitError("Enter a daily limit of at least 1.00.");
      return;
    }
    saveLimit.mutate(cents);
  }

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

  const bankFrozen = card.status === "frozen" && card.frozenBy === "admin";
  const rows = charges.data?.charges ?? [];

  return (
    <div
      className={`card card-pad bank-card ${card.status === "frozen" ? "is-frozen" : ""}`}
      data-testid={`card-${card.id}`}
      data-status={card.status}
    >
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

      <p className="muted" data-testid={`card-limit-${card.id}`}>
        Daily limit {formatMoney(card.limitCents, settings)} · spent today{" "}
        <span data-testid={`card-spent-${card.id}`}>
          {formatMoney(card.spentTodayCents, settings)}
        </span>
        {" · "}expires {card.expires}
      </p>

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

      {canChange && (
        <div className="form-grid bank-card-forms">
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

export function CardsPage() {
  const runKey = useRunKey();
  const { account: me, user, isLoading } = useBankSession();
  const settings = me?.settings;
  const canChange = Boolean(user && !user.isDemo);
  const accounts = useMoneyAccounts(runKey, Boolean(user));
  const cards = useQuery({
    queryKey: [...MONEY_KEY, "cards", runKey],
    queryFn: () => listCards(runKey),
    enabled: Boolean(user),
  });
  const refreshMoney = useRefreshMoney();
  const issue = useMutation({
    mutationFn: (accountId: string) => createCard(accountId, runKey),
    onSuccess: () => refreshMoney(),
  });

  const cardList = cards.data?.cards ?? [];
  const withoutCard = (accounts.data?.accounts ?? []).filter(
    (account: MoneyAccount) =>
      !cardList.some((card) => card.accountId === account.id),
  );

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

      {!isLoading && !user && (
        <SignInPrompt next="/bank/cards" title="Log in to see your cards" />
      )}

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

      {user && cards.data && (
        <p className="muted" data-testid="cards-today">
          Today for you is {cards.data.today}; the daily limit counts that day.{" "}
          <Link to={bankPath("/practice", runKey)}>Move your clock</Link>
        </p>
      )}

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

      {user && cards.data && cardList.length === 0 && (
        <p className="empty" data-testid="cards-empty">
          No cards yet.
        </p>
      )}

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
