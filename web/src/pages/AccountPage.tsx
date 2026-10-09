import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, getSession } from "../api";
import { ROLE_LABELS } from "../bankApi";
import { AccountIcon } from "../components/icons";
import { Avatar, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";

// Two sessions: the Playground Bank account, and the back-office session that
// the planted auth bug (authRequired) works on. Its test hooks stay as they were.
export function AccountPage() {
  const runKey = useRunKey();
  const { user: bankUser } = useBankSession();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["session", runKey],
    queryFn: () => getSession(runKey),
    retry: false,
  });

  return (
    <section data-testid="account-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Account"
        description={
          <p className="page-sub">Your current sessions on Playground Bank.</p>
        }
      />

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

      <div className="card card-pad">
        <h2 className="card-title">Back-office session</h2>
        <p className="muted card-sub">
          The classic site's demo staff accounts sign in on the classic site at
          /login.
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

        {data && data.authenticated && (
          <div data-testid="account-user" className="account-row">
            <Avatar
              name={data.user?.name ?? "User"}
              seed={data.user?.id ?? "user"}
            />
            <p className="account-title">
              Signed in as {data.user?.name} ({data.role})
            </p>
          </div>
        )}

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
      </div>
    </section>
  );
}
