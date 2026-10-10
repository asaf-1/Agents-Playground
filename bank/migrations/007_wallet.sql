-- Playground Bank, phase 3c: wallets. Sending coin to another customer, and
-- swapping one coin for another.
--
-- Buying and selling (3b) move money in and out of a bank account. These do
-- not: they move coin between customers, or between two of a customer's own
-- holdings. No cents change hands, which is why nothing here writes into
-- bank_transactions.

-- One address per customer per coin, so a customer can be sent coin without
-- giving out their email. The address carries a checksum, so a typo is
-- catchable -- which is the whole point of the "check the address" step.
CREATE TABLE bank_wallets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  address text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

CREATE INDEX bank_wallets_address ON bank_wallets (address);

-- One row per send. to_user_id is null when the coin went to an address that
-- belongs to nobody, which should be impossible -- and is exactly what the
-- planted bad-address bug makes possible.
CREATE TABLE bank_wallet_sends (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  to_address text NOT NULL,
  to_user_id uuid REFERENCES bank_users (id) ON DELETE SET NULL,
  quantity_atoms bigint NOT NULL CHECK (quantity_atoms > 0),
  -- The network fee, in the coin being sent, not in money.
  fee_atoms bigint NOT NULL CHECK (fee_atoms >= 0),
  memo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_wallet_sends_user ON bank_wallet_sends (user_id, created_at);
CREATE INDEX bank_wallet_sends_to ON bank_wallet_sends (to_user_id, created_at);

-- One coin straight into another, priced through both of the customer's own
-- prices. The fee is taken in money terms and shows as a smaller amount out.
CREATE TABLE bank_swaps (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  from_symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  to_symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  from_atoms bigint NOT NULL CHECK (from_atoms > 0),
  to_atoms bigint NOT NULL CHECK (to_atoms > 0),
  -- What each side was priced at, kept so a swap can be explained later.
  from_price_micros bigint NOT NULL CHECK (from_price_micros > 0),
  to_price_micros bigint NOT NULL CHECK (to_price_micros > 0),
  -- The value that went in, and the fee taken out of it, both in cents.
  value_cents bigint NOT NULL,
  fee_cents bigint NOT NULL CHECK (fee_cents >= 0),
  -- What the coin given up had cost, so the swap can move the cost basis
  -- across rather than inventing a new one.
  cost_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_symbol <> to_symbol)
);

CREATE INDEX bank_swaps_user ON bank_swaps (user_id, created_at);
