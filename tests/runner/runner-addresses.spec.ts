// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// The types of a browser, a browser context and a page.
import { type Browser, type BrowserContext, type Page } from "@playwright/test";
// The runner helpers: the administrator, the saved sessions, a signed-out
// browser, a flow from the catalog, open the runner, start a run, a unique
// reason.
import {
  ADMIN,
  SIGNED_OUT,
  USER_STATE,
  flowById,
  openRunner,
  startRun,
  uniqueReason,
} from "../../framework/helpers/runner";

// Every screen and every run has its own address after a "#", and the Running
// now line leads back to a run still going. Until 2026-11-26 the page wrote no
// address at all: a refresh landed on the Run tab, a new tab on the Dashboard,
// and Back left the runner, so a run's page was lost the moment anybody left it
// (Asaf, leaving a soak run). Each test starts its own short stub run and finds
// it by its id, because other tests start runs at the same time.

// The quick suite every test here runs: the stub finishes it in a few seconds.
const FLOW = "group-smoke";

// The run id in the address bar of a run's page.
function runIdIn(page: Page): string {
  const match = /#\/runs\/(\d+)$/.exec(page.url());
  expect(match, `the address names the run: ${page.url()}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

// A second browser with its own session (signed out, or the plain user), at
// the runner's address.
async function otherBrowser(
  browser: Browser,
  baseURL: string | undefined,
  storageState: string | typeof SIGNED_OUT,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, storageState });
  return { context, page: await context.newPage() };
}

test.describe("Addresses", () => {
  // The run page's address survives a refresh.
  test("a run's page has its own address, and a refresh opens that same run again", async ({
    page,
  }) => {
    expected(
      "the run page's address is #/runs/<id>; after a refresh the same run page, the suite's name as its title, the same address",
    );
    let id = "";

    await test.step("start a Smoke run", async () => {
      await startRun(page, FLOW, uniqueReason("address refresh"));
      id = runIdIn(page);
      fact("run", id);
      await expect(
        page.getByTestId("run-view-title"),
        "the run page names the suite",
      ).toHaveText(flowById(FLOW).label);
    });

    await test.step("refresh the page", async () => {
      await page.reload();
      await expect(
        page.getByTestId("panel-run-view"),
        "the run page is open again after the refresh",
      ).toBeVisible();
      await expect(
        page.getByTestId("run-view-title"),
        "it is the same run",
      ).toHaveText(flowById(FLOW).label);
      expect(page.url(), "the address still names the run").toMatch(
        new RegExp(`#/runs/${id}$`),
      );
    });
  });

  // The address works in a browser tab that never saw the run.
  test("a run's address opened in a new browser tab shows that same run", async ({
    page,
    context,
  }) => {
    expected(
      "a second tab sent to #/runs/<id> opens that run's page, titled with the suite's name",
    );
    let id = "";

    await test.step("start a Smoke run", async () => {
      await startRun(page, FLOW, uniqueReason("address new tab"));
      id = runIdIn(page);
      fact("run", id);
    });

    await test.step("open its address in a new browser tab", async () => {
      const second = await context.newPage();
      await second.goto(`/#/runs/${id}`);
      await expect(
        second.getByTestId("panel-run-view"),
        "the new tab opens the run's page, not the Dashboard",
      ).toBeVisible();
      await expect(
        second.getByTestId("run-view-title"),
        "it is the same run",
      ).toHaveText(flowById(FLOW).label);
      await second.close();
    });
  });

  // Back and Forward stay inside the runner.
  test("Back and Forward move between screens and a run's page without leaving the runner", async ({
    page,
  }) => {
    expected(
      "Dashboard > History > the run, then Back shows History, Back the Dashboard, Forward History, Forward the run again",
    );
    const reason = uniqueReason("address back");
    let id = "";

    await test.step("start a Smoke run, then go Dashboard > History > View", async () => {
      await startRun(page, FLOW, reason);
      id = runIdIn(page);
      fact("run", id);

      await page.getByTestId("tab-dashboard").click();
      await page.getByTestId("tab-history").click();
      // Other tests start runs too, so the row is found by its own reason.
      const row = page.getByTestId("history-row").filter({
        has: page.getByTestId("history-reason").filter({ hasText: reason }),
      });
      await row.getByTestId("run-view").click();
      await expect(
        page.getByTestId("panel-run-view"),
        "the run's page is open",
      ).toBeVisible();
    });

    await test.step("Back, Back", async () => {
      await page.goBack();
      await expect(
        page.getByTestId("panel-history"),
        "Back from the run's page shows History",
      ).toBeVisible();
      expect(page.url(), "History's address").toMatch(/#\/history$/);

      await page.goBack();
      await expect(
        page.getByTestId("panel-dashboard"),
        "Back again shows the Dashboard, still inside the runner",
      ).toBeVisible();
      expect(page.url(), "the Dashboard's address").toMatch(/#\/dashboard$/);
    });

    await test.step("Forward, Forward", async () => {
      await page.goForward();
      await expect(
        page.getByTestId("panel-history"),
        "Forward shows History",
      ).toBeVisible();

      await page.goForward();
      await expect(
        page.getByTestId("panel-run-view"),
        "Forward again shows the run's page",
      ).toBeVisible();
      expect(page.url(), "the run's address").toMatch(
        new RegExp(`#/runs/${id}$`),
      );
    });
  });

  // Leaving the runner altogether and pressing Back.
  test("going to another site and pressing Back returns to the run's page", async ({
    page,
  }) => {
    expected(
      "on a run's page, a visit to another page and then Back lands on the same run's page",
    );
    let id = "";

    await test.step("start a Smoke run", async () => {
      await startRun(page, FLOW, uniqueReason("address other site"));
      id = runIdIn(page);
      fact("run", id);
    });

    await test.step("go to another page, then press Back", async () => {
      await page.goto("about:blank");
      await page.goBack();
      await expect(
        page.getByTestId("panel-run-view"),
        "Back returns to the run's page",
      ).toBeVisible();
      expect(page.url(), "the run's address").toMatch(
        new RegExp(`#/runs/${id}$`),
      );
    });
  });

  // Each tab's address, opened in a new browser tab, opens that tab.
  test("every tab has its own address, and that address opens the same tab in a new browser tab", async ({
    page,
    context,
  }) => {
    expected(
      "Dashboard, Run, History, Reports, Triage and Users each write #/<tab>, and a new tab sent there opens that tab",
    );
    await openRunner(page);

    for (const tab of [
      "dashboard",
      "run",
      "history",
      "reports",
      "triage",
      "users",
    ]) {
      await test.step(`the ${tab} tab`, async () => {
        await page.getByTestId(`tab-${tab}`).click();
        expect(page.url(), `the ${tab} tab writes its own address`).toMatch(
          new RegExp(`#/${tab}$`),
        );

        const second = await context.newPage();
        await second.goto(`/#/${tab}`);
        await expect(
          second.getByTestId(`panel-${tab}`),
          `a new tab sent to #/${tab} opens that tab`,
        ).toBeVisible();
        await expect(
          second.getByTestId(`tab-${tab}`),
          `the ${tab} tab is marked as the open one`,
        ).toHaveAttribute("aria-selected", "true");
        await second.close();
      });
    }
  });

  // Signed out, sign in, land on the run.
  test("a signed-out visitor sent a run's address signs in and lands on that run", async ({
    page,
    browser,
    baseURL,
  }) => {
    expected(
      "a signed-out browser at #/runs/<id> shows the sign-in card; after signing in, that run's page",
    );
    let id = "";

    await test.step("start a Smoke run", async () => {
      await startRun(page, FLOW, uniqueReason("address sign in"));
      id = runIdIn(page);
      fact("run", id);
    });

    const visitor = await otherBrowser(browser, baseURL, SIGNED_OUT);

    await test.step("a signed-out browser opens the run's address", async () => {
      await visitor.page.goto(`/#/runs/${id}`);
      await expect(
        visitor.page.getByTestId("auth-screen"),
        "signed out, the sign-in card comes first",
      ).toBeVisible();
    });

    await test.step("sign in", async () => {
      fact("account", ADMIN.username);
      await visitor.page.getByTestId("signin-username").fill(ADMIN.username);
      await visitor.page.getByTestId("signin-password").fill(ADMIN.password);
      await visitor.page.getByTestId("signin-submit").click();
      await expect(
        visitor.page.getByTestId("panel-run-view"),
        "after signing in, the run's page the address named",
      ).toBeVisible();
      expect(visitor.page.url(), "the run's address").toMatch(
        new RegExp(`#/runs/${id}$`),
      );
    });

    await visitor.context.close();
  });

  // An admin-only address, for a plain user.
  test("a plain user sent the Users address gets the Dashboard, and the address says so", async ({
    browser,
    baseURL,
  }) => {
    expected(
      "runner-user at #/users sees the Dashboard, no Users tab, and the address #/dashboard",
    );
    const user = await otherBrowser(browser, baseURL, USER_STATE);

    await test.step("open #/users as the plain user", async () => {
      await user.page.goto("/#/users");
      await expect(
        user.page.getByTestId("panel-dashboard"),
        "a tab this person does not have falls back to the Dashboard",
      ).toBeVisible();
      await expect(
        user.page.getByTestId("tab-users"),
        "there is no Users tab for a plain user",
      ).toHaveCount(0);
      expect(user.page.url(), "the address follows the fallback").toMatch(
        /#\/dashboard$/,
      );
    });

    await user.context.close();
  });

  // A run that does not exist, by its address.
  test("an address for a run that does not exist says so, and stops asking after three tries", async ({
    page,
  }) => {
    expected(
      "#/runs/1 opens the run page with 'Could not load this run' and the server's 'was not found'; at most three requests for it in 16 seconds",
    );
    // Every request for run 1's detail, counted.
    let asked = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/runs/1") asked += 1;
    });

    await test.step("open #/runs/1", async () => {
      await page.goto("/#/runs/1");
      await expect(
        page.getByTestId("run-view-subtitle"),
        "the page says the run could not be loaded, not Loading…",
      ).toContainText("Could not load this run");
      await expect(
        page.getByTestId("run-view-status"),
        "with the server's own words",
      ).toContainText("was not found");
    });

    await test.step("wait three refreshes and more", async () => {
      // Five-second refreshes: tries at 0, 5 and 10 seconds, then none.
      await page.waitForTimeout(16_000);
      fact("requests for run 1", asked);
      expect(
        asked,
        "the page stops asking for a run that is not there after three tries",
      ).toBeLessThanOrEqual(3);
    });
  });

  // An address that names nothing, and the skip link's "#".
  test("an address that names nothing opens the Dashboard, and the skip link's # moves nobody", async ({
    page,
  }) => {
    expected(
      "#/nothing opens the Dashboard at #/dashboard; on History, the skip link leaves History open",
    );

    await test.step("open #/nothing", async () => {
      await page.goto("/#/nothing");
      await expect(
        page.getByTestId("panel-dashboard"),
        "an unknown address opens the Dashboard",
      ).toBeVisible();
      expect(page.url(), "and says so in the address").toMatch(/#\/dashboard$/);
    });

    await test.step("on History, use the skip link", async () => {
      await page.getByTestId("tab-history").click();
      await page.getByTestId("skip-link").focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByTestId("panel-history"),
        "the skip link's #runner-main is not an address: History stays open",
      ).toBeVisible();
    });
  });
});

test.describe("Running now", () => {
  // The line under the tabs, while a run goes, and after it ends.
  test("a run still going is on the Running now line of another screen, Open leads back to it, and it leaves the line when it ends", async ({
    page,
  }) => {
    expected(
      "on Reports, a row for the run with the suite's name and 'Running'/'Queued', its Open link opens the run's page (where the line is hidden); back on Reports the row goes once the run ends",
    );
    let id = "";

    await test.step("start a Smoke run", async () => {
      await startRun(page, FLOW, uniqueReason("running now"));
      id = runIdIn(page);
      fact("run", id);
      await expect(
        page.getByTestId("live-runs"),
        "the line is hidden on a run's own page",
      ).toBeHidden();
    });

    // Other tests' runs can be on the line too, so the row is found by its id.
    const row = page.locator(`[data-testid="live-run"][data-run-id="${id}"]`);

    await test.step("go to Reports", async () => {
      await page.getByTestId("tab-reports").click();
      await expect(
        row,
        "the run is on the Running now line of a screen that shows no runs",
      ).toBeVisible();
      await expect(
        row.getByTestId("live-run-name"),
        "the row names the suite",
      ).toHaveText(flowById(FLOW).label);
      await expect(
        row.getByTestId("live-run-time"),
        "the row says how long it has been going",
      ).toHaveText(/^(Running|Queued) /);
    });

    await test.step("press Open on its row", async () => {
      await row.getByTestId("live-run-open").click();
      await expect(
        page.getByTestId("panel-run-view"),
        "Open leads back to the run's page",
      ).toBeVisible();
      expect(page.url(), "the run's address").toMatch(
        new RegExp(`#/runs/${id}$`),
      );
    });

    await test.step("back on Reports, wait for the run to end", async () => {
      await page.getByTestId("tab-reports").click();
      // The stub ends a run in about eight seconds; the line refreshes every
      // five.
      await expect(
        row,
        "a finished run leaves the line (History keeps it)",
      ).toHaveCount(0, { timeout: 20_000 });
    });
  });
});
