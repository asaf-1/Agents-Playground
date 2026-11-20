// k6 stage "soak" (a soak test): the usual mix for 10 minutes with a fixed
// end, by hand only (`npm run k6:soak`), to watch the bank's memory and
// whether it slows down over time. The run script samples the server's memory
// as it goes.

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

// 5 virtual users for 10 minutes.
export const options = {
  scenarios: {
    soak: { executor: "constant-vus", vus: 5, duration: "10m" },
  },
  // k6 reports each refusal code apart (framework/k6/bank.js).
  thresholds: { ...REPORT_REFUSALS },
};

// Before the run: 40 new customers, and what the shop has in stock.
export function setup() {
  return {
    customers: signUpMany(40),
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
