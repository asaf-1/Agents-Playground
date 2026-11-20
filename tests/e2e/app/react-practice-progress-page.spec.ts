// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Playwright's page type, for the helpers below.
import type { Page } from "@playwright/test";
// Signing up a customer of one's own, whose ticks are kept.
import { signUpCustomer } from "../../../framework/helpers/bank";
// What the server says is on, and turning faults on through the API.
import { armFaults, practiceTruth } from "../../../framework/helpers/practice";

// Your progress (web/src/pages/PracticeProgressPage.tsx), the screen under
// the Practice guide built on 2026-11-20: the sidebar link, the tabs (To find,
// Found, On now, All), the dots, a level folding away, and the page's own
// instructions.
//
// Safe in the fully parallel suite: each test signs up its own customer, and
// each browser context is its own visitor with its own run key. The faults
// used come from the server's catalogue, never written here.

// Ticks a fault found through the page, and waits for the tick to hold.
async function tick(page: Page, flag: string): Promise<void> {
  await page.getByTestId(`bug-found-${flag}`).click();
  await expect(
    page.getByTestId(`bug-found-${flag}`),
    `the tick on ${flag} is pressed`,
  ).toHaveAttribute("aria-pressed", "true");
}

test.describe("Your progress, the checklist (/app/practice/progress)", () => {
  // The sidebar's Your progress link sits right under Practice guide, opens
  // the page, and only it is marked as the page you are on.
  test("the sidebar's Your progress link sits under Practice guide and opens the page", async ({
    page,
  }) => {
    expected(
      "Your progress is the link right below Practice guide; pressing it opens 'Your progress', marked current, and Practice guide is not",
    );
    await test.step("open the home page", async () => {
      await page.goto("/app");
    });

    await test.step("Your progress sits right under Practice guide", async () => {
      const guide = await page.getByTestId("nav-link-practice").boundingBox();
      const progress = await page
        .getByTestId("nav-link-progress")
        .boundingBox();
      fact("guide top", guide ? Math.round(guide.y) : null);
      fact("progress top", progress ? Math.round(progress.y) : null);
      expect(guide, "the Practice guide link is drawn").not.toBeNull();
      expect(progress, "the Your progress link is drawn").not.toBeNull();
      expect(
        progress!.y,
        "Your progress is below Practice guide",
      ).toBeGreaterThan(guide!.y);
      expect(
        progress!.y - guide!.y,
        "with nothing between them (one link's height apart)",
      ).toBeLessThan(guide!.height * 1.6);
    });

    await test.step("press Your progress", async () => {
      await page.getByTestId("nav-link-progress").click();
      await expect(page, "the address is Your progress").toHaveURL(
        /\/app\/practice\/progress$/,
      );
      await expect(
        page.getByTestId("app-heading"),
        "the page's heading is Your progress",
      ).toHaveText("Your progress");
      await expect(
        page.getByTestId("nav-link-progress"),
        "Your progress is marked as the current page",
      ).toHaveAttribute("aria-current", "page");
      await expect(
        page.getByTestId("nav-link-practice"),
        "Practice guide is not marked current on Your progress",
      ).not.toHaveAttribute("aria-current", "page");
    });
  });

  // The tabs split the list: To find hides what is ticked, Found shows only
  // it, On now shows only what is switched on, and All shows everything.
  test("To find and Found split the list as faults are ticked, and On now shows only what is on", async ({
    page,
  }) => {
    expected(
      "a new customer ticks one fault and has another on: To find N-1 lines without the ticked one; Found 1, the ticked one; On now 1, the one on; All N",
    );
    const truth =
      await test.step("sign up, and turn one fault on through the API", async () => {
        await signUpCustomer(page.request, "Tabs Customer");
        const truth = await practiceTruth(page);
        await armFaults(page, [truth.flags[1]]);
        return truth;
      });
    const [ticked, on] = truth.flags;
    fact("faults", truth.total);
    fact("ticked", ticked);
    fact("on", on);

    await test.step("open Your progress and tick one fault", async () => {
      await page.goto("/app/practice/progress");
      await tick(page, ticked);
    });

    const lines = page.locator(".bug-row");
    await test.step("To find leaves the ticked fault out", async () => {
      await page.getByTestId("practice-show-todo").click();
      await expect(lines, "every fault but the ticked one").toHaveCount(
        truth.total - 1,
      );
      await expect(
        page.getByTestId(`bug-${ticked}`),
        "the ticked fault is not on To find",
      ).toHaveCount(0);
    });

    await test.step("Found shows only the ticked fault", async () => {
      await page.getByTestId("practice-show-found").click();
      await expect(lines, "one fault is found").toHaveCount(1);
      await expect(
        page.getByTestId(`bug-${ticked}`),
        "and it is the ticked one",
      ).toBeVisible();
    });

    await test.step("On now shows only the fault that is on", async () => {
      await page.getByTestId("practice-show-on").click();
      await expect(lines, "one fault is on").toHaveCount(1);
      await expect(
        page.getByTestId(`bug-${on}`),
        "and it is the one turned on",
      ).toBeVisible();
    });

    await test.step("All shows every fault again", async () => {
      await page.getByTestId("practice-show-all").click();
      await expect(lines, "every fault in the catalogue").toHaveCount(
        truth.total,
      );
    });
  });

  // The dots: one per fault, green once ticked; pressing one shows its line,
  // opened, even when the tab in use hides it.
  test("a dot turns green when its fault is ticked, and pressing one opens its fault's line", async ({
    page,
  }) => {
    expected(
      "one dot per fault; a ticked fault's dot is found; on Found, pressing another fault's dot switches to All and opens that line with its Where",
    );
    const truth =
      await test.step("sign up and open Your progress", async () => {
        await signUpCustomer(page.request, "Dots Customer");
        const truth = await practiceTruth(page);
        await page.goto("/app/practice/progress");
        return truth;
      });
    const [ticked, other] = truth.flags;
    fact("ticked", ticked);
    fact("dot pressed", other);

    await test.step("there is one dot per fault", async () => {
      await expect(
        page.locator("[data-testid^='practice-dot-']"),
        "one dot for every fault in the catalogue",
      ).toHaveCount(truth.total);
    });

    await test.step("tick a fault: its dot turns found", async () => {
      await tick(page, ticked);
      await expect(
        page.getByTestId(`practice-dot-${ticked}`),
        "the ticked fault's dot is drawn as found",
      ).toHaveClass(/is-found/);
      await expect(
        page.getByTestId(`practice-dot-${other}`),
        "a fault not ticked keeps a hollow dot",
      ).not.toHaveClass(/is-found/);
    });

    await test.step("on Found, press the dot of a fault not found", async () => {
      await page.getByTestId("practice-show-found").click();
      await expect(
        page.getByTestId(`bug-${other}`),
        "the fault not found is hidden on Found",
      ).toHaveCount(0);
      await page.getByTestId(`practice-dot-${other}`).click();
    });

    await test.step("its line is shown, opened, in view", async () => {
      await expect(
        page.getByTestId("practice-show-all"),
        "the list switched to All, so the line can show",
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByTestId(`bug-open-${other}`),
        "the line is opened",
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByTestId(`bug-details-${other}`),
        "its Where and hint show",
      ).toContainText("Where:");
      await expect(
        page.getByTestId(`bug-details-${other}`),
        "the opened line is scrolled into view",
      ).toBeInViewport();
    });
  });

  // A level's heading folds its faults away, says how many are found, and
  // opens them again.
  test("a level folds away under its heading and opens again", async ({
    page,
  }) => {
    expected(
      "a new customer: Hard's heading says '0 of N found'; pressed, its lines hide and it says folded; pressed again, they show",
    );
    await test.step("sign up and open Your progress", async () => {
      await signUpCustomer(page.request, "Fold Customer");
      await page.goto("/app/practice/progress");
    });

    const fold = page.getByTestId("bug-group-fold-hard");
    const group = page.getByTestId("bug-group-hard");
    const size =
      await test.step("the Hard heading counts what is found", async () => {
        await expect(
          group.locator(".bug-row").first(),
          "Hard's lines have drawn",
        ).toBeVisible();
        const size = await group.locator(".bug-row").count();
        await expect(
          fold,
          "nothing found yet, out of the level's size",
        ).toContainText(`0 of ${size} found`);
        return size;
      });
    fact("Hard faults", size);

    await test.step("fold Hard away", async () => {
      await fold.click();
      await expect(
        fold,
        "the heading says the level is folded",
      ).toHaveAttribute("aria-expanded", "false");
      await expect(group, "Hard's lines are hidden").toBeHidden();
    });

    await test.step("open Hard again", async () => {
      await fold.click();
      await expect(fold, "the heading says the level is open").toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(
        group.locator(".bug-row"),
        "every Hard line shows again",
      ).toHaveCount(size);
    });
  });

  // The page explains every control on it, and the guide leads to it.
  test("Your progress explains every control on it, and the guide links to it", async ({
    page,
  }) => {
    expected(
      "the guide's 'Open Your progress' opens the page; its instructions name Off/On, Turn on all, opening a line, Reveal the answer, the circle, the tabs and Start over",
    );
    await test.step("open the guide and follow its link", async () => {
      await page.goto("/app/practice");
      await page.getByTestId("practice-go-progress").click();
      await expect(page, "the guide's link opens Your progress").toHaveURL(
        /\/app\/practice\/progress$/,
      );
    });

    const controls = [
      "Off/On",
      "Turn on all",
      "Press a fault's line",
      "Reveal the answer",
      "The circle",
      "To find, Found, On now, All",
      "Start over",
    ];
    fact("controls", controls);
    await test.step("the instructions name every control", async () => {
      const how = page.getByTestId("progress-how");
      for (const control of controls) {
        await expect(how, `the instructions name ${control}`).toContainText(
          control,
        );
      }
    });
  });
});
