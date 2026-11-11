// Node's crypto for ids and order numbers, the money helpers, and
// notifications.
const crypto = require("crypto");
const { InsufficientFundsError, cents, insertTransaction } = require("./money");
const { notify } = require("./notify");

// The gear shop ("a more real back end", phases 2 and 3). The 48 products are
// rows with real stock; a customer fills a cart and pays from one of their bank
// accounts; staff move each order placed -> packed -> shipped -> delivered, or
// refund it. A checkout is one database transaction: the money, the stock, the
// order, its history row and the receipt are all saved, or none of them.
//
// Six bugs are planted here, all off by default and armed per run key like the
// rest of the site:
//   - bankShopOversell:        two checkouts sell the last item twice.
//   - bankShopClientPrice:     checkout charges the total the browser sent.
//   - bankShopBackorderBuyable: a Backordered product can be bought.
//   - bankShopRefundTwice:     an order can be refunded a second time.
//   - bankShopStatusSkip:      an order can jump steps or go backwards.
//   - bankShopSupportRefund:   lives in bank/routes.js, where the role is
//                              checked.

// --- The catalogue ------------------------------------------------------------

// The six categories, eight products each.
const CATEGORIES = [
  "Compute",
  "Storage",
  "Network",
  "Security",
  "Observability",
  "Data",
];

// Eight made-up crypto gear names per category, in catalogue order (moved here
// from server.js, which kept them in memory until the shop became real).
const PRODUCT_NAMES = {
  Compute: [
    "Hashforge S1 Miner",
    "Ember GPU Rig 6x",
    "Quarry ASIC Q9",
    "Validator Box V1",
    "Hashforge S2 Pro Miner",
    "Ember GPU Rig 8x",
    "Quarry ASIC Q12",
    "Validator Box V2 Max",
  ],
  Storage: [
    "Vaultkey Nano Wallet",
    "Frostbyte Cold Wallet",
    "Cellar Air-Gapped Wallet",
    "Seedsafe Titanium Backup",
    "Vaultkey Touch Wallet",
    "Frostbyte Steel Seed Plate",
    "Cellar Multisig Kit",
    "Seedsafe Fireproof Vault",
  ],
  Network: [
    "Relay Node Mini",
    "Lightning Router L1",
    "Meshlink Node Kit",
    "Archive Node 4TB",
    "Relay Node Pro",
    "Lightning Router L2",
    "Meshlink Satellite Receiver",
    "Archive Node 8TB",
  ],
  Security: [
    "Sentinel Security Key",
    "Bastion 2FA Token",
    "Faraday Wallet Pouch",
    "Signing Card Duo",
    "Sentinel Security Key NFC",
    "Bastion Biometric Key",
    "Tamper-Evident Bag Pack",
    "Privacy Screen Filter",
  ],
  Observability: [
    "Pulse Price Ticker",
    "Hashwatch Rig Monitor",
    "Mempool Lamp",
    "Node Health Beacon",
    "Pulse Desk Display",
    "Hashwatch Thermal Probe",
    "Gas Fee Gauge",
    "Portfolio E-Ink Frame",
  ],
  Data: [
    "Price Oracle Feed",
    "Candles Market Data 1Y",
    "Chain Analytics Seat",
    "Block Explorer API Key",
    "Price Oracle Feed Pro",
    "Candles Market Data 5Y",
    "Tax Export Pack",
    "Whale Watch Stream",
  ],
};

// The 48 products as the shop first stocks them: the same ids, names,
// categories, prices, stock and status the catalogue always showed. They are
// written to the database once; from then on the rows are the truth.
function starterCatalogue() {
  return Array.from({ length: 48 }, (_, index) => {
    const n = index + 1;
    const category = CATEGORIES[index % CATEGORIES.length];
    return {
      id: `sku-${String(n).padStart(3, "0")}`,
      name: PRODUCT_NAMES[category][Math.floor(index / CATEGORIES.length)],
      category,
      listPriceCents: (100 + n * 15) * 100,
      stock: (n * 7) % 50,
      status: n % 9 === 0 ? "Backordered" : "Available",
    };
  });
}

// Stocks the shop on first start; a product that already exists is left as it
// is, so a restart never undoes a sale or a restock.
async function seedShopProducts(db) {
  const products = starterCatalogue();
  const values = [];
  const params = [];
  products.forEach((product, index) => {
    const at = index * 6;
    values.push(
      `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6})`,
    );
    params.push(
      product.id,
      product.name,
      product.category,
      product.listPriceCents,
      product.stock,
      product.status,
    );
  });
  await db.query(
    `INSERT INTO bank_shop_products
       (id, name, category, list_price_cents, stock, status)
     VALUES ${values.join(", ")}
     ON CONFLICT (id) DO NOTHING`,
    params,
  );
}

// --- Errors -------------------------------------------------------------------

// Each one becomes its own HTTP answer in bank/routes.js and its own error code
// in GraphQL.
class ProductNotFoundError extends Error {}
class BackorderedError extends Error {
  constructor(product) {
    super(`${product.name} is backordered`);
    this.product = product;
  }
}
class OutOfStockError extends Error {
  constructor(product, available) {
    super(`only ${available} of ${product.name} in stock`);
    this.product = product;
    this.available = available;
  }
}
class EmptyCartError extends Error {}
class PriceChangedError extends Error {
  constructor(totalCents) {
    super("the total changed");
    this.totalCents = totalCents;
  }
}
class OrderNotFoundError extends Error {}
class StatusMoveError extends Error {
  constructor(from, to) {
    super(`an order cannot go from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}
class AlreadyRefundedError extends Error {}
class TooLateToRefundError extends Error {}

// --- Rules ----------------------------------------------------------------------

// At most this many of one product in a cart.
const MAX_LINE_QUANTITY = 99;
// An Admin may set a product's stock from 0 to this.
const MAX_STOCK = 9999;
// How long the planted oversell bug waits between reading the stock and
// writing it, so two checkouts sent together reliably both read the same
// number (the same window the transfer race bug uses).
const RACE_WINDOW_MS = 250;

// The loyalty discount: the more a customer has spent in the shop (orders not
// refunded), the bigger the share off their next order. Policy values, like
// the fee tiers on trades; what a customer pays depends on what they did.
const LOYALTY_TIERS = [
  { fromCents: 0, basisPoints: 0 },
  { fromCents: 100_000, basisPoints: 200 },
  { fromCents: 500_000, basisPoints: 500 },
  { fromCents: 2_000_000, basisPoints: 1000 },
];

// The order's steps, and the one step allowed after each.
const STATUSES = ["placed", "packed", "shipped", "delivered", "refunded"];
const NEXT_STATUS = {
  placed: "packed",
  packed: "shipped",
  shipped: "delivered",
};
// The words the customer reads in a notification for each step.
const STATUS_WORDS = {
  placed: "placed",
  packed: "packed",
  shipped: "shipped",
  delivered: "delivered",
  refunded: "refunded",
};

// The tier for what a customer has spent, and the next one up (null at the
// top).
function tierFor(spentCents) {
  let current = LOYALTY_TIERS[0];
  let next = null;
  for (const tier of LOYALTY_TIERS) {
    if (spentCents >= tier.fromCents) {
      current = tier;
    } else if (!next) {
      next = tier;
    }
  }
  return {
    spentCents,
    basisPoints: current.basisPoints,
    next: next
      ? { atCents: next.fromCents, basisPoints: next.basisPoints }
      : null,
  };
}

// What a customer has spent in the shop, refunds left out. q is the database
// or a transaction.
async function spentCents(q, userId) {
  const { rows } = await q.query(
    `SELECT COALESCE(SUM(total_cents), 0) AS total FROM bank_shop_orders
      WHERE user_id = $1 AND status <> 'refunded'`,
    [userId],
  );
  return cents(rows[0].total);
}

// The customer's discount now.
async function loyalty(db, userId) {
  return tierFor(await spentCents(db, userId));
}

// The share off, in whole cents, rounded down so the bank never gives away a
// fraction of a cent.
function discountOf(subtotalCents, basisPoints) {
  return Math.floor((subtotalCents * basisPoints) / 10000);
}

// --- Reading products -----------------------------------------------------------

// A product row as the bank API shows it.
function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    listPriceCents: cents(row.list_price_cents),
    stock: Number(row.stock),
    status: row.status,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// The same product as the classic /api/products answer has always shaped it:
// the price in whole dollars and the currency, so the original pages, tests
// and OpenAPI contract read it unchanged.
function toClassicProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: cents(row.list_price_cents) / 100,
    currency: "USD",
    stock: Number(row.stock),
    status: row.status,
  };
}

// Every product, in catalogue order.
async function listProductRows(db) {
  const { rows } = await db.query(
    "SELECT * FROM bank_shop_products ORDER BY id",
  );
  return rows;
}

// One product row, or null.
async function findProductRow(db, id) {
  const { rows } = await db.query(
    "SELECT * FROM bank_shop_products WHERE id = $1",
    [String(id)],
  );
  return rows[0] || null;
}

// The bank API's product list and one product.
async function listProducts(db) {
  return (await listProductRows(db)).map(toProduct);
}

async function findProduct(db, id) {
  const row = await findProductRow(db, id);
  return row ? toProduct(row) : null;
}

// The classic API's product list and one product.
async function listClassicProducts(db) {
  return (await listProductRows(db)).map(toClassicProduct);
}

async function findClassicProduct(db, id) {
  const row = await findProductRow(db, id);
  return row ? toClassicProduct(row) : null;
}

// An Admin sets how many are in stock (a delivery came in, or a count was
// wrong).
async function restockProduct(db, id, stock) {
  const { rows } = await db.query(
    `UPDATE bank_shop_products SET stock = $2, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [String(id), stock],
  );
  if (!rows[0]) {
    throw new ProductNotFoundError("no such product");
  }
  return toProduct(rows[0]);
}

// --- The cart -------------------------------------------------------------------

// The cart's rows joined to their products. With lock set, the product rows are
// locked until the transaction ends (SELECT ... FOR UPDATE), in id order so two
// checkouts always lock in the same order and never wait on each other in a
// circle.
async function cartRows(q, userId, { lock = false } = {}) {
  const { rows } = await q.query(
    `SELECT c.product_id, c.quantity, p.name, p.category, p.list_price_cents,
            p.stock, p.status
       FROM bank_shop_cart_items c
       JOIN bank_shop_products p ON p.id = c.product_id
      WHERE c.user_id = $1
      ORDER BY p.id
      ${lock ? "FOR UPDATE OF p" : ""}`,
    [userId],
  );
  return rows.map((row) => ({
    productId: row.product_id,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity),
    unitPriceCents: cents(row.list_price_cents),
    lineTotalCents: cents(row.list_price_cents) * Number(row.quantity),
    stock: Number(row.stock),
    status: row.status,
  }));
}

// The subtotal, the discount and the total for some lines at a tier.
function priceLines(lines, basisPoints) {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.lineTotalCents,
    0,
  );
  const discountCents = discountOf(subtotalCents, basisPoints);
  return {
    subtotalCents,
    discountBasisPoints: basisPoints,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}

// The cart as the API shows it: each line, whether it can be bought as it is,
// the money, and the loyalty tier it was priced at.
async function getCart(db, userId) {
  const lines = await cartRows(db, userId);
  const tier = await loyalty(db, userId);
  return {
    lines: lines.map((line) => ({
      ...line,
      buyable: line.status === "Available" && line.stock >= line.quantity,
    })),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    ...priceLines(lines, tier.basisPoints),
    loyalty: tier,
  };
}

// The checks a product must pass to go in a cart in this quantity.
//
// INTENTIONAL DEFECT (bankShopBackorderBuyable, REPORT): with the flag armed
// the Backordered check is skipped. The product page hides "Add to cart" on a
// Backordered product, so the page looks right; only the API lets it through.
function checkBuyable(product, quantity, backorderBug) {
  if (product.status === "Backordered" && !backorderBug) {
    throw new BackorderedError(product);
  }
  if (quantity > Number(product.stock)) {
    throw new OutOfStockError(product, Number(product.stock));
  }
}

// Adds a product to the cart, on top of any already there.
async function addToCart(
  db,
  userId,
  productId,
  quantity,
  { backorderBug = false } = {},
) {
  const product = await findProductRow(db, productId);
  if (!product) {
    throw new ProductNotFoundError("no such product");
  }
  const { rows } = await db.query(
    `SELECT quantity FROM bank_shop_cart_items
      WHERE user_id = $1 AND product_id = $2`,
    [userId, product.id],
  );
  const total = (rows[0] ? Number(rows[0].quantity) : 0) + quantity;
  if (total > MAX_LINE_QUANTITY) {
    throw new OutOfStockError(
      product,
      Math.min(MAX_LINE_QUANTITY, Number(product.stock)),
    );
  }
  checkBuyable(product, total, backorderBug);
  await db.query(
    `INSERT INTO bank_shop_cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [userId, product.id, total],
  );
  return getCart(db, userId);
}

// Sets how many of a product are in the cart; 0 takes it out.
async function setCartQuantity(
  db,
  userId,
  productId,
  quantity,
  { backorderBug = false } = {},
) {
  const product = await findProductRow(db, productId);
  if (!product) {
    throw new ProductNotFoundError("no such product");
  }
  if (quantity === 0) {
    await db.query(
      "DELETE FROM bank_shop_cart_items WHERE user_id = $1 AND product_id = $2",
      [userId, product.id],
    );
    return getCart(db, userId);
  }
  checkBuyable(product, quantity, backorderBug);
  await db.query(
    `INSERT INTO bank_shop_cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [userId, product.id, quantity],
  );
  return getCart(db, userId);
}

// --- Checkout -------------------------------------------------------------------

// A free order number like SO-482193, checked against the ones taken.
async function freeOrderNumber(tx) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const number = `SO-${100000 + crypto.randomInt(900000)}`;
    const { rows } = await tx.query(
      "SELECT 1 FROM bank_shop_orders WHERE number = $1",
      [number],
    );
    if (rows.length === 0) {
      return number;
    }
  }
  throw new Error("could not find a free order number");
}

// Writes one step of an order's history.
async function addEvent(tx, { orderId, status, actorId, note = "" }) {
  await tx.query(
    `INSERT INTO bank_shop_order_events (id, order_id, status, actor_user_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), orderId, status, actorId || null, note],
  );
}

// Pays for the cart from one of the customer's accounts. expectedTotalCents is
// the total the customer was shown; if the real total is different (a price
// changed, a discount tier moved) nothing is charged and the new total comes
// back, so nobody pays a number they never saw.
//
// The correct path, in one transaction: lock the products, check each line,
// price it, take the money only if the balance covers it, take the stock only
// if it is still there, then write the order, its lines, its first step, the
// history row and the receipt, and empty the cart.
//
// INTENTIONAL DEFECT (bankShopOversell, REPORT): with the flag armed the stock
// is read before the transaction with no lock, the request waits, and the new
// stock is written as "what I read minus what I bought". Two checkouts for the
// last item both read 1, both pass, both write 0: two orders, one item, and the
// stock still looks right.
//
// INTENTIONAL DEFECT (bankShopClientPrice, REPORT): with the flag armed a
// total that does not match is not refused; the account is charged the number
// the browser sent. Edit the request and pay $1.
async function checkout(
  db,
  {
    userId,
    account,
    expectedTotalCents,
    oversellBug = false,
    clientPriceBug = false,
    backorderBug = false,
  },
) {
  // The bug's unlocked read, before the transaction, and its wait.
  let seen = null;
  if (oversellBug) {
    seen = await cartRows(db, userId);
    for (const line of seen) {
      checkBuyable(line, line.quantity, backorderBug);
    }
    await new Promise((resolve) => setTimeout(resolve, RACE_WINDOW_MS));
  }

  const orderId = await db.transaction(async (tx) => {
    // The lines: locked (correct path) or as read earlier (the bug).
    const lines = seen || (await cartRows(tx, userId, { lock: true }));
    if (lines.length === 0) {
      throw new EmptyCartError("the cart is empty");
    }
    if (!seen) {
      for (const line of lines) {
        checkBuyable(line, line.quantity, backorderBug);
      }
    }

    // The price at the customer's tier, and what is actually charged.
    const tier = tierFor(await spentCents(tx, userId));
    const price = priceLines(lines, tier.basisPoints);
    let chargedCents = price.totalCents;
    if (expectedTotalCents !== price.totalCents) {
      if (!clientPriceBug) {
        throw new PriceChangedError(price.totalCents);
      }
      chargedCents = expectedTotalCents;
    }

    // The money, only if the balance covers it.
    const debit = await tx.query(
      `UPDATE bank_money_accounts SET balance_cents = balance_cents - $2
        WHERE id = $1 AND balance_cents >= $2 RETURNING balance_cents`,
      [account.id, chargedCents],
    );
    if (debit.rows.length === 0) {
      throw new InsufficientFundsError("insufficient funds");
    }

    // The stock: "only if there is still enough" (correct), or "what I read
    // minus what I bought" (the bug's lost update).
    for (const line of lines) {
      if (seen) {
        await tx.query(
          "UPDATE bank_shop_products SET stock = $2, updated_at = now() WHERE id = $1",
          [line.productId, Math.max(0, line.stock - line.quantity)],
        );
      } else {
        const taken = await tx.query(
          `UPDATE bank_shop_products SET stock = stock - $2, updated_at = now()
            WHERE id = $1 AND stock >= $2 RETURNING stock`,
          [line.productId, line.quantity],
        );
        if (taken.rows.length === 0) {
          throw new OutOfStockError(line, line.stock);
        }
      }
    }

    // The order, its lines and its first step.
    const id = crypto.randomUUID();
    const number = await freeOrderNumber(tx);
    await tx.query(
      `INSERT INTO bank_shop_orders
         (id, number, user_id, account_id, subtotal_cents, discount_basis_points,
          discount_cents, total_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        number,
        userId,
        account.id,
        price.subtotalCents,
        price.discountBasisPoints,
        price.discountCents,
        chargedCents,
      ],
    );
    for (const line of lines) {
      await tx.query(
        `INSERT INTO bank_shop_order_lines
           (order_id, product_id, name, quantity, unit_price_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, line.productId, line.name, line.quantity, line.unitPriceCents],
      );
    }
    await addEvent(tx, { orderId: id, status: "placed", actorId: userId });

    // The history row, the receipt, and an empty cart.
    await insertTransaction(tx, {
      accountId: account.id,
      kind: "shop_purchase",
      amountCents: -chargedCents,
      balanceAfterCents: cents(debit.rows[0].balance_cents),
      description: `Shop order ${number}`,
      counterparty: "Playground Bank gear shop",
    });
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    await notify(tx, {
      userId,
      kind: "shop_order",
      title: `Order ${number} placed`,
      body: `${itemCount} ${itemCount === 1 ? "item" : "items"}. We'll tell you when it ships.`,
      link: `/shop/orders/${id}`,
      amountCents: -chargedCents,
    });
    await tx.query("DELETE FROM bank_shop_cart_items WHERE user_id = $1", [
      userId,
    ]);
    return id;
  });
  return findOrder(db, orderId);
}

// --- Orders -----------------------------------------------------------------------

// Every order is read with the paying account's number, the customer, and how
// many items it holds.
const ORDER_SELECT = `
  SELECT o.*, a.number AS account_number,
         u.full_name AS customer_name, u.email AS customer_email,
         (SELECT COALESCE(SUM(l.quantity), 0) FROM bank_shop_order_lines l
           WHERE l.order_id = o.id) AS item_count
    FROM bank_shop_orders o
    JOIN bank_money_accounts a ON a.id = o.account_id
    JOIN bank_users u ON u.id = o.user_id`;

// An order row as the API shows it, without its lines and steps.
function toOrder(row) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    userId: row.user_id,
    customer: { fullName: row.customer_name, email: row.customer_email },
    accountId: row.account_id,
    accountNumber: row.account_number,
    itemCount: Number(row.item_count),
    subtotalCents: cents(row.subtotal_cents),
    discountBasisPoints: Number(row.discount_basis_points),
    discountCents: cents(row.discount_cents),
    totalCents: cents(row.total_cents),
    refundedCents: cents(row.refunded_cents),
    nextStatus: NEXT_STATUS[row.status] || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// One order in full: its lines and every step, oldest first, with who took it.
async function findOrder(db, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
    return null;
  }
  const { rows } = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  if (!rows[0]) {
    return null;
  }
  const lines = await db.query(
    `SELECT product_id, name, quantity, unit_price_cents
       FROM bank_shop_order_lines WHERE order_id = $1 ORDER BY product_id`,
    [id],
  );
  const events = await db.query(
    `SELECT e.status, e.note, e.created_at, u.full_name AS actor_name,
            u.role AS actor_role
       FROM bank_shop_order_events e
       LEFT JOIN bank_users u ON u.id = e.actor_user_id
      WHERE e.order_id = $1
      ORDER BY e.created_at, e.id`,
    [id],
  );
  return {
    ...toOrder(rows[0]),
    lines: lines.rows.map((line) => ({
      productId: line.product_id,
      name: line.name,
      quantity: Number(line.quantity),
      unitPriceCents: cents(line.unit_price_cents),
      lineTotalCents: cents(line.unit_price_cents) * Number(line.quantity),
    })),
    events: events.rows.map((event) => ({
      status: event.status,
      note: event.note,
      actorName: event.actor_name || null,
      actorRole: event.actor_role || null,
      createdAt: new Date(event.created_at).toISOString(),
    })),
  };
}

// The customer's own order, or null (someone else's answers the same as one
// that doesn't exist).
async function findOwnOrder(db, userId, id) {
  const order = await findOrder(db, id);
  return order && order.userId === userId ? order : null;
}

// A customer's orders, newest first.
async function listOrders(db, userId) {
  const { rows } = await db.query(
    `${ORDER_SELECT} WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
    [userId],
  );
  return rows.map(toOrder);
}

// Every customer's orders for staff, newest first, optionally one status.
async function listAllOrders(db, status) {
  const { rows } = await db.query(
    status
      ? `${ORDER_SELECT} WHERE o.status = $1 ORDER BY o.created_at DESC LIMIT 200`
      : `${ORDER_SELECT} ORDER BY o.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  return rows.map(toOrder);
}

// Moves an order to its next step and tells the customer. Only the next step
// is allowed, and a refunded order goes nowhere.
//
// INTENTIONAL DEFECT (bankShopStatusSkip, REPORT): with the flag armed any of
// the four steps is accepted from any step, so an order goes straight from
// placed to delivered, or from delivered back to packed.
async function advanceOrder(db, { orderId, to, actorId, skipBug = false }) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      "SELECT status, user_id, number FROM bank_shop_orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    if (!rows[0]) {
      throw new OrderNotFoundError("no such order");
    }
    const from = rows[0].status;
    const allowed = skipBug
      ? from !== "refunded" && to !== from
      : NEXT_STATUS[from] === to;
    if (!allowed) {
      throw new StatusMoveError(from, to);
    }
    await tx.query(
      "UPDATE bank_shop_orders SET status = $2, updated_at = now() WHERE id = $1",
      [orderId, to],
    );
    await addEvent(tx, { orderId, status: to, actorId });
    await notify(tx, {
      userId: rows[0].user_id,
      kind: "shop_order_status",
      title: `Order ${rows[0].number} ${STATUS_WORDS[to]}`,
      body:
        to === "delivered"
          ? "It has arrived. Enjoy it."
          : `It is ${STATUS_WORDS[to]} now.`,
      link: `/shop/orders/${orderId}`,
    });
  });
  return findOrder(db, orderId);
}

// Refunds an order: the whole total goes back to the account that paid, with
// its history row; the stock goes back on the shelf; the customer is told.
// Allowed once, and only before delivery.
//
// INTENTIONAL DEFECT (bankShopRefundTwice, REPORT): with the flag armed the
// "already refunded" check is skipped, so a second refund pays the money back
// again.
//
// INTENTIONAL DEFECT (bankRefundNoEntry, REPORT): with the flag armed the money
// goes back but no history row is written, so the balance and the statement
// disagree and the books check finds the account out of balance.
async function refundOrder(
  db,
  { orderId, actorId, twiceBug = false, noEntryBug = false },
) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      "SELECT * FROM bank_shop_orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = rows[0];
    if (!order) {
      throw new OrderNotFoundError("no such order");
    }
    if (order.status === "refunded" && !twiceBug) {
      throw new AlreadyRefundedError("already refunded");
    }
    if (order.status === "delivered") {
      throw new TooLateToRefundError("already delivered");
    }
    const amountCents = cents(order.total_cents);

    // The money back, with its history row (unless the bug drops it).
    const credit = await tx.query(
      `UPDATE bank_money_accounts SET balance_cents = balance_cents + $2
        WHERE id = $1 RETURNING balance_cents`,
      [order.account_id, amountCents],
    );
    if (!noEntryBug) {
      await insertTransaction(tx, {
        accountId: order.account_id,
        kind: "shop_refund",
        amountCents,
        balanceAfterCents: cents(credit.rows[0].balance_cents),
        description: `Refund for shop order ${order.number}`,
        counterparty: "Playground Bank gear shop",
      });
    }

    // The stock back on the shelf.
    const lines = await tx.query(
      "SELECT product_id, quantity FROM bank_shop_order_lines WHERE order_id = $1",
      [orderId],
    );
    for (const line of lines.rows) {
      await tx.query(
        `UPDATE bank_shop_products SET stock = LEAST(stock + $2, ${MAX_STOCK}),
                updated_at = now()
          WHERE id = $1`,
        [line.product_id, Number(line.quantity)],
      );
    }

    // The order, its step, and the customer told.
    await tx.query(
      `UPDATE bank_shop_orders
          SET status = 'refunded', refunded_cents = refunded_cents + $2,
              updated_at = now()
        WHERE id = $1`,
      [orderId, amountCents],
    );
    await addEvent(tx, { orderId, status: "refunded", actorId });
    await notify(tx, {
      userId: order.user_id,
      kind: "shop_refund",
      title: `Order ${order.number} refunded`,
      body: "The money is back in the account you paid from.",
      link: `/shop/orders/${orderId}`,
      amountCents,
    });
  });
  return findOrder(db, orderId);
}

// What the routes, GraphQL and server.js use.
module.exports = {
  AlreadyRefundedError,
  BackorderedError,
  CATEGORIES,
  EmptyCartError,
  LOYALTY_TIERS,
  MAX_LINE_QUANTITY,
  MAX_STOCK,
  NEXT_STATUS,
  OrderNotFoundError,
  OutOfStockError,
  PriceChangedError,
  ProductNotFoundError,
  STATUSES,
  StatusMoveError,
  TooLateToRefundError,
  addToCart,
  advanceOrder,
  checkout,
  findClassicProduct,
  findOrder,
  findOwnOrder,
  findProduct,
  getCart,
  listAllOrders,
  listClassicProducts,
  listOrders,
  listProducts,
  loyalty,
  refundOrder,
  restockProduct,
  seedShopProducts,
  setCartQuantity,
  starterCatalogue,
  tierFor,
};
