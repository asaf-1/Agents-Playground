import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard, Lock, LockOpen, UserCog } from "lucide-react";
import {
  accountMeta,
  formatDate,
  formatMoney,
  getBankUserDetail,
  listBankUsers,
  ROLE_LABELS,
  STATUS_LABELS,
  updateBankUser,
  type BankRole,
  type BankSettings,
  type BankUser,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { Avatar, Badge, PageHeader } from "../components/ui";
import { useBankSession } from "../useBankSession";

const ROLES: BankRole[] = ["customer", "support", "admin"];

type RowDialog = { mode: "view" | "role"; row: BankUser } | null;

// Why a row's changes are off, shown inside its menu instead of a dead item.
function lockedReason(row: BankUser, me: BankUser, isAdmin: boolean) {
  if (!isAdmin) return "Only an Admin can change roles or lock accounts.";
  if (row.id === me.id)
    return "This is you: you can't change your own account.";
  if (row.isDemo) return "Demo accounts can't be changed.";
  return null;
}

function BankUserDialog({
  row,
  settings,
  onClose,
}: {
  row: BankUser;
  settings: BankSettings | undefined;
  onClose: () => void;
}) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["bank", "users", row.id],
    queryFn: () => getBankUserDetail(row.id),
  });
  const locale = settings?.locale ?? "en-US";
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-wide"
          data-testid="bank-user-dialog"
        >
          <Dialog.Title>{row.fullName}</Dialog.Title>
          <Dialog.Description>
            {row.email} · {ROLE_LABELS[row.role]} · {STATUS_LABELS[row.status]}
          </Dialog.Description>
          {isPending && <p className="state">Loading the profile…</p>}
          {isError && (
            <p role="alert" className="callout">
              {(error as Error).message}
            </p>
          )}
          {data && (
            <>
              <dl className="detail-list">
                <div>
                  <dt>Member since</dt>
                  <dd data-testid="bank-user-since">
                    {formatDate(data.user.createdAt, locale)}
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>
                    {data.profile.phone || (
                      <span className="not-set">Not set</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>City</dt>
                  <dd data-testid="bank-user-city">
                    {data.profile.city || (
                      <span className="not-set">Not set</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>
                    {data.profile.country || (
                      <span className="not-set">Not set</span>
                    )}
                  </dd>
                </div>
              </dl>
              <h3 className="dialog-subhead">Accounts</h3>
              {data.accounts.length === 0 ? (
                <p className="muted" data-testid="bank-user-no-accounts">
                  No accounts.
                </p>
              ) : (
                <ul className="mini-list" data-testid="bank-user-accounts">
                  {data.accounts.map((item) => (
                    <li
                      key={item.id}
                      data-testid={`bank-user-account-${item.id}`}
                    >
                      <span>
                        {item.name}{" "}
                        <span className="mono muted">{accountMeta(item)}</span>
                      </span>
                      <strong className="mono">
                        {formatMoney(item.balanceCents, settings)}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="btn" data-testid="bank-user-close">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RoleDialog({
  row,
  onSave,
  saving,
  errorMessage,
  onClose,
}: {
  row: BankUser;
  onSave: (role: BankRole) => void;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
}) {
  const [role, setRole] = useState<BankRole>(row.role);
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" data-testid="role-dialog">
          <Dialog.Title>Change {row.fullName}'s role</Dialog.Title>
          <Dialog.Description>
            Support can look at every account; Admin can also change them.
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSave(role);
            }}
          >
            <div className="field">
              <label htmlFor="role-select">Role</label>
              <select
                id="role-select"
                data-testid={`admin-role-${row.id}`}
                value={role}
                onChange={(event) => setRole(event.target.value as BankRole)}
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            {errorMessage && (
              <p role="alert" className="callout" data-testid="role-error">
                {errorMessage}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="btn btn-primary"
                type="submit"
                data-testid="role-save"
                disabled={saving || role === row.role}
              >
                {saving ? "Saving…" : "Save role"}
              </button>
              <Dialog.Close asChild>
                <button type="button" data-testid="role-cancel">
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

// Bank users, for staff. Support can look; Admin can also change roles and
// lock or unlock accounts. The server enforces the same rules.
export function AdminUsersPage() {
  const { user, isLoading, account } = useBankSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<RowDialog>(null);

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bank", "users"] });
      setDialog(null);
    },
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

          {mutation.isError && dialog?.mode !== "role" && (
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
                      const reason = user
                        ? lockedReason(row, user, isAdmin)
                        : null;
                      return (
                        <tr key={row.id} data-testid={`admin-row-${row.id}`}>
                          <td>
                            <span className="user-cell">
                              <Avatar name={row.fullName} seed={row.id} />
                              {row.fullName}
                            </span>
                          </td>
                          <td className="cell-mono">{row.email}</td>
                          <td data-testid={`admin-role-badge-${row.id}`}>
                            <Badge value={ROLE_LABELS[row.role]} />
                          </td>
                          <td data-testid={`admin-status-${row.id}`}>
                            <Badge value={STATUS_LABELS[row.status]} />
                          </td>
                          <td className="cell-muted">
                            {formatDate(row.createdAt, locale)}
                          </td>
                          <td className="cell-actions">
                            <DropdownMenu.Root modal={false}>
                              <DropdownMenu.Trigger asChild>
                                <button
                                  data-testid={`admin-actions-${row.id}`}
                                  aria-label={`Actions for ${row.fullName}`}
                                >
                                  ⋯
                                </button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                  className="dropdown-content"
                                  data-testid={`admin-menu-${row.id}`}
                                  sideOffset={4}
                                  align="end"
                                >
                                  <DropdownMenu.Item
                                    data-testid={`admin-view-${row.id}`}
                                    onSelect={() =>
                                      setDialog({ mode: "view", row })
                                    }
                                  >
                                    <IdCard aria-hidden="true" />
                                    View profile
                                  </DropdownMenu.Item>
                                  {reason ? (
                                    <p
                                      className="menu-note"
                                      data-testid={`admin-menu-note-${row.id}`}
                                    >
                                      {reason}
                                    </p>
                                  ) : (
                                    <>
                                      <DropdownMenu.Item
                                        data-testid={`admin-change-role-${row.id}`}
                                        onSelect={() => {
                                          mutation.reset();
                                          setDialog({ mode: "role", row });
                                        }}
                                      >
                                        <UserCog aria-hidden="true" />
                                        Change role
                                      </DropdownMenu.Item>
                                      <DropdownMenu.Item
                                        data-testid={`admin-toggle-${row.id}`}
                                        disabled={mutation.isPending}
                                        onSelect={() =>
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
                                        {row.status === "active" ? (
                                          <Lock aria-hidden="true" />
                                        ) : (
                                          <LockOpen aria-hidden="true" />
                                        )}
                                        {row.status === "active"
                                          ? "Lock"
                                          : "Unlock"}
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

      {dialog?.mode === "view" && (
        <BankUserDialog
          row={dialog.row}
          settings={account?.settings}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === "role" && (
        <RoleDialog
          row={dialog.row}
          saving={mutation.isPending}
          errorMessage={
            mutation.isError ? (mutation.error as Error).message : null
          }
          onSave={(role) =>
            mutation.mutate({ id: dialog.row.id, change: { role } })
          }
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
