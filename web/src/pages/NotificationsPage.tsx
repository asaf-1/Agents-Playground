// The Notifications page: every notification, newest first.

// The data cache and the router, the mark-read calls, and the bell's shared
// parts.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { markAllNotificationsRead, markNotificationRead } from "../bankApi";
import {
  NOTIFICATIONS_KEY,
  NotificationText,
  useNotifications,
} from "../components/NotificationBell";
// The sign-in card and the page heading.
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
// The test's runKey, who is signed in, and links that keep the runKey.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { bankPath } from "../useMoney";

// Every notification, newest first. Opening one marks it read and goes to the
// screen it is about.
export function NotificationsPage() {
  // The runKey, the router, the cache, who is signed in, and their
  // notifications.
  const runKey = useRunKey();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, account, isLoading } = useBankSession();
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
  // How many are unread.
  const unread = notes.data?.unread ?? 0;

  // The heading with Mark all read, then the sign-in card, the empty note or
  // the list.
  return (
    <section data-testid="notifications-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Notifications"
        description={
          <p className="page-sub" data-testid="notifications-unread">
            {user ? `${unread} unread.` : "What others did that concerns you."}
          </p>
        }
        actions={
          user && (
            <button
              className="btn"
              data-testid="notifications-mark-all"
              disabled={unread === 0 || readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              Mark all read
            </button>
          )
        }
      />
      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt
          next="/notifications"
          title="Log in to see your notifications"
        />
      )}
      {/* Nothing yet. */}
      {notes.data && notes.data.notifications.length === 0 && (
        <p className="empty" data-testid="notifications-empty">
          Nothing yet.
        </p>
      )}
      {/* Each one: opening it marks it read and goes to its link. */}
      {notes.data && notes.data.notifications.length > 0 && (
        <ul className="card notif-list" data-testid="notifications-list">
          {notes.data.notifications.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                className={note.read ? "notif-row" : "notif-row is-unread"}
                data-testid={`notification-${note.id}`}
                onClick={() => {
                  if (!note.read) read.mutate(note.id);
                  if (note.link) navigate(bankPath(note.link, runKey));
                }}
              >
                <NotificationText note={note} settings={account?.settings} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
