import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleDollarSign } from "lucide-react";
import {
  answerRequest,
  askForMoney,
  fieldErrors,
  formatMoney,
  formatUtc,
  listRequests,
  parseAmount,
  payRequest,
  REQUEST_STATUS_LABELS,
  type BankSettings,
  type MoneyAccount,
  type MoneyRequest,
} from "../bankApi";
import { NOTIFICATIONS_KEY } from "../components/NotificationBell";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { MONEY_KEY, useMoneyAccounts, useRefreshMoney } from "../useMoney";
import { useQueryClient } from "@tanstack/react-query";

const NUMBER = /^PB-?\d{4}-?\d{4}$/i;

function PayDialog({
  request,
  accounts,
  settings,
  runKey,
}: {
  request: MoneyRequest;
  accounts: MoneyAccount[];
  settings: BankSettings | undefined;
  runKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  // One key per opened dialog: a second click sends the same key.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const refreshMoney = useRefreshMoney();
  const mutation = useMutation({
    mutationFn: () => payRequest(request.id, fromId, key, runKey),
    onSuccess: async () => {
      await refreshMoney();
      setOpen(false);
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setKey(crypto.randomUUID());
          mutation.reset();
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="btn btn-primary btn-sm"
          data-testid={`request-pay-${request.id}`}
        >
          Pay
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="request-pay-dialog"
        >
          <Dialog.Title>
            Pay {request.requesterName}{" "}
            {formatMoney(request.amountCents, settings)}?
          </Dialog.Title>
          <Dialog.Description>
            It goes to {request.toAccountNumber}
            {request.memo ? ` for "${request.memo}"` : ""}.
          </Dialog.Description>
          <div className="field">
            <label htmlFor="request-pay-from">Pay from</label>
            <select
              id="request-pay-from"
              data-testid="request-pay-from"
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.number} ·{" "}
                  {formatMoney(item.balanceCents, settings)}
                </option>
              ))}
            </select>
          </div>
          {mutation.isError && (
            <p role="alert" className="callout" data-testid="request-pay-error">
              {(mutation.error as Error).message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="btn btn-primary"
              data-testid="request-pay-confirm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Paying…" : "Pay now"}
            </button>
            <Dialog.Close asChild>
              <button type="button" data-testid="request-pay-cancel">
                Cancel
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Money requests: ask another customer for money, and pay or decline what you
// were asked for. Both sides see the same request change state.
export function RequestsPage() {
  const runKey = useRunKey();
  const queryClient = useQueryClient();
  const { account: me, user, isLoading } = useBankSession();
  const settings = me?.settings;
  const canChange = Boolean(user && !user.isDemo);
  const accounts = useMoneyAccounts(runKey, Boolean(user));
  const requests = useQuery({
    queryKey: [...MONEY_KEY, "requests", runKey],
    queryFn: () => listRequests(runKey),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });
  const refreshMoney = useRefreshMoney();
  const list = accounts.data?.accounts ?? [];

  const [toId, setToId] = useState("");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<MoneyRequest | null>(null);
  useEffect(() => {
    if (!toId && list.length > 0) setToId(list[0].id);
  }, [list, toId]);

  const ask = useMutation({
    mutationFn: (amountCents: number) =>
      askForMoney(
        {
          toAccountId: toId,
          fromAccountNumber: number.trim(),
          amountCents,
          memo: memo.trim(),
        },
        runKey,
      ),
    onSuccess: async (result) => {
      await refreshMoney();
      setSent(result.request);
      setNumber("");
      setAmount("");
      setMemo("");
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });
  const answer = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "decline" | "cancel";
    }) => answerRequest(id, action, runKey),
    onSettled: async () => {
      await refreshMoney();
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSent(null);
    const next: Record<string, string> = {};
    const cents = parseAmount(amount);
    if (!NUMBER.test(number.trim())) {
      next.fromAccountNumber = "Enter an account number like PB-1234-5678.";
    }
    if (cents === null || cents <= 0) {
      next.amountCents = "Enter an amount like 25.00.";
    }
    setErrors(next);
    if (Object.keys(next).length === 0 && cents !== null) {
      ask.mutate(cents);
    }
  }

  const other =
    ask.isError && !errors.fromAccountNumber && !errors.amountCents
      ? (ask.error as Error).message
      : null;

  return (
    <section data-testid="requests-page" className="page">
      <PageHeader
        eyebrow="Money"
        title="Requests"
        description={
          <p className="page-sub">
            Ask another customer for money, and pay or decline what you were
            asked for.
          </p>
        }
      />
      {!isLoading && !user && (
        <SignInPrompt
          next="/bank/requests"
          title="Log in to see your requests"
        />
      )}
      {user?.isDemo && (
        <div
          className="callout callout-info demo-note"
          data-testid="requests-demo-note"
        >
          <span>
            Demo accounts can't ask for money or be asked. Sign up for your own
            account to try it.
          </span>
          <Link
            className="btn btn-primary btn-sm"
            data-testid="requests-demo-signup"
            to="/signup?next=/bank/requests"
          >
            Sign up
          </Link>
        </div>
      )}

      {canChange && list.length > 0 && (
        <form
          className="card card-pad form-card"
          data-testid="request-form"
          onSubmit={submit}
          noValidate
        >
          <h2>Ask for money</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="request-from">Their account number</label>
              <input
                id="request-from"
                data-testid="request-from"
                className="mono"
                placeholder="PB-1234-5678"
                autoComplete="off"
                aria-invalid={errors.fromAccountNumber ? true : undefined}
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
              {errors.fromAccountNumber && (
                <p role="alert" data-testid="request-from-error">
                  {errors.fromAccountNumber}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="request-amount">Amount</label>
              <input
                id="request-amount"
                data-testid="request-amount"
                inputMode="decimal"
                placeholder="25.00"
                aria-invalid={errors.amountCents ? true : undefined}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {errors.amountCents && (
                <p role="alert" data-testid="request-amount-error">
                  {errors.amountCents}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="request-to">Into my account</label>
              <select
                id="request-to"
                data-testid="request-to"
                value={toId}
                onChange={(event) => setToId(event.target.value)}
              >
                {list.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.number}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="request-memo">What it's for (optional)</label>
              <input
                id="request-memo"
                data-testid="request-memo"
                placeholder="Dinner, concert tickets…"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </div>
          </div>
          {other && (
            <p role="alert" className="callout" data-testid="request-error">
              {other}
            </p>
          )}
          {sent && (
            <p
              className="callout callout-success"
              role="status"
              data-testid="request-sent"
            >
              Sent. They'll see your request for{" "}
              {formatMoney(sent.amountCents, settings)} and get a notification.
            </p>
          )}
          <div className="btn-row">
            <button
              className="btn btn-primary"
              type="submit"
              data-testid="request-submit"
              disabled={ask.isPending}
            >
              <CircleDollarSign aria-hidden="true" />
              {ask.isPending ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      )}

      {user && requests.data && (
        <>
          <div className="section-head">
            <h2>Asked of you</h2>
          </div>
          {requests.data.incoming.length === 0 ? (
            <p className="empty" data-testid="incoming-empty">
              Nobody has asked you for money.
            </p>
          ) : (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="incoming-table">
                  <thead>
                    <tr>
                      <th>Asked (UTC)</th>
                      <th>From</th>
                      <th>For</th>
                      <th className="cell-num">Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.data.incoming.map((row) => (
                      <tr key={row.id} data-testid={`incoming-row-${row.id}`}>
                        <td className="cell-mono">
                          {formatUtc(row.createdAt)}
                        </td>
                        <td>
                          {row.requesterName}
                          <span className="cell-sub">
                            to {row.toAccountNumber}
                          </span>
                        </td>
                        <td>{row.memo}</td>
                        <td className="cell-num cell-mono">
                          {formatMoney(row.amountCents, settings)}
                        </td>
                        <td data-testid={`incoming-status-${row.id}`}>
                          <Badge value={REQUEST_STATUS_LABELS[row.status]} />
                        </td>
                        <td className="cell-actions-wide">
                          {row.status === "pending" && canChange ? (
                            <span className="btn-row">
                              <PayDialog
                                request={row}
                                accounts={list}
                                settings={settings}
                                runKey={runKey}
                              />
                              <button
                                className="btn btn-sm"
                                data-testid={`request-decline-${row.id}`}
                                disabled={answer.isPending}
                                onClick={() =>
                                  answer.mutate({
                                    id: row.id,
                                    action: "decline",
                                  })
                                }
                              >
                                Decline
                              </button>
                            </span>
                          ) : (
                            <span className="cell-muted">
                              {row.answeredAt ? formatUtc(row.answeredAt) : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="section-head">
            <h2>You asked</h2>
          </div>
          {requests.data.outgoing.length === 0 ? (
            <p className="empty" data-testid="outgoing-empty">
              You haven't asked anyone yet.
            </p>
          ) : (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="outgoing-table">
                  <thead>
                    <tr>
                      <th>Asked (UTC)</th>
                      <th>Asked of</th>
                      <th>For</th>
                      <th className="cell-num">Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.data.outgoing.map((row) => (
                      <tr key={row.id} data-testid={`outgoing-row-${row.id}`}>
                        <td className="cell-mono">
                          {formatUtc(row.createdAt)}
                        </td>
                        <td className="cell-mono">{row.payerAccountNumber}</td>
                        <td>{row.memo}</td>
                        <td className="cell-num cell-mono">
                          {formatMoney(row.amountCents, settings)}
                        </td>
                        <td data-testid={`outgoing-status-${row.id}`}>
                          <Badge value={REQUEST_STATUS_LABELS[row.status]} />
                        </td>
                        <td>
                          {row.status === "pending" && canChange && (
                            <button
                              className="btn btn-sm"
                              data-testid={`request-cancel-${row.id}`}
                              disabled={answer.isPending}
                              onClick={() =>
                                answer.mutate({ id: row.id, action: "cancel" })
                              }
                            >
                              Cancel
                            </button>
                          )}
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
