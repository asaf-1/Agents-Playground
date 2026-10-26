import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import {
  createApiKey,
  fieldErrors,
  formatDate,
  listApiKeys,
  revokeApiKey,
  type ApiKey,
  type KeyScope,
} from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useBankSession } from "../useBankSession";

// Personal API keys for practising API testing against the bank. A key is
// shown once, right here; after that the page knows only its prefix.
const KEYS_KEY = ["bank", "keys"] as const;

export function DeveloperPage() {
  const { account, user, isLoading } = useBankSession();
  const locale = account?.settings.locale ?? "en-US";
  const canChange = Boolean(user && !user.isDemo);
  const queryClient = useQueryClient();

  const keys = useQuery({
    queryKey: KEYS_KEY,
    queryFn: listApiKeys,
    enabled: Boolean(user),
  });

  const [name, setName] = useState("");
  const [scope, setScope] = useState<KeyScope>("read");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ key: ApiKey; token: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => createApiKey({ name: name.trim(), scope }),
    onSuccess: (created) => {
      setFresh(created);
      setCopied(false);
      setName("");
      setError("");
      queryClient.invalidateQueries({ queryKey: KEYS_KEY });
    },
    onError: (failure) =>
      setError(fieldErrors(failure).name ?? (failure as Error).message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS_KEY }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Name the key in 2 to 60 characters.");
      return;
    }
    create.mutate();
  }

  async function copyToken() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const rows = keys.data?.keys ?? [];

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

      {!isLoading && !user && (
        <SignInPrompt next="/developer" title="Log in to make an API key" />
      )}

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

      {canChange && (
        <form
          className="card card-pad form-card"
          data-testid="key-form"
          onSubmit={submit}
          noValidate
        >
          <h2 className="form-section">New key</h2>
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
          <p className="muted">
            A read key may only GET and run GraphQL queries; a write key may do
            what you may. Every key is limited to{" "}
            <span data-testid="keys-rate-limit">
              {keys.data?.rateLimitPerMinute ?? "…"}
            </span>{" "}
            requests a minute, and keys cannot manage keys.
          </p>
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

      {user && keys.data && rows.length === 0 && (
        <p className="empty" data-testid="keys-empty">
          No keys yet.
        </p>
      )}
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
