import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatDate,
  listBankUsers,
  ROLE_LABELS,
  STATUS_LABELS,
  updateBankUser,
  type BankRole,
  type BankUser,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { Avatar, Badge, PageHeader } from "../components/ui";
import { useBankSession } from "../useBankSession";

const ROLES: BankRole[] = ["customer", "support", "admin"];

// Bank users, for staff. Support can look; Admin can also change roles and
// lock or unlock accounts. The server enforces the same rules.
export function AdminUsersPage() {
  const { user, isLoading, account } = useBankSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const staff = user?.role === "support" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["bank", "users"],
    queryFn: listBankUsers,
    enabled: staff,
  });

  const mutation = useMutation({
    mutationFn: ({ id, change }: { id: string; change: Partial<BankUser> }) =>
      updateBankUser(id, {
        role: change.role,
        status: change.status,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["bank", "users"] }),
  });

  const users = useMemo(() => {
    const all = data?.users ?? [];
    const term = search.trim().toLowerCase();
    return term
      ? all.filter(
          (row) =>
            row.fullName.toLowerCase().includes(term) ||
            row.email.toLowerCase().includes(term),
        )
      : all;
  }, [data, search]);

  const locale = account?.settings.locale ?? "en-US";

  return (
    <section data-testid="admin-users-page" className="page">
      <PageHeader
        eyebrow="Back office"
        title="Bank users"
        description={
          <p className="page-sub">
            Every Playground Bank account. Support can look; Admin can change
            roles and lock accounts.
          </p>
        }
      />

      {!isLoading && !user && (
        <SignInPrompt next="/admin/users" title="Log in as staff to see this" />
      )}

      {user && !staff && (
        <div className="card card-pad" data-testid="admin-forbidden">
          <p className="account-title">You don't have access to this page.</p>
          <p className="muted">
            Bank users is for Support and Admin. Log in with a staff account to
            see it.
          </p>
        </div>
      )}

      {staff && (
        <>
          {!isAdmin && (
            <p
              className="callout callout-info"
              data-testid="admin-readonly-note"
            >
              You're signed in as Support, so this list is read-only.
            </p>
          )}

          <div className="toolbar">
            <input
              data-testid="admin-search"
              className="input input-search"
              type="search"
              placeholder="Search by name or email"
              aria-label="Search bank users by name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {mutation.isError && (
            <p data-testid="admin-error" role="alert" className="callout">
              {(mutation.error as Error).message}
            </p>
          )}
          {isPending && (
            <p className="state" data-testid="admin-loading">
              Loading users…
            </p>
          )}
          {isError && (
            <p role="alert" className="callout">
              {(error as Error).message}
            </p>
          )}

          {data && (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="admin-users-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((row) => {
                      const editable =
                        isAdmin && row.id !== user?.id && !row.isDemo;
                      return (
                        <tr key={row.id} data-testid={`admin-row-${row.id}`}>
                          <td>
                            <span className="user-cell">
                              <Avatar name={row.fullName} seed={row.id} />
                              {row.fullName}
                            </span>
                          </td>
                          <td className="cell-mono">{row.email}</td>
                          <td>
                            {editable ? (
                              <select
                                className="input-sm"
                                data-testid={`admin-role-${row.id}`}
                                aria-label={`Role for ${row.fullName}`}
                                value={row.role}
                                disabled={mutation.isPending}
                                onChange={(event) =>
                                  mutation.mutate({
                                    id: row.id,
                                    change: {
                                      role: event.target.value as BankRole,
                                    },
                                  })
                                }
                              >
                                {ROLES.map((role) => (
                                  <option key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Badge value={ROLE_LABELS[row.role]} />
                            )}
                          </td>
                          <td data-testid={`admin-status-${row.id}`}>
                            <Badge value={STATUS_LABELS[row.status]} />
                          </td>
                          <td className="cell-muted">
                            {formatDate(row.createdAt, locale)}
                          </td>
                          <td className="cell-actions-wide">
                            {editable ? (
                              <button
                                data-testid={`admin-toggle-${row.id}`}
                                className="btn-sm"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    id: row.id,
                                    change: {
                                      status:
                                        row.status === "active"
                                          ? "locked"
                                          : "active",
                                    },
                                  })
                                }
                              >
                                {row.status === "active" ? "Lock" : "Unlock"}
                              </button>
                            ) : (
                              <span className="cell-muted">
                                {row.id === user?.id
                                  ? "You"
                                  : row.isDemo
                                    ? "Demo"
                                    : "Read-only"}
                              </span>
                            )}
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
    </section>
  );
}
