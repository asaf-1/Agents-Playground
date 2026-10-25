-- Playground Bank, the security pack: sessions a customer can see and end, and
-- a hold on repeated failed log-ins.

-- A session was a token hash and an expiry. For the Devices page it also needs
-- a stable id the page can name without ever seeing the token, a short
-- description of the browser it was opened from, and when it was last used.
ALTER TABLE bank_sessions
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN device text NOT NULL DEFAULT '',
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX bank_sessions_id ON bank_sessions (id);

-- Failed log-ins, counted per email and per client (the caller's address), so
-- one visitor's mistakes never lock a shared demo account for everyone. After
-- enough failures within the window the pair is held until held_until; a
-- successful log-in clears the row. The limits live in settings
-- (BANK_LOGIN_MAX_FAILURES, BANK_LOGIN_HOLD_SECONDS), not here.
CREATE TABLE bank_login_holds (
  email text NOT NULL,
  client text NOT NULL,
  failures integer NOT NULL DEFAULT 0,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  held_until timestamptz,
  PRIMARY KEY (email, client)
);
