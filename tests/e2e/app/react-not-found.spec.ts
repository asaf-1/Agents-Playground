// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// A sidebar link, with its group opened first if it is shut.
import { navLink } from "../../../framework/helpers/nav";

// Page not found and the error screen (web/src/pages/NotFoundPage.tsx and
// web/src/components/ErrorBoundary.tsx): an address the app has no page for
// shows where you are and three ways back, and a page that breaks shows what
// happened while the menu stays.
//
// Safe in the fully parallel suite: nothing here signs in or changes data,
// and the blocked page file is blocked only in the test's own browser.

// The About page's code, as the build names it (AboutPage-<hash>.js). Blocking
// it is a real way a page breaks: its code never arrives.
const ABOUT_CODE = "**/app/assets/AboutPage-*.js";

// Each way back on Page not found, and the page it opens.
const WAYS_BACK = [
  { testId: "not-found-home", url: /\/app$/, page: "app-home" },
  { testId: "not-found-bank", url: /\/app\/bank$/, page: "bank-page" },
  {
    testId: "not-found-practice",
    url: /\/app\/practice$/,
    page: "practice-page",
  },
];

test.describe("Page not found and the error screen (/app)", () => {
  // An unknown address: the heading, the address as typed, and the frame.
  test("an unknown address shows Page not found, with the address and the menu", async ({
    page,
  }) => {
    const missing = "/app/no-such-page?from=old-link";
    expected(
      `${missing}: heading 'Page not found', the address shown as typed, the sidebar still there`,
    );
    fact("address", missing);

    await page.goto(missing);
    await expect(page.getByTestId("not-found-page")).toBeVisible();
    await expect(page.getByTestId("app-heading")).toHaveText("Page not found");
    await expect(page.getByTestId("not-found-path")).toHaveText(missing);
    await expect(page.getByTestId("app-nav")).toBeVisible();
  });

  // A deep address under a real section is unknown too, and a real page never
  // shows Page not found.
  test("a deep unknown address is not found, and a real page is", async ({
    page,
  }) => {
    expected(
      "/app/bank/nope/extra shows Page not found with that address; /app/about shows About, not Page not found",
    );

    await page.goto("/app/bank/nope/extra");
    await expect(page.getByTestId("not-found-path")).toHaveText(
      "/app/bank/nope/extra",
    );

    await page.goto("/app/about");
    await expect(page.getByTestId("app-about")).toBeVisible();
    await expect(page.getByTestId("not-found-page")).toHaveCount(0);
  });

  // Each of the three links opens its page.
  test("each way back opens its page", async ({ page }) => {
    expected(
      "Home opens /app, Bank opens /app/bank, Practice guide opens /app/practice",
    );
    fact(
      "links",
      WAYS_BACK.map((way) => way.testId),
    );

    for (const way of WAYS_BACK) {
      await page.goto("/app/no-such-page");
      await page.getByTestId(way.testId).click();
      await expect(page, way.testId).toHaveURL(way.url);
      await expect(page.getByTestId(way.page), way.testId).toBeVisible();
      await expect(page.getByTestId("not-found-page")).toHaveCount(0);
    }
  });

  // A page whose code never arrives: the error screen, inside the frame, and
  // the error still reported as a page error.
  test("a page whose code fails to load shows the error screen, and Back to home works", async ({
    page,
  }) => {
    expected(
      "About's code blocked: the error screen with a message, the sidebar still there, a page error reported; Back to home opens Home and the screen is gone",
    );
    // Every error the page reports as uncaught.
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route(ABOUT_CODE, (route) => route.abort());

    // Home loads; About is opened inside the app, so only its code is asked for.
    await page.goto("/app");
    await expect(page.getByTestId("app-home")).toBeVisible();
    await (await navLink(page, "nav-link-about")).click();

    await expect(page.getByTestId("app-error")).toBeVisible();
    await expect(page.getByTestId("app-heading")).toHaveText(
      "Something went wrong on this page",
    );
    await expect(page.getByTestId("app-error-message")).not.toBeEmpty();
    await expect(page.getByTestId("app-nav")).toBeVisible();
    await expect.poll(() => pageErrors.length).toBeGreaterThan(0);
    fact("message", await page.getByTestId("app-error-message").innerText());
    fact("page errors", pageErrors.length);

    // Back to home clears the screen.
    await page.getByTestId("app-error-home").click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId("app-home")).toBeVisible();
    await expect(page.getByTestId("app-error")).toHaveCount(0);
  });

  // Reload fetches the page again: once the code arrives, the page opens.
  test("Reload the page loads it again once its code arrives", async ({
    page,
  }) => {
    expected(
      "About's code blocked on /app/about: the error screen; unblocked and Reload pressed: About opens and the screen is gone",
    );
    await page.route(ABOUT_CODE, (route) => route.abort());

    await page.goto("/app/about");
    await expect(page.getByTestId("app-error")).toBeVisible();

    await page.unroute(ABOUT_CODE);
    await page.getByTestId("app-error-reload").click();
    await expect(page.getByTestId("app-about")).toBeVisible();
    await expect(page.getByTestId("app-error")).toHaveCount(0);
  });
});
