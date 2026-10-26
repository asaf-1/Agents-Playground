-- Playground Bank, phase A3: a virtual debit card per account.

-- One card per account. The number is 16 digits with a valid Luhn check
-- digit, starting with 9 so it can never collide with a real card range. The
-- CVV is stored in plain text, which a real bank never does: a real CVV
-- exists precisely so that a stolen database is not enough to pay with a card.
-- Here the money is fake and the point is practice, so the page can show it
-- on request. The daily limit starts as a share of the account's balance (see
-- bank/cards.js) and the customer can change it. frozen_by says who froze the
-- card: a customer can unfreeze their own, only the bank (an Admin) can undo
-- a bank freeze.
CREATE TABLE bank_cards (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL UNIQUE REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  number text NOT NULL UNIQUE,
  expires text NOT NULL,
  cvv text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen')),
  frozen_by text CHECK (frozen_by IS NULL OR frozen_by IN ('customer', 'admin')),
  limit_cents bigint NOT NULL CHECK (limit_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_cards_user ON bank_cards (user_id, created_at);

-- Every attempt to pay with a card, approved or declined, with the reason.
-- charged_on is the customer's own day (their clock, see bank/schedule.js),
-- which is what the daily limit counts against.
CREATE TABLE bank_card_charges (
  id uuid PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES bank_cards (id) ON DELETE CASCADE,
  merchant text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('approved', 'declined')),
  reason text CHECK (reason IS NULL OR reason IN ('frozen', 'over_limit', 'insufficient_funds')),
  charged_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_card_charges_card_day
  ON bank_card_charges (card_id, charged_on, status);

-- A card purchase is a history row like a bill or a trade, so the list is
-- re-stated with it, as 003 and 006 did.
ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_kind;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_kind
  CHECK (kind IN ('opening', 'deposit', 'transfer_in', 'transfer_out',
                  'bill_payment', 'loan_disbursement',
                  'crypto_buy', 'crypto_sell', 'card_purchase'));

-- A declined charge tells the customer, so one more notification kind.
ALTER TABLE bank_notifications DROP CONSTRAINT bank_notifications_kind_check;
ALTER TABLE bank_notifications ADD CONSTRAINT bank_notifications_kind_check
  CHECK (kind IN (
    'money_received', 'loan_decided', 'account_changed', 'request_received',
    'request_answered', 'support_reply', 'support_solved', 'welcome',
    'scheduled_paid', 'scheduled_failed', 'card_declined'
  ));
