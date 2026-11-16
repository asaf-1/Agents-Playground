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

// The Practice page, one fault at a time (web/src/pages/PracticePage.tsx):
// Turn on for one fault or a group, the level filter, the instructions and
// the statement about saving, I found it for a signed-up customer (saved on
// the account), and Start over.
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

test.describe("Practice page, one fault at a time (/app/practice)", () => {
  // One fault on: it is Live, the switch and the state say 1, and it is live
  // on its own page; off again, the switch says off.
  test("a visitor turns one fault on, and only that one is live", async ({
    page,
  }) => {
    expected(
      "Turn on ordersRefreshLabel: Live, the switch '1 on', the state '1 of N faults are on'; Orders' button reads Reload; Turn off: the switch 'off'",
    );
    await page.goto("/app/practice");
    const total = await totalFaults(page);
    fact("faults", total);

    await page.getByTestId("bug-toggle-ordersRefreshLabel").click();
    await expect(page.getByTestId("bug-live-ordersRefreshLabel")).toBeVisible();
    await expect(page.getByTestId("bug-toggle-ordersRefreshLabel")).toHaveText(
      "Turn off",
    );
    await expect(page.getByTestId("practice-switch-state")).toHaveText("1 on");
    await expect(page.getByTestId("practice-state")).toContainText(
      `1 of ${total} faults are on`,
    );
    await expect(page.locator(".bug-live")).toHaveCount(1);

    // Live on its own page.
    await page.goto("/app/orders");
    await expect(page.getByTestId("orders-refresh")).toHaveText("Reload");

    // Off again.
    await page.goto("/app/practice");
    await page.getByTestId("bug-toggle-ordersRefreshLabel").click();
    await expect(page.getByTestId("practice-switch-state")).toHaveText("off");
    await expect(page.locator(".bug-live")).toHaveCount(0);
  });

  // A group: Turn on all arms every fault in it; Turn off all clears it.
  test("a group's Turn on all arms the group, and Turn off all clears it", async ({
    page,
  }) => {
    expected(
      "Validation's Turn on all: every card in the group Live, the switch 'N on' for the group's size; Turn off all: none Live",
    );
    await page.goto("/app/practice");
    const group = page.getByTestId("bug-group-Validation");
    // Wait for the list to arrive before counting it.
    await expect(group.locator(".bug-card").first()).toBeVisible();
    const size = await group.locator(".bug-card").count();
    fact("Validation faults", size);
    expect(size).toBeGreaterThan(1);

    const toggle = page.getByTestId("bug-group-toggle-Validation");
    await expect(toggle).toHaveText(`Turn on all ${size}`);
    await toggle.click();
    await expect(group.locator(".bug-live")).toHaveCount(size);
    await expect(page.getByTestId("practice-switch-state")).toHaveText(
      `${size} on`,
    );
    await expect(toggle).toHaveText("Turn off all");

    await toggle.click();
    await expect(page.locator(".bug-live")).toHaveCount(0);
    await expect(page.getByTestId("practice-switch-state")).toHaveText("off");
  });

  // The level filter shows one level at a time, and All shows them all.
  test("the level filter shows one level at a time", async ({ page }) => {
    expected(
      "for Easy, Medium and Hard: every card shown carries that level, as many as the button says; All shows every fault",
    );
    await page.goto("/app/practice");
    const total = await totalFaults(page);
    const cards = page.locator(".bug-card");
    await expect(cards).toHaveCount(total);

    for (const [id, label] of [
      ["easy", "Easy"],
      ["medium", "Medium"],
      ["hard", "Hard"],
    ]) {
      const button = page.getByTestId(`practice-level-${id}`);
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      // The count in the button, as "Hard (19)".
      const count = Number((await button.innerText()).match(/\((\d+)\)/)![1]);
      fact(label, count);
      await expect(cards).toHaveCount(count);
      await expect(page.locator(".bug-card .bug-level")).toHaveText(
        Array(count).fill(label),
      );
    }

    await page.getByTestId("practice-level-all").click();
    await expect(cards).toHaveCount(total);
  });

  // The instructions name every control, the levels are explained, and the
  // statement about saving is there; a visitor gets no I found it button.
  test("the instructions cover every control, and say who keeps progress", async ({
    page,
  }) => {
    expected(
      "six steps from 'Choose what to hunt' to 'Start over'; Easy, Medium and Hard explained; 'Progress is saved only on an account you sign up for.'; signed out: a log-in note and no I found it",
    );
    await page.goto("/app/practice");
    const how = page.getByTestId("practice-how");
    const steps = [
      "Choose what to hunt.",
      "Pick a level.",
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

    // Signed out: why there is no progress, and no tick to press.
    await expect(page.getByTestId("practice-progress-note")).toContainText(
      "to save your progress",
    );
    await expect(page.locator("[data-testid^='bug-found-']")).toHaveCount(0);
  });

  // A demo account can switch faults but not tick them, and is told why.
  test("a demo account is told its ticks are not kept, and gets no I found it", async ({
    page,
  }) => {
    expected(
      "as the demo customer: the note says demo account and Sign up; no I found it button; Turn on still works",
    );
    fact("demo", DEMO.customer);
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/practice");
    const note = page.getByTestId("practice-progress-note");
    await expect(note).toContainText("demo account");
    await expect(note).toContainText("Sign up");
    await expect(page.locator("[data-testid^='bug-found-']")).toHaveCount(0);

    const [flag] = await faults(page);
    fact("switched on", flag);
    await page.getByTestId(`bug-toggle-${flag}`).click();
    await expect(page.getByTestId(`bug-live-${flag}`)).toBeVisible();
  });

  // A signed-up customer's tick is saved on the account and comes back.
  test("a signed-up customer's tick is saved and still there after a reload", async ({
    page,
  }) => {
    expected(
      "a new customer ticks a fault: Found and '1 of N found'; after a reload both stay; untick: '0 of N found'",
    );
    await signUpCustomer(page.request, "Practice Customer");
    await page.goto("/app/practice");
    const total = await totalFaults(page);
    const [flag] = await faults(page);
    fact("ticked", flag);
    const progress = page.getByTestId("practice-progress");
    await expect(progress).toHaveText(`0 of ${total} found`);

    await page.getByTestId(`bug-found-${flag}`).click();
    await expect(page.getByTestId(`bug-found-tag-${flag}`)).toBeVisible();
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
      "one fault on and one ticked; Start over asks to clear 1 tick, Cancel keeps both; Yes: the switch 'off', no Live, '0 of N found'",
    );
    await signUpCustomer(page.request, "Start Over Customer");
    await page.goto("/app/practice");
    const total = await totalFaults(page);
    const [switched, ticked] = await faults(page);
    fact("switched on", switched);
    fact("ticked", ticked);
    await page.getByTestId(`bug-toggle-${switched}`).click();
    await expect(page.getByTestId(`bug-live-${switched}`)).toBeVisible();
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
    await expect(page.getByTestId(`bug-live-${switched}`)).toBeVisible();

    // Yes: everything off, nothing ticked.
    await page.getByTestId("practice-start-over").click();
    await page.getByTestId("practice-start-over-yes").click();
    await expect(page.getByTestId("practice-switch-state")).toHaveText("off");
    await expect(page.locator(".bug-live")).toHaveCount(0);
    await expect(page.getByTestId("practice-progress")).toHaveText(
      `0 of ${total} found`,
    );
    fact(
      "after start over",
      await page.getByTestId("practice-progress").innerText(),
    );
  });
});
