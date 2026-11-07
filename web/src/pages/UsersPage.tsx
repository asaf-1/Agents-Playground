// The Users page: the back-office directory, with search, a New user dialog,
// and View and Edit for each user.

// React state, effects and refs, Radix's dialog and menu, the data cache and
// the icons.
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil } from "lucide-react";
// The users calls, the New user dialog, the avatar, badge and page heading.
import { getUsers, updateUser, type User } from "../api";
import { CreateUserDialog } from "../components/CreateUserDialog";
import { Avatar, Badge, PageHeader } from "../components/ui";
// The date format, and the test's runKey and flags.
import { formatShortDate } from "../format";
import { useAppFlags, useRunKey } from "../useAppFlags";

// Fixed reference date so the locale-formatting defect is deterministic.
const DIRECTORY_AS_OF = "2026-01-15T12:00:00Z";

// The roles and statuses the Edit dialog offers.
const EDIT_ROLES = ["Admin", "Editor", "Viewer"];
const EDIT_STATUSES = ["Active", "Inactive"];

// The dialog open now: View or Edit, and for whom.
type UserDialog = { mode: "view" | "edit"; user: User } | null;

// modal={false}: the menu hands focus straight to the dialog it opens.
function UserRowActions({
  user,
  onOpen,
}: {
  user: User;
  onOpen: (dialog: UserDialog) => void;
}) {
  // The ⋯ button and its menu: View and Edit.
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          data-testid={`user-actions-${user.id}`}
          aria-label={`Actions for ${user.name}`}
        >
          ⋯
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="dropdown-content"
          data-testid={`user-menu-${user.id}`}
          sideOffset={4}
        >
          <DropdownMenu.Item
            data-testid={`user-view-${user.id}`}
            onSelect={() => onOpen({ mode: "view", user })}
          >
            <Eye aria-hidden="true" />
            View
          </DropdownMenu.Item>
          <DropdownMenu.Item
            data-testid={`user-edit-${user.id}`}
            onSelect={() => onOpen({ mode: "edit", user })}
          >
            <Pencil aria-hidden="true" />
            Edit
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// The View dialog: id, name, role and status.
function UserDetailsDialog({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="user-details-dialog"
        >
          <Dialog.Title>{user.name}</Dialog.Title>
          <Dialog.Description>
            A user in the back-office directory.
          </Dialog.Description>
          <dl className="detail-list">
            <div>
              <dt>ID</dt>
              <dd className="mono" data-testid="user-details-id">
                {user.id}
              </dd>
            </div>
            <div>
              <dt>Name</dt>
              <dd data-testid="user-details-name">{user.name}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd data-testid="user-details-role">
                <Badge value={user.role} />
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd data-testid="user-details-status">
                <Badge value={user.status} />
              </dd>
            </div>
          </dl>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="btn" data-testid="user-details-close">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Role and status only: that is what PATCH /api/users/:id can change.
function EditUserDialog({
  user,
  runKey,
  onClose,
}: {
  user: User;
  runKey: string;
  onClose: () => void;
}) {
  // The cache, and the role and status picked (Active when the user's status is
  // neither).
  const queryClient = useQueryClient();
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(
    EDIT_STATUSES.includes(user.status) ? user.status : "Active",
  );
  // Save; on success, refresh the list and close.
  const mutation = useMutation({
    mutationFn: () => updateUser(user.id, { role, status }, runKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users", runKey] });
      onClose();
    },
  });

  // The title, a line on what can change, the two pickers, any error, and the
  // buttons.
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          data-testid="user-edit-dialog"
        >
          <Dialog.Title>Edit {user.name}</Dialog.Title>
          <Dialog.Description>
            Change the role or the status. The name can't be changed here.
          </Dialog.Description>
          <form
            data-testid="user-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {/* The role. */}
            <div className="field">
              <label htmlFor="user-edit-role">Role</label>
              <select
                id="user-edit-role"
                data-testid="user-edit-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {EDIT_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            {/* The status. */}
            <div className="field">
              <label htmlFor="user-edit-status">Status</label>
              <select
                id="user-edit-status"
                data-testid="user-edit-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {EDIT_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            {/* What went wrong. */}
            {mutation.isError && (
              <p data-testid="user-edit-error" role="alert" className="callout">
                {(mutation.error as Error).message}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="btn btn-primary"
                type="submit"
                data-testid="user-edit-save"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving…" : "Save"}
              </button>
              <Dialog.Close asChild>
                <button type="button" data-testid="user-edit-cancel">
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

// The page: the heading with New user, the search, the table, and any open
// dialog.
export function UsersPage() {
  // The runKey, its flags, and the dialog open now.
  const runKey = useRunKey();
  const flags = useAppFlags(runKey);
  const [dialog, setDialog] = useState<UserDialog>(null);

  // The users for this runKey.
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["users", runKey],
    queryFn: () => getUsers(runKey),
  });

  // Debounced client-side search. INTENTIONAL DEFECT hook: with usersSearchStale
  // armed, the debounce applies the PREVIOUS query (stale closure / off-by-one),
  // so the filter lags one input behind (REPORT).
  const [searchInput, setSearchInput] = useState("");
  const [applied, setApplied] = useState("");
  const lastQueryRef = useRef("");
  const searchStale = flags?.usersSearchStale ?? false;

  // Apply the search 250 ms after the last key; with the bug armed, apply the
  // one before.
  useEffect(() => {
    const handle = setTimeout(() => {
      setApplied(searchStale ? lastQueryRef.current : searchInput);
      lastQueryRef.current = searchInput;
    }, 250);
    return () => clearTimeout(handle);
  }, [searchInput, searchStale]);

  // The users whose names hold the search.
  const users = data?.users ?? [];
  const filtered = applied
    ? users.filter((user) =>
        user.name.toLowerCase().includes(applied.toLowerCase()),
      )
    : users;

  // The heading with the date and New user, the search, then loading, an error,
  // or the table.
  return (
    <section data-testid="users-page" className="page">
      <PageHeader
        eyebrow="Back office"
        title="Users"
        description={
          <p data-testid="users-asof" className="page-sub">
            Directory as of{" "}
            {formatShortDate(DIRECTORY_AS_OF, flags?.usersLocaleBug ?? false)}
          </p>
        }
        actions={
          <CreateUserDialog
            runKey={runKey}
            a11yBug={flags?.usersA11yBug ?? false}
          />
        }
      />

      {/* The search box. */}
      <div className="toolbar">
        <input
          data-testid="users-search"
          className="input input-search"
          type="search"
          placeholder="Search by name"
          aria-label="Search users by name"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </div>

      {/* Loading. */}
      {isPending && (
        <p data-testid="users-loading" className="state">
          Loading users…
        </p>
      )}

      {/* The error. */}
      {isError && (
        <p data-testid="users-error" role="alert" className="callout">
          {(error as Error).message}
        </p>
      )}

      {/* No match, or the table with a menu on each row. */}
      {data &&
        (filtered.length === 0 ? (
          <p data-testid="users-no-results" className="empty">
            No users match “{applied}”.
          </p>
        ) : (
          <div className="card table-card">
            <div className="table-wrap">
              <table data-testid="users-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id} data-testid={`user-row-${user.id}`}>
                      <td className="cell-id">{user.id}</td>
                      <td data-testid={`user-name-${user.id}`}>
                        <span className="user-cell">
                          <Avatar name={user.name} seed={user.id} />
                          {user.name}
                        </span>
                      </td>
                      <td>
                        <Badge value={user.role} />
                      </td>
                      <td>
                        <Badge value={user.status} />
                      </td>
                      <td className="cell-actions">
                        <UserRowActions user={user} onOpen={setDialog} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {/* The View or Edit dialog, when one is open. */}
      {dialog?.mode === "view" && (
        <UserDetailsDialog user={dialog.user} onClose={() => setDialog(null)} />
      )}
      {dialog?.mode === "edit" && (
        <EditUserDialog
          user={dialog.user}
          runKey={runKey}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
