-- Playground Bank, plan 2 phase B1: three indexes the busiest reads were
-- missing, found by `npm run db:audit` (scripts/db/index-audit.js) on a
-- customer with 20,000 notifications, 20,000 card charges and 5,000 orders.

-- The bell's unread count runs on every page load and read every notification
-- the customer ever had. A partial index holds only the unread ones, which is
-- the whole question, so it stays small however long the history grows.
CREATE INDEX bank_notifications_unread
  ON bank_notifications (user_id)
  WHERE read_at IS NULL;

-- A card's charges a page at a time, newest first (GraphQL Card.charges):
-- without this, every page sorted the card's whole history to return 21 rows.
CREATE INDEX bank_card_charges_card_newest
  ON bank_card_charges (card_id, created_at, id);

-- Every order a customer placed, newest first, a page at a time (GraphQL
-- orders). bank_orders_open leads with status, which suits the sweep's "open
-- ones" and not "all of them".
CREATE INDEX bank_orders_user_newest
  ON bank_orders (user_id, created_at, id);

-- Deliberately not indexed: the 27 foreign keys whose parent rows this app
-- never deletes (coins, accounts, users, transfers, trades). An index on each
-- would only make every insert slower; the audit lists them.
