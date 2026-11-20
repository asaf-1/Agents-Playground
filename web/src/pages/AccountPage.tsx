// The Sign-in status page (at /account, its address since the start): the
// bank sign-in, and the demo's back-office session.

// React state, the data cache, the router's link, the back-office calls and
// the role names.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, getSession, login, logout } from "../api";
import { ROLE_LABELS } from "../bankApi";
// The icon, the avatar, the badge and the page heading.
import { AccountIcon } from "../components/icons";
import { Avatar, Badge, PageHeader } from "../components/ui";
// The test's runKey, and who is signed in to the bank.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";

// The back office's demo staff (SEEDED_CREDENTIALS in server.js), one per
// role. Their roles decide what /app/users lets them do.
const BACK_OFFICE_STAFF = [
  {
    email: "alice@demo.local",
    role: "Admin",
    note: "Creates, edits and deletes users",
  },
  {
    email: "bob@demo.local",
    role: "Editor",
    note: "Creates and edits users; may not delete",
  },
  {
    email: "carol@demo.local",
    role: "Viewer",
    note: "Inactive on purpose: the sign-in is refused",
  },
];

// The back-office sign-in form (the original demo site's /login page, moved
// here on 2026-11-20): email, password, the server's answer, and the staff to
// try. On success the session card above shows who is signed in.
function BackOfficeSignIn({ runKey }: { runKey: string }) {
  // What is typed, and the cache to refresh after signing in.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();

  // Sign in; on success, ask again who is signed in, and re-read the users
  // (what /app/users offers depends on the role).
  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async () => {
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["session", runKey] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // The form, then the demo staff and their shared password.
  return (
    <div className="auth-grid">
      <form
        data-testid="backoffice-form"
        className="card card-pad"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {/* The email. */}
        <div className="field">
          <label htmlFor="backoffice-email">Email</label>
          <input
            id="backoffice-email"
            data-testid="backoffice-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        {/* The password. */}
        <div className="field">
          <label htmlFor="backoffice-password">Password</label>
          <input
            id="backoffice-password"
            data-testid="backoffice-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {/* The server's answer, such as a wrong password or an inactive
            account. */}
        {mutation.isError && (
          <p data-testid="backoffice-error" role="alert" className="callout">
            {(mutation.error as Error).message}
          </p>
        )}

        <button
          data-testid="backoffice-submit"
          className="btn btn-primary btn-block"
          type="submit"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Signing in…" : "Sign in to the back office"}
        </button>
      </form>

      {/* The demo staff and their shared password. */}
      <aside
        className="card card-pad demo-accounts"
        data-testid="backoffice-demo-accounts"
      >
        <h3>Back-office staff</h3>
        <p className="muted">
          Password for every one: <code className="mono">demo1234</code>
        </p>
        <div className="demo-list">
          {BACK_OFFICE_STAFF.map((staff) => (
            <div className="demo-row" key={staff.email}>
              <div>
                <p className="mono">{staff.email}</p>
                <p className="muted">{staff.note}</p>
              </div>
              <Badge value={staff.role} />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

// Two sessions: the Playground Bank account, and the back-office session that
// /app/users' role checks and the planted auth bug (authRequired) work on.
export function AccountPage() {
  // The runKey, the bank user, and the cache.
  const runKey = useRunKey();
  const { user: bankUser } = useBankSession();
  const queryClient = useQueryClient();

  // Ask for the back-office session once; a 401 is an answer, so no retry.
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["session", runKey],
    queryFn: () => getSession(runKey),
    retry: false,
  });

  // Sign out of the back office, then ask again who is signed in.
  const signOut = useMutation({
    mutationFn: () => logout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session", runKey] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // The heading, then a card for each session.
  return (
    <section data-testid="account-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Sign-in status"
        description={
          <p className="page-sub">
            Who you are signed in as: in Playground Bank, and in the back office
            behind Orders and Users.
          </p>
        }
      />

      {/* The bank account: who is signed in, or links to log in. */}
      <div className="card card-pad" data-testid="account-bank">
        <h2 className="card-title">Playground Bank account</h2>
        {bankUser ? (
          <div className="account-row">
            <Avatar name={bankUser.fullName} seed={bankUser.id} />
            <div>
              <p className="account-title" data-testid="account-bank-user">
                Signed in as {bankUser.fullName} ({ROLE_LABELS[bankUser.role]})
              </p>
              <Link to="/profile">View profile</Link>
            </div>
          </div>
        ) : (
          <p className="muted" data-testid="account-bank-anon">
            Not signed in. <Link to="/login">Log in</Link> or{" "}
            <Link to="/signup">create an account</Link>.
          </p>
        )}
      </div>

      {/* The back-office session: checking, expired, signed in, or a guest
          with the sign-in form. */}
      <div className="card card-pad" data-testid="account-backoffice">
        <h2 className="card-title">Back-office session</h2>
        <p className="muted card-sub">
          The back office's staff sign in here. Their role decides what the
          Users page lets them do: only an Admin may delete a user.
        </p>
        {isPending && (
          <p data-testid="account-loading" className="state">
            Checking session…
          </p>
        )}

        {isError && (
          <div data-testid="account-expired" role="alert" className="callout">
            <p>
              {error instanceof ApiError && error.status === 401
                ? "Your session is no longer valid. Please sign in again."
                : (error as Error).message}
            </p>
          </div>
        )}

        {/* Signed in: who, and Sign out. */}
        {data && data.authenticated && (
          <div className="account-row">
            <Avatar
              name={data.user?.name ?? "User"}
              seed={data.user?.id ?? "user"}
            />
            <div>
              <p data-testid="account-user" className="account-title">
                Signed in as {data.user?.name} ({data.role})
              </p>
              <button
                data-testid="backoffice-signout"
                className="btn"
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
              >
                {signOut.isPending ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        )}

        {/* A guest. */}
        {data && !data.authenticated && (
          <div className="account-row">
            <span className="account-icon">
              <AccountIcon />
            </span>
            <div>
              <p data-testid="account-anon" className="account-title">
                You are not signed in.
              </p>
              <p className="muted">You are browsing as a guest.</p>
            </div>
          </div>
        )}

        {/* The sign-in form, for a guest and after an expired session. */}
        {(isError || (data && !data.authenticated)) && (
          <BackOfficeSignIn runKey={runKey} />
        )}
      </div>
    </section>
  );
}
