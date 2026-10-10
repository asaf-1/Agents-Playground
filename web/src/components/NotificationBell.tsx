import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  Bell,
  CircleDollarSign,
  HandCoins,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  formatMoney,
  formatUtc,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type BankNotification,
  type BankSettings,
} from "../bankApi";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

export const NOTIFICATIONS_KEY = ["bank", "notifications"] as const;

const KIND_ICONS = {
  money_received: ArrowDownLeft,
  loan_decided: HandCoins,
  account_changed: ShieldCheck,
  request_received: CircleDollarSign,
  request_answered: CircleDollarSign,
  support_reply: LifeBuoy,
  support_solved: LifeBuoy,
  welcome: Sparkles,
} as const;

// The notifications for the signed-in person, refreshed every 15 seconds so
// what someone else does shows up without a reload.
export function useNotifications(runKey: string, enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, runKey],
    queryFn: () => listNotifications(runKey),
    enabled,
    refetchInterval: 15_000,
  });
}

export function NotificationText({
  note,
  settings,
}: {
  note: BankNotification;
  settings: BankSettings | undefined;
}) {
  const Icon = KIND_ICONS[note.kind];
  return (
    <>
      <span className="notif-icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="notif-text">
        <strong>
          {note.title}
          {note.amountCents !== null && (
            <span className="notif-amount">
              {" "}
              {formatMoney(note.amountCents, settings)}
            </span>
          )}
        </strong>
        {note.body && <span className="notif-body">{note.body}</span>}
        <span className="notif-time">{formatUtc(note.createdAt)} UTC</span>
      </span>
      {!note.read && <span className="notif-dot" aria-label="Unread" />}
    </>
  );
}

// The bell on the top bar, for signed-in Playground Bank accounts.
export function NotificationBell() {
  const runKey = useRunKey();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, account } = useBankSession();
  const notes = useNotifications(runKey, Boolean(user));
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  const read = useMutation({
    mutationFn: (id: string) => markNotificationRead(id, runKey),
    onSettled: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(runKey),
    onSettled: refresh,
  });

  if (!user) {
    return null;
  }
  const unread = notes.data?.unread ?? 0;
  const list = (notes.data?.notifications ?? []).slice(0, 8);

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          className="icon-chip"
          data-testid="notif-bell"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <span className="notif-count" data-testid="notif-count">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="dropdown-content notif-menu"
          data-testid="notif-menu"
          align="end"
          sideOffset={8}
        >
          <div className="notif-head">
            <strong>Notifications</strong>
            <button
              type="button"
              className="link-button"
              data-testid="notif-mark-all"
              disabled={unread === 0 || readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              Mark all read
            </button>
          </div>
          <DropdownMenu.Separator className="menu-separator" />
          {list.length === 0 && (
            <p className="menu-note" data-testid="notif-empty">
              Nothing yet. When someone sends you money or answers you, it shows
              up here.
            </p>
          )}
          {list.map((note) => (
            <DropdownMenu.Item
              key={note.id}
              className="notif-item"
              data-testid={`notif-item-${note.id}`}
              onSelect={() => {
                if (!note.read) read.mutate(note.id);
                if (note.link) navigate(bankPath(note.link, runKey));
              }}
            >
              <NotificationText note={note} settings={account?.settings} />
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Item
            data-testid="notif-see-all"
            onSelect={() => navigate(bankPath("/notifications", runKey))}
          >
            See all notifications
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
