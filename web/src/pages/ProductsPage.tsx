import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProducts } from "../api";

const CATEGORIES = [
  "All",
  "Compute",
  "Storage",
  "Network",
  "Security",
  "Observability",
  "Data",
] as const;

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
    <section data-testid="products-page">
      <h1 data-testid="app-heading">Products</h1>

      <div data-testid="products-controls">
        <input
          data-testid="products-search"
          type="search"
          aria-label="Search products"
          placeholder="Search products"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div
          data-testid="products-filters"
          role="group"
          aria-label="Filter by category"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              data-testid={`products-filter-${c}`}
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

      {isPending && <p data-testid="products-loading">Loading products…</p>}

      {isError && (
        <p data-testid="products-error" role="alert">
          {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <p data-testid="products-count">{visible.length} products</p>
          {visible.length === 0 ? (
            <p data-testid="products-no-results">No products match.</p>
          ) : (
            <ul data-testid="products-grid">
              {visible.map((p) => (
                <li key={p.id} data-testid={`product-card-${p.id}`}>
                  <Link
                    data-testid={`product-link-${p.id}`}
                    to={`/products/${p.id}`}
                  >
                    <span data-testid={`product-name-${p.id}`}>{p.name}</span>
                  </Link>
                  <span data-testid={`product-category-${p.id}`}>
                    {p.category}
                  </span>
                  <span data-testid={`product-price-${p.id}`}>${p.price}</span>
                  <span data-testid={`product-stock-${p.id}`}>
                    {p.stock} in stock
                  </span>
                  <span data-testid={`product-status-${p.id}`}>{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
