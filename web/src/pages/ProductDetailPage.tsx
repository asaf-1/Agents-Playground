import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProduct } from "../api";

export function ProductDetailPage() {
  const { id = "" } = useParams();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => getProduct(id),
    enabled: Boolean(id),
  });

  return (
    <section data-testid="product-detail-page">
      <nav data-testid="product-breadcrumb">
        <Link data-testid="product-back" to="/products">
          Products
        </Link>{" "}
        / {id}
      </nav>

      {isPending && <p data-testid="product-loading">Loading product…</p>}

      {isError && (
        <p data-testid="product-error" role="alert">
          {(error as Error).message}
        </p>
      )}

      {data && (
        <article data-testid="product-detail">
          <h1 data-testid="app-heading">{data.product.name}</h1>
          <dl>
            <dt>SKU</dt>
            <dd data-testid="product-sku">{data.product.id}</dd>
            <dt>Category</dt>
            <dd data-testid="product-category">{data.product.category}</dd>
            <dt>Price</dt>
            <dd data-testid="product-detail-price">${data.product.price}</dd>
            <dt>Stock</dt>
            <dd data-testid="product-stock">{data.product.stock} in stock</dd>
            <dt>Status</dt>
            <dd data-testid="product-detail-status">{data.product.status}</dd>
          </dl>
        </article>
      )}
    </section>
  );
}
