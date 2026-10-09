-- Playground Bank, phase 2a: users with roles, their sessions, profiles and
-- settings. Ids are UUIDs made by the app. Every table name starts with bank_.

CREATE TABLE bank_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'support', 'admin')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'locked')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only a SHA-256 hash of each session token is stored, so a copy of this table
-- can't be used to sign in.
CREATE TABLE bank_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX bank_sessions_user_id ON bank_sessions (user_id);

CREATE TABLE bank_profiles (
  user_id uuid PRIMARY KEY REFERENCES bank_users (id) ON DELETE CASCADE,
  phone text NOT NULL DEFAULT '',
  address_line text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_settings (
  user_id uuid PRIMARY KEY REFERENCES bank_users (id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('USD', 'EUR', 'GBP', 'ILS')),
  locale text NOT NULL DEFAULT 'en-US'
    CHECK (locale IN ('en-US', 'en-GB', 'de-DE')),
  email_alerts boolean NOT NULL DEFAULT true,
  statement_emails boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
