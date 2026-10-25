-- Playground Bank, phase A2: scheduled payments, and a clock of the customer's
-- own.

-- Each customer may move their own calendar forward on the Practice page, so a
-- payment due "tomorrow" can be watched happening now. The offset is theirs
-- alone: the site's real clock, and everyone else's, never move. Only whole
-- days, only forward, and reset puts it back.
CREATE TABLE bank_clocks (
  user_id uuid PRIMARY KEY REFERENCES bank_users (id) ON DELETE CASCADE,
  offset_days integer NOT NULL DEFAULT 0 CHECK (offset_days >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A bill to pay on a date, once or on a repeat. next_due is the scheduled
-- date; when it falls on a weekend the payment runs on the Monday after, which
-- is worked out when it runs, not stored. anchor_day is the day of the month
-- the schedule was made for, so a monthly payment set for the 31st lands on
-- the 30th or the 28th in shorter months and comes back to the 31st after.
CREATE TABLE bank_scheduled_payments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  payee_id uuid NOT NULL REFERENCES bank_payees (id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  memo text NOT NULL DEFAULT '',
  repeat text NOT NULL CHECK (repeat IN ('once', 'weekly', 'monthly')),
  anchor_day integer NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
  next_due date NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'done', 'failed', 'cancelled')),
  runs integer NOT NULL DEFAULT 0,
  last_run_on date,
  last_result text CHECK (last_result IS NULL OR last_result IN ('paid', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_scheduled_payments_due
  ON bank_scheduled_payments (user_id, status, next_due);

-- Two new kinds of notification: a scheduled payment that was paid, and one
-- that was not. The kind list is a CHECK constraint, so it is re-stated in
-- full, as 003 and 006 did for bank_transactions.
ALTER TABLE bank_notifications DROP CONSTRAINT bank_notifications_kind_check;
ALTER TABLE bank_notifications ADD CONSTRAINT bank_notifications_kind_check
  CHECK (kind IN (
    'money_received', 'loan_decided', 'account_changed', 'request_received',
    'request_answered', 'support_reply', 'support_solved', 'welcome',
    'scheduled_paid', 'scheduled_failed'
  ));
