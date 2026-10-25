import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endOtherSessions, endSession, listSessions } from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { BANK_ME_KEY, useBankSession } from "../useBankSession";

// The security pack: every browser signed in to the account, with "end" per
// device and "log out everywhere else". The page names sessions by id and
// never sees a token; the server decides what is "this device" from the
// cookie that made the request.
const SESSIONS_KEY = ["bank", "sessions"] as const;

function formatWhen(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function DevicesPage() {
  const { account, isLoading } = useBankSession();
  const runKey = useRunKey();
  const queryClient = useQueryClient();
  const [ended, setEnded] = useState<number | null>(null);

  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: listSessions,
    enabled: Boolean(account),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });

  const endOne = useMutation({
    mutationFn: endSession,
    onSuccess: (result) => {
      if (result.current) {
        // This very session was ended, so the cookie is gone and the account
        // with it; the shell will show the visitor as signed out.
        queryClient.invalidateQueries({ queryKey: BANK_ME_KEY });
      }
      refresh();
    },
  });

  // Forwards the run key so practice mode can arm its planted bug for this
  // visitor only.
  const endOthers = useMutation({
    mutationFn: () => endOtherSessions(runKey),
    onSuccess: (result) => {
      setEnded(result.ended);
      refresh();
    },
  });

  const locale = account?.settings.locale ?? "en-US";
  const rows = sessions.data?.sessions ?? [];
  const others = rows.filter((session) => !session.current).length;
  const actionError = (endOne.error ?? endOthers.error) as Error | null;

  return (
    <section data-testid="devices-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Devices"
        description={
          <p className="page-sub">
            Every browser that is signed in to your account. End one you do not
            recognise, or all of them but this one.
          </p>
        }
      />

      {!isLoading && !account && (
        <SignInPrompt next="/devices" title="Log in to see your devices" />
      )}

      {account && (
        <div className="card card-pad">
          <p className="muted" data-testid="devices-count">
            {rows.length === 1
              ? "1 signed-in device"
              : `${rows.length} signed-in devices`}
          </p>

          {sessions.isError && (
            <p data-testid="devices-error" role="alert" className="callout">
              {(sessions.error as Error).message}
            </p>
          )}

          <ul className="devices-list" data-testid="devices-list">
            {rows.map((session) => (
              <li
                key={session.id}
                className="devices-row"
                data-testid="device-row"
                data-current={session.current ? "true" : "false"}
              >
                <div className="devices-main">
                  <div className="devices-title">
                    <strong data-testid="device-name">{session.device}</strong>
                    {session.current && (
                      <span
                        className="badge badge-success"
                        data-testid="device-current"
                      >
                        This device
                      </span>
                    )}
                  </div>
                  <p className="muted devices-when">
                    Signed in {formatWhen(session.createdAt, locale)} · last
                    seen {formatWhen(session.lastSeenAt, locale)}
                  </p>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    data-testid="device-end"
                    disabled={endOne.isPending}
                    onClick={() => endOne.mutate(session.id)}
                  >
                    End
                  </button>
                )}
              </li>
            ))}
          </ul>

          {ended !== null && (
            <p className="callout callout-success" data-testid="devices-ended">
              Signed out {ended} other {ended === 1 ? "device" : "devices"}.
            </p>
          )}
          {actionError && (
            <p
              data-testid="devices-action-error"
              role="alert"
              className="callout"
            >
              {actionError.message}
            </p>
          )}

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="devices-end-others"
              disabled={others === 0 || endOthers.isPending}
              onClick={() => endOthers.mutate()}
            >
              {endOthers.isPending ? "Signing out…" : "Log out everywhere else"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
