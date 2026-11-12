// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Playwright's page type, for the helper below.
import type { Page } from "@playwright/test";
// The bank helpers: the demo people and signing in.
import { DEMO, signIn } from "../../../framework/helpers/bank";

// Playground Bank on a phone: the ☰ menu and tables shown as cards, at an
// iPhone's 390 x 844. The rest of the suite runs at 1440 px, where none of
// this shows.
//
// Safe in the fully parallel suite: nothing here changes data. The tests sign
// in as the read-only demo customer and admin, or not at all.

// The phone screen every test here uses, unless it sets its own.
const PHONE = { width: 390, height: 844 };

// Every customer page. A new page belongs here too, so it is checked on a
// phone the day it is added.
const CUSTOMER_ROUTES = [
  "/app",
  "/app/bank",
  "/app/bank/transfer",
  "/app/bank/bills",
  "/app/bank/cards",
  "/app/bank/loans",
  "/app/bank/requests",
  "/app/markets",
  "/app/markets/BTC",
  "/app/portfolio",
  "/app/wallet",
  "/app/practice",
  "/app/notifications",
  "/app/support",
  "/app/graphql",
  "/app/developer",
  "/app/orders",
  "/app/users",
  "/app/products",
  "/app/products/sku-021",
  "/app/account",
  "/app/shop/cart",
  "/app/shop/orders",
  "/app/profile",
  "/app/profile/edit",
  "/app/settings",
  "/app/devices",
  "/app/about",
];

// The back-office pages only staff can open.
const ADMIN_ROUTES = [
  "/app/admin/users",
  "/app/admin/loans",
  "/app/admin/support",
  "/app/admin/shop-orders",
  "/app/admin/audit",
  "/app/admin/books",
];

// Opens each page and returns the ones wider than the screen, with their
// width. It waits for the page's data first: a table that loads late is what
// would push a page wide. Markets and the ticker ask again every 5 seconds,
// which leaves the half-second quiet that "networkidle" needs.
async function widePages(page: Page, routes: string[]): Promise<string[]> {
  const wide: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.getByTestId("practice-banner"), route).toBeVisible();
    await page.waitForLoadState("networkidle");
    // The page's full width against the screen's.
    const { scroll, screen } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      screen: window.innerWidth,
    }));
    if (scroll > screen) wide.push(`${route} ${scroll}px`);
  }
  return wide;
}

test.describe("Playground Bank on a phone (390 px)", () => {
  test.use({ viewport: PHONE });

  // The menu is shut at first; ☰ opens it with its groups; picking a page
  // goes there and shuts it. Nothing is refused by the security policy.
  test("the ☰ button opens the menu, and a pick goes there and shuts it", async ({
    page,
  }) => {
    expected(
      "☰ on the left of the bar, the logo on the right; menu hidden, ☰ 'Open menu' not expanded; open: menu visible, 'Close menu', expanded; Markets opens /app/markets and the menu shuts; no CSP refusals",
    );
    // Collect any console message that is a security-policy refusal.
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) {
        violations.push(`${page.url()}: ${message.text()}`);
      }
    });

    // Shut: the menu is hidden and the button says it opens it.
    await page.goto("/app");
    const toggle = page.getByTestId("nav-toggle");
    const nav = page.getByTestId("app-nav");
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAccessibleName("Open menu");

    // The bar: ☰ on the left, on the side the panel slides in from, and the
    // logo on the right.
    const toggleBox = await toggle.boundingBox();
    const brandBox = await page.getByTestId("nav-brand").boundingBox();
    fact("☰ left edge", toggleBox ? Math.round(toggleBox.x) : null);
    fact("logo left edge", brandBox ? Math.round(brandBox.x) : null);
    expect(toggleBox).not.toBeNull();
    expect(brandBox).not.toBeNull();
    expect(toggleBox!.x).toBeLessThan(PHONE.width / 2);
    expect(brandBox!.x).toBeGreaterThan(PHONE.width / 2);

    // Open: the menu and its group titles show, and the button now shuts it.
    await toggle.click();
    await expect(nav).toBeVisible();
    await expect(nav.getByText("Exchange", { exact: true })).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAccessibleName("Close menu");

    // A pick: the page opens and the menu shuts.
    await page.getByTestId("nav-link-markets").click();
    await expect(page).toHaveURL(/\/app\/markets$/);
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    fact("violations", violations);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // While open the page behind doesn't scroll; Escape shuts it and puts focus
  // back on ☰; a tap on the dark layer shuts it too.
  test("Escape and a tap beside the menu shut it", async ({ page }) => {
    expected(
      "open: html.menu-open; Escape: menu hidden, focus on ☰, no menu-open; open again, tap the backdrop: menu hidden",
    );
    await page.goto("/app");
    const toggle = page.getByTestId("nav-toggle");
    const nav = page.getByTestId("app-nav");

    // Open: the page behind is held still.
    await toggle.click();
    await expect(nav).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/menu-open/);

    // Escape shuts it, and focus is back on the button.
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(page.locator("html")).not.toHaveClass(/menu-open/);

    // A tap on the dark layer, right of the 300 px panel, shuts it too.
    await toggle.click();
    await expect(nav).toBeVisible();
    await page
      .getByTestId("nav-backdrop")
      .click({ position: { x: 350, y: 600 } });
    await expect(nav).toBeHidden();
  });

  // An admin's menu carries the back-office links.
  test("an admin's phone menu shows the staff links", async ({ page }) => {
    expected("as the demo admin: Bank users, Audit log and Books in the menu");
    await signIn(page.request, DEMO.admin);
    await page.goto("/app");
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-link-bank-users")).toBeVisible();
    await expect(page.getByTestId("nav-link-audit")).toBeVisible();
    await expect(page.getByTestId("nav-link-books")).toBeVisible();
  });

  // No customer page is wider than the phone, so nothing scrolls sideways.
  test("no customer page is wider than the screen", async ({ page }) => {
    expected(`all ${CUSTOMER_ROUTES.length} customer pages fit in 390 px`);
    await signIn(page.request, DEMO.customer);
    fact("pages", CUSTOMER_ROUTES.length);
    const wide = await widePages(page, CUSTOMER_ROUTES);
    fact("wider than the screen", wide);
    expect(wide, wide.join("\n")).toEqual([]);
  });

  // The same for the back office, as the demo admin.
  test("no back-office page is wider than the screen", async ({ page }) => {
    expected(`all ${ADMIN_ROUTES.length} back-office pages fit in 390 px`);
    await signIn(page.request, DEMO.admin);
    fact("pages", ADMIN_ROUTES.length);
    const wide = await widePages(page, ADMIN_ROUTES);
    fact("wider than the screen", wide);
    expect(wide, wide.join("\n")).toEqual([]);
  });

  // A table row is a card: each cell shows its column's name, and the row's
  // ⋯ button sits inside the screen.
  test("a table row shows its column names and its actions on screen", async ({
    page,
  }) => {
    expected(
      "on Bank users, Maya's email cell is labelled 'Email' and shows it; her ⋯ button ends inside 390 px",
    );
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/users");
    // Maya's row, found by her email.
    const row = page
      .getByTestId("admin-users-table")
      .locator("tbody tr", { hasText: DEMO.customer });
    const emailCell = row.locator("td", { hasText: DEMO.customer });

    // The cell carries the name, and the phone CSS draws it in front.
    await expect(emailCell).toHaveAttribute("data-label", "Email");
    const shown = await emailCell.evaluate(
      (cell) => getComputedStyle(cell, "::before").content,
    );
    fact("label shown", shown);
    expect(shown).toBe('"Email"');

    // The ⋯ button is inside the screen, not off to the right.
    const box = await row
      .getByRole("button", { name: /Actions for/ })
      .boundingBox();
    fact("⋯ right edge", box ? Math.round(box.x + box.width) : null);
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  });
});

test.describe("Playground Bank on a wide screen", () => {
  // At the suite's 1440 px the menu is the side menu as before, the ☰ button
  // is hidden, and a table shows no column names in its cells.
  test("keeps the side menu and normal tables", async ({ page }) => {
    expected(
      "at 1440 px: menu visible, ☰ hidden, Bank users' email cell draws no label",
    );
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/users");
    await expect(page.getByTestId("app-nav")).toBeVisible();
    await expect(page.getByTestId("nav-toggle")).toBeHidden();
    const emailCell = page
      .getByTestId("admin-users-table")
      .locator("td", { hasText: DEMO.customer });
    const shown = await emailCell.evaluate(
      (cell) => getComputedStyle(cell, "::before").content,
    );
    fact("label shown", shown);
    expect(shown).toBe("none");
  });
});
