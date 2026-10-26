import { expect, test } from "@playwright/test";
import { DEMO, signIn, signUpCustomer } from "./_bank";

// The Developer page (phase A5): make a key, see the token once, use it, and
// revoke it.

test.describe("API keys (/app/developer)", () => {
  test("make a key, see it once, use it, revoke it", async ({
    page,
    browser,
  }) => {
    await signUpCustomer(page.request, "Developer Customer");
    await page.goto("/app/developer");
    await expect(page.getByTestId("developer-page")).toBeVisible();
    await expect(page.getByTestId("keys-empty")).toBeVisible();
    await expect(page.getByTestId("keys-rate-limit")).toHaveText(/^\d+$/);

    await page.getByTestId("key-name").fill("Postman on my laptop");
    await page.getByTestId("key-scope").selectOption("read");
    await page.getByTestId("key-create").click();

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

    await page.getByTestId("key-token-done").click();
    await expect(page.getByTestId("key-token")).toHaveCount(0);

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

  test("a demo customer and a visitor see the notes, and the sidebar links here", async ({
    page,
  }) => {
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/developer");
    await expect(page.getByTestId("keys-demo-note")).toBeVisible();
    await expect(page.getByTestId("key-form")).toHaveCount(0);

    await page.request.post("/api/bank/logout", { data: {} });
    await page.goto("/app");
    await page.getByTestId("nav-link-developer").click();
    await expect(page).toHaveURL(/\/app\/developer$/);
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
  });
});
