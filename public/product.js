const pathSegments = window.location.pathname.split("/").filter(Boolean);
const productId = pathSegments[pathSegments.length - 1] || "sku-123";
const productState =
  new URLSearchParams(window.location.search).get("state") || "valid";

const productLayout = document.querySelector("[data-testid='product-layout']");
const productStateElement = document.querySelector(
  "[data-testid='product-state']",
);
const productIdElement = document.querySelector("[data-testid='product-id']");
const productTitle = document.querySelector("[data-testid='product-title']");
const productSummary = document.querySelector(
  "[data-testid='product-summary']",
);
const productNotes = document.querySelector("[data-testid='product-notes']");
const productPrice = document.querySelector("[data-testid='product-price']");
const productStatus = document.querySelector("[data-testid='product-status']");

function renderNotes(notes) {
  productNotes.innerHTML = notes
    .map((note) => {
      const label = typeof note === "string" ? "Signal" : note.label;
      const detail = typeof note === "string" ? note : note.detail;

      return `
        <article class="note-chip">
          <p class="note-chip__label">${label}</p>
          <p class="note-chip__text">${detail}</p>
        </article>
      `;
    })
    .join("");
}

async function loadProduct() {
  productIdElement.textContent = `ID: ${productId}`;

  const response = await fetch(
    `/api/product/${productId}?state=${productState}`,
  );
  const payload = await response.json();
  const product = payload.product;
  const numericPrice = Number(product.price);

  productLayout.classList.toggle(
    "product-layout--broken",
    Boolean(product.layout?.overlap),
  );
  productStateElement.textContent =
    payload.state === "broken" ? "Broken state" : "Valid state";
  productStateElement.classList.toggle(
    "status-pill--warning",
    payload.state === "broken",
  );
  productStateElement.classList.toggle(
    "status-pill--success",
    payload.state !== "broken",
  );

  productTitle.textContent = product.name;
  productSummary.textContent = String(product.subtitle);
  productStatus.textContent = product.status;
  productPrice.textContent = Number.isFinite(numericPrice)
    ? `$${numericPrice.toFixed(2)} ${product.currency}`
    : `${String(numericPrice)} ${product.currency}`;

  renderNotes(product.notes || []);
}

loadProduct().catch((error) => {
  productTitle.textContent = "Product load failed";
  productSummary.textContent = error.message;
  productStatus.textContent = "Unable to validate";
});
