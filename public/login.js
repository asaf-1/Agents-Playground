const loginForm = document.querySelector("[data-testid='login-form']");
const emailInput = document.querySelector("[data-testid='login-email']");
const passwordInput = document.querySelector("[data-testid='login-password']");
const submitBtn = document.querySelector("[data-testid='login-submit']");
const errorEl = document.querySelector("[data-testid='login-error']");
const statusEl = document.querySelector("[data-testid='login-status']");

function readCookie(name) {
  const match = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function getRunKey() {
  return (
    new URLSearchParams(window.location.search).get("runKey") ||
    readCookie("qa_runkey") ||
    "global"
  );
}

function getNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") ? next : "/dashboard";
}

// loginSubmitLabel drift: when armed for this runKey, the submit button is relabelled
// (e.g. "Authenticate"), so a stale "Sign In" locator goes stale -> the healer's job.
async function applyLabelDrift() {
  try {
    const response = await fetch(
      "/api/test/flags?runKey=" + encodeURIComponent(getRunKey()),
    );
    const data = await response.json();
    if (data.flags && typeof data.flags.loginSubmitLabel === "string") {
      submitBtn.textContent = data.flags.loginSubmitLabel;
    }
  } catch (error) {
    // leave the default label if the flag store is unreachable
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  statusEl.textContent = "";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.value,
        password: passwordInput.value,
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      statusEl.textContent = `Signed in as ${data.user.name}`;
      window.location.assign(getNext());
      return;
    }

    errorEl.textContent = data.message || "Login failed.";
  } catch (error) {
    errorEl.textContent = "Could not reach the sign-in service.";
  }
});

applyLabelDrift();
