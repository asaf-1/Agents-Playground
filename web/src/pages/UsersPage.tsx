import { useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { getUsers, type User } from "../api";
import { CreateUserDialog } from "../components/CreateUserDialog";
import { formatShortDate } from "../format";
import { useAppFlags, useRunKey } from "../useAppFlags";

// Fixed reference date so the locale-formatting defect is deterministic.
const DIRECTORY_AS_OF = "2026-01-15T12:00:00Z";

function UserRowActions({ user }: { user: User }) {
  return (
    <DropdownMenu.Root>
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
          <DropdownMenu.Item data-testid={`user-view-${user.id}`}>
            View
          </DropdownMenu.Item>
          <DropdownMenu.Item data-testid={`user-edit-${user.id}`}>
            Edit
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function UsersPage() {
  const runKey = useRunKey();
  const flags = useAppFlags(runKey);

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

  useEffect(() => {
    const handle = setTimeout(() => {
      setApplied(searchStale ? lastQueryRef.current : searchInput);
      lastQueryRef.current = searchInput;
    }, 250);
    return () => clearTimeout(handle);
  }, [searchInput, searchStale]);

  const users = data?.users ?? [];
  const filtered = applied
    ? users.filter((user) =>
        user.name.toLowerCase().includes(applied.toLowerCase()),
      )
    : users;

  return (
    <section data-testid="users-page">
      <h1 data-testid="app-heading">Users</h1>

      <p data-testid="users-asof">
        Directory as of{" "}
        {formatShortDate(DIRECTORY_AS_OF, flags?.usersLocaleBug ?? false)}
      </p>

      <CreateUserDialog
        runKey={runKey}
        a11yBug={flags?.usersA11yBug ?? false}
      />

      <input
        data-testid="users-search"
        type="search"
        placeholder="Search by name"
        aria-label="Search users by name"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
      />

      {isPending && <p data-testid="users-loading">Loading users…</p>}

      {isError && (
        <p data-testid="users-error" role="alert">
          {(error as Error).message}
        </p>
      )}

      {data &&
        (filtered.length === 0 ? (
          <p data-testid="users-no-results">No users match “{applied}”.</p>
        ) : (
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
                  <td>{user.id}</td>
                  <td data-testid={`user-name-${user.id}`}>{user.name}</td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                  <td>
                    <UserRowActions user={user} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
}
