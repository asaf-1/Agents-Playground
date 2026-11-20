// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Playwright's page type, for the helper below.
import type { Page } from "@playwright/test";
// The bank helpers: the demo people, signing in and signing up.
import { DEMO, signIn, signUpCustomer } from "../../../framework/helpers/bank";

// Your progress, one fault at a time (web/src/pages/PracticeProgressPage.tsx):
// the On/Off switch for one fault or a level, the groups by level, I found it
// for a signed-up customer (saved on the account), and Start over; and the
// Practice guide's instructions (web/src/pages/PracticePage.tsx).
//
// Safe in the fully parallel suite: each browser context is its own visitor
// with its own run key, the customers are signed up per test, and the demo
// account is only looked at.

// How many faults the catalogue has, read from the server, never written here.
async function totalFaults(page: Page): Promise<number> {
  const state = await (await page.request.get("/api/practice")).json();
  return state.total;
}

// The catalogue's flags, in order, from the server. Apart from
// ordersRefreshLabel, whose effect a test here checks, the faults these tests
// switch and tick come from here, never written into this file: the
// test-cases page and the runner's knowledge base list a spec under every
// fault it names, and these tests check the page, not those faults.
async function faults(page: Page): Promise<string[]> {
  const state = await (await page.request.get("/api/practice")).json();
  return state.bugs
    .map((bug: { flag: string }) => bug.flag)
    .filter((flag: string) => flag !== "ordersRefreshLabel");
}

// Each fault's level, from the server, as flag -> level.
async function levels(page: Page): Promise<Map<string, string>> {
  const state = await (await page.request.get("/api/practice")).json();
  return new Map(
    state.bugs.map((bug: { flag: string; level: string }) => [
      bug.flag,
      bug.level,
    ]),
  );
}

// The lines switched on.
const ON = ".bug-row.is-armed";

test.describe("Your progress, one fault at a time (/app/practice/progress)", () => {
  // One fault on: its switch is on, the top switch and the state say 1, and
  // it is live on its own page; off again, the switch says off.
  test("a visitor turns one fault on, and only that one is live", async ({
    page,
  }) => {
    expected(
      "switch ordersRefreshLabel on: its switch checked, the top switch '1 on', the state '1 of N faults are on'; Orders' button reads Reload; off: the top switch 'off'",
    );
    await page.goto("/app/practice/progress");
    const total = await totalFaults(page);
    fact("faults", total);

    await page.getByTestId("bug-toggle-ordersRefreshLabel").click();
    await expect(
      page.getByTestId("bug-toggle-ordersRefreshLabel"),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("practice-switch-state")).toHaveText("1 on");
    await expect(page.getByTestId("practice-state")).toContainText(
      `1 of ${total} faults are on`,
    );
    await expect(page.locator(ON)).toHaveCount(1);

    // Live on its own page.
    await page.goto("/app/orders");
    await expect(page.getByTestId("orders-refresh")).toHaveText("Reload");

    // Off again.
    await page.goto("/app/practice/progress");
    await page.getByTestId("bug-toggle-ordersRefreshLabel").click();
    await expect(page.getByTestId("practice-switch-state")).toHaveText("off");
    await expect(page.locator(ON)).toHaveCount(0);
  });

  // A level: Turn on all arms every fault in it; Turn off all clears it.
  test("a level's Turn on all arms the level, and Turn off all clears it", async ({
    page,
  }) => {
    expected(
      "Easy's Turn on all: every line in the level on, the switch 'N on' for the level's size; Turn off all: none on",
    );
    await page.goto("/app/practice/progress");
    const group = page.getByTestId("bug-group-easy");
    // Wait for the list to arrive before counting it.
    await expect(group.locator(".bug-row").first()).toBeVisible();
    const size = await group.locator(".bug-row").count();
    fact("Easy faults", size);
    expect(size).toBeGreaterThan(1);

    const toggle = page.getByTestId("bug-group-toggle-easy");
    await expect(toggle).toHaveText(`Turn on all ${size}`);
    await toggle.click();
    await expect(group.locator(ON)).toHaveCount(size);
    await expect(page.getByTestId("practice-switch-state")).toHaveText(
      `${size} on`,
    );
    await expect(toggle).toHaveText("Turn off all");

    await toggle.click();
    await expect(page.locator(ON)).toHaveCount(0);
    await expect(page.getByTestId("practice-switch-state")).toHaveText("off");
  });

  // The faults are grouped by level: every line sits in its own level's
  // group, and the groups hold them all.
  test("every fault sits in its level's group, and the groups hold them all", async ({
    page,
  }) => {
    expected(
      "Easy, Medium and Hard: each group's lines are the faults the server calls that level; together every fault",
    );
    await page.goto("/app/practice/progress");
    const total = await totalFaults(page);
    const byFlag = await levels(page);
    await expect(page.locator(".bug-row")).toHaveCount(total);

    let counted = 0;
    for (const level of ["easy", "medium", "hard"]) {
      const ids = await page
        .getByTestId(`bug-group-${level}`)
        .locator(".bug-row")
        .evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-testid")!.slice(4)),
        );
      fact(level, ids.length);
      counted += ids.length;
      for (const flag of ids) {
        expect(byFlag.get(flag), `${flag} is in its own level`).toBe(level);
      }
    }
    expect(counted).toBe(total);
  });

  // The guide's instructions name every control, the levels are explained,
  // and the statement about saving is there.
  test("the instructions cover every control, and say who keeps progress", async ({
    page,
  }) => {
    expected(
      "six steps from 'Open Your progress' to 'Start over'; Easy, Medium and Hard explained; 'Progress is saved only on an account you sign up for.'; signed out on Your progress: a log-in note and no I found it",
    );
    await page.goto("/app/practice");
    const how = page.getByTestId("practice-how");
    const steps = [
      "Open Your progress.",
      "Choose what to hunt.",
      "Go and look.",
      "Check yourself.",
      "Tick it off.",
      "Start over",
    ];
    fact("steps", steps);
    await expect(how.locator("ol > li")).toHaveCount(steps.length);
    for (const [index, step] of steps.entries()) {
      await expect(how.locator("ol > li").nth(index)).toContainText(step);
    }
    await expect(page.getByTestId("practice-levels")).toContainText("Easy");
    await expect(page.getByTestId("practice-levels")).toContainText("Medium");
    await expect(page.getByTestId("practice-levels")).toContainText("Hard");
    await expect(page.getByTestId("practice-save-note")).toContainText(
      "Progress is saved only on an account you sign up for.",
    );
    await expect(page.getByTestId("practice-save-note")).toContainText(
      "demo accounts are shared by everyone",
    );

    // Signed out on Your progress: why there is no progress, and no tick.
    await page.goto("/app/practice/progress");
    await expect(page.getByTestId("practice-progress-note")).toContainText(
      "to save your progress",
    );
    await expect(page.locator(".bug-row").first()).toBeVisible();
    await expect(page.locator("[data-testid^='bug-found-']")).toHaveCount(0);
  });

  // A demo account can switch faults but not tick them, and is told why.
  test("a demo account is told its ticks are not kept, and gets no I found it", async ({
    page,
  }) => {
    expected(
      "as the demo customer: the note says demo account and Sign up; no I found it; no To find or Found tab; the switch still works",
    );
    fact("demo", DEMO.customer);
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/practice/progress");
    const note = page.getByTestId("practice-progress-note");
    await expect(note).toContainText("demo account");
    await expect(note).toContainText("Sign up");
    await expect(page.locator(".bug-row").first()).toBeVisible();
    await expect(page.locator("[data-testid^='bug-found-']")).toHaveCount(0);
    await expect(page.getByTestId("practice-show-todo")).toHaveCount(0);
    await expect(page.getByTestId("practice-show-found")).toHaveCount(0);

    const [flag] = await faults(page);
    fact("switched on", flag);
    await page.getByTestId(`bug-toggle-${flag}`).click();
    await expect(page.getByTestId(`bug-toggle-${flag}`)).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  // A signed-up customer's tick is saved on the account and comes back.
  test("a signed-up customer's tick is saved and still there after a reload", async ({
    page,
  }) => {
    expected(
      "a new customer ticks a fault: pressed, its dot found, and '1 of N found'; after a reload all stay; untick: '0 of N found'",
    );
    await signUpCustomer(page.request, "Practice Customer");
    await page.goto("/app/practice/progress");
    const total = await totalFaults(page);
    const [flag] = await faults(page);
    fact("ticked", flag);
    const progress = page.getByTestId("practice-progress");
    await expect(progress).toHaveText(`0 of ${total} found`);

    await page.getByTestId(`bug-found-${flag}`).click();
    await expect(page.getByTestId(`bug-found-${flag}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId(`practice-dot-${flag}`)).toHaveClass(
      /is-found/,
    );
    await expect(progress).toHaveText(`1 of ${total} found`);

    await page.reload();
    await expect(progress).toHaveText(`1 of ${total} found`);
    await expect(page.getByTestId(`bug-found-${flag}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fact("after reload", await progress.innerText());

    await page.getByTestId(`bug-found-${flag}`).click();
    await expect(progress).toHaveText(`0 of ${total} found`);
  });

  // Start over asks first, then turns every fault off and clears the ticks.
  test("Start over asks first, then turns every fault off and clears the ticks", async ({
    page,
  }) => {
    expected(
      "one fault on and one ticked; Start over asks to clear 1 tick, Cancel keeps both; Yes: the switch 'off', none on, '0 of N found'",
    );
    await signUpCustomer(page.request, "Start Over Customer");
    await page.goto("/app/practice/progress");
    const total = await totalFaults(page);
    const [switched, ticked] = await faults(page);
    fact("switched on", switched);
    fact("ticked", ticked);
    await page.getByTestId(`bug-toggle-${switched}`).click();
    await expect(page.getByTestId(`bug-toggle-${switched}`)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByTestId(`bug-found-${ticked}`).click();
    await expect(page.getByTestId("practice-progress")).toHaveText(
      `1 of ${total} found`,
    );

    // Asked first; Cancel changes nothing.
    await page.getByTestId("practice-start-over").click();
    await expect(page.getByTestId("practice-confirm")).toContainText(
      "Turn every fault off and clear your 1 tick?",
    );
    await page.getByTestId("practice-start-over-cancel").click();
    await expect(page.getByTestId("practice-confirm")).toHaveCount(0);
    await expect(page.getByTestId(`bug-toggle-${switched}`)).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Yes: everything off, nothing ticked.
    await page.getByTestId("practice-start-over").click();
    await page.getByTestId("practice-start-over-yes").click();
    await expect(page.getByTestId("practice-switch-state")).toHaveText("off");
    await expect(page.locator(ON)).toHaveCount(0);
    await expect(page.getByTestId("practice-progress")).toHaveText(
      `0 of ${total} found`,
    );
    fact(
      "after start over",
      await page.getByTestId("practice-progress").innerText(),
    );
  });
});
