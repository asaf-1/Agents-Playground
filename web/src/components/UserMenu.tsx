// The account menu on the top bar: log in or sign up as a guest; profile,
// settings and log out when signed in.

// Radix's dropdown menu, the data cache, the router's link, and the menu's
// icons.
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  CircleUserRound,
  LogIn,
  LogOut,
  Settings,
  UserPen,
  UserPlus,
  UsersRound,
} from "lucide-react";
// The log-out call, the role names, and who is signed in.
import { bankLogout, ROLE_LABELS } from "../bankApi";
import { useBankSession, useSetBankAccount } from "../useBankSession";
// The avatar and the role badge.
import { Avatar, Badge } from "./ui";

// The account menu on the top-bar chip, for Playground Bank accounts. Guests
// see Edit profile and Settings disabled until they log in.
export function UserMenu() {
  // Who is signed in, and the way to change it.
  const { user } = useBankSession();
  const setAccount = useSetBankAccount();

  // Log out, then forget the account here, even if the call failed.
  const signOut = useMutation({
    mutationFn: bankLogout,
    onSettled: () => setAccount(null),
  });

  // Support and admin users get the Bank users link.
  const staff = user?.role === "support" || user?.role === "admin";

  return (
    <DropdownMenu.Root>
      {/* The chip: avatar, first name and role badge. */}
      <DropdownMenu.Trigger asChild>
        <button
          className="user-chip"
          data-testid="account-menu-trigger"
          aria-label={
            user ? `Account menu for ${user.fullName}` : "Account menu"
          }
        >
          <Avatar name={user?.fullName ?? "Guest"} seed={user?.id ?? "guest"} />
          <span>{user ? user.fullName.split(" ")[0] : "Guest"}</span>
          {user && <Badge value={ROLE_LABELS[user.role]} />}
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      {/* The menu, opened under the chip. */}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="dropdown-content account-menu"
          data-testid="account-menu"
          align="end"
          sideOffset={8}
        >
          {/* Who it is: name and email, or Guest. */}
          <DropdownMenu.Label className="menu-label">
            <strong>{user ? user.fullName : "Guest"}</strong>
            <span>{user ? user.email : "Not signed in"}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="menu-separator" />

          {/* A guest: Log in and Sign up. */}
          {!user && (
            <>
              <DropdownMenu.Item asChild>
                <Link data-testid="account-menu-login" to="/login">
                  <LogIn aria-hidden="true" />
                  Log in
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link data-testid="account-menu-signup" to="/signup">
                  <UserPlus aria-hidden="true" />
                  Sign up
                </Link>
              </DropdownMenu.Item>
            </>
          )}
          {/* View profile, for everyone. */}
          <DropdownMenu.Item asChild>
            <Link data-testid="account-menu-view-profile" to="/profile">
              <CircleUserRound aria-hidden="true" />
              View profile
            </Link>
          </DropdownMenu.Item>
          {/* Edit profile and Settings: links when signed in, greyed out
              for a guest. */}
          {user ? (
            <>
              <DropdownMenu.Item asChild>
                <Link
                  data-testid="account-menu-edit-profile"
                  to="/profile/edit"
                >
                  <UserPen aria-hidden="true" />
                  Edit profile
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link data-testid="account-menu-settings" to="/settings">
                  <Settings aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenu.Item>
            </>
          ) : (
            <>
              <DropdownMenu.Item
                data-testid="account-menu-edit-profile"
                disabled
              >
                <UserPen aria-hidden="true" />
                Edit profile
              </DropdownMenu.Item>
              <DropdownMenu.Item data-testid="account-menu-settings" disabled>
                <Settings aria-hidden="true" />
                Settings
              </DropdownMenu.Item>
            </>
          )}
          {/* Staff only: Bank users. */}
          {staff && (
            <DropdownMenu.Item asChild>
              <Link data-testid="account-menu-bank-users" to="/admin/users">
                <UsersRound aria-hidden="true" />
                Bank users
              </Link>
            </DropdownMenu.Item>
          )}

          {/* Signed in: Log out. */}
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
