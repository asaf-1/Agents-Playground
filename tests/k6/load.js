// k6 stage "load" (a load test): people using the bank the usual way, mostly
// reading, some moving money, a few buying in the shop. Run it with
// `npm run k6:load`.

// k6's pause between actions, and the shared bank helpers.
import { sleep } from "k6";
import {
  anyOf,
  buyOne,
  buyableProducts,
  commonReads,
  moneyStillAddsUp,
  signUpMany,
  transferInside,
  REPORT_REFUSALS,
} from "../../framework/k6/bank.js";

// Up to 10 virtual users: 15 seconds to climb, 30 at 10, 10 to stop.
export const options = {
  scenarios: {
    load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 10 },
        { duration: "30s", target: 10 },
        { duration: "10s", target: 0 },
      ],
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

// One visit: 7 in 10 read, 2 in 10 move money, 1 in 10 buys one product.
export default function ({ customers, products }) {
  const roll = Math.random();
  const customer = anyOf(customers);
  if (roll < 0.7) {
    commonReads(customer);
  } else if (roll < 0.9) {
    transferInside(customers);
  } else {
    buyOne(customer.session, anyOf(products), customer.accounts[0].id);
  }
  sleep(1);
}

// After the run: the money still adds up.
export function teardown({ customers }) {
  moneyStillAddsUp(customers);
}
