// One product's page: a breadcrumb back, then its icon and details.

// The router's link and the address's id, and the data cache.
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
// The product call, its icon and the status badge.
import { getProduct } from "../api";
import { ProductIcon } from "../components/ProductIcon";
import { Badge } from "../components/ui";

export function ProductDetailPage() {
  // The product's id from the address.
  const { id = "" } = useParams();

  // Ask for the product once there is an id.
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => getProduct(id),
    enabled: Boolean(id),
  });

  // The breadcrumb, then loading, an error, or the product.
  return (
    <section data-testid="product-detail-page" className="page">
      {/* Products / this SKU. */}
      <nav
        data-testid="product-breadcrumb"
        className="breadcrumb"
        aria-label="Breadcrumb"
      >
        <Link data-testid="product-back" to="/products">
          Products
        </Link>{" "}
        / <span className="mono">{id}</span>
      </nav>

      {/* Loading. */}
      {isPending && (
        <p data-testid="product-loading" className="state">
          Loading product…
        </p>
      )}

      {/* The error. */}
      {isError && (
        <p data-testid="product-error" role="alert" className="callout">
          {(error as Error).message}
        </p>
      )}

      {/* The product: its icon, then SKU, category, price, stock and
          status. */}
      {data && (
        <article data-testid="product-detail" className="detail">
          <div
            className={`product-art detail-art art-${data.product.category.toLowerCase()}`}
            aria-hidden="true"
          >
            <ProductIcon
              id={data.product.id}
              category={data.product.category}
            />
          </div>
          <div className="detail-info">
            <p className="eyebrow">Gear shop · {data.product.category}</p>
            <h1 data-testid="app-heading">{data.product.name}</h1>
            <p className="page-sub">
              A simulated product for testing practice. Prices are in fake
              dollars.
            </p>
            <dl className="spec-grid">
              <div className="spec">
                <dt>SKU</dt>
                <dd data-testid="product-sku" className="mono">
                  {data.product.id}
                </dd>
              </div>
              <div className="spec">
                <dt>Category</dt>
                <dd data-testid="product-category">{data.product.category}</dd>
              </div>
              <div className="spec spec-price">
                <dt>Price</dt>
                <dd data-testid="product-detail-price">
                  ${data.product.price}
                </dd>
              </div>
              <div className="spec">
                <dt>Stock</dt>
                <dd data-testid="product-stock">
                  {data.product.stock} in stock
                </dd>
              </div>
              <div className="spec">
                <dt>Status</dt>
                <dd data-testid="product-detail-status">
                  <Badge value={data.product.status} />
                </dd>
              </div>
            </dl>
          </div>
        </article>
      )}
    </section>
  );
}
