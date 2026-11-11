// The bell on the top bar: the unread count, the latest notifications, and a
// link to them all.

// Radix's dropdown menu, the data cache, the router, and the notification
// icons.
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  Bell,
  BellRing,
  CalendarCheck,
  CalendarX,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  CreditCard,
  HandCoins,
  LifeBuoy,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
// The notification calls and the formats.
import {
  formatMoney,
  formatUtc,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type BankNotification,
  type BankSettings,
  type NotificationKind,
} from "../bankApi";
// The test's runKey, who is signed in, and links that keep the runKey.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// The cache key for notifications.
export const NOTIFICATIONS_KEY = ["bank", "notifications"] as const;

// Each kind of notification's icon. Typed against every kind the server can
// send (NotificationKind), so a new kind without an icon fails the type check
// instead of reaching the page: six kinds once had none, and a declined card,
// a scheduled payment, a filled order or a price alert blanked the whole page.
const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  money_received: ArrowDownLeft,
  loan_decided: HandCoins,
  account_changed: ShieldCheck,
  request_received: CircleDollarSign,
  request_answered: CircleDollarSign,
  support_reply: LifeBuoy,
  support_solved: LifeBuoy,
  welcome: Sparkles,
  // Scheduled payments: paid on the day, or not.
  scheduled_paid: CalendarCheck,
  scheduled_failed: CalendarX,
  // Cards: a purchase the card refused.
  card_declined: CreditCard,
  // The exchange: a limit order filled or failed, a price alert went off.
  order_filled: CircleCheck,
  order_failed: CircleX,
  price_alert: BellRing,
  // The gear shop: the receipt, each step of the order, and a refund.
  shop_order: ShoppingBag,
  shop_order_status: Truck,
  shop_refund: Undo2,
};

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

// One notification: its icon, title, amount, text, time and unread dot. The
// notifications page uses it too.
export function NotificationText({
  note,
  settings,
}: {
  note: BankNotification;
  settings: BankSettings | undefined;
}) {
  // A kind this page doesn't know yet still shows, with the plain bell.
  const Icon = KIND_ICONS[note.kind] ?? Bell;
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
  // The runKey, the router, the cache, who is signed in, and their
  // notifications.
  const runKey = useRunKey();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, account } = useBankSession();
  const notes = useNotifications(runKey, Boolean(user));
  // Refresh every notifications query.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  // Mark one read, or all of them; either way, refresh.
  const read = useMutation({
    mutationFn: (id: string) => markNotificationRead(id, runKey),
    onSettled: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(runKey),
    onSettled: refresh,
  });

  // Nobody signed in: no bell.
  if (!user) {
    return null;
  }
  // The unread count, and the newest 8.
  const unread = notes.data?.unread ?? 0;
  const list = (notes.data?.notifications ?? []).slice(0, 8);

  // The bell button and its menu.
  return (
    <DropdownMenu.Root modal={false}>
      {/* The bell, with the unread count (99+ above 99). */}
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
          {/* The title, and Mark all read. */}
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
          {/* Nothing to show yet. */}
          {list.length === 0 && (
            <p className="menu-note" data-testid="notif-empty">
              Nothing yet. When someone sends you money or answers you, it shows
              up here.
            </p>
          )}
          {/* Each one: picking it marks it read and opens its link. */}
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
          {/* A link to every notification. */}
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
