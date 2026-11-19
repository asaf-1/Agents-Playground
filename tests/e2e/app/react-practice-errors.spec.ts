// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// What the server says is on, turning faults on, and making the page's own
// practice calls fail or wait.
import {
  armFaults,
  failPractice,
  holdPracticeLoads,
  practiceTruth,
} from "../../../framework/helpers/practice";

// The Practice guide and the top switch when the server doesn't answer
// (web/src/pages/PracticePage.tsx, web/src/components/PracticeSwitch.tsx).
// Before this, a failed load showed "Practice mode is off" and "0 faults" while
// faults were on, a failed press said nothing, and a press on the switch while
// its state was unknown turned every fault on.
//
// Only the page's own calls are failed or held (page.route); the test asks the
// server directly (page.request) for the truth. The faults switched come from
// the server's catalogue, never written here. Safe in the fully parallel
// suite: each browser context is its own visitor with its own run key.

test.describe("Practice guide and switch when the server doesn't answer", () => {
  // A failed first load: an honest message, nothing claims off or 0, the
  // switch is locked; Try again shows the fault that is really on.
  test("a failed first load never says off or 0 faults, and Try again shows the fault that is on", async ({
    page,
  }) => {
    expected(
      "one fault on; its load answered 503 twice: 'Couldn't load your practice settings. Nothing was changed.', no 'Practice mode is off', no '0 faults', the switch locked and 'unknown'; Try again: '1 of N faults are on', the switch '1 on'",
    );
    const { flags, total } =
      await test.step("turn one fault on through the API", async () => {
        const truth = await practiceTruth(page);
        await armFaults(page, [truth.flags[0]]);
        return truth;
      });
    fact("fault on", flags[0]);
    fact("faults", total);

    const failing =
      await test.step("open the Practice guide while its load fails", async () => {
        const failing = await failPractice(page, "GET");
        await page.goto("/app/practice");
        await expect(
          page.getByTestId("practice-load-error"),
          "the page says it couldn't load, and that nothing changed",
        ).toContainText(
          "Couldn't load your practice settings. Nothing was changed.",
        );
        return failing;
      });
    fact("loads answered 503", failing.count());

    await test.step("nothing on the page claims off or 0 faults", async () => {
      await expect(
        page.getByText("Practice mode is off"),
        "the page never says practice mode is off when it doesn't know",
      ).toHaveCount(0);
      await expect(
        page.getByTestId("practice-page"),
        "no line on the page says 0 faults",
      ).not.toContainText(/\b0 faults/);
      await expect(
        page.getByTestId("practice-level-filter"),
        "the level filter waits for the list, instead of showing (0) counts",
      ).toHaveCount(0);
      await expect(
        page.getByTestId("practice-switch"),
        "the top switch is locked while its state is unknown",
      ).toBeDisabled();
      await expect(
        page.getByTestId("practice-switch-state"),
        "the top switch says its state is unknown, not off",
      ).toHaveText("unknown");
    });

    await test.step("press Try again once the server answers", async () => {
      await failing.stop();
      await page.getByTestId("practice-retry").click();
      await expect(
        page.getByTestId("practice-state"),
        "the page shows the one fault that is really on",
      ).toContainText(`1 of ${total} faults are on`);
      await expect(
        page.getByTestId("practice-load-error"),
        "the error is gone once the load works",
      ).toHaveCount(0);
      await expect(
        page.getByTestId("practice-switch-state"),
        "the top switch shows the real state",
      ).toHaveText("1 on");
    });
  });

  // A refresh that fails after a good answer: the last answer stays, marked
  // not up to date, and the buttons that act on it are locked until Try again.
  test("a failed refresh keeps the last answer, says it is not up to date, and Try again catches up", async ({
    page,
  }) => {
    expected(
      "one fault on and shown; loads then answered 503; a second fault turned on: the page still shows '1 of N faults are on', marked 'Not up to date: the server didn't answer', Turn on and the switch locked; the server has 2 on; Try again: '2 of N faults are on'",
    );
    const { flags, total } =
      await test.step("turn one fault on and open the Practice guide", async () => {
        const truth = await practiceTruth(page);
        await armFaults(page, [truth.flags[0]]);
        await page.goto("/app/practice");
        await expect(
          page.getByTestId("practice-state"),
          "the page shows the one fault on",
        ).toContainText(`1 of ${truth.total} faults are on`);
        return truth;
      });
    fact("faults turned on", `${flags[0]}, then ${flags[1]}`);

    const failing =
      await test.step("the server stops answering loads, and a second fault is turned on", async () => {
        const failing = await failPractice(page, "GET");
        await page.getByTestId(`bug-toggle-${flags[1]}`).click();
        await expect(
          page.getByTestId("practice-stale"),
          "the page says its answer is not up to date",
        ).toContainText("Not up to date: the server didn't answer");
        return failing;
      });
    fact("loads answered 503", failing.count());

    await test.step("the last answer stays, and what acts on it is locked", async () => {
      await expect(
        page.getByTestId("practice-state"),
        "the page keeps its last answer, marked, rather than guessing",
      ).toContainText(`1 of ${total} faults are on`);
      await expect(
        page.getByTestId(`bug-toggle-${flags[2]}`),
        "Turn on is locked while the list is not up to date",
      ).toBeDisabled();
      await expect(
        page.getByTestId("practice-switch"),
        "the top switch is locked while its state is not up to date",
      ).toBeDisabled();
    });

    await test.step("the server has both faults on", async () => {
      const truth = await practiceTruth(page);
      fact("server armed", truth.armed.join(", "));
      expect(truth.armed, "the server turned the second fault on").toEqual([
        flags[0],
        flags[1],
      ]);
    });

    await test.step("press Try again once the server answers", async () => {
      await failing.stop();
      await page.getByTestId("practice-retry").click();
      await expect(
        page.getByTestId("practice-state"),
        "the page catches up with the server",
      ).toContainText(`2 of ${total} faults are on`);
      await expect(
        page.getByTestId("practice-stale"),
        "the not-up-to-date mark is gone",
      ).toHaveCount(0);
      await expect(
        page.getByTestId(`bug-toggle-${flags[2]}`),
        "Turn on works again",
      ).toBeEnabled();
    });
  });

  // A press that tries to turn practice mode on, and fails: a message beside
  // the switch, the switch still off, nothing armed.
  test("a failed press to turn practice mode on shows why and changes nothing", async ({
    page,
  }) => {
    expected(
      "the switch 'off'; its press answered 503: 'Couldn't turn practice mode on. Try again.' beside it, the switch still 'off', the server has none on",
    );
    await test.step("open the Practice guide with every fault off", async () => {
      await page.goto("/app/practice");
      await expect(
        page.getByTestId("practice-switch-state"),
        "the switch starts off",
      ).toHaveText("off");
    });

    const failing =
      await test.step("press the switch while the server doesn't answer", async () => {
        const failing = await failPractice(page, "POST");
        await page.getByTestId("practice-switch").click();
        await expect(
          page.getByTestId("practice-switch-error"),
          "a message beside the switch says the press failed",
        ).toHaveText("Couldn't turn practice mode on. Try again.");
        return failing;
      });
    fact("presses answered 503", failing.count());

    await test.step("the switch keeps its confirmed state, and nothing changed", async () => {
      await expect(
        page.getByTestId("practice-switch-state"),
        "the switch still says off",
      ).toHaveText("off");
      await expect(
        page.getByTestId("practice-switch"),
        "the switch can be pressed again",
      ).toBeEnabled();
      const truth = await practiceTruth(page);
      fact("server armed", truth.armed.length);
      expect(truth.armed, "the server has no fault on").toEqual([]);
    });
  });

  // A press that tries to turn the faults off, and fails: a message beside
  // the switch, the switch still on, the fault still armed.
  test("a failed press to turn practice mode off shows why and changes nothing", async ({
    page,
  }) => {
    expected(
      "one fault on, the switch '1 on'; its press answered 503: 'Couldn't turn practice mode off. Try again.' beside it, the switch still '1 on', the server still has that fault on",
    );
    const flag =
      await test.step("turn one fault on and open the home page", async () => {
        const truth = await practiceTruth(page);
        await armFaults(page, [truth.flags[0]]);
        await page.goto("/app");
        await expect(
          page.getByTestId("practice-switch-state"),
          "the switch says one fault is on",
        ).toHaveText("1 on");
        return truth.flags[0];
      });
    fact("fault on", flag);

    const failing =
      await test.step("press the switch while the server doesn't answer", async () => {
        const failing = await failPractice(page, "POST");
        await page.getByTestId("practice-switch").click();
        await expect(
          page.getByTestId("practice-switch-error"),
          "a message beside the switch says the press failed",
        ).toHaveText("Couldn't turn practice mode off. Try again.");
        return failing;
      });
    fact("presses answered 503", failing.count());

    await test.step("the switch keeps its confirmed state, and nothing changed", async () => {
      await expect(
        page.getByTestId("practice-switch-state"),
        "the switch still says one fault is on",
      ).toHaveText("1 on");
      const truth = await practiceTruth(page);
      fact("server armed", truth.armed.join(", "));
      expect(truth.armed, "the server still has the fault on").toEqual([flag]);
    });
  });

  // A slow answer: the page and the switch say they are checking, never off,
  // and show the real state once it arrives.
  test("a slow answer shows checking on the page and the switch, never a false off", async ({
    page,
  }) => {
    expected(
      "the load held: the state box 'Checking your practice settings', no 'Practice mode is off', the switch 'checking' and locked; released: 'Practice mode is off', the switch 'off'",
    );
    const hold =
      await test.step("open the Practice guide while its load waits", async () => {
        const hold = await holdPracticeLoads(page);
        await page.goto("/app/practice");
        await expect(
          page.getByTestId("practice-state"),
          "the state box says it is checking",
        ).toContainText("Checking your practice settings");
        return hold;
      });

    await test.step("nothing says off while the answer is on its way", async () => {
      await expect(
        page.getByText("Practice mode is off"),
        "the page never says off before it knows",
      ).toHaveCount(0);
      await expect(
        page.getByTestId("practice-switch-state"),
        "the switch says it is checking, not off",
      ).toHaveText("checking");
      await expect(
        page.getByTestId("practice-switch"),
        "the switch is locked while it checks",
      ).toBeDisabled();
    });

    await test.step("the answer arrives", async () => {
      await hold.release();
      await expect(
        page.getByTestId("practice-state"),
        "the page shows the real state, off for a new visitor",
      ).toContainText("Practice mode is off");
      await expect(
        page.getByTestId("practice-switch-state"),
        "the switch shows the real state",
      ).toHaveText("off");
    });
  });
});
