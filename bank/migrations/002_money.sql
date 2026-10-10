-- Playground Bank, phase 2b: money. Amounts are whole cents in bigint, never
-- floating point, so 0.10 + 0.20 is exactly 0.30. A balance can only change
-- inside the same database transaction that records why it changed.

CREATE TABLE bank_money_accounts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  number text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('checking', 'savings')),
  name text NOT NULL,
  balance_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_money_accounts_user ON bank_money_accounts (user_id, created_at);

-- One row per transfer. The key a client sends with a transfer is stored here,
-- so the same key sent twice moves the money once.
CREATE TABLE bank_transfers (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  from_account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  to_account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  memo text NOT NULL DEFAULT '',
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

-- Every change to a balance: money in is positive, money out is negative, and
-- the balance right after it is kept, so history never has to be recomputed.
-- seq gives a stable newest-first order when two rows share a timestamp.
CREATE TABLE bank_transactions (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  kind text NOT NULL
    CONSTRAINT bank_transactions_kind
    CHECK (kind IN ('opening', 'deposit', 'transfer_in', 'transfer_out')),
  amount_cents bigint NOT NULL,
  balance_after_cents bigint NOT NULL,
  description text NOT NULL,
  memo text NOT NULL DEFAULT '',
  counterparty text NOT NULL DEFAULT '',
  transfer_id uuid REFERENCES bank_transfers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_transactions_account ON bank_transactions (account_id, created_at, seq);
