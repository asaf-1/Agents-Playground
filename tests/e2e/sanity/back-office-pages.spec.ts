// The back office's pages load and pass their page contracts: Orders, Users,
// and the sign-in status page with the back-office sign-in. (They replace the
// original demo site's Orders, Admin, Profile and Settings checks, removed on
// 2026-11-20.)

/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

// /app/orders: its heading, its contract, and the three orders.
test("Orders page loads and passes its page contract", async ({
  ordersPage,
}) => {
  expected("the heading visible, the page contract valid, 3 order rows");
  await ordersPage.goto("sanity-orders-page");
  await expect(ordersPage.heading, "the Orders heading").toBeVisible();
  await ordersPage.waitForOrdersLoaded(3);
  const validation = await ordersPage.expectLoaded();
  fact("contract", validation.valid);
});

// /app/users: its heading, its contract, and the seeded staff.
test("Users page loads and passes its page contract", async ({ usersPage }) => {
  expected(
    "the heading visible, the page contract valid, Alice Northwind's row shown",
  );
  await usersPage.goto("sanity-users-page");
  await expect(usersPage.heading, "the Users heading").toBeVisible();
  await usersPage.waitForUsersLoaded();
  const validation = await usersPage.expectLoaded();
  fact("contract", validation.valid);
  await expect(usersPage.row("USR-001"), "the seeded Admin").toContainText(
    "Alice Northwind",
  );
});

// /app/account: its contract, a guest in the back office, and the sign-in
// form with the demo staff listed.
test("Sign-in status page loads with the back-office sign-in", async ({
  accountPage,
  page,
}) => {
  expected(
    "the page contract valid; 'You are not signed in.'; the sign-in form and the three demo staff",
  );
  await accountPage.goto("sanity-account-page");
  await expect(accountPage.guest, "a guest by default").toHaveText(
    "You are not signed in.",
  );
  const validation = await accountPage.expectLoaded();
  fact("contract", validation.valid);
  await expect(accountPage.signInForm, "the sign-in form").toBeVisible();
  await expect(
    page.getByTestId("backoffice-demo-accounts"),
    "the demo staff, one per role",
  ).toContainText("alice@demo.local");
});
