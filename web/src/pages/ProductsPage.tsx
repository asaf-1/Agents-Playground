import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProducts } from "../api";
import { ProductIcon } from "../components/ProductIcon";
import { Badge, PageHeader } from "../components/ui";

const CATEGORIES = [
  "All",
  "Compute",
  "Storage",
  "Network",
  "Security",
  "Observability",
  "Data",
] as const;

// Each card is one <li> with no list inside it: the catalog tests count every
// <li> in the grid.
export function ProductsPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"name" | "price">("name");

  const products = data?.products ?? [];
  const visible = useMemo(() => {
    let list = products;
    if (category !== "All") {
      list = list.filter((p) => p.category === category);
    }
    if (search) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      );
    }
    return [...list].sort((a, b) =>
      sortBy === "name" ? a.name.localeCompare(b.name) : a.price - b.price,
    );
  }, [products, category, search, sortBy]);

  return (
    <section data-testid="products-page" className="page">
      <PageHeader
        eyebrow="Gear shop"
        title="Products"
        description={
          <p className="page-sub">
            Hardware wallets, mining rigs, node boxes and more. Fake money only.
          </p>
        }
      />

      <div data-testid="products-controls" className="shop-toolbar">
        <input
          data-testid="products-search"
          className="input input-search"
          type="search"
          aria-label="Search products"
          placeholder="Search products"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div
          data-testid="products-filters"
          className="chips"
          role="group"
          aria-label="Filter by category"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              data-testid={`products-filter-${c}`}
              className="chip-btn"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          data-testid="products-sort"
          onClick={() => setSortBy((s) => (s === "name" ? "price" : "name"))}
        >
          Sort: {sortBy}
        </button>
      </div>

      {isPending && (
        <p data-testid="products-loading" className="state">
          Loading products…
        </p>
      )}

      {isError && (
        <p data-testid="products-error" role="alert" className="callout">
          {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <p data-testid="products-count" className="result-count">
            {visible.length} products
          </p>
          {visible.length === 0 ? (
            <p data-testid="products-no-results" className="empty">
              No products match.
            </p>
          ) : (
            <ul data-testid="products-grid" className="product-grid">
              {visible.map((p) => (
                <li
                  key={p.id}
                  data-testid={`product-card-${p.id}`}
                  className="product-card"
                >
                  <div
                    className={`product-art art-${p.category.toLowerCase()}`}
                    aria-hidden="true"
                  >
                    <ProductIcon id={p.id} category={p.category} />
                  </div>
                  <div className="product-body">
                    <span
                      data-testid={`product-category-${p.id}`}
                      className="product-cat"
                    >
                      {p.category}
                    </span>
                    <Link
                      data-testid={`product-link-${p.id}`}
                      className="product-title"
                      to={`/products/${p.id}`}
                    >
                      <span data-testid={`product-name-${p.id}`}>{p.name}</span>
                    </Link>
                    <span
                      data-testid={`product-stock-${p.id}`}
                      className={p.stock < 10 ? "stock low" : "stock"}
                    >
                      {p.stock} in stock
                    </span>
                    <div className="product-meta">
                      <span
                        data-testid={`product-price-${p.id}`}
                        className="price"
                      >
                        ${p.price}
                      </span>
                      <span data-testid={`product-status-${p.id}`}>
                        <Badge value={p.status} />
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
