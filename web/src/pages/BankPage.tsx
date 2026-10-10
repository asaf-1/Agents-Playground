import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Landmark, PiggyBank } from "lucide-react";
import {
  accountMeta,
  formatMoney,
  formatUtc,
  recentActivity,
  TRANSACTION_LABELS,
  type MoneyAccount,
} from "../bankApi";
import { AddFundsDialog, OpenAccountDialog } from "../components/MoneyDialogs";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, MONEY_KEY, useMoneyAccounts } from "../useMoney";

export function AccountKindIcon({ kind }: { kind: MoneyAccount["kind"] }) {
  return kind === "savings" ? (
    <PiggyBank aria-hidden="true" />
  ) : (
    <Landmark aria-hidden="true" />
  );
}

export function SignedAmount({
  cents,
  text,
  testId,
}: {
  cents: number;
  text: string;
  testId?: string;
}) {
  return (
    <span
      className={`amount ${cents < 0 ? "amount-out" : "amount-in"}`}
      data-testid={testId}
    >
      {cents > 0 ? "+" : ""}
      {text}
    </span>
  );
}

// The bank's front page: every account, the total, and the latest activity.
export function BankPage() {
  const runKey = useRunKey();
  const { account, user, isLoading } = useBankSession();
  const settings = account?.settings;
  const accounts = useMoneyAccounts(runKey, Boolean(user));
  const activity = useQuery({
    queryKey: [...MONEY_KEY, "activity", runKey],
    queryFn: () => recentActivity(runKey),
    enabled: Boolean(user),
  });

  const list = accounts.data?.accounts ?? [];
  const names = new Map(list.map((item) => [item.id, item.name]));
  const canChange = Boolean(user && !user.isDemo);

  return (
    <section data-testid="bank-page" className="page">
      <PageHeader
        eyebrow="Money"
        title="Bank"
        description={
          <p className="page-sub">
            Your accounts and balances. Practice money, in the format from your
            Settings.
          </p>
        }
        actions={
          canChange && (
            <>
              <OpenAccountDialog runKey={runKey} />
              <Link
                className="btn btn-primary"
                data-testid="bank-transfer-link"
                to={bankPath("/bank/transfer", runKey)}
              >
                <ArrowLeftRight aria-hidden="true" />
                Transfer
              </Link>
            </>
          )
        }
      />

      {!isLoading && !user && (
        <SignInPrompt next="/bank" title="Log in to see your accounts" />
      )}

      {user?.isDemo && (
        <div
          className="callout callout-info demo-note"
          data-testid="bank-demo-note"
        >
          <span>
            This is a shared demo account, so it can only be browsed: no
            transfers or added funds. Sign up for your own account to move
            money.
          </span>
          <Link
            className="btn btn-primary btn-sm"
            data-testid="bank-demo-signup"
            to="/signup?next=/bank"
          >
            Sign up
          </Link>
        </div>
      )}

      {accounts.isError && (
        <p role="alert" className="callout" data-testid="bank-error">
          {(accounts.error as Error).message}
        </p>
      )}

      {accounts.data && list.length === 0 && (
        <div className="card card-pad" data-testid="bank-no-accounts">
          <p className="account-title">No accounts yet</p>
          <p className="muted">
            {user?.isDemo
              ? "Staff demo accounts don't hold money. Log in as maya@playgroundbank.test to browse a customer's accounts."
              : "Open an account to start."}
          </p>
        </div>
      )}

      {accounts.data && list.length > 0 && (
        <>
          <div className="card card-pad balance-card">
            <p className="eyebrow">Total balance</p>
            <p className="balance-total" data-testid="bank-total">
              {formatMoney(accounts.data.totalCents, settings)}
            </p>
            <p className="muted">
              Across {list.length} account{list.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="money-grid">
            {list.map((item) => (
              <article
                className="card money-card"
                key={item.id}
                data-testid={`bank-account-card-${item.id}`}
              >
                <div className="money-card-head">
                  <span className="hub-icon">
                    <AccountKindIcon kind={item.kind} />
                  </span>
                  <div>
                    <h2 data-testid={`account-name-${item.id}`}>{item.name}</h2>
                    <p
                      className="mono muted card-meta"
                      data-testid={`account-number-${item.id}`}
                    >
                      {accountMeta(item)}
                    </p>
                  </div>
                </div>
                <p
                  className="money-balance"
                  data-testid={`account-balance-${item.id}`}
                >
                  {formatMoney(item.balanceCents, settings)}
                </p>
                <div className="btn-row">
                  <Link
                    className="btn btn-sm"
                    data-testid={`account-view-${item.id}`}
                    to={bankPath(`/bank/accounts/${item.id}`, runKey)}
                  >
                    History
                  </Link>
                  {canChange && (
                    <>
                      <AddFundsDialog
                        account={item}
                        runKey={runKey}
                        settings={settings}
                      />
                      <Link
                        className="btn btn-sm"
                        data-testid={`account-transfer-${item.id}`}
                        to={bankPath(`/bank/transfer?from=${item.id}`, runKey)}
                      >
                        Send
                      </Link>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="section-head">
            <h2>Recent activity</h2>
            <p className="muted">The latest moves across your accounts.</p>
          </div>
          {activity.data && activity.data.transactions.length === 0 && (
            <p className="empty" data-testid="bank-activity-empty">
              Nothing yet. Add funds or make a transfer.
            </p>
          )}
          {activity.data && activity.data.transactions.length > 0 && (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="bank-activity">
                  <thead>
                    <tr>
                      <th>Date (UTC)</th>
                      <th>Account</th>
                      <th>Description</th>
                      <th className="cell-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.data.transactions.map((row) => (
                      <tr key={row.id} data-testid={`activity-row-${row.id}`}>
                        <td className="cell-mono">
                          {formatUtc(row.createdAt)}
                        </td>
                        <td>{names.get(row.accountId) ?? "Account"}</td>
                        <td>
                          {row.description}
                          {row.memo && (
                            <span className="cell-sub">{row.memo}</span>
                          )}
                          <span className="sr-only">
                            {" "}
                            ({TRANSACTION_LABELS[row.kind]})
                          </span>
                        </td>
                        <td className="cell-num">
                          <SignedAmount
                            cents={row.amountCents}
                            text={formatMoney(row.amountCents, settings)}
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
