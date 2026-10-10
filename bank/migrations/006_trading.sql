-- Playground Bank, phase 3b: buying and selling crypto with bank money.
--
-- This is where the exchange stops being a chart and joins the bank. A buy
-- takes real cents out of a real account and gives back coin; a sell does the
-- reverse. Both land in bank_transactions, so there is one history for money
-- and coin rather than two that can disagree.
--
-- Quantities are in "atoms": hundred-millionths of a coin, as whole numbers,
-- so 0.1 + 0.2 of a coin is exactly 0.3. Prices are in micro-dollars, as on
-- the market. Money is in cents, as everywhere else in the bank.

-- A price the customer was shown and can act on. It holds for 15 seconds,
-- which is what makes "the price moved while you were deciding" a real thing
-- to test. A quote is per customer and single use.
CREATE TABLE bank_trade_quotes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  -- What the customer asked for: an amount of money to spend, or a quantity
  -- of coin to sell. Exactly one is set.
  spend_cents bigint,
  quantity_atoms bigint,
  -- The price this quote is good for, and what it works out to.
  price_micros bigint NOT NULL CHECK (price_micros > 0),
  gross_cents bigint NOT NULL,
  fee_cents bigint NOT NULL CHECK (fee_cents >= 0),
  net_cents bigint NOT NULL,
  filled_atoms bigint NOT NULL CHECK (filled_atoms > 0),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((spend_cents IS NULL) <> (quantity_atoms IS NULL))
);

CREATE INDEX bank_trade_quotes_user ON bank_trade_quotes (user_id, created_at);

-- What a customer holds of one coin, and what they paid for it. cost_atoms and
-- cost_cents together are the running cost basis: selling takes the same
-- proportion out of both, so the average price paid never drifts.
CREATE TABLE bank_holdings (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  quantity_atoms bigint NOT NULL DEFAULT 0 CHECK (quantity_atoms >= 0),
  -- Total cents paid for the coin still held. Divided by the quantity, it is
  -- the average price paid, which is what profit and loss is measured against.
  cost_cents bigint NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

CREATE INDEX bank_holdings_user ON bank_holdings (user_id, symbol);

-- One row per filled trade: what happened, at what price, and which bank
-- transaction paid for it. Kept even after the holding is sold down to zero,
-- so a history never loses a trade.
CREATE TABLE bank_trades (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity_atoms bigint NOT NULL CHECK (quantity_atoms > 0),
  price_micros bigint NOT NULL CHECK (price_micros > 0),
  gross_cents bigint NOT NULL,
  fee_cents bigint NOT NULL CHECK (fee_cents >= 0),
  -- What actually left or entered the bank account: gross plus the fee on a
  -- buy, gross minus the fee on a sell.
  net_cents bigint NOT NULL,
  -- On a sell, what the sold coin had cost, so realised profit is kept rather
  -- than recomputed from a history that may have been filtered.
  cost_cents bigint NOT NULL DEFAULT 0,
  quote_id uuid REFERENCES bank_trade_quotes (id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES bank_transactions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_trades_user ON bank_trades (user_id, created_at);
CREATE INDEX bank_trades_symbol ON bank_trades (user_id, symbol, created_at);

-- Crypto money moves through the same ledger as every other kind, so one
-- history shows a transfer, a bill, a loan and a coin purchase together.
ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_kind;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_kind
  CHECK (kind IN ('opening', 'deposit', 'transfer_in', 'transfer_out',
                  'bill_payment', 'loan_disbursement',
                  'crypto_buy', 'crypto_sell'));
