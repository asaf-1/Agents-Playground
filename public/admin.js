// Admin audit log — now fetch-driven from GET /api/admin/audit (was an inline seeded array).
// Refresh Log re-fetches; Clear Log empties client-side (count -> 0), exactly as before.
// The audit endpoint is RBAC/auth gated (flags rbacEnforce / adminGate / authRequired):
// a 401/403 renders a role-gate message instead of entries, lighting permissions-or-rbac.
const logEl = document.getElementById("admin-log");
const countEl = document.getElementById("admin-action-count");
const gateEl = document.querySelector("[data-testid='admin-role-gate-message']");
const roleEl = document.querySelector("[data-testid='admin-current-role']");
const refreshBtn = document.getElementById("refresh-admin-log-btn");
const clearBtn = document.getElementById("clear-admin-log-btn");

let entries = [];
// Generation token: a Clear (or newer load) bumps it so a late audit fetch can't repopulate
// the log after the user cleared it.
let loadToken = 0;

function readCookie(name) {
  const match = document.cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function getRunKey() {
  return new URLSearchParams(window.location.search).get("runKey") || readCookie("qa_runkey") || "global";
}

function render() {
  countEl.textContent = String(entries.length);
  logEl.innerHTML = entries.length
    ? entries
        .map(
          (e) =>
            `<div class="admin-log-entry" data-testid="admin-log-entry"><strong>${e.actor}</strong> &middot; ${e.action} <span style="color:#6b7280;">(${e.ts})</span></div>`
        )
        .join("")
    : '<div class="admin-log-entry">No entries.</div>';
}

async function loadAudit() {
  const myToken = ++loadToken;
  try {
    const response = await fetch("/api/admin/audit?runKey=" + encodeURIComponent(getRunKey()));
    if (myToken !== loadToken) {
      return;
    }
    if (response.status === 401) {
      gateEl.textContent = "Login required to view the audit log.";
      roleEl.textContent = "";
      entries = [];
      render();
      return;
    }
    if (response.status === 403) {
      const data = await response.json().catch(() => ({}));
      gateEl.textContent = `Admin role required to view the audit log (you are ${data.actualRole || "not signed in"}).`;
      roleEl.textContent = "";
      entries = [];
      render();
      return;
    }
    const data = await response.json();
    if (myToken !== loadToken) {
      return;
    }
    gateEl.textContent = "";
    roleEl.textContent = `Role: ${data.role || "anonymous"}`;
    entries = data.entries || [];
    render();
  } catch (error) {
    if (myToken !== loadToken) {
      return;
    }
    gateEl.textContent = "Could not reach the audit service.";
    entries = [];
    render();
  }
}

refreshBtn.addEventListener("click", loadAudit);
clearBtn.addEventListener("click", () => {
  loadToken += 1;
  entries = [];
  render();
});

loadAudit();
