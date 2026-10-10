import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import {
  EXAMPLES,
  loadSchema,
  runGraphql,
  type GraphqlResult,
} from "../graphqlApi";
import { PageHeader } from "../components/ui";
import { useRunKey } from "../useAppFlags";

// The GraphQL explorer: write a query, run it, read the answer, and browse the
// schema the server reports through introspection. Built into the site so
// practising GraphQL needs no separate tool.

function parseVariables(text: string): Record<string, unknown> | undefined {
  const value = text.trim();
  if (!value) {
    return undefined;
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error('Variables must be a JSON object, like { "id": "…" }.');
  }
  return parsed as Record<string, unknown>;
}

function SchemaBrowser({ runKey }: { runKey: string }) {
  const schema = useQuery({
    queryKey: ["bank", "graphql", "schema", runKey],
    queryFn: () => loadSchema(runKey),
    staleTime: 5 * 60_000,
  });

  if (schema.isLoading) {
    return (
      <p className="state" data-testid="graphql-schema-loading">
        Loading the schema…
      </p>
    );
  }
  if (schema.isError) {
    return (
      <p role="alert" className="callout" data-testid="graphql-schema-error">
        {(schema.error as Error).message}
      </p>
    );
  }

  return (
    <div className="card card-pad" data-testid="graphql-schema">
      {schema.data?.map((type) => (
        <details key={type.name} data-testid={`graphql-type-${type.name}`}>
          <summary>
            <span className="mono">{type.name}</span>
            {type.description && (
              <span className="muted"> · {type.description}</span>
            )}
          </summary>
          <ul className="schema-fields">
            {type.fields.map((field) => (
              <li key={field.name}>
                <code className="mono">
                  {field.name}
                  {field.args.length > 0 &&
                    `(${field.args
                      .map((arg) => `${arg.name}: ${arg.type}`)
                      .join(", ")})`}
                  : {field.type}
                </code>
                {field.description && (
                  <span className="muted"> {field.description}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

export function GraphqlPage() {
  const runKey = useRunKey();
  const [query, setQuery] = useState(EXAMPLES[0].query);
  const [variables, setVariables] = useState("");
  const [example, setExample] = useState(EXAMPLES[0].name);
  const [inputError, setInputError] = useState<string | null>(null);

  const run = useMutation<GraphqlResult>({
    mutationFn: () => runGraphql(query, parseVariables(variables), runKey),
  });

  function pickExample(name: string) {
    const chosen = EXAMPLES.find((item) => item.name === name);
    if (!chosen) {
      return;
    }
    setExample(name);
    setQuery(chosen.query);
    setVariables(chosen.variables ?? "");
    setInputError(null);
    run.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setInputError(null);
    try {
      parseVariables(variables);
    } catch (error) {
      setInputError(
        error instanceof SyntaxError
          ? "The variables aren't valid JSON."
          : (error as Error).message,
      );
      return;
    }
    run.mutate();
  }

  const result = run.data;
  const failed = Boolean(result?.errors?.length);

  return (
    <section data-testid="graphql-page" className="page">
      <PageHeader
        eyebrow="Developers"
        title="GraphQL"
        description={
          <p className="page-sub">
            One address, <code className="mono">POST /api/bank/graphql</code>,
            over the same accounts, money and rules as the REST API. Ask for the
            fields you want and get exactly those back.
          </p>
        }
        actions={
          <a
            className="btn"
            data-testid="graphql-docs-link"
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
          >
            REST API docs
          </a>
        }
      />

      <div className="callout callout-info" data-testid="graphql-note">
        <span>
          You run as whoever is signed in. Signed out, a query answers{" "}
          <code className="mono">NOT_SIGNED_IN</code>; demo accounts can read
          everything but can't change anything.
        </span>
      </div>

      <form
        className="card card-pad form-card graphql-form"
        data-testid="graphql-form"
        onSubmit={submit}
      >
        <h2>Query</h2>
        <div className="field">
          <label htmlFor="graphql-example">Start from an example</label>
          <select
            id="graphql-example"
            data-testid="graphql-example"
            value={example}
            onChange={(event) => pickExample(event.target.value)}
          >
            {EXAMPLES.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="graphql-query">Query</label>
          <textarea
            id="graphql-query"
            data-testid="graphql-query"
            className="mono code-area"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="graphql-variables">Variables (JSON, optional)</label>
          <textarea
            id="graphql-variables"
            data-testid="graphql-variables"
            className="mono code-area code-area-short"
            spellCheck={false}
            placeholder={'{ "id": "…" }'}
            aria-invalid={inputError ? true : undefined}
            value={variables}
            onChange={(event) => setVariables(event.target.value)}
          />
          {inputError && (
            <p role="alert" data-testid="graphql-variables-error">
              {inputError}
            </p>
          )}
        </div>
        <div className="btn-row">
          <button
            className="btn btn-primary"
            type="submit"
            data-testid="graphql-run"
            disabled={run.isPending}
          >
            <Play aria-hidden="true" />
            {run.isPending ? "Running…" : "Run query"}
          </button>
        </div>
      </form>

      {run.isError && (
        <p role="alert" className="callout" data-testid="graphql-run-error">
          {(run.error as Error).message}
        </p>
      )}

      {result && (
        <>
          <div className="section-head">
            <h2>Response</h2>
            <span
              className={`badge badge-${failed ? "danger" : "success"}`}
              data-testid="graphql-result-status"
            >
              {failed
                ? `${result.errors?.length} error${result.errors?.length === 1 ? "" : "s"}`
                : "No errors"}
            </span>
          </div>
          {/* The box scrolls, so it takes focus: a keyboard alone can read it. */}
          <pre
            className="card card-pad code-block"
            data-testid="graphql-response"
            tabIndex={0}
            role="region"
            aria-label="Response"
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </>
      )}

      <div className="section-head">
        <h2>Schema</h2>
      </div>
      <p className="page-sub">
        Read from the server with an introspection query, so it is always what
        the API really offers.
      </p>
      <SchemaBrowser runKey={runKey} />
    </section>
  );
}
