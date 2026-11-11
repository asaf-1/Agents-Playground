// The Audit log, for an Admin: every staff action and every money action, who
// did it, through which door, newest first, a page at a time, with a CSV
// download ("a more real back end", phase 4).

// React state and the data cache.
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
// The log's calls, types and time format.
import {
  auditCsvUrl,
  formatUtc,
  listAudit,
  type AuditFilters,
} from "../bankApi";
// The sign-in card, the badge and heading, and who is signed in.
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useBankSession } from "../useBankSession";

// The filters, the table, "Show more", and the CSV link.
export function AuditLogPage() {
  // Who is signed in, whether they are an Admin, and the filters.
  const { user, isLoading } = useBankSession();
  const admin = user?.role === "admin";
  const [filters, setFilters] = useState<AuditFilters>({});
  const [actorText, setActorText] = useState("");

  // The log a page at a time; each page says where the next one starts.
  const log = useInfiniteQuery({
    queryKey: ["bank", "audit", filters],
    queryFn: ({ pageParam }) => listAudit(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: admin,
  });
  const pages = log.data?.pages ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const actions = pages[0]?.actions ?? [];

  // The heading, then the sign-in card, a no-access note, or the log.
  return (
    <section data-testid="audit-log-page" className="page">
      <PageHeader
        eyebrow="Back office"
        title="Audit log"
        description={
          <p className="page-sub">
            Every staff action and every money action, through the website, the
            REST API or GraphQL. Lines can only be added: the database refuses
            to change or delete one.
          </p>
        }
        actions={
          admin && (
            <a
              className="btn"
              href={auditCsvUrl(filters)}
              data-testid="audit-csv"
              download
            >
              Download CSV
            </a>
          )
        }
      />

      {/* Signed out, or not an Admin. */}
      {!isLoading && !user && (
        <SignInPrompt
          next="/admin/audit"
          title="Log in as an Admin to see this"
        />
      )}
      {user && !admin && (
        <div className="card card-pad" data-testid="audit-forbidden">
          <p className="account-title">You don't have access to this page.</p>
          <p className="muted">The audit log is for Admins only.</p>
        </div>
      )}

      {/* The filters: an action, a door, a person. */}
      {admin && (
        <form
          className="filter-bar"
          data-testid="audit-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters((current) => ({
              ...current,
              actor: actorText.trim() || undefined,
            }));
          }}
        >
          <div className="field">
            <label htmlFor="audit-action">Action</label>
            <select
              id="audit-action"
              data-testid="audit-action"
              value={filters.action ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  action: event.target.value || undefined,
                }))
              }
            >
              <option value="">Every action</option>
              {actions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="audit-door">Door</label>
            <select
              id="audit-door"
              data-testid="audit-door"
              value={filters.door ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  door: (event.target.value ||
                    undefined) as AuditFilters["door"],
                }))
              }
            >
              <option value="">REST and GraphQL</option>
              <option value="rest">REST (and the website)</option>
              <option value="graphql">GraphQL</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="audit-actor">Who (email)</label>
            <input
              id="audit-actor"
              className="input"
              data-testid="audit-actor"
              type="email"
              value={actorText}
              onChange={(event) => setActorText(event.target.value)}
            />
          </div>
          <div className="filter-actions">
            <button type="submit" className="btn" data-testid="audit-apply">
              Apply
            </button>
          </div>
        </form>
      )}

      {/* Loading, an error, or none. */}
      {admin && log.isPending && <p className="state">Loading the log…</p>}
      {log.isError && (
        <p role="alert" className="callout">
          {(log.error as Error).message}
        </p>
      )}
      {admin && log.data && entries.length === 0 && (
        <p className="empty" data-testid="audit-empty">
          Nothing in the log matches.
        </p>
      )}

      {/* The lines, newest first, then "Show more". */}
      {entries.length > 0 && (
        <div className="card table-card">
          <p className="result-count" data-testid="audit-total">
            {pages[0].total} {pages[0].total === 1 ? "line" : "lines"}
          </p>
          <div className="table-wrap">
            <table data-testid="audit-table">
              <thead>
                <tr>
                  <th>When (UTC)</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Door</th>
                  <th>Request id</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} data-testid="audit-row">
                    <td className="cell-mono">{formatUtc(entry.createdAt)}</td>
                    <td>
                      {entry.actorEmail}
                      <span className="cell-sub">{entry.actorRole}</span>
                    </td>
                    <td className="cell-mono" data-testid="audit-row-action">
                      {entry.action}
                    </td>
                    <td className="cell-mono">
                      {entry.targetType}
                      <span className="cell-sub" data-testid="audit-row-target">
                        {entry.targetId}
                      </span>
                    </td>
                    <td data-testid="audit-row-door">
                      <Badge
                        value={entry.door === "graphql" ? "GraphQL" : "REST"}
                        tone={entry.door === "graphql" ? "violet" : "info"}
                      />
                      {entry.auth === "api_key" && (
                        <span className="cell-sub">API key</span>
                      )}
                    </td>
                    <td className="cell-mono cell-muted">{entry.requestId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {log.hasNextPage && (
            <div className="pager">
              <button
                type="button"
                className="btn"
                data-testid="audit-more"
                disabled={log.isFetchingNextPage}
                onClick={() => log.fetchNextPage()}
              >
                {log.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
