// Shared auth guard for protected pages (/profile, /settings, /user-manager; /admin in Phase 3).
// Default behavior is a NO-OP: with authRequired off (the default), GET /api/session returns
// 200 { authenticated:false } and the guard simply fills the banner. It only redirects to
// /login when the resolved authRequired flag is armed for this runKey and there is no valid
// session — which is exactly what lights the auth-or-session category in scenarios.
(function () {
  function readCookie(name) {
    const match = document.cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith(name + "="));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  }

  const runKey = new URLSearchParams(window.location.search).get("runKey") || readCookie("qa_runkey") || "global";
  const banner = document.querySelector("[data-testid='session-banner']");
  const logoutBtn = document.querySelector("[data-testid='logout-btn']");

  function toLogin() {
    window.location.assign("/login?next=" + encodeURIComponent(window.location.pathname + window.location.search));
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/logout", { method: "POST" });
      } catch (error) {
        // ignore network error; still send the user to /login
      }
      toLogin();
    });
  }

  fetch("/api/session?runKey=" + encodeURIComponent(runKey))
    .then((response) => response.json().then((data) => ({ status: response.status, data })))
    .then(({ status, data }) => {
      if (status === 401 || (data && data.authRequired && !data.authenticated)) {
        toLogin();
        return;
      }
      if (banner) {
        banner.textContent = data && data.authenticated
          ? `Signed in as ${data.user.name} (${data.role})`
          : "Not signed in";
      }
    })
    .catch(() => {
      // leave the page as-is if the session endpoint is unreachable
    });
})();
