-- Playground Bank, phase 2b-2: bill pay and loans. Amounts stay bigint cents.

-- People a customer pays bills to. Deleting one only marks it, so old
-- payments still show who they went to.
CREATE TABLE bank_payees (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  name text NOT NULL,
  reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX bank_payees_user ON bank_payees (user_id, created_at);

-- One row per bill payment; the key a client sends makes a repeat a no-op,
-- like transfers.
CREATE TABLE bank_bill_payments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  payee_id uuid NOT NULL REFERENCES bank_payees (id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  memo text NOT NULL DEFAULT '',
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

-- A loan a customer asks for; an Admin approves or rejects it. Approving pays
-- the amount into account_id. The rate and payment are fixed when it's asked.
CREATE TABLE bank_loans (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  term_months integer NOT NULL CHECK (term_months IN (12, 24, 36, 60)),
  apr_basis_points integer NOT NULL,
  monthly_payment_cents bigint NOT NULL,
  total_interest_cents bigint NOT NULL,
  purpose text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES bank_users (id) ON DELETE SET NULL,
  decision_note text NOT NULL DEFAULT '',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_loans_user ON bank_loans (user_id, created_at);
CREATE INDEX bank_loans_status ON bank_loans (status, created_at);

ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_kind;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_kind
  CHECK (kind IN ('opening', 'deposit', 'transfer_in', 'transfer_out',
                  'bill_payment', 'loan_disbursement'));
