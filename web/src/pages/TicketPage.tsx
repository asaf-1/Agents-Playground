import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Send } from "lucide-react";
import { ApiError } from "../api";
import {
  formatUtc,
  getTicket,
  replyToTicket,
  solveTicket,
  TICKET_STATUS_LABELS,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, MONEY_KEY } from "../useMoney";

// One support conversation, for its customer and for staff. Staff can also
// mark it solved. It refreshes every 15 seconds, so a reply from the other
// side appears without a reload.
export function TicketPage() {
  const { id = "" } = useParams();
  const runKey = useRunKey();
  const queryClient = useQueryClient();
  const { user, isLoading } = useBankSession();
  const staff = user?.role === "support" || user?.role === "admin";
  const key = [...MONEY_KEY, "ticket", id, runKey];
  const ticket = useQuery({
    queryKey: key,
    queryFn: () => getTicket(id, runKey),
    enabled: Boolean(user),
    retry: false,
    refetchInterval: 15_000,
  });
  const [body, setBody] = useState("");
  const reply = useMutation({
    mutationFn: () => replyToTicket(id, body, runKey),
    onSuccess: (result) => {
      queryClient.setQueryData(key, result);
      setBody("");
    },
  });
  const solve = useMutation({
    mutationFn: () => solveTicket(id, runKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const data = ticket.data;
  const notFound =
    ticket.error instanceof ApiError && ticket.error.status === 404;
  const isOwner = data && user && data.ticket.customer.id === user.id;
  const demoTicket = Boolean(data?.ticket.customer.isDemo);
  const canReply = Boolean(
    data && user && !demoTicket && (staff || (isOwner && !user.isDemo)),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim()) reply.mutate();
  }

  return (
    <section data-testid="ticket-page" className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to={bankPath(staff ? "/admin/support" : "/support", runKey)}>
          {staff ? "Support inbox" : "Support"}
        </Link>
        <span aria-hidden="true">/</span>
        <span>Ticket</span>
      </nav>
      <PageHeader
        eyebrow="Support"
        title={data ? data.ticket.subject : "Ticket"}
        description={
          data && (
            <p className="page-sub">
              <span data-testid="ticket-status">
                <Badge value={TICKET_STATUS_LABELS[data.ticket.status]} />
              </span>{" "}
              {staff &&
                `${data.ticket.customer.fullName} · ${data.ticket.customer.email}`}
            </p>
          )
        }
        actions={
          staff &&
          data &&
          !demoTicket &&
          data.ticket.status !== "solved" && (
            <button
              className="btn"
              data-testid="ticket-solve"
              disabled={solve.isPending}
              onClick={() => solve.mutate()}
            >
              <CircleCheck aria-hidden="true" />
              Mark solved
            </button>
          )
        }
      />
      {!isLoading && !user && (
        <SignInPrompt
          next={`/support/${id}`}
          title="Log in to read this ticket"
        />
      )}
      {notFound && (
        <div className="card card-pad" data-testid="ticket-not-found">
          <p className="account-title">There's no such ticket.</p>
          <p className="muted">It doesn't exist, or it isn't yours.</p>
        </div>
      )}
      {solve.isError && (
        <p role="alert" className="callout" data-testid="ticket-solve-error">
          {(solve.error as Error).message}
        </p>
      )}
      {data && (
        <>
          {data.ticket.transactionDescription && (
            <p
              className="callout callout-info"
              data-testid="ticket-transaction"
            >
              About the transaction "{data.ticket.transactionDescription}".
            </p>
          )}
          <ol className="thread" data-testid="ticket-thread">
            {data.messages.map((message) => (
              <li
                key={message.id}
                className={message.fromStaff ? "bubble from-staff" : "bubble"}
                data-testid={`ticket-message-${message.id}`}
              >
                <span className="bubble-meta">
                  {message.authorName}
                  {message.fromStaff && " · Support"} ·{" "}
                  {formatUtc(message.createdAt)} UTC
                </span>
                <p>{message.body}</p>
              </li>
            ))}
          </ol>
          {canReply ? (
            <form
              className="card card-pad form-card"
              data-testid="ticket-reply-form"
              onSubmit={submit}
            >
              <div className="field">
                <label htmlFor="ticket-reply">Reply</label>
                <textarea
                  id="ticket-reply"
                  data-testid="ticket-reply"
                  rows={3}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </div>
              {reply.isError && (
                <p
                  role="alert"
                  className="callout"
                  data-testid="ticket-reply-error"
                >
                  {(reply.error as Error).message}
                </p>
              )}
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  type="submit"
                  data-testid="ticket-reply-send"
                  disabled={reply.isPending || !body.trim()}
                >
                  <Send aria-hidden="true" />
                  {reply.isPending ? "Sending…" : "Send reply"}
                </button>
              </div>
            </form>
          ) : (
            <p className="muted" data-testid="ticket-readonly">
              This is a shared demo ticket, so it can only be read.
            </p>
          )}
        </>
      )}
    </section>
  );
}
