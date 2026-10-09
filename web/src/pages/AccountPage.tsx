import { useQuery } from "@tanstack/react-query";
import { ApiError, getSession } from "../api";
import { AccountIcon } from "../components/icons";
import { Avatar, PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";

export function AccountPage() {
  const runKey = useRunKey();

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
          <p className="page-sub">Your current session on Playground Bank.</p>
        }
      />

      <div className="card card-pad">
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
