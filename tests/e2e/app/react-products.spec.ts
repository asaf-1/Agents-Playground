// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

// Read-only catalog -> fully parallel-safe. The 48 parametrized detail tests
// give the suite enough volume that sharding + multiple workers pays off.

// sku-001 to sku-048.
const PRODUCT_IDS = Array.from(
  { length: 48 },
  (_, i) => `sku-${String(i + 1).padStart(3, "0")}`,
);
// The six categories, eight products each.
const CATEGORIES = [
  "Compute",
  "Storage",
  "Network",
  "Security",
  "Observability",
  "Data",
];

test.describe("React Products catalog", () => {
  // All 48 products are listed.
  test("lists all 48 seeded products", async ({ page }) => {
    expected("'48 products' and 48 items in the grid");
    await page.goto("/app/products");
    await expect(page.getByTestId("products-grid")).toBeVisible();
    await expect(page.getByTestId("products-count")).toHaveText("48 products");
    await expect(page.getByTestId("products-grid").locator("li")).toHaveCount(
      48,
    );
  });

  // One test per category: the filter leaves its 8 products.
  for (const category of CATEGORIES) {
    test(`filters the catalog to ${category} (8 items)`, async ({ page }) => {
      expected(`'8 products' and 8 items after filtering to ${category}`);
      fact("category", category);
      await page.goto("/app/products");
      await page.getByTestId(`products-filter-${category}`).click();
      await expect(page.getByTestId("products-count")).toHaveText("8 products");
      await expect(page.getByTestId("products-grid").locator("li")).toHaveCount(
        8,
      );
    });
  }

  // A search with no match shows the empty state.
  test("search shows the empty state for a no-match query", async ({
    page,
  }) => {
    expected("searching 'zzz-no-such-product' shows products-no-results");
    await page.goto("/app/products");
    await page.getByTestId("products-search").fill("zzz-no-such-product");
    await expect(page.getByTestId("products-no-results")).toBeVisible();
  });

  // The sort button switches from name to price.
  test("sort toggles between name and price", async ({ page }) => {
    expected("'Sort: name', then 'Sort: price' after a click");
    await page.goto("/app/products");
    await expect(page.getByTestId("products-sort")).toHaveText("Sort: name");
    await page.getByTestId("products-sort").click();
    await expect(page.getByTestId("products-sort")).toHaveText("Sort: price");
  });
});

test.describe("React Product detail (parametrized across the catalog)", () => {
  // One test per product: its detail page shows the SKU, category, price and status.
  for (const id of PRODUCT_IDS) {
    test(`product ${id} detail loads with full metadata`, async ({ page }) => {
      expected(
        `the detail for ${id}: its SKU, a category, a $ price and a status`,
      );
      fact("sku", id);
      await page.goto(`/app/products/${id}`);
      await expect(page.getByTestId("product-detail")).toBeVisible();
      await expect(page.getByTestId("product-sku")).toHaveText(id);
      await expect(page.getByTestId("product-category")).toBeVisible();
      await expect(page.getByTestId("product-detail-price")).toContainText("$");
      await expect(page.getByTestId("product-detail-status")).toBeVisible();
    });
  }
});
