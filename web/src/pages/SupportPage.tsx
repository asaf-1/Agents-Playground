import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import {
  fieldErrors,
  formatUtc,
  listMyTickets,
  openTicket,
  TICKET_STATUS_LABELS,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, MONEY_KEY } from "../useMoney";

// Your support tickets, and a new one. Coming from a transaction's "Report a
// problem" (?transaction=<id>&about=<text>), the ticket is about that row.
export function SupportPage() {
  const runKey = useRunKey();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const transactionId = params.get("transaction") || undefined;
  const about = params.get("about") || "";
  const { user, isLoading } = useBankSession();
  const canChange = Boolean(user && !user.isDemo);
  const tickets = useQuery({
    queryKey: [...MONEY_KEY, "tickets", runKey],
    queryFn: () => listMyTickets(runKey),
    enabled: Boolean(user),
  });

  const [subject, setSubject] = useState(
    about ? `About "${about}"`.slice(0, 120) : "",
  );
  const [body, setBody] = useState("");
  const mutation = useMutation({
    mutationFn: () => openTicket({ subject, body, transactionId }, runKey),
    onSuccess: (result) =>
      navigate(bankPath(`/support/${result.ticket.id}`, runKey)),
  });
  const errors = mutation.isError ? fieldErrors(mutation.error) : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section data-testid="support-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Support"
        description={
          <p className="page-sub">
            Ask the bank anything. Support answers here, and you get a
            notification when they do.
          </p>
        }
      />
      {!isLoading && !user && (
        <SignInPrompt next="/support" title="Log in to contact support" />
      )}
      {user?.isDemo && (
        <div
          className="callout callout-info demo-note"
          data-testid="support-demo-note"
        >
          <span>
            Demo accounts can read their tickets but not write new ones. Sign up
            for your own account to try it.
          </span>
          <Link
            className="btn btn-primary btn-sm"
            data-testid="support-demo-signup"
            to="/signup?next=/support"
          >
            Sign up
          </Link>
        </div>
      )}

      {canChange && (
        <form
          className="card card-pad form-card"
          data-testid="ticket-form"
          onSubmit={submit}
          noValidate
        >
          <h2>Write to support</h2>
          {transactionId && (
            <p className="callout callout-info" data-testid="ticket-about">
              About a transaction{about ? `: ${about}` : ""}.
            </p>
          )}
          <div className="field">
            <label htmlFor="ticket-subject">Subject</label>
            <input
              id="ticket-subject"
              data-testid="ticket-subject"
              aria-invalid={errors.subject ? true : undefined}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
            {errors.subject && (
              <p role="alert" data-testid="ticket-subject-error">
                {errors.subject}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="ticket-body">Message</label>
            <textarea
              id="ticket-body"
              data-testid="ticket-body"
              rows={4}
              aria-invalid={errors.body ? true : undefined}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            {errors.body && (
              <p role="alert" data-testid="ticket-body-error">
                {errors.body}
              </p>
            )}
          </div>
          {mutation.isError && !errors.subject && !errors.body && (
            <p role="alert" className="callout" data-testid="ticket-error">
              {(mutation.error as Error).message}
            </p>
          )}
          <div className="btn-row">
            <button
              className="btn btn-primary"
              type="submit"
              data-testid="ticket-submit"
              disabled={mutation.isPending}
            >
              <LifeBuoy aria-hidden="true" />
              {mutation.isPending ? "Sending…" : "Send to support"}
            </button>
          </div>
        </form>
      )}

      {user && tickets.data && (
        <>
          <div className="section-head">
            <h2>Your tickets</h2>
          </div>
          {tickets.data.tickets.length === 0 ? (
            <p className="empty" data-testid="tickets-empty">
              No tickets yet.
            </p>
          ) : (
            <ul
              className="card mini-list ticket-list"
              data-testid="tickets-list"
            >
              {tickets.data.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    data-testid={`ticket-link-${ticket.id}`}
                    to={bankPath(`/support/${ticket.id}`, runKey)}
                  >
                    {ticket.subject}
                  </Link>
                  <span className="cell-muted">
                    {formatUtc(ticket.updatedAt)}{" "}
                    <Badge value={TICKET_STATUS_LABELS[ticket.status]} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
