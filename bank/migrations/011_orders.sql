-- Playground Bank, phase A4: limit orders and price alerts on the exchange.

-- An order to buy or sell a coin when the customer's own price reaches a
-- limit: a buy fills at or below it, a sell at or above it. Nothing waits in
-- the background; open orders are checked against the price whenever the
-- customer makes a request (bank/exchange.js), and a fill goes through the
-- same quote-and-fill code as a trade made by hand, so it carries the fee and
-- lands in the same history. A buy carries what to spend, a sell how much to
-- sell; exactly one of the two is set.
CREATE TABLE bank_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  spend_cents bigint CHECK (spend_cents IS NULL OR spend_cents > 0),
  quantity_atoms bigint CHECK (quantity_atoms IS NULL OR quantity_atoms > 0),
  limit_micros bigint NOT NULL CHECK (limit_micros > 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'filled', 'cancelled', 'failed')),
  fill_price_micros bigint,
  trade_id uuid REFERENCES bank_trades (id) ON DELETE SET NULL,
  fail_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  filled_at timestamptz,
  CHECK ((spend_cents IS NULL) <> (quantity_atoms IS NULL))
);

CREATE INDEX bank_orders_open ON bank_orders (user_id, status, created_at);

-- "Tell me when BTC goes above $X." Fires once, with the price it saw.
CREATE TABLE bank_price_alerts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES bank_coins (symbol) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('above', 'below')),
  limit_micros bigint NOT NULL CHECK (limit_micros > 0),
  status text NOT NULL DEFAULT 'armed'
    CHECK (status IN ('armed', 'fired', 'cancelled')),
  fired_micros bigint,
  fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_price_alerts_armed ON bank_price_alerts (user_id, status, created_at);

-- Three more things the bell can say.
ALTER TABLE bank_notifications DROP CONSTRAINT bank_notifications_kind_check;
ALTER TABLE bank_notifications ADD CONSTRAINT bank_notifications_kind_check
  CHECK (kind IN (
    'money_received', 'loan_decided', 'account_changed', 'request_received',
    'request_answered', 'support_reply', 'support_solved', 'welcome',
    'scheduled_paid', 'scheduled_failed', 'card_declined',
    'order_filled', 'order_failed', 'price_alert'
  ));
