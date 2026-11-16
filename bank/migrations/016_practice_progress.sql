-- Playground Bank: the Practice page's progress, for signed-up customers.

-- One row per customer and planted fault they have marked "I found it". The
-- flag is a name from the practice catalogue (practice.js); the server checks
-- it before writing. Which faults are switched on is never stored (that lives
-- with the visitor's run key and ends with their browser); only what a
-- customer found. Demo accounts are shared, so they never get rows: the
-- server refuses their writes. Deleting a customer deletes their progress.
CREATE TABLE bank_practice_progress (
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  flag text NOT NULL,
  found_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flag)
);
