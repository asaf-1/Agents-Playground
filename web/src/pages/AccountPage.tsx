import { useQuery } from "@tanstack/react-query";
import { ApiError, getSession } from "../api";
import { useRunKey } from "../useAppFlags";

export function AccountPage() {
  const runKey = useRunKey();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["session", runKey],
    queryFn: () => getSession(runKey),
    retry: false,
  });

  return (
    <section data-testid="account-page">
      <h1 data-testid="app-heading">Account</h1>

      {isPending && <p data-testid="account-loading">Checking session…</p>}

      {isError && (
        <div data-testid="account-expired" role="alert">
          <p>
            {error instanceof ApiError && error.status === 401
              ? "Your session is no longer valid. Please sign in again."
              : (error as Error).message}
          </p>
        </div>
      )}

      {data && data.authenticated && (
        <div data-testid="account-user">
          <p>
            Signed in as {data.user?.name} ({data.role})
          </p>
        </div>
      )}

      {data && !data.authenticated && (
        <p data-testid="account-anon">You are not signed in.</p>
      )}
    </section>
  );
}
