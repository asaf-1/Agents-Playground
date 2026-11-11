-- Playground Bank, "a more real back end", phase 4: two things every real
-- bank's back end keeps -- the answer to every retried money request, and a
-- log of who did what that nobody can edit.

-- Retry-safe money requests. A client sends an Idempotency-Key header (or an
-- idempotencyKey argument in GraphQL) with a change; the first request claims
-- the key here, does the work, and stores its answer. The same key again gets
-- that stored answer instead of doing the work twice. request_hash is a
-- fingerprint of what was asked, so the same key with a different request is
-- refused rather than quietly answered with the first result. Keys older than
-- a day are cleared (bank/idempotency.js), as Stripe does.
CREATE TABLE bank_idempotency_keys (
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 100),
  scope text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running', 'done')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Clearing old keys reads by age.
CREATE INDEX bank_idempotency_keys_created ON bank_idempotency_keys (created_at);

-- The audit log: one line for every staff action and every money action, with
-- who did it, what, to which record, through which door (REST or GraphQL) and
-- how they were signed in (a session or an API key). The actor is copied in,
-- not linked: the log must outlive whatever it describes.
CREATE TABLE bank_audit_log (
  id uuid PRIMARY KEY,
  actor_user_id uuid,
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  door text NOT NULL CHECK (door IN ('rest', 'graphql')),
  auth text NOT NULL CHECK (auth IN ('session', 'api_key')),
  request_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The Audit log page reads newest first, a page after a cursor, optionally for
-- one action or one person.
CREATE INDEX bank_audit_log_recent ON bank_audit_log (created_at DESC, id DESC);
CREATE INDEX bank_audit_log_action ON bank_audit_log (action, created_at DESC);
CREATE INDEX bank_audit_log_actor ON bank_audit_log (actor_user_id, created_at DESC);

-- Append-only, enforced by the database itself: an UPDATE or a DELETE on the
-- log is refused, whoever sends it and through whatever code. The app has no
-- route that changes a line; this makes sure no future one can either.
CREATE FUNCTION bank_audit_log_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bank_audit_log is append-only: lines cannot be changed or deleted';
END
$$;

CREATE TRIGGER bank_audit_log_no_change
  BEFORE UPDATE OR DELETE ON bank_audit_log
  FOR EACH ROW EXECUTE FUNCTION bank_audit_log_append_only();
