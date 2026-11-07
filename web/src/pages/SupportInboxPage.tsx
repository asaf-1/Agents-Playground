// The Support inbox: every customer's tickets, for Support and Admin.

// React state, the router's link, and the data cache.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
// The inbox call, the status words, and the time format.
import {
  formatUtc,
  listInbox,
  TICKET_STATUS_LABELS,
  type TicketStatus,
} from "../bankApi";
// The sign-in card, the status badge and the page heading.
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
// The test's runKey, who is signed in, and links that keep the runKey.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// The filter buttons; Open is picked at the start.
const FILTERS: { value: TicketStatus | "all"; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "answered", label: "Answered" },
  { value: "solved", label: "Solved" },
];

// Every customer's tickets, for Support and Admin: open ones (waiting for
// staff) first.
export function SupportInboxPage() {
  // The runKey, who is signed in, and whether they are staff.
  const runKey = useRunKey();
  const { user, isLoading } = useBankSession();
  const staff = user?.role === "support" || user?.role === "admin";
  // The filter picked, and its tickets, asked for every 15 seconds.
  const [filter, setFilter] = useState<TicketStatus | "all">("open");
  const inbox = useQuery({
    queryKey: ["bank", "inbox", filter],
    queryFn: () => listInbox(filter === "all" ? undefined : filter),
    enabled: staff,
    refetchInterval: 15_000,
  });

  // The heading, then the sign-in card, a no-access note, or the inbox.
  return (
    <section data-testid="support-inbox-page" className="page">
      <PageHeader
        eyebrow="Back office"
        title="Support inbox"
        description={
          <p className="page-sub">
            Customers' questions. Open ones are waiting for an answer.
          </p>
        }
      />
      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt
          next="/admin/support"
          title="Log in as staff to see this"
        />
      )}
      {/* A customer: no access. */}
      {user && !staff && (
        <div className="card card-pad" data-testid="support-inbox-forbidden">
          <p className="account-title">You don't have access to this page.</p>
          <p className="muted">
            The Support inbox is for Support and Admin. Your own tickets are on
            the Support page.
          </p>
        </div>
      )}
      {/* Staff: the filter, then the tickets. */}
      {staff && (
        <>
          <div
            className="segmented"
            role="group"
            aria-label="Show tickets"
            data-testid="inbox-filter"
          >
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`inbox-filter-${option.value}`}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* No tickets for this filter. */}
          {inbox.data && inbox.data.tickets.length === 0 && (
            <p className="empty" data-testid="inbox-empty">
              No tickets here.
            </p>
          )}
          {/* The tickets table; each subject opens the ticket. */}
          {inbox.data && inbox.data.tickets.length > 0 && (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="inbox-table">
                  <thead>
                    <tr>
                      <th>Updated (UTC)</th>
                      <th>Customer</th>
                      <th>Subject</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inbox.data.tickets.map((ticket) => (
                      <tr
                        key={ticket.id}
                        data-testid={`inbox-row-${ticket.id}`}
                      >
                        <td className="cell-mono">
                          {formatUtc(ticket.updatedAt)}
                        </td>
                        <td>
                          {ticket.customer.fullName}
                          <span className="cell-sub">
                            {ticket.customer.email}
                          </span>
                        </td>
                        <td>
                          <Link
                            data-testid={`inbox-open-${ticket.id}`}
                            to={bankPath(`/support/${ticket.id}`, runKey)}
                          >
                            {ticket.subject}
                          </Link>
                        </td>
                        <td data-testid={`inbox-status-${ticket.id}`}>
                          <Badge value={TICKET_STATUS_LABELS[ticket.status]} />
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
