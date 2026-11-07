// The API keys page: make a personal key, see it once, and revoke it.

// React state, the router's link, the data cache and the icons.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
// The key calls, field errors and the date format.
import {
  createApiKey,
  fieldErrors,
  formatDate,
  listApiKeys,
  revokeApiKey,
  type ApiKey,
  type KeyScope,
} from "../bankApi";
// The sign-in card, the page heading, and who is signed in.
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useBankSession } from "../useBankSession";

// Personal API keys for practising API testing against the bank. A key is
// shown once, right here; after that the page knows only its prefix.
const KEYS_KEY = ["bank", "keys"] as const;

// The page: the new-key form, the key just made, and the list.
export function DeveloperPage() {
  // Who is signed in, their locale, whether they can change things, and the
  // cache.
  const { account, user, isLoading } = useBankSession();
  const locale = account?.settings.locale ?? "en-US";
  const canChange = Boolean(user && !user.isDemo);
  const queryClient = useQueryClient();

  // Their keys.
  const keys = useQuery({
    queryKey: KEYS_KEY,
    queryFn: listApiKeys,
    enabled: Boolean(user),
  });

  // The form's name and scope, any error, the key just made, and whether it was
  // copied.
  const [name, setName] = useState("");
  const [scope, setScope] = useState<KeyScope>("read");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ key: ApiKey; token: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  // Make the key; on success, show it once, clear the form and refresh the
  // list.
  const create = useMutation({
    mutationFn: () => createApiKey({ name: name.trim(), scope }),
    onSuccess: (created) => {
      setFresh(created);
      setCopied(false);
      setName("");
      setError("");
      queryClient.invalidateQueries({ queryKey: KEYS_KEY });
    },
    // A problem with the name, or the server's message.
    onError: (failure) =>
      setError(fieldErrors(failure).name ?? (failure as Error).message),
  });
  // Revoke a key, then refresh the list.
  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS_KEY }),
  });

  // Check the name here first, then make the key.
  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Name the key in 2 to 60 characters.");
      return;
    }
    create.mutate();
  }

  // Copy the new key; if the browser refuses, the button stays as Copy.
  async function copyToken() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // This site's address, for the curl example.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // The keys to list.
  const rows = keys.data?.keys ?? [];

  // The heading, then the sign-in card, the demo note, the form, the new key
  // and the list.
  return (
    <section data-testid="developer-page" className="page">
      <PageHeader
        eyebrow="Developers"
        title="API keys"
        description={
          <p className="page-sub">
            Call the bank's API without a browser: the REST endpoints in the{" "}
            <a href="/api/docs" target="_blank" rel="noreferrer">
              docs
            </a>{" "}
            and <Link to="/graphql">GraphQL</Link>, with a key of your own.
          </p>
        }
      />

      {/* Signed out: the sign-in card. */}
      {!isLoading && !user && (
        <SignInPrompt next="/developer" title="Log in to make an API key" />
      )}

      {/* A demo account: why it can't make keys. */}
      {user?.isDemo && (
        <div
          className="callout callout-info demo-note"
          data-testid="keys-demo-note"
        >
          <p>
            Demo accounts cannot make keys, because they are shared.{" "}
            <Link to="/signup">Sign up</Link> for a key of your own.
          </p>
        </div>
      )}

      {/* The form: name, scope, the limits, any error, Make key. */}
      {canChange && (
        <form
          className="card card-pad form-card"
          data-testid="key-form"
          onSubmit={submit}
          noValidate
        >
          <h2 className="form-section">New key</h2>
          {/* The name and scope. */}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="key-name">Name</label>
              <input
                id="key-name"
                data-testid="key-name"
                placeholder="Postman on my laptop"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="key-scope">Scope</label>
              <select
                id="key-scope"
                data-testid="key-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as KeyScope)}
              >
                <option value="read">Read only</option>
                <option value="write">Read and write</option>
              </select>
            </div>
          </div>
          {/* What each scope may do, and the rate limit. */}
          <p className="muted">
            A read key may only GET and run GraphQL queries; a write key may do
            what you may. Every key is limited to{" "}
            <span data-testid="keys-rate-limit">
              {keys.data?.rateLimitPerMinute ?? "…"}
            </span>{" "}
            requests a minute, and keys cannot manage keys.
          </p>
          {/* What went wrong. */}
          {error && (
            <p role="alert" className="callout" data-testid="key-error">
              {error}
            </p>
          )}
          <div className="btn-row">
            <button
              type="submit"
              className="btn btn-primary"
              data-testid="key-create"
              disabled={create.isPending}
            >
              <KeyRound aria-hidden="true" /> Make key
            </button>
          </div>
        </form>
      )}

      {/* The key just made: the token, Copy, Done, a curl example. */}
      {fresh && (
        <div className="card card-pad" data-testid="key-fresh">
          <h2 className="form-section">Your new key, shown once</h2>
          <p className="muted">
            Copy it now. It is stored as a hash, so nobody, including this page,
            can show it again.
          </p>
          <p className="key-token mono" data-testid="key-token">
            {fresh.token}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-sm"
              data-testid="key-token-copy"
              onClick={copyToken}
            >
              <Copy aria-hidden="true" /> {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              data-testid="key-token-done"
              onClick={() => setFresh(null)}
            >
              Done
            </button>
          </div>
          <p className="muted">Try it:</p>
          <pre className="key-example mono" data-testid="key-example">
            {`curl -H "Authorization: Bearer ${fresh.token}" ${origin}/api/bank/me`}
          </pre>
        </div>
      )}

      {/* No keys yet. */}
      {user && keys.data && rows.length === 0 && (
        <p className="empty" data-testid="keys-empty">
          No keys yet.
        </p>
      )}
      {/* The keys table, with Revoke on active keys. */}
      {rows.length > 0 && (
        <div className="card table-card">
          <div className="table-wrap">
            <table data-testid="keys-list">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Scope</th>
                  <th>Made</th>
                  <th>Last used</th>
                  <th>Status</th>
                  {canChange && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((key) => (
                  <tr
                    key={key.id}
                    data-testid={`key-row-${key.id}`}
                    data-status={key.revokedAt ? "revoked" : "active"}
                  >
                    <td>{key.name}</td>
                    <td className="cell-mono">{key.prefix}…</td>
                    <td>
                      {key.scope === "read" ? "Read only" : "Read and write"}
                    </td>
                    <td className="cell-mono">
                      {formatDate(key.createdAt, locale)}
                    </td>
                    <td className="cell-mono">
                      {key.lastUsedAt
                        ? formatDate(key.lastUsedAt, locale)
                        : "Never"}
                    </td>
                    <td data-testid={`key-status-${key.id}`}>
                      {key.revokedAt ? "Revoked" : "Active"}
                    </td>
                    {canChange && (
                      <td className="cell-num">
                        {!key.revokedAt && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            data-testid={`key-revoke-${key.id}`}
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(key.id)}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
