import { expect, test } from "@playwright/test";

// Read-only catalog -> fully parallel-safe. The 48 parametrized detail tests
// give the suite enough volume that sharding + multiple workers pays off.
const PRODUCT_IDS = Array.from(
  { length: 48 },
  (_, i) => `sku-${String(i + 1).padStart(3, "0")}`,
);
const CATEGORIES = [
  "Compute",
  "Storage",
  "Network",
  "Security",
  "Observability",
  "Data",
];

test.describe("React Products catalog", () => {
  test("lists all 48 seeded products", async ({ page }) => {
    await page.goto("/app/products");
    await expect(page.getByTestId("products-grid")).toBeVisible();
    await expect(page.getByTestId("products-count")).toHaveText("48 products");
    await expect(page.getByTestId("products-grid").locator("li")).toHaveCount(
      48,
    );
  });

  for (const category of CATEGORIES) {
    test(`filters the catalog to ${category} (8 items)`, async ({ page }) => {
      await page.goto("/app/products");
      await page.getByTestId(`products-filter-${category}`).click();
      await expect(page.getByTestId("products-count")).toHaveText("8 products");
      await expect(page.getByTestId("products-grid").locator("li")).toHaveCount(
        8,
      );
    });
  }

  test("search shows the empty state for a no-match query", async ({
    page,
  }) => {
    await page.goto("/app/products");
    await page.getByTestId("products-search").fill("zzz-no-such-product");
    await expect(page.getByTestId("products-no-results")).toBeVisible();
  });

  test("sort toggles between name and price", async ({ page }) => {
    await page.goto("/app/products");
    await expect(page.getByTestId("products-sort")).toHaveText("Sort: name");
    await page.getByTestId("products-sort").click();
    await expect(page.getByTestId("products-sort")).toHaveText("Sort: price");
  });
});

test.describe("React Product detail (parametrized across the catalog)", () => {
  for (const id of PRODUCT_IDS) {
    test(`product ${id} detail loads with full metadata`, async ({ page }) => {
      await page.goto(`/app/products/${id}`);
      await expect(page.getByTestId("product-detail")).toBeVisible();
      await expect(page.getByTestId("product-sku")).toHaveText(id);
      await expect(page.getByTestId("product-category")).toBeVisible();
      await expect(page.getByTestId("product-detail-price")).toContainText("$");
      await expect(page.getByTestId("product-detail-status")).toBeVisible();
    });
  }
});
