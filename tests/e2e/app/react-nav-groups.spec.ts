// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

// The sidebar's groups that fold away (web/src/components/Layout.tsx): Money,
// Exchange, Shop, Back office, You and Developers start shut, except the one
// holding the page you are on; a heading opens and shuts its group; what you
// open is remembered in this browser.
//
// Safe in the fully parallel suite: nothing here signs in or changes data,
// and each test's browser has its own storage.

// The six groups, by their heading's id.
const GROUPS = ["money", "exchange", "shop", "backoffice", "you", "developers"];

test.describe("Sidebar groups (/app)", () => {
  // On Home every group is shut; on Transfer only Money is open.
  test("groups start shut, except the one holding the page you are on", async ({
    page,
  }) => {
    expected(
      "on /app all six headings are shut and Markets is hidden; on /app/bank/transfer only Money is open, Transfer shows and Markets is hidden",
    );
    fact("groups", GROUPS);
    await page.goto("/app");
    for (const id of GROUPS) {
      await expect(page.getByTestId(`nav-group-${id}`), id).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    await expect(page.getByTestId("nav-link-markets")).toBeHidden();
    // The two links outside any group always show.
    await expect(page.getByTestId("nav-link-practice")).toBeVisible();
    await expect(page.getByTestId("nav-link-home")).toBeVisible();

    await page.goto("/app/bank/transfer");
    for (const id of GROUPS) {
      await expect(page.getByTestId(`nav-group-${id}`), id).toHaveAttribute(
        "aria-expanded",
        id === "money" ? "true" : "false",
      );
    }
    await expect(page.getByTestId("nav-link-transfer")).toBeVisible();
    await expect(page.getByTestId("nav-link-markets")).toBeHidden();
  });

  // About is about the site, not about you: last, outside every group, and
  // always shown.
  test("About sits last, on its own, outside every group", async ({ page }) => {
    expected(
      "on /app with every group shut: About shows, is the menu's last link, and sits in no group; on /app/about no group opens",
    );
    await page.goto("/app");
    const about = page.getByTestId("nav-link-about");
    await expect(about).toBeVisible();
    await expect(
      page.getByTestId("app-nav").locator("a").last(),
    ).toHaveAttribute("data-testid", "nav-link-about");
    const group = await about.evaluate(
      (element) =>
        element.closest("[data-nav-group]")?.getAttribute("data-nav-group") ??
        null,
    );
    fact("group", group ?? "none");
    expect(group).toBeNull();

    await about.click();
    await expect(page.getByTestId("app-about")).toBeVisible();
    for (const id of GROUPS) {
      await expect(page.getByTestId(`nav-group-${id}`), id).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  });

  // A heading opens its group, and the next press shuts it.
  test("a heading opens and shuts its group", async ({ page }) => {
    expected(
      "on /app, Exchange opens: Markets, Portfolio and Wallet show; pressed again: they hide",
    );
    await page.goto("/app");
    const heading = page.getByTestId("nav-group-exchange");
    await heading.click();
    await expect(heading).toHaveAttribute("aria-expanded", "true");
    for (const link of ["markets", "portfolio", "wallet"]) {
      await expect(page.getByTestId(`nav-link-${link}`)).toBeVisible();
    }
    await heading.click();
    await expect(heading).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("nav-link-markets")).toBeHidden();
  });

  // What you open is remembered in this browser.
  test("an opened group stays open after a reload and on other pages", async ({
    page,
  }) => {
    expected(
      "Developers opened on /app: still open after a reload, and on /app/bank (with Money, the page's own)",
    );
    await page.goto("/app");
    await page.getByTestId("nav-group-developers").click();
    await expect(page.getByTestId("nav-link-graphql")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("nav-group-developers")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.goto("/app/bank");
    await expect(page.getByTestId("nav-link-graphql")).toBeVisible();
    await expect(page.getByTestId("nav-link-transfer")).toBeVisible();
    fact(
      "remembered",
      await page.evaluate(() => window.localStorage.getItem("pb.nav.open")),
    );
  });

  // The page's own group can be shut while you are on it; a new visit opens
  // it again.
  test("the page's own group can be shut, and opens again on the next visit", async ({
    page,
  }) => {
    expected(
      "on /app/bank, Money shut by its heading hides Transfer; after a reload Money is open again",
    );
    await page.goto("/app/bank");
    const money = page.getByTestId("nav-group-money");
    await expect(money).toHaveAttribute("aria-expanded", "true");
    await money.click();
    await expect(money).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("nav-link-transfer")).toBeHidden();

    await page.reload();
    await expect(money).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("nav-link-transfer")).toBeVisible();
  });
});
