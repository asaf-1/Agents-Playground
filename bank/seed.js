const { EmailTakenError, createUser, findUserByEmail } = require("./accounts");
const { seedDemoPayees } = require("./bills");
const { seedDemoLoan } = require("./loans");
const { notify } = require("./notify");
const { addMessage, openTicket } = require("./support");

// Demo accounts, one per role plus a locked one, all with the password
// demo1234. They are read-only (is_demo), so on the shared public site nobody
// can change them for everyone else. Emails use the reserved .test domain.
const DEMO_PASSWORD = "demo1234";

const DEMO_ACCOUNTS = [
  {
    email: "maya@playgroundbank.test",
    fullName: "Maya Chen",
    role: "customer",
    status: "active",
    profile: {
      phone: "+1 415 555 0134",
      addressLine: "220 Market Street",
      city: "San Francisco",
      postalCode: "94105",
      country: "United States",
    },
  },
  {
    email: "sam@playgroundbank.test",
    fullName: "Sam Rivera",
    role: "support",
    status: "active",
  },
  {
    email: "alex@playgroundbank.test",
    fullName: "Alex Morgan",
    role: "admin",
    status: "active",
  },
  {
    email: "lee@playgroundbank.test",
    fullName: "Lee Park",
    role: "customer",
    status: "locked",
  },
];

// Safe to run on every start: an account that already exists is left alone.
async function seedDemoAccounts(db) {
  for (const account of DEMO_ACCOUNTS) {
    if (await findUserByEmail(db, account.email)) {
      continue;
    }
    try {
      await createUser(db, {
        ...account,
        password: DEMO_PASSWORD,
        isDemo: true,
      });
    } catch (error) {
      // Another start created it a moment ago; that's fine.
      if (!(error instanceof EmailTakenError)) {
        throw error;
      }
    }
  }
}

// Maya's payees and one approved loan (decided by the demo Admin), once her
// accounts exist. Safe on every start: each part only runs the first time.
async function seedDemoBillsAndLoans(db) {
  const { rows } = await db.query(
    `SELECT u.id,
            (SELECT a.id FROM bank_money_accounts a
              WHERE a.user_id = u.id AND a.number = 'PB-1000-0001') AS checking,
            (SELECT id FROM bank_users WHERE email = 'alex@playgroundbank.test') AS admin
       FROM bank_users u
      WHERE u.email = 'maya@playgroundbank.test'`,
  );
  const maya = rows[0];
  if (!maya || !maya.checking || !maya.admin) {
    return;
  }
  await seedDemoPayees(db, maya.id);
  await seedDemoLoan(db, {
    userId: maya.id,
    accountId: maya.checking,
    deciderId: maya.admin,
  });
  await seedDemoConnected(db, maya.id);
}

// Maya's welcome note and one solved support conversation (phase 2c). Safe on
// every start: each part only runs the first time.
async function seedDemoConnected(db, mayaId) {
  const notes = await db.query(
    "SELECT count(*) AS total FROM bank_notifications WHERE user_id = $1 AND kind = 'welcome'",
    [mayaId],
  );
  if (Number(notes.rows[0].total) === 0) {
    await notify(db, {
      userId: mayaId,
      kind: "welcome",
      title: "Welcome to Playground Bank",
      body: "Notifications appear here when someone sends you money, answers your request, or replies to your ticket.",
      link: "/bank",
    });
  }
  const tickets = await db.query(
    "SELECT count(*) AS total FROM bank_support_tickets WHERE user_id = $1",
    [mayaId],
  );
  const sam = await db.query(
    "SELECT id, role FROM bank_users WHERE email = 'sam@playgroundbank.test'",
  );
  if (Number(tickets.rows[0].total) > 0 || !sam.rows[0]) {
    return;
  }
  const day = (back) => new Date(Date.now() - back * 86_400_000).toISOString();
  const ticket = await openTicket(db, {
    userId: mayaId,
    subject: "A transfer to savings shows twice?",
    body: "I see two Monthly savings transfers in September. Did it go out twice?",
    createdAt: day(20),
  });
  const answered = await addMessage(db, {
    ticket,
    author: { id: sam.rows[0].id, role: sam.rows[0].role },
    body: "Hi Maya, those are two different months: 13 and 27 September. Nothing went out twice.",
    createdAt: day(19),
  });
  await addMessage(db, {
    ticket: answered,
    author: { id: mayaId, role: "customer" },
    body: "Ah, I see it now. Thanks!",
    createdAt: day(19),
  });
  await db.query(
    "UPDATE bank_support_tickets SET status = 'solved' WHERE id = $1",
    [ticket.id],
  );
}

module.exports = {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  seedDemoAccounts,
  seedDemoBillsAndLoans,
};
