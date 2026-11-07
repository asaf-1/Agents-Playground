// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people, sign in, sign up.
import { DEMO, signIn, signUpCustomer } from "../../../framework/helpers/bank";

// The Developer page (phase A5): make a key, see the token once, use it, and
// revoke it.

test.describe("API keys (/app/developer)", () => {
  // On the Developer page a key is made, its token shown once and usable
  // anywhere, listed only by prefix, and then revoked.
  test("make a key, see it once, use it, revoke it", async ({
    page,
    browser,
  }) => {
    expected(
      "a pbk_ token shown with an example; it opens /me (200); the row shows the name, prefix and Read only, never the token; revoked, then /me 401",
    );
    // A new customer on an empty Developer page.
    await signUpCustomer(page.request, "Developer Customer");
    await page.goto("/app/developer");
    await expect(page.getByTestId("developer-page")).toBeVisible();
    await expect(page.getByTestId("keys-empty")).toBeVisible();
    await expect(page.getByTestId("keys-rate-limit")).toHaveText(/^\d+$/);

    // Make a read-only key called "Postman on my laptop".
    await page.getByTestId("key-name").fill("Postman on my laptop");
    await page.getByTestId("key-scope").selectOption("read");
    await page.getByTestId("key-create").click();

    // The token is shown once, with an example of using it. It is never printed.
    const token = (await page.getByTestId("key-token").textContent())!.trim();
    expect(token).toMatch(/^pbk_[A-Za-z0-9_-]{32}$/);
    await expect(page.getByTestId("key-example")).toContainText(
      `Bearer ${token}`,
    );

    // The key works from anywhere.
    const api = await browser.newContext();
    expect(
      (
        await api.request.get("/api/bank/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status(),
    ).toBe(200);

    // The list knows it by prefix, not by token.
    const row = page.locator('[data-testid^="key-row-"]').first();
    await expect(row).toContainText("Postman on my laptop");
    await expect(row).toContainText(`${token.slice(0, 12)}…`);
    await expect(row).toContainText("Read only");
    await expect(page.getByTestId("keys-list")).not.toContainText(token);
    const id = (await row.getAttribute("data-testid"))!.replace("key-row-", "");
    fact("keyId", id);

    // Close the token panel: the token is gone from the page.
    await page.getByTestId("key-token-done").click();
    await expect(page.getByTestId("key-token")).toHaveCount(0);

    // Revoke it: the row says so, and the key no longer works.
    await page.getByTestId(`key-revoke-${id}`).click();
    await expect(page.getByTestId(`key-status-${id}`)).toHaveText("Revoked");
    await expect(page.getByTestId(`key-revoke-${id}`)).toHaveCount(0);
    expect(
      (
        await api.request.get("/api/bank/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status(),
    ).toBe(401);
    await api.close();
  });

  // The demo customer sees a note instead of the form; a signed-out visitor
  // reaches the page from the sidebar and is asked to sign in.
  test("a demo customer and a visitor see the notes, and the sidebar links here", async ({
    page,
  }) => {
    expected(
      "demo: the note, no key form; signed out: the sidebar link opens /app/developer with the sign-in prompt",
    );
    // As the demo customer.
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/developer");
    await expect(page.getByTestId("keys-demo-note")).toBeVisible();
    await expect(page.getByTestId("key-form")).toHaveCount(0);

    // Signed out, through the sidebar.
    await page.request.post("/api/bank/logout", { data: {} });
    await page.goto("/app");
    await page.getByTestId("nav-link-developer").click();
    await expect(page).toHaveURL(/\/app\/developer$/);
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
  });
});
