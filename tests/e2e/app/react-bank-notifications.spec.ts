// Reads the schema and the web app's kind list from disk, for the guard below.
import { readFileSync } from "node:fs";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: accounts and sign up.
import { moneyAccounts, signUpCustomer } from "../../../framework/helpers/bank";

// Every notification shows in the bell and on the Notifications page. Six
// kinds once had no icon (card_declined, scheduled_paid, scheduled_failed,
// order_filled, order_failed, price_alert), and one of them was enough to
// blank the whole page with React error #130. Found 2026-11-12; this spec keeps
// it fixed.

test.describe("Notifications for every kind", () => {
  // The crash, as a customer met it: a declined card purchase.
  test("a declined card purchase shows in the bell and on the page", async ({
    page,
  }) => {
    expected(
      "a frozen card's purchase is declined; /app/notifications shows 'declined at Night Kiosk' with the page around it; the bell lists it; no page error",
    );
    // Any error thrown in the page fails the test.
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // A customer, a card, frozen, then a purchase it refuses.
    await signUpCustomer(page.request, "Declined Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    const made = await page.request.post("/api/bank/cards", {
      data: { accountId: checking.id },
    });
    const card = (await made.json()).card as { id: string };
    await page.request.patch(`/api/bank/cards/${card.id}`, {
      data: { status: "frozen" },
    });
    const charged = await page.request.post(
      `/api/bank/cards/${card.id}/charges`,
      { data: { merchant: "Night Kiosk", amountCents: 1_500 } },
    );
    const { charge } = await charged.json();
    fact("charge", charge.status);
    expect(charge.status).toBe("declined");

    // The page, with its heading and the notification.
    await page.goto("/app/notifications");
    await expect(page.getByTestId("app-heading")).toBeVisible();
    await expect(page.getByText(/declined at Night Kiosk/)).toBeVisible();

    // The bell.
    await page.getByTestId("notif-bell").click();
    await expect(page.getByTestId("notif-menu")).toContainText(
      "declined at Night Kiosk",
    );
    fact("page errors", errors);
    expect(errors).toEqual([]);
  });

  // The cause, guarded: the web app knows every kind the database allows.
  test("every notification kind the database allows has an icon in the app", async () => {
    expected(
      "the kinds in bank/schema.sql's bank_notifications_kind_check are exactly the NotificationKind list in web/src/bankApi.ts",
    );
    // The database's list, from the generated schema.
    const schema = readFileSync("bank/schema.sql", "utf8");
    const check = schema.match(
      /bank_notifications_kind_check CHECK \(\(kind = ANY \(ARRAY\[(.*?)\]\)\)\)/,
    );
    expect(check, "the kind check in bank/schema.sql").not.toBeNull();
    const database = [...check![1].matchAll(/'([a-z_]+)'::text/g)]
      .map((found) => found[1])
      .sort();

    // The web app's list, which KIND_ICONS must cover (the type check
    // enforces that part).
    const api = readFileSync("web/src/bankApi.ts", "utf8");
    const union = api.match(/export type NotificationKind =([\s\S]*?);/);
    expect(union, "NotificationKind in web/src/bankApi.ts").not.toBeNull();
    const web = [...union![1].matchAll(/"([a-z_]+)"/g)]
      .map((found) => found[1])
      .sort();

    fact("database kinds", database.length);
    fact("web kinds", web.length);
    expect(web).toEqual(database);
  });
});
