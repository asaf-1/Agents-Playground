const ordersMode = document.querySelector("[data-testid='orders-mode']");
const ordersDelay = document.querySelector("[data-testid='orders-delay']");
const ordersStatus = document.querySelector("[data-testid='orders-status']");
const ordersSpinner = document.querySelector("[data-testid='orders-spinner']");
const ordersError = document.querySelector("[data-testid='orders-error']");
const ordersTableBody = document.querySelector("[data-testid='orders-tbody']");
const refreshOrdersButton = document.querySelector(
  "[data-testid='refresh-orders']",
);

const searchParams = new URLSearchParams(window.location.search);
const currentMode = searchParams.get("mode") || "stable";
const currentDelay =
  searchParams.get("delayMs") || (currentMode === "slow" ? "7000" : "0");
const flakyRunKey =
  currentMode === "flaky"
    ? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    : "";

ordersMode.textContent = `Mode: ${currentMode}`;
ordersDelay.textContent = `Delay: ${currentDelay}ms`;

document.querySelectorAll("[data-target]").forEach((element) => {
  element.addEventListener("click", () => {
    window.location.assign(element.dataset.target);
  });
});

function setLoadingState(isLoading) {
  if (!ordersSpinner) {
    return;
  }

  ordersSpinner.hidden = !isLoading;
}

function renderOrders(orders) {
  ordersTableBody.innerHTML = orders
    .map(
      (order) => `
        <tr data-testid="orders-row">
          <td>${order.id}</td>
          <td>${order.customer}</td>
          <td>${order.status}</td>
          <td>${order.region}</td>
          <td>${order.total}</td>
        </tr>
      `,
    )
    .join("");
}

async function loadOrders(triggerLabel = "initial") {
  setLoadingState(true);
  ordersError.hidden = true;
  ordersStatus.textContent = `Loading orders (${triggerLabel})...`;

  try {
    const requestParams = new URLSearchParams({
      mode: currentMode,
      delayMs: currentDelay,
    });

    if (flakyRunKey) {
      requestParams.set("runKey", flakyRunKey);
    }

    const response = await fetch(`/api/orders?${requestParams.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      const error = new Error(payload.message || "Failed to load orders.");
      error.payload = payload;
      throw error;
    }

    renderOrders(payload.orders);
    ordersStatus.textContent = `Loaded ${payload.orders.length} orders in ${payload.mode} mode on attempt ${payload.attempt}.`;
  } catch (error) {
    ordersError.hidden = false;
    ordersError.innerHTML = `
      <p><strong>Request failed:</strong> ${error.message}</p>
      <p>This state is intentional so the recovery agent has a real branch to inspect.</p>
    `;

    if (!ordersTableBody.querySelector("[data-testid='orders-row']")) {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="5">Orders are not available yet.</td>
        </tr>
      `;
    }

    ordersStatus.textContent = "Orders request failed. Waiting for recovery.";
  } finally {
    setLoadingState(false);
  }
}

refreshOrdersButton.addEventListener("click", () => {
  loadOrders("manual-refresh");
});

loadOrders();
