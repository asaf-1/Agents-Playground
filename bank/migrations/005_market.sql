-- Playground Bank, phase 3a: the crypto exchange's market.
--
-- This table holds the coins that exist and how each one behaves. It does NOT
-- hold prices. A price belongs to one customer at one instant and is computed
-- by bank/market.js, so there is nothing here to go stale, and two customers
-- looking at the same coin see different numbers on different paths.
--
-- A price is in micro-dollars: 1,000,000 micros = $1.00, so six decimal
-- places. Cents are too coarse for a market -- on a $0.39 coin a single cent
-- is a 2.5% jump -- and a rate is allowed finer precision than an amount, the
-- same way loan rates are kept in basis points. Money that actually moves is
-- still rounded to whole cents when a trade settles.
--
-- anchor_micros is only the middle of the band a customer's own starting price
-- is drawn from, never a price anybody is shown.

CREATE TABLE bank_coins (
  symbol text PRIMARY KEY,
  name text NOT NULL,
  anchor_micros bigint NOT NULL CHECK (anchor_micros > 0),
  -- How far this coin swings, as a natural-log multiplier: 0.08 is a coin that
  -- usually stays inside about ±8% of its own line.
  volatility numeric(6, 4) NOT NULL CHECK (volatility > 0),
  -- How strongly this coin trends. It weights the slowest waves in the price,
  -- so a high value gives long climbs and long slides. Which way a given
  -- customer is leaning right now comes from their own seed, so the same coin
  -- trends up for one person and down for another.
  drift numeric(6, 4) NOT NULL CHECK (drift >= 0),
  -- The order size, in 1e-8 units, that moves this coin's price by about 12%.
  -- Smaller depth means a customer's own buying shifts the price more.
  depth_atoms bigint NOT NULL CHECK (depth_atoms > 0),
  -- Where it sits in the markets list before any sorting is applied.
  rank integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_coins_rank ON bank_coins (rank);

-- The coin universe. Adding a row here is all it takes for a new coin to show
-- up on every customer's market, each with their own price for it.
INSERT INTO bank_coins
  (symbol, name, anchor_micros, volatility, drift, depth_atoms, rank)
VALUES
  ('BTC', 'Bitcoin',    67420150000, 0.2200, 0.0180,   5000000000, 1),
  ('ETH', 'Ethereum',    3512800000, 0.2600, 0.0220,  90000000000, 2),
  ('SOL', 'Solana',       172440000, 0.3400, 0.0320, 900000000000, 3),
  ('ADA', 'Cardano',         452100, 0.3800, 0.0380, 90000000000000, 4),
  ('AVAX', 'Avalanche',    36180000, 0.3600, 0.0350, 4000000000000, 5),
  ('LINK', 'Chainlink',    17920000, 0.3200, 0.0300, 8000000000000, 6),
  ('DOT', 'Polkadot',       7040000, 0.3300, 0.0330, 20000000000000, 7),
  -- PLAY is the house coin: it barely moves, so there is always one steady
  -- line on the page to compare the others against.
  ('PLAY', 'Playground',    1000000, 0.0700, 0.0090, 50000000000000, 8);
