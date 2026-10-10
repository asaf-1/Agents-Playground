-- Playground Bank, phase 2c: connected flows. What one person does shows up
-- for another: notifications, money requests and support tickets.

-- One row per thing someone should know about. amount_cents, when set, is
-- formatted by the page in the reader's own currency and number format.
CREATE TABLE bank_notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'money_received', 'loan_decided', 'account_changed', 'request_received',
    'request_answered', 'support_reply', 'support_solved', 'welcome'
  )),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  amount_cents bigint,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_notifications_user ON bank_notifications (user_id, created_at);

-- A customer asks another customer for money, by the payer's account number.
-- Paying it is a real transfer, recorded in transfer_id.
CREATE TABLE bank_money_requests (
  id uuid PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  to_account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  payer_account_number text NOT NULL,
  amount_cents bigint NOT NULL,
  memo text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'declined', 'cancelled')),
  transfer_id uuid REFERENCES bank_transfers (id) ON DELETE SET NULL,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_money_requests_payer ON bank_money_requests (payer_id, created_at);
CREATE INDEX bank_money_requests_requester ON bank_money_requests (requester_id, created_at);

-- A customer's question to the bank, optionally about one transaction, and
-- the conversation with staff.
CREATE TABLE bank_support_tickets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  subject text NOT NULL,
  transaction_id uuid REFERENCES bank_transactions (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'solved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_support_tickets_user ON bank_support_tickets (user_id, updated_at);
CREATE INDEX bank_support_tickets_status ON bank_support_tickets (status, updated_at);

CREATE TABLE bank_support_messages (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  ticket_id uuid NOT NULL REFERENCES bank_support_tickets (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_support_messages_ticket ON bank_support_messages (ticket_id, seq);
