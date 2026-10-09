import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  CircleUserRound,
  LogIn,
  LogOut,
  Settings,
  UserPen,
} from "lucide-react";
import { getSession, logout } from "../api";
import { Avatar, Badge } from "./ui";

// The account menu on the top-bar chip. It reads the session under its own run
// key ("shell"), so flags a test arms for its run never reach the shell.
export function UserMenu() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["session", "shell"],
    queryFn: () => getSession("shell"),
    retry: false,
  });
  const user = data?.authenticated ? data.user : undefined;

  const signOut = useMutation({
    mutationFn: logout,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="user-chip"
          data-testid="account-menu-trigger"
          aria-label={user ? `Account menu for ${user.name}` : "Account menu"}
        >
          <Avatar name={user?.name ?? "Guest"} seed={user?.id ?? "guest"} />
          <span>{user ? user.name.split(" ")[0] : "Guest"}</span>
          {user && <Badge value={user.role} />}
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="dropdown-content account-menu"
          data-testid="account-menu"
          align="end"
          sideOffset={8}
        >
          <DropdownMenu.Label className="menu-label">
            <strong>{user ? user.name : "Guest"}</strong>
            <span>{user ? user.email : "Not signed in"}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="menu-separator" />

          {!user && (
            <DropdownMenu.Item asChild>
              <Link data-testid="account-menu-login" to="/login">
                <LogIn aria-hidden="true" />
                Log in
              </Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item asChild>
            <Link data-testid="account-menu-view-profile" to="/account">
              <CircleUserRound aria-hidden="true" />
              View profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item data-testid="account-menu-edit-profile" disabled>
            <UserPen aria-hidden="true" />
            Edit profile
            <span className="soon-pill">Soon</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item data-testid="account-menu-settings" disabled>
            <Settings aria-hidden="true" />
            Settings
            <span className="soon-pill">Soon</span>
          </DropdownMenu.Item>

          {user && (
            <>
              <DropdownMenu.Separator className="menu-separator" />
              <DropdownMenu.Item
                data-testid="account-menu-logout"
                onSelect={() => signOut.mutate()}
              >
                <LogOut aria-hidden="true" />
                Log out
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
