import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX } from "lucide-react";
import {
  decideLoan,
  fieldErrors,
  formatApr,
  formatMoney,
  formatUtc,
  LOAN_STATUS_LABELS,
  listStaffLoans,
  type BankUser,
  type Loan,
  type LoanStatus,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useBankSession } from "../useBankSession";

const FILTERS: { value: LoanStatus | "all"; label: string }[] = [
  { value: "pending", label: "Waiting" },
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

type Decision = { loan: Loan; decision: "approve" | "reject" } | null;

// Why a loan can't be decided by this person, shown in its menu instead of
// dead items. null when it can be.
function blockedReason(loan: Loan, me: BankUser) {
  if (loan.status !== "pending") return "Already decided.";
  if (me.role !== "admin") return "Only an Admin can decide loans.";
  if (loan.customer?.id === me.id) {
    return "This is your own loan: another Admin has to decide it.";
  }
  if (loan.customer?.isDemo) {
    return "Demo accounts' loans can't be changed.";
  }
  return null;
}

function DecisionDialog({
  decision,
  onClose,
}: {
  decision: NonNullable<Decision>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { account } = useBankSession();
  const [note, setNote] = useState("");
  const approving = decision.decision === "approve";
  const mutation = useMutation({
    mutationFn: () => decideLoan(decision.loan.id, decision.decision, note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bank", "loans"] });
      onClose();
    },
  });
  const settings = account?.settings;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="loan-decision-dialog"
        >
          <Dialog.Title>
            {approving ? "Approve" : "Reject"}{" "}
            {formatMoney(decision.loan.amountCents, settings)} for{" "}
            {decision.loan.customer?.fullName}?
          </Dialog.Title>
          <Dialog.Description>
            {approving
              ? `The money goes into ${decision.loan.accountNumber} right away.`
              : "The customer sees your reason next to the loan."}
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="field">
              <label htmlFor="loan-note">
                {approving ? "Note (optional)" : "Reason"}
              </label>
              <input
                id="loan-note"
                data-testid="loan-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            {mutation.isError && (
              <p
                role="alert"
                className="callout"
                data-testid="loan-decision-error"
              >
                {fieldErrors(mutation.error).note ??
                  (mutation.error as Error).message}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="btn btn-primary"
                type="submit"
                data-testid="loan-decision-confirm"
                disabled={mutation.isPending}
              >
                {mutation.isPending
                  ? "Saving…"
                  : approving
                    ? "Approve and pay out"
                    : "Reject loan"}
              </button>
              <Dialog.Close asChild>
                <button type="button" data-testid="loan-decision-cancel">
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

// The loan queue, for staff. Support can look; an Admin approves or rejects.
export function LoanRequestsPage() {
  const { user, account, isLoading } = useBankSession();
  const settings = account?.settings;
  const staff = user?.role === "support" || user?.role === "admin";
  const [filter, setFilter] = useState<LoanStatus | "all">("pending");
  const [decision, setDecision] = useState<Decision>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["bank", "loans", filter],
    queryFn: () => listStaffLoans(filter === "all" ? undefined : filter),
    enabled: staff,
  });

  return (
    <section data-testid="loan-requests-page" className="page">
      <PageHeader
        eyebrow="Back office"
        title="Loan requests"
        description={
          <p className="page-sub">
            Every loan customers ask for. Support can look; an Admin approves or
            rejects, and never their own.
          </p>
        }
      />

      {!isLoading && !user && (
        <SignInPrompt next="/admin/loans" title="Log in as staff to see this" />
      )}

      {user && !staff && (
        <div className="card card-pad" data-testid="loan-requests-forbidden">
          <p className="account-title">You don't have access to this page.</p>
          <p className="muted">
            Loan requests is for Support and Admin. Log in with a staff account
            to see it.
          </p>
        </div>
      )}

      {staff && user && (
        <>
          {user.role !== "admin" && (
            <p
              className="callout callout-info"
              data-testid="loan-requests-readonly"
            >
              You're signed in as Support, so this list is read-only.
            </p>
          )}
          <div
            className="segmented"
            role="group"
            aria-label="Show loans"
            data-testid="loan-filter"
          >
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`loan-filter-${option.value}`}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {isPending && <p className="state">Loading loans…</p>}
          {isError && (
            <p role="alert" className="callout">
              {(error as Error).message}
            </p>
          )}
          {data && data.loans.length === 0 && (
            <p className="empty" data-testid="loan-requests-empty">
              No loans here.
            </p>
          )}
          {data && data.loans.length > 0 && (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="loan-requests-table">
                  <thead>
                    <tr>
                      <th>Asked (UTC)</th>
                      <th>Customer</th>
                      <th className="cell-num">Amount</th>
                      <th>Term</th>
                      <th className="cell-num">A month</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.loans.map((loan) => {
                      const reason = blockedReason(loan, user);
                      return (
                        <tr
                          key={loan.id}
                          data-testid={`loan-request-row-${loan.id}`}
                        >
                          <td className="cell-mono">
                            {formatUtc(loan.createdAt)}
                          </td>
                          <td>
                            {loan.customer?.fullName}
                            <span className="cell-sub">
                              {loan.customer?.email}
                            </span>
                          </td>
                          <td className="cell-num cell-mono">
                            {formatMoney(loan.amountCents, settings)}
                          </td>
                          <td>
                            {loan.termMonths} months ·{" "}
                            {formatApr(loan.aprBasisPoints)}
                            {loan.purpose && (
                              <span className="cell-sub">{loan.purpose}</span>
                            )}
                          </td>
                          <td className="cell-num cell-mono">
                            {formatMoney(loan.monthlyPaymentCents, settings)}
                          </td>
                          <td data-testid={`loan-request-status-${loan.id}`}>
                            <Badge value={LOAN_STATUS_LABELS[loan.status]} />
                            {loan.decisionNote && (
                              <span className="cell-sub">
                                {loan.decisionNote}
                              </span>
                            )}
                          </td>
                          <td className="cell-actions">
                            <DropdownMenu.Root modal={false}>
                              <DropdownMenu.Trigger asChild>
                                <button
                                  data-testid={`loan-actions-${loan.id}`}
                                  aria-label={`Actions for the loan of ${loan.customer?.fullName}`}
                                >
                                  ⋯
                                </button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                  className="dropdown-content"
                                  data-testid={`loan-menu-${loan.id}`}
                                  sideOffset={4}
                                  align="end"
                                >
                                  {reason ? (
                                    <p
                                      className="menu-note"
                                      data-testid={`loan-menu-note-${loan.id}`}
                                    >
                                      {reason}
                                    </p>
                                  ) : (
                                    <>
                                      <DropdownMenu.Item
                                        data-testid={`loan-approve-${loan.id}`}
                                        onSelect={() =>
                                          setDecision({
                                            loan,
                                            decision: "approve",
                                          })
                                        }
                                      >
                                        <CircleCheck aria-hidden="true" />
                                        Approve
                                      </DropdownMenu.Item>
                                      <DropdownMenu.Item
                                        data-testid={`loan-reject-${loan.id}`}
                                        onSelect={() =>
                                          setDecision({
                                            loan,
                                            decision: "reject",
                                          })
                                        }
                                      >
                                        <CircleX aria-hidden="true" />
                                        Reject
                                      </DropdownMenu.Item>
                                    </>
                                  )}
                                </DropdownMenu.Content>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {decision && (
        <DecisionDialog decision={decision} onClose={() => setDecision(null)} />
      )}
    </section>
  );
}
