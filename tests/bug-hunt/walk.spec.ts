// The bug hunt's five walks (npm run bug-hunt), side by side. Each walker
// follows every link in Playground Bank and watches for what goes wrong
// (framework/helpers/bugHunt/walk.ts); the two customers also press the
// buttons on their own account. Each walk writes its findings to the run's
// folder for the score at the end. A walk passes when it got round the site;
// what it finds is in the report, never a failed test.

// Node's file and path tools.
import fs from "node:fs";
import path from "node:path";
// The [RESULT] block's test tools.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// Signing up a fresh customer and signing in as the demo staff.
import { DEMO, signIn, signUpCustomer } from "../../framework/helpers/bank";
// The walk, the run's folder, and the walk names.
import { runFolder, walkSite } from "../../framework/helpers/bugHunt/walk";
import type { Pass } from "../../framework/helpers/bugHunt/findings";
// The type of a request context.
import type { APIRequestContext } from "@playwright/test";

// The five walks: who walks, how they sign in, whether they press buttons,
// and whether practice mode is on for their own session.
const WALKS: {
  pass: Pass;
  signInAs: (request: APIRequestContext) => Promise<unknown>;
  pressButtons: boolean;
  practice: boolean;
}[] = [
  {
    pass: "customer, practice off",
    signInAs: (request) => signUpCustomer(request, "Hunt Customer"),
    pressButtons: true,
    practice: false,
  },
  {
    pass: "customer, practice on",
    signInAs: (request) => signUpCustomer(request, "Hunt Practice"),
    pressButtons: true,
    practice: true,
  },
  {
    pass: "admin, looking only",
    signInAs: (request) => signIn(request, DEMO.admin),
    pressButtons: false,
    practice: false,
  },
  {
    pass: "support, looking only",
    signInAs: (request) => signIn(request, DEMO.support),
    pressButtons: false,
    practice: false,
  },
  {
    pass: "signed out",
    signInAs: async () => undefined,
    pressButtons: false,
    practice: false,
  },
];

for (const walk of WALKS) {
  test(`walks the bank: ${walk.pass}`, async ({ page, baseURL }) => {
    expected(
      `${walk.pass}: opens every page it can reach${walk.pressButtons ? " and presses its buttons" : ""}, and saves what went wrong`,
    );
    const dir = runFolder();
    // Signed in (or not), through the page's own cookies.
    await walk.signInAs(page.request);
    // Practice mode on for this session only: its own run key, in its own
    // cookie. Nobody else's session changes.
    if (walk.practice) {
      const on = await page.request.post("/api/practice", {
        data: { on: true },
      });
      expect(on.status()).toBe(200);
      fact("practice mode", (await on.json()).runKey);
    }

    const result = await walkSite(page, {
      pass: walk.pass,
      base: baseURL!,
      pressButtons: walk.pressButtons,
      screenshotDir: path.join(dir, "screenshots"),
    });
    // The walk's results, for the score.
    const file = `walk-${walk.pass.replace(/[^a-z]+/gi, "-").toLowerCase()}.json`;
    fs.writeFileSync(path.join(dir, file), JSON.stringify(result, null, 2));
    fact("pages opened", result.pages.length);
    fact("buttons pressed", result.pressed);
    fact("signals", result.signals);
    fact(
      "findings",
      result.findings.map(
        (f) => `${f.classification}/${f.confidence}: ${f.title}`,
      ),
    );
    fact("saved", path.join(dir, file));

    // Got round the site: more than a handful of pages.
    expect(result.pages.length).toBeGreaterThan(3);
  });
}
