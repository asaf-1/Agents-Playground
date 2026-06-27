import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { getUsers, type User } from "../api";
import { CreateUserDialog } from "../components/CreateUserDialog";

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
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  return (
    <section data-testid="users-page">
      <h1 data-testid="app-heading">Users</h1>

      <CreateUserDialog />

      {isPending && <p data-testid="users-loading">Loading users…</p>}

      {isError && (
        <p data-testid="users-error" role="alert">
          {(error as Error).message}
        </p>
      )}

      {data && (
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
            {data.users.map((user) => (
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
      )}
    </section>
  );
}
