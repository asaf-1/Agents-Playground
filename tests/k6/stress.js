// k6 stage "stress" (a stress test): many transfers, checkouts and log-ins at
// the same time, with short pauses, plus double presses (one transfer sent
// twice at once with one key). Run it with `npm run k6:stress`. The bank may
// answer "busy"
// (503 SERVER_BUSY) to log-ins when too many passwords are checked at once;
// that is its design, and it is counted apart from errors.

// k6's pause between actions, and the shared bank helpers.
import { sleep } from "k6";
import {
  anyOf,
  buyOne,
  buyableProducts,
  doublePress,
  logIn,
  moneyStillAddsUp,
  signUpMany,
  transferInside,
  REPORT_REFUSALS,
} from "../../framework/k6/bank.js";

// Three groups at once for 45 seconds: 8 moving money, 6 buying, 6 logging in.
export const options = {
  scenarios: {
    transfers: {
      executor: "constant-vus",
      vus: 8,
      duration: "45s",
      exec: "moveMoney",
    },
    checkouts: {
      executor: "constant-vus",
      vus: 6,
      duration: "45s",
      exec: "shop",
    },
    logins: {
      executor: "constant-vus",
      vus: 6,
      duration: "45s",
      exec: "signIn",
    },
  },
  // k6 reports each refusal code apart (framework/k6/bank.js).
  thresholds: { ...REPORT_REFUSALS },
};

// Before the run: 30 new customers, and what the shop has in stock.
export function setup() {
  return {
    customers: signUpMany(30),
    products: buyableProducts().map((item) => item.id),
  };
}

// Moving money: a transfer, and every tenth time a double press.
export function moveMoney({ customers }) {
  if (Math.random() < 0.1) {
    doublePress(anyOf(customers), 100);
  } else {
    transferInside(customers);
  }
  sleep(0.2);
}

// Buying one product.
export function shop({ customers, products }) {
  const customer = anyOf(customers);
  buyOne(customer.session, anyOf(products), customer.accounts[0].id);
  sleep(0.2);
}

// Logging in again.
export function signIn({ customers }) {
  logIn(anyOf(customers));
  sleep(0.2);
}

// After the run: the money still adds up.
export function teardown({ customers }) {
  moneyStillAddsUp(customers);
}
