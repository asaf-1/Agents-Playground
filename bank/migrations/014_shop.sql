-- Playground Bank, "a more real back end", phases 2 and 3: the gear shop and
-- its back office. Until now the 48 products lived in server.js's memory and
-- nothing could be bought. From here they are rows with real stock, a customer
-- fills a cart and pays from a bank account, and staff move each order along.

-- The catalogue. The ids, names, categories, prices, stock and status are the
-- ones the shop always showed (bank/shop.js seeds them once). Stock is real
-- now: a checkout takes it down, a refund puts it back, an Admin restocks. It
-- can never go below zero; the planted oversell bug sells the last one twice
-- without breaking this rule, which is exactly why it is hard to see.
CREATE TABLE bank_shop_products (
  id text PRIMARY KEY CHECK (id ~ '^sku-[0-9]{3}$'),
  name text NOT NULL,
  category text NOT NULL,
  list_price_cents bigint NOT NULL CHECK (list_price_cents > 0),
  stock integer NOT NULL CHECK (stock >= 0),
  status text NOT NULL CHECK (status IN ('Available', 'Backordered')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A customer's cart: one row per product, with how many. Nothing is reserved
-- by putting it in a cart; stock is checked again at checkout.
CREATE TABLE bank_shop_cart_items (
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES bank_shop_products (id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- Carts that hold a product (the foreign key's own index).
CREATE INDEX bank_shop_cart_items_product ON bank_shop_cart_items (product_id);

-- An order: who bought, the account that paid, what it cost and where it is
-- now. total_cents is what was actually taken from the account; refunded_cents
-- is what has gone back. The status only moves forward (placed, packed,
-- shipped, delivered), or ends as refunded; bank/shop.js enforces the order.
CREATE TABLE bank_shop_orders (
  id uuid PRIMARY KEY,
  number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES bank_users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES bank_money_accounts (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'placed'
    CHECK (status IN ('placed', 'packed', 'shipped', 'delivered', 'refunded')),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents > 0),
  discount_basis_points integer NOT NULL DEFAULT 0
    CHECK (discount_basis_points BETWEEN 0 AND 10000),
  discount_cents bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents > 0),
  refunded_cents bigint NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A customer's orders, newest first; the staff list by status; and the paying
-- account's foreign key.
CREATE INDEX bank_shop_orders_user ON bank_shop_orders (user_id, created_at);
CREATE INDEX bank_shop_orders_status ON bank_shop_orders (status, created_at);
CREATE INDEX bank_shop_orders_account ON bank_shop_orders (account_id);

-- What an order holds, with the name and unit price as they were when it was
-- bought, so a later price change never rewrites an old receipt.
CREATE TABLE bank_shop_order_lines (
  order_id uuid NOT NULL REFERENCES bank_shop_orders (id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES bank_shop_products (id),
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents > 0),
  PRIMARY KEY (order_id, product_id)
);

-- Lines that hold a product (the foreign key's own index).
CREATE INDEX bank_shop_order_lines_product ON bank_shop_order_lines (product_id);

-- Every step an order took, who took it, and when: what the customer's "My
-- orders" page shows as the order's history.
CREATE TABLE bank_shop_order_events (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES bank_shop_orders (id) ON DELETE CASCADE,
  status text NOT NULL,
  actor_user_id uuid REFERENCES bank_users (id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- An order's steps in order, and the actor's foreign key.
CREATE INDEX bank_shop_order_events_order
  ON bank_shop_order_events (order_id, created_at);
CREATE INDEX bank_shop_order_events_actor
  ON bank_shop_order_events (actor_user_id);

-- A purchase and a refund are history rows like a bill or a trade, so the list
-- is re-stated with them, as 003, 006 and 010 did.
ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_kind;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_kind
  CHECK (kind IN ('opening', 'deposit', 'transfer_in', 'transfer_out',
                  'bill_payment', 'loan_disbursement',
                  'crypto_buy', 'crypto_sell', 'card_purchase',
                  'shop_purchase', 'shop_refund'));

-- The receipt, each step of the order, and a refund tell the customer.
ALTER TABLE bank_notifications DROP CONSTRAINT bank_notifications_kind_check;
ALTER TABLE bank_notifications ADD CONSTRAINT bank_notifications_kind_check
  CHECK (kind IN (
    'money_received', 'loan_decided', 'account_changed', 'request_received',
    'request_answered', 'support_reply', 'support_solved', 'welcome',
    'scheduled_paid', 'scheduled_failed', 'card_declined', 'order_filled',
    'order_failed', 'price_alert', 'shop_order', 'shop_order_status',
    'shop_refund'
  ));
