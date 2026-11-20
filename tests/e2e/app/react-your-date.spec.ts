// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Signing up a customer of one's own, whose date can move.
import { signUpCustomer } from "../../../framework/helpers/bank";
// The customer's clock, and moving it through the API.
import {
  addDays,
  advanceClockTo,
  readClock,
} from "../../../framework/helpers/schedule";

// Your date (web/src/components/YourDate.tsx), in the top bar of every page
// since 2026-11-20: the time now in UTC, the customer's own date, +1 day and
// the back arrow. It replaced the clock card on the Practice page, and the
// "Practice site" strip above the top bar went the same day.
//
// Safe in the fully parallel suite: each test signs up its own customer, and
// a customer's date moves for nobody else.

// A phone's screen at its narrowest, the width the phone checks use last.
const NARROW = { width: 320, height: 700 };

test.describe("Your date in the top bar", () => {
  // The chip shows the time in UTC and the customer's date; a move on one
  // page is still there on the next, and the back arrow undoes it.
  test("Your date shows the UTC time and your date, and a move on one page holds on the next", async ({
    page,
  }) => {
    expected(
      "a new customer on /app/bank: the time as HH:MM UTC, within a minute of now; the date the server gives; +1 day: '+1 day' ahead, still so on /app/markets; the back arrow: the real date again; no 'Practice site' strip",
    );
    const clock =
      await test.step("sign up and read the date from the server", async () => {
        await signUpCustomer(page.request, "Date Customer");
        return readClock(page.request);
      });
    fact("today", clock.today);

    await test.step("open Bank: the time and the date show", async () => {
      await page.goto("/app/bank");
      const time = page.getByTestId("your-date-time");
      await expect(time, "the time is HH:MM and says UTC").toHaveText(
        /^\d{2}:\d{2}UTC$/,
      );
      // The shown minute against the real UTC minute, a minute either way
      // allowed for the moment between reading and checking.
      const shown = (await time.innerText()).slice(0, 5);
      const now = new Date();
      const minutes = (hhmm: string) =>
        Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
      const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const gap = Math.abs(minutes(shown) - nowMinutes) % (24 * 60);
      fact("time shown", shown);
      expect(
        Math.min(gap, 24 * 60 - gap),
        "the time shown is the UTC time now, to the minute",
      ).toBeLessThanOrEqual(1);
      await expect(
        page.getByTestId("clock-today"),
        "the date is the customer's date from the server",
      ).toContainText(clock.today);
      await expect(
        page.getByTestId("clock-reset"),
        "no back arrow while the date is the real one",
      ).toHaveCount(0);
      await expect(
        page.getByTestId("practice-banner"),
        "the 'Practice site' strip is gone",
      ).toHaveCount(0);
    });

    await test.step("press +1 day", async () => {
      await page.getByTestId("clock-advance").click();
      await expect(
        page.getByTestId("clock-offset"),
        "the date is one day ahead",
      ).toHaveText("+1 day");
      await expect(
        page.getByTestId("clock-today"),
        "the date shown is tomorrow",
      ).toContainText(addDays(clock.today, 1));
    });

    await test.step("open Markets: the moved date is still there", async () => {
      await page.goto("/app/markets");
      await expect(
        page.getByTestId("clock-offset"),
        "another page shows the same moved date",
      ).toHaveText("+1 day");
    });

    await test.step("press the back arrow", async () => {
      await page.getByTestId("clock-reset").click();
      await expect(
        page.getByTestId("clock-today"),
        "the date is the real one again",
      ).toContainText(clock.today);
      await expect(
        page.getByTestId("clock-offset"),
        "no 'ahead' mark once it is back",
      ).toHaveCount(0);
      const after = await readClock(page.request);
      fact("offset after", after.offsetDays);
      expect(after.offsetDays, "the server's date is back too").toBe(0);
    });
  });

  // On the narrowest phone, a date moved ahead (the widest the chip gets,
  // with its offset and back arrow) still fits the screen.
  test("a date moved two days ahead fits a 320px phone, back arrow and all", async ({
    page,
  }) => {
    expected(
      "at 320 px, a customer two days ahead: the chip shows '+2 days' and the back arrow, ends inside 320 px, and the page is no wider than the screen",
    );
    await test.step("sign up and move the date two days through the API", async () => {
      await signUpCustomer(page.request, "Narrow Date Customer");
      const { today } = await readClock(page.request);
      await advanceClockTo(page.request, addDays(today, 2));
    });

    await test.step("open Bank on a 320px screen", async () => {
      await page.setViewportSize(NARROW);
      await page.goto("/app/bank");
      await expect(
        page.getByTestId("clock-offset"),
        "the chip says two days ahead",
      ).toHaveText("+2 days");
      await expect(
        page.getByTestId("clock-reset"),
        "the back arrow shows",
      ).toBeVisible();
    });

    await test.step("the chip and the page fit the screen", async () => {
      const box = await page.getByTestId("your-date").boundingBox();
      const right = box ? Math.round(box.x + box.width) : null;
      fact("chip right edge", right);
      expect(right, "the chip is drawn").not.toBeNull();
      expect(right!, "the chip ends inside the screen").toBeLessThanOrEqual(
        NARROW.width,
      );
      const width = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      fact("page width", width);
      expect(
        width,
        "nothing pushes the page wider than the screen",
      ).toBeLessThanOrEqual(NARROW.width);
    });
  });
});
