const { EmailTakenError, createUser, findUserByEmail } = require("./accounts");

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

module.exports = { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemoAccounts };
