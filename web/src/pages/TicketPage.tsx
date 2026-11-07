// One support ticket: the conversation, a reply box, and Mark solved for staff.

// React state, the router, the data cache and the icons.
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Send } from "lucide-react";
// The API error type, and the ticket calls, time format and status words.
import { ApiError } from "../api";
import {
  formatUtc,
  getTicket,
  replyToTicket,
  solveTicket,
  TICKET_STATUS_LABELS,
} from "../bankApi";
// The sign-in card, the status badge and the page heading.
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
// The test's runKey, who is signed in, and the money helpers.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath, MONEY_KEY } from "../useMoney";

// One support conversation, for its customer and for staff. Staff can also
// mark it solved. It refreshes every 15 seconds, so a reply from the other
// side appears without a reload.
export function TicketPage() {
  // The ticket from the address, the runKey, the cache, and who is looking.
  const { id = "" } = useParams();
  const runKey = useRunKey();
  const queryClient = useQueryClient();
  const { user, isLoading } = useBankSession();
  const staff = user?.role === "support" || user?.role === "admin";
  // The ticket, asked for every 15 seconds; a 404 is an answer, so no retry.
  const key = [...MONEY_KEY, "ticket", id, runKey];
  const ticket = useQuery({
    queryKey: key,
    queryFn: () => getTicket(id, runKey),
    enabled: Boolean(user),
    retry: false,
    refetchInterval: 15_000,
  });
  // The reply box, and the reply call that puts the new conversation straight
  // into the cache.
  const [body, setBody] = useState("");
  const reply = useMutation({
    mutationFn: () => replyToTicket(id, body, runKey),
    onSuccess: (result) => {
      queryClient.setQueryData(key, result);
      setBody("");
    },
  });
  // Mark solved, then ask again.
  const solve = useMutation({
    mutationFn: () => solveTicket(id, runKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  // Not found, whose it is, and who may reply: staff, or the owner on their own
  // account; never on a demo ticket.
  const data = ticket.data;
  const notFound =
    ticket.error instanceof ApiError && ticket.error.status === 404;
  const isOwner = data && user && data.ticket.customer.id === user.id;
  const demoTicket = Boolean(data?.ticket.customer.isDemo);
  const canReply = Boolean(
    data && user && !demoTicket && (staff || (isOwner && !user.isDemo)),
  );

  // Send a reply that isn't empty.
  function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim()) reply.mutate();
  }

  // The breadcrumb, the heading with its status and Mark solved, then the
  // conversation.
  return (
    <section data-testid="ticket-page" className="page">
      {/* Back to the inbox for staff, or to Support. */}
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
      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt
          next={`/support/${id}`}
          title="Log in to read this ticket"
        />
      )}
      {/* No such ticket, or not theirs. */}
      {notFound && (
        <div className="card card-pad" data-testid="ticket-not-found">
          <p className="account-title">There's no such ticket.</p>
          <p className="muted">It doesn't exist, or it isn't yours.</p>
        </div>
      )}
      {/* Mark solved failed. */}
      {solve.isError && (
        <p role="alert" className="callout" data-testid="ticket-solve-error">
          {(solve.error as Error).message}
        </p>
      )}
      {/* The ticket: what it is about, the messages, a reply box. */}
      {data && (
        <>
          {/* The transaction it is about. */}
          {data.ticket.transactionDescription && (
            <p
              className="callout callout-info"
              data-testid="ticket-transaction"
            >
              About the transaction "{data.ticket.transactionDescription}".
            </p>
          )}
          {/* The messages, staff ones marked. */}
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
          {/* Reply, or a note that a demo ticket is read only. */}
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
