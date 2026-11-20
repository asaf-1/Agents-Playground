// k6 stage "spike" (a spike test): a quiet bank, a sudden jump in people,
// then quiet again, to see that it recovers. Run it with `npm run k6:spike`.
// Each phase is tagged, so the run reports the spike's timings and the quiet
// time after it apart.

// k6's pause between actions, and the shared bank helpers.
import { sleep } from "k6";
import {
  anyOf,
  commonReads,
  moneyStillAddsUp,
  signUpMany,
  transferInside,
  REPORT_REFUSALS,
} from "../../framework/k6/bank.js";

// 2 users all along; 30 more for 20 seconds from second 10; then 15 seconds
// of only the 2, tagged "after", to see the bank settle.
export const options = {
  scenarios: {
    before: {
      executor: "constant-vus",
      vus: 2,
      duration: "10s",
      tags: { phase: "before" },
    },
    spike: {
      executor: "ramping-vus",
      startTime: "10s",
      startVUs: 0,
      stages: [
        { duration: "5s", target: 30 },
        { duration: "10s", target: 30 },
        { duration: "5s", target: 0 },
      ],
      tags: { phase: "spike" },
    },
    after: {
      executor: "constant-vus",
      vus: 2,
      startTime: "30s",
      duration: "15s",
      tags: { phase: "after" },
    },
  },
  // Limits that always pass, so k6 reports each phase's own numbers.
  thresholds: {
    ...REPORT_REFUSALS,
    "http_req_duration{phase:before}": ["p(95)>=0"],
    "http_req_duration{phase:spike}": ["p(95)>=0"],
    "http_req_duration{phase:after}": ["p(95)>=0"],
    "unexpected_errors{phase:after}": ["count>=0"],
  },
};

// Before the run: 30 new customers.
export function setup() {
  return { customers: signUpMany(30) };
}

// One visit: reads, and one time in four a transfer.
export default function ({ customers }) {
  if (Math.random() < 0.25) {
    transferInside(customers);
  } else {
    commonReads(anyOf(customers));
  }
  sleep(0.5);
}

// After the run: the money still adds up.
export function teardown({ customers }) {
  moneyStillAddsUp(customers);
}
