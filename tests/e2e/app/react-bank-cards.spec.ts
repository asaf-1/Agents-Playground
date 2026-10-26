import { expect, test } from "@playwright/test";
import {
  DEMO,
  balanceOf,
  moneyAccounts,
  signIn,
  signUpCustomer,
} from "./_bank";

// Cards in the browser (phase A3): get a card, read its details, set the
// daily limit, pay a merchant, see the decline reasons, freeze and unfreeze;
// and the bank's freeze from the staff page.

async function issueCard(
  request: Parameters<typeof signIn>[0],
  accountId: string,
) {
  const response = await request.post("/api/bank/cards", {
    data: { accountId },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).card as { id: string; limitCents: number };
}

test.describe("Cards (/app/bank/cards)", () => {
  test("get a card, see its details, set a limit, pay, get declined, freeze", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Card Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;

    await page.goto("/app/bank/cards");
    await expect(page.getByTestId("cards-page")).toBeVisible();
    await expect(page.getByTestId("cards-empty")).toBeVisible();
    await page.getByTestId(`card-get-${checking.id}`).click();

    const card = page.locator('[data-testid^="card-"][data-status]').first();
    await expect(card).toBeVisible();
    const id = (await card.getAttribute("data-testid"))!.replace("card-", "");
    await expect(page.getByTestId(`card-masked-${id}`)).toHaveText(
      /^•••• •••• •••• \d{4}$/,
    );
    await expect(page.getByTestId(`card-status-${id}`)).toHaveText("Active");

    // Details only on request.
    await page.getByTestId(`card-details-${id}`).click();
    await expect(page.getByTestId(`card-number-${id}`)).toHaveText(
      /^9\d{3} \d{4} \d{4} \d{4}$/,
    );
    await expect(page.getByTestId(`card-cvv-${id}`)).toHaveText(/^\d{3}$/);
    await page.getByTestId(`card-details-${id}`).click();
    await expect(page.getByTestId(`card-number-${id}`)).toHaveCount(0);

    // A limit of the customer's choosing.
    await page.getByTestId(`card-limit-input-${id}`).fill("500");
    await page.getByTestId(`card-limit-save-${id}`).click();
    await expect(page.getByTestId(`card-limit-${id}`)).toContainText(
      "Daily limit $500.00",
    );

    // Pay within it.
    await page.getByTestId(`spend-merchant-${id}`).selectOption("Cloud Coffee");
    await page.getByTestId(`spend-amount-${id}`).fill("120.50");
    await page.getByTestId(`spend-submit-${id}`).click();
    await expect(page.getByTestId(`spend-result-${id}`)).toHaveText(
      "Approved: $120.50 at Cloud Coffee.",
    );
    await expect(page.getByTestId(`card-spent-${id}`)).toHaveText("$120.50");
    await expect(page.getByTestId(`charges-${id}`)).toContainText(
      "Cloud Coffee",
    );
    expect(await balanceOf(page.request, checking.id)).toBe(
      checking.balanceCents - 12_050,
    );

    // Past the day's limit.
    await page.getByTestId(`spend-amount-${id}`).fill("400");
    await page.getByTestId(`spend-submit-${id}`).click();
    await expect(page.getByTestId(`spend-result-${id}`)).toContainText(
      "Declined: This would take today's spending past the card's daily limit.",
    );
    await expect(page.getByTestId(`card-spent-${id}`)).toHaveText("$120.50");

    // Frozen.
    await page.getByTestId(`card-freeze-${id}`).click();
    await expect(page.getByTestId(`card-status-${id}`)).toHaveText("Frozen");
    await page.getByTestId(`spend-amount-${id}`).fill("5");
    await page.getByTestId(`spend-submit-${id}`).click();
    await expect(page.getByTestId(`spend-result-${id}`)).toContainText(
      "Declined: The card is frozen.",
    );
    await page.getByTestId(`card-freeze-${id}`).click();
    await expect(page.getByTestId(`card-status-${id}`)).toHaveText("Active");

    // The purchase is in the account's history too.
    await page.goto(`/app/bank/accounts/${checking.id}`);
    await expect(page.getByTestId("account-page")).toContainText(
      "Card purchase",
    );
  });

  test("an Admin freezes a card from the customer's profile, and the customer cannot undo it", async ({
    page,
    request,
    browser,
  }) => {
    const customer = await signUpCustomer(request, "Frozen Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const card = await issueCard(request, checking.id);

    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/users");
    await page.getByTestId("admin-search").fill(customer.email);
    await page.getByTestId(`admin-actions-${customer.id}`).click();
    await page.getByTestId(`admin-view-${customer.id}`).click();
    const dialog = page.getByTestId("bank-user-dialog");
    await expect(
      dialog.getByTestId(`bank-user-card-status-${card.id}`),
    ).toHaveText("Active");
    await dialog.getByTestId(`bank-user-card-freeze-${card.id}`).click();
    await expect(
      dialog.getByTestId(`bank-user-card-status-${card.id}`),
    ).toHaveText("Frozen by the bank");

    // The customer's view.
    const theirs = await browser.newContext();
    const theirPage = await theirs.newPage();
    await signIn(theirPage.request, customer.email, "practice123");
    await theirPage.goto("/app/bank/cards");
    await expect(theirPage.getByTestId(`card-status-${card.id}`)).toHaveText(
      "Frozen by the bank",
    );
    await expect(
      theirPage.getByTestId(`card-freeze-${card.id}`),
    ).toBeDisabled();
    await expect(
      theirPage.getByTestId(`card-bank-frozen-${card.id}`),
    ).toBeVisible();
    await theirs.close();

    // And the bank lets go.
    await dialog.getByTestId(`bank-user-card-freeze-${card.id}`).click();
    await expect(
      dialog.getByTestId(`bank-user-card-status-${card.id}`),
    ).toHaveText("Active");
  });

  test("Support sees cards read-only; a demo customer and a visitor see the notes", async ({
    page,
    request,
  }) => {
    const customer = await signUpCustomer(request, "Viewed Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const card = await issueCard(request, checking.id);

    await signIn(page.request, DEMO.support);
    await page.goto("/app/admin/users");
    await page.getByTestId("admin-search").fill(customer.email);
    await page.getByTestId(`admin-actions-${customer.id}`).click();
    await page.getByTestId(`admin-view-${customer.id}`).click();
    const dialog = page.getByTestId("bank-user-dialog");
    await expect(dialog.getByTestId(`bank-user-card-${card.id}`)).toBeVisible();
    await expect(
      dialog.getByTestId(`bank-user-card-freeze-${card.id}`),
    ).toHaveCount(0);
    await dialog.getByTestId("bank-user-close").click();

    await signIn(page.request, DEMO.customer);
    await page.goto("/app/bank/cards");
    await expect(page.getByTestId("cards-demo-note")).toBeVisible();
    await expect(page.getByTestId("cards-issue")).toHaveCount(0);

    await page.request.post("/api/bank/logout", { data: {} });
    await page.goto("/app/bank/cards");
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
    await page.goto("/app");
    await page.getByTestId("nav-link-cards").click();
    await expect(page).toHaveURL(/\/app\/bank\/cards$/);
  });
});
