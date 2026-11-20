// k6 stage "breakpoint" (a breakpoint test): more and more load until the
// bank breaks, to find where. Run it with `npm run k6:breakpoint`. New visits
// start at a steadily rising rate (10 a second, up to 1000 over 5 minutes),
// whatever the bank's speed, and k6 stops the test itself the moment the bank
// breaks:
// - any unexpected error (an answer the bank should never give, or none);
// - 50 answers that took over a second (the quick sign it is falling behind);
// - p95 over 500 ms (five times the stress stage's limit), checked from 10
//   seconds in.
// Not "dropped iterations" (k6 couldn't start a visit on time): the first run
// stopped on that at 182 a second while the bank answered in 7 ms, because k6
// was slow to make users, not because the bank broke. It is still reported.
// The run reports the rate it had reached. Breaking is this stage's result,
// so the run script judges it on the money: after breaking, the money still
// adds up, the books balance, and the bank answers ready again.

// The test's own clock and state, a gauge for the rate reached, and the
// shared bank helpers.
import exec from "k6/execution";
import { Gauge } from "k6/metrics";
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

// The rise: from START to TOP visits a second over RISE_SECONDS.
const START = 10;
const TOP = 1000;
const RISE_SECONDS = 300;

// What the run had reached when it stopped: the visits a second being asked
// for, and the virtual users busy. The run script reads their last values.
const loadRate = new Gauge("load_rate");
const loadUsers = new Gauge("load_users");

export const options = {
  scenarios: {
    breakpoint: {
      executor: "ramping-arrival-rate",
      startRate: START,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 1000,
      stages: [{ duration: `${RISE_SECONDS}s`, target: TOP }],
    },
  },
  // The lines that mean "broken": crossing one stops the test. The last one
  // always passes, so k6 reports how many visits it couldn't start on time.
  thresholds: {
    ...REPORT_REFUSALS,
    unexpected_errors: [{ threshold: "count<1", abortOnFail: true }],
    slow_answers: [{ threshold: "count<50", abortOnFail: true }],
    dropped_iterations: ["count>=0"],
    http_req_duration: [
      { threshold: "p(95)<500", abortOnFail: true, delayAbortEval: "10s" },
    ],
  },
};

// Before the run: 50 new customers, and what the shop has in stock.
export function setup() {
  return {
    customers: signUpMany(50),
    products: buyableProducts().map((item) => item.id),
  };
}

// One visit, with no pause (the rate sets the pace): 7 in 10 read, 2 in 10
// move money, 1 in 10 buys one product. First, the load it was started at.
export default function ({ customers, products }) {
  const seconds = (Date.now() - exec.scenario.startTime) / 1000;
  loadRate.add(
    Math.round(
      START + ((TOP - START) * Math.min(seconds, RISE_SECONDS)) / RISE_SECONDS,
    ),
  );
  loadUsers.add(exec.instance.vusActive);
  const roll = Math.random();
  const customer = anyOf(customers);
  if (roll < 0.7) {
    commonReads(customer);
  } else if (roll < 0.9) {
    transferInside(customers);
  } else {
    buyOne(customer.session, anyOf(products), customer.accounts[0].id);
  }
}

// After the run, broken or not: the money still adds up.
// A broken bank may still be finishing requests k6 gave up on, so the check
// waits 5 seconds first and reads what is settled.
export function teardown({ customers }) {
  sleep(5);
  moneyStillAddsUp(customers);
}
