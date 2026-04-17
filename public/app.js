const healthOutput = document.querySelector("[data-testid='health-output']");
const triageInput = document.querySelector("[data-testid='triage-input']");
const triageOutput = document.querySelector("[data-testid='triage-output']");

function wireNavigation() {
  document.querySelectorAll("[data-target]").forEach((element) => {
    element.addEventListener("click", () => {
      window.location.assign(element.dataset.target);
    });
  });

  document.querySelectorAll("[data-scroll]").forEach((element) => {
    element.addEventListener("click", () => {
      const target = document.querySelector(element.dataset.scroll);

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

async function checkHealth() {
  if (!healthOutput) {
    return;
  }

  healthOutput.textContent = "Checking local API...";

  try {
    const response = await fetch("/api/health");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Health check failed.");
    }

    healthOutput.innerHTML = `
      <strong>Status:</strong> ${payload.status}<br />
      <strong>Port:</strong> ${payload.port}<br />
      <strong>Service:</strong> ${payload.service}
    `;
  } catch (error) {
    healthOutput.textContent = error.message;
  }
}

function wireQuickTriage() {
  if (!triageInput || !triageOutput) {
    return;
  }

  const renderTriage = () => {
    const summary = triageInput.value.trim();

    triageOutput.innerHTML = summary
      ? `<strong>Captured triage:</strong> ${summary}`
      : "No triage summary captured yet.";
  };

  triageInput.addEventListener("input", renderTriage);
  renderTriage();
}

wireNavigation();
wireQuickTriage();

document.querySelector("[data-testid='check-health']")?.addEventListener("click", checkHealth);
