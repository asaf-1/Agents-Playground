-- Playground Bank, phase A5: personal API keys for developers.

-- A key is shown once and stored as a hash, like a session token: a stolen
-- database holds nothing that opens an account. prefix is the first few
-- characters, kept in clear so the page can say which key is which. scope is
-- what the key may do: read, or read and write; the server checks it on
-- every request, never the page. Revoking keeps the row with revoked_at set,
-- so the Developer page can show what was there.
CREATE TABLE bank_api_keys (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('read', 'write')),
  token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX bank_api_keys_user ON bank_api_keys (user_id, created_at);

-- Requests per key per minute, for the rate limit. One row per key and
-- minute, bumped with an upsert; old minutes are swept as they go.
CREATE TABLE bank_api_key_usage (
  key_id uuid NOT NULL REFERENCES bank_api_keys (id) ON DELETE CASCADE,
  minute timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, minute)
);
