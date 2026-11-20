// k6 stage "baseline": a few people reading what most visits read. These are
// the numbers every other stage is compared with. Run it with
// `npm run k6:baseline` (scripts/k6/run.js starts the bank on this PC first).

// k6's pause between actions, and the shared bank helpers.
import { sleep } from "k6";
import {
  anyOf,
  commonReads,
  moneyStillAddsUp,
  signUpMany,
  REPORT_REFUSALS,
} from "../../framework/k6/bank.js";

// 5 virtual users for 30 seconds, each pausing a second between visits.
export const options = {
  scenarios: {
    reads: { executor: "constant-vus", vus: 5, duration: "30s" },
  },
  // k6 reports each refusal code apart (framework/k6/bank.js).
  thresholds: { ...REPORT_REFUSALS },
};

// Before the run: 10 new customers.
export function setup() {
  return { customers: signUpMany(10) };
}

// One visit: the common reads, as one of the customers.
export default function ({ customers }) {
  commonReads(anyOf(customers));
  sleep(1);
}

// After the run: the money still adds up.
export function teardown({ customers }) {
  moneyStillAddsUp(customers);
}
