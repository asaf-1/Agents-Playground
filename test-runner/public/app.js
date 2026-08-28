// Test Runner front end. No framework, no build step, no dependencies — this
// app has to start with a bare `node server.js` from its own folder on any box
// with Node 20, so the browser side stays plain DOM too.
//
// Three rules hold the code together:
//
//   1. Every string that came from the server is written with textContent or
//      set through a validated href. Nothing server-provided ever reaches
//      innerHTML, so a flow name, a username, or a line of console output
//      cannot inject markup. Log text is the sharpest case: it is whatever a
//      test, a fixture, or the site under test decided to print.
//   2. The server is the authority on what is legal. We validate input here to
//      save a round trip and to give fast feedback, then show the server's own
//      message verbatim when it disagrees — those messages are written to be
//      read by a person.
//   3. Work follows the visible tab. A tab loads when it is first opened, and
//      the run poller only ticks while History is on screen: a forgotten
//      background tab must not spend the team's GitHub API quota.

(function () {
  "use strict";

  var POLL_MS = 5000;
  var HISTORY_LIMIT = 50;

  // A tab left open on a finished run should not poll forever, and neither
  // should one whose server keeps returning a run we cannot interpret. Both
  // cases are bounded here rather than trusted to the data.
  var MAX_POLL_CYCLES = 360; // 30 minutes of 5s ticks
  var MAX_POLL_FAILURES = 3;

  // GitHub creates the workflow run a moment after accepting the dispatch, so
  // a fresh run can be missing from the first list. Keep polling for a while
  // even when nothing in the list looks active.
  var AWAIT_RUN_MS = 90 * 1000;

  // Run options are a per-person convenience, not state the server owns, so
  // localStorage is the right home for them. Credentials never go here — the
  // session is an HttpOnly cookie the browser manages and JS cannot read.
  var OPTIONS_KEY = "testRunner.options.v1";

  // The open tab belongs to this browser tab, not to the person: two windows
  // side by side is a normal way to use this, so sessionStorage.
  var TAB_KEY = "testRunner.tab.v1";

  // Light or dark is a display preference, not a credential, and it belongs to
  // the person rather than to one window — so localStorage, and nothing else
  // ever goes in here. Absent means "follow the operating system".
  var THEME_KEY = "testRunner.theme.v1";

  // Three states, cycled in this order by one button. "system" is a real
  // choice, not the absence of one, so it is in the ring rather than only the
  // starting point.
  var THEME_ORDER = { system: "light", light: "dark", dark: "system" };

  // The accessible name for each state: what is on now, and what the next press
  // will do. The markup used to hardcode "Dark theme" in every state, which was
  // wrong in two of the three.
  var THEME_ARIA = {
    system: "Theme: following the system. Press to switch to light.",
    light: "Theme: light. Press to switch to dark.",
    dark: "Theme: dark. Press to follow the system theme.",
  };

  // Held here rather than on `state` because it is applied on the line below,
  // long before that object exists.
  var themeMode = storedTheme();

  // Applied at the top of the file rather than from the startup tail: this runs
  // the moment the deferred bundle is parsed, which is the earliest moment
  // available to us. The conventional pre-paint inline <script> in <head> would
  // be earlier, but server.js sends `script-src 'self'` with no nonce, so an
  // inline script is blocked with no visible error - it would flash the wrong
  // theme and report nothing. A separate /theme-boot.js file would work, but
  // only once it is added to the STATIC_FILES allowlist in server.js.
  applyTheme(themeMode);

  // Mirrors src/auth.js (USERNAME_PATTERN, PASSWORD_MIN). The server is the
  // authority and its refusal is shown verbatim; these exist so the form can
  // state the real rule and catch a violation without a round trip. The sign-up
  // shape is narrower than the store's, which also accepts "@" and shorter
  // names for accounts an operator hand-edited in. Keep in step with auth.js.
  var SIGNUP_USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
  var SIGNUP_PASSWORD_MIN = 10;

  // The workflow declares `shards` and `workers` as `type: choice` inputs with
  // exactly these options, so GitHub rejects any other value and the server
  // snaps a request down to the nearest one. Mirrors DISPATCHABLE_SHARDS and
  // DISPATCHABLE_WORKERS in src/github.js: offering anything else here is a
  // promise this app cannot keep.
  var DISPATCHABLE_COUNTS = [1, 2, 4, 8];

  // How the server records who pressed Run. Every dispatch uses this app's own
  // token, so GitHub attributes all of them to the token owner; github.js puts
  // the real requester in the run's `reason` input as
  // "<user> via test runner" or "<user> via test runner: <free text>".
  // Keep in step with startRun() in src/github.js.
  var ATTRIBUTION_MARKER = " via test runner";

  // The same requester, on the one channel that survives a reload: the runner
  // workflow's `run-name` puts it at the END of the run title, and GitHub
  // returns that title as `display_title` with run metadata - which it never
  // does for dispatch inputs. Keep this marker byte-for-byte in step with
  // run-name; the separator is U+00B7, not an ASCII dot.
  var TITLE_REQUESTER_MARKER = " · requested by ";

  // A token parsed out of a title is only a name if it has an account's shape.
  // Wider than SIGNUP_USERNAME_PATTERN so a GitHub login typed into the Actions
  // form by hand also lands, and still whitespace-free - which is what keeps a
  // sentence of free text out of the "Started by" column.
  var TITLE_REQUESTER_SHAPE = /^[A-Za-z0-9._-]{1,48}$/;

  // That reason only reaches the browser in the dispatch response, so it is
  // remembered per run id for as long as the session lasts. Bounded because it
  // is a cache, not a record: the runs it describes scroll off the 50-run page
  // long before this fills.
  var MAX_ATTRIBUTIONS = 200;

  // USERS is admin-only, and it is filtered out of this list rather than
  // hidden, so a non-admin page contains no such control at all.
  var TABS = [
    { id: "dashboard", label: "Dashboard", adminOnly: false },
    { id: "run", label: "Run", adminOnly: false },
    { id: "history", label: "History", adminOnly: false },
    { id: "users", label: "Users", adminOnly: true },
  ];

  var KINDS = [
    {
      kind: "group",
      label: "Suites",
      note: "curated bundles of specs",
    },
    {
      kind: "spec",
      label: "Spec files",
      note: "every test in one file",
    },
    {
      kind: "suite",
      label: "Test blocks",
      note: "a single describe block",
    },
  ];

  // GitHub's conclusion vocabulary, rendered in words a person reads rather
  // than the API's snake_case.
  var CONCLUSION_LABELS = {
    success: "success",
    failure: "failure",
    cancelled: "cancelled",
    timed_out: "timed out",
    skipped: "skipped",
    startup_failure: "startup failure",
    action_required: "action required",
    neutral: "neutral",
    stale: "stale",
  };

  // The conclusions the History filter offers by name. Anything else GitHub
  // reports lands in the "other" bucket instead of vanishing from the table.
  var FILTERED_CONCLUSIONS = [
    "success",
    "failure",
    "cancelled",
    "timed_out",
    "skipped",
    "startup_failure",
  ];

  var state = {
    screen: "boot",
    session: null,
    // Bumped every time the signed-in session is torn down. A response that
    // was already in flight then lands with a stale epoch and is dropped -
    // without it, a poll tick or a Refresh that resolved after sign-out wrote
    // the previous person's runs back into state and flipped loaded.history
    // true, so the next sign-in took the "already loaded" path and showed
    // somebody else's history as current.
    epoch: 0,
    authTab: "signin",
    tab: "dashboard",
    loaded: {
      dashboard: false,
      flows: false,
      history: false,
      users: false,
    },

    flows: [],
    totals: null,
    source: "",
    dispatch: null,
    flowsError: "",
    filter: "",
    // Which column each flow table is sorted by, and which way. It lives in
    // state because both tables are rebuilt from scratch on a five-second
    // poll: held on the DOM it would be thrown away every tick. An empty key
    // means catalog order, which is the order a person expects on arrival.
    flowSort: { key: "", dir: 1 },
    quickSort: { key: "", dir: 1 },
    starting: null, // flow id currently being dispatched
    inFlight: false,

    dashboard: null,

    runs: [],
    historyFilter: "",
    logs: {}, // run id -> { open, loading, fetched, error, payload, version }
    cancelling: {}, // run id -> true while its cancel request is in flight
    attribution: {}, // run id -> { requester, note } parsed from the dispatch
    attributionOrder: [], // insertion order, so the map above stays bounded

    users: [],
    signupMode: "",
    inviteCodeSet: false,
    pendingDelete: "", // username awaiting a second click on Delete
    userBusy: "",
    userBusyLabel: "",

    pollTimer: null,
    pollCycles: 0,
    pollFailures: 0,
    awaitingRunSince: 0,
  };

  // History rows are kept and updated rather than rebuilt on every poll: a
  // colleague reading a <pre> of live console output must not lose their scroll
  // position, or their keyboard focus, every five seconds.
  var rows = Object.create(null);

  // ─────────────────────────── DOM plumbing ───────────────────────────

  function pick(testid) {
    return document.querySelector('[data-testid="' + testid + '"]');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== "") {
      node.textContent = String(text);
    }
    return node;
  }

  function show(node, visible) {
    if (!node) return;
    if (visible) node.removeAttribute("hidden");
    else node.setAttribute("hidden", "");
  }

  function setText(node, text) {
    if (node) node.textContent = text === undefined ? "" : String(text);
  }

  var dom = {
    boot: pick("boot-screen"),
    bootMessage: pick("boot-message"),
    bootFault: document.getElementById("boot-fault"),
    bootError: pick("boot-error"),
    bootRetry: pick("boot-retry"),

    authScreen: pick("auth-screen"),
    authTabs: pick("auth-tabs"),
    tabSignin: pick("auth-tab-signin"),
    tabSignup: pick("auth-tab-signup"),
    signinForm: pick("signin-form"),
    signinUsername: pick("signin-username"),
    signinPassword: pick("signin-password"),
    signinError: pick("signin-error"),
    signinSubmit: pick("signin-submit"),
    signupForm: pick("signup-form"),
    signupUsername: pick("signup-username"),
    signupPassword: pick("signup-password"),
    signupInvite: pick("signup-invite"),
    signupInviteField: pick("signup-invite-field"),
    signupError: pick("signup-error"),
    signupSubmit: pick("signup-submit"),
    authNote: pick("auth-note"),
    themeToggleAuth: pick("theme-toggle-auth"),
    themeLabelAuth: pick("theme-label-auth"),

    runnerScreen: pick("runner-screen"),
    sessionUsername: pick("session-username"),
    sessionRole: pick("session-role"),
    signout: pick("signout-button"),
    themeToggle: pick("theme-toggle"),
    themeLabel: pick("theme-label"),
    dispatchRepo: pick("dispatch-repo"),
    dispatchRef: pick("dispatch-ref"),
    dispatchWorkflow: pick("dispatch-workflow"),
    flowsSource: pick("flows-source"),
    dispatchBanner: pick("dispatch-banner"),
    dispatchReasons: pick("dispatch-reasons"),

    tabbar: document.getElementById("tabbar"),
    panels: {
      dashboard: pick("panel-dashboard"),
      run: pick("panel-run"),
      history: pick("panel-history"),
      users: pick("panel-users"),
    },

    dashboardWindow: pick("dashboard-window"),
    dashboardRefresh: pick("dashboard-refresh"),
    dashboardError: pick("dashboard-error"),
    tileTotal: pick("tile-total"),
    tileTotalNote: pick("tile-total-note"),
    tileSuccess: pick("tile-success"),
    tileSuccessNote: pick("tile-success-note"),
    tileActive: pick("tile-active"),
    tileActiveNote: pick("tile-active-note"),
    tileFlows: pick("tile-flows"),
    tileFlowsNote: pick("tile-flows-note"),
    quickStatus: pick("quick-status"),
    quickRuns: pick("quick-runs"),
    lastRun: pick("last-run"),
    recentRuns: pick("recent-runs"),

    optionsForm: pick("options-form"),
    optionsReset: pick("options-reset"),
    targetUrl: pick("option-target-url"),
    browser: pick("option-browser"),
    shards: pick("option-shards"),
    retries: pick("option-retries"),
    workers: pick("option-workers"),
    reason: pick("option-reason"),
    reasonCount: pick("reason-count"),
    flowsRefresh: pick("flows-refresh"),
    flowFilter: pick("flow-filter"),
    flowCount: pick("flow-count"),
    flowsError: pick("flows-error"),
    flowList: pick("flow-list"),
    runStatus: pick("run-status"),

    historyPolling: pick("history-polling"),
    historyCount: pick("history-count"),
    historyRefresh: pick("history-refresh"),
    historyFilter: pick("history-filter"),
    historyStatus: pick("history-status"),
    historyBody: pick("history-body"),
    historyEmpty: pick("history-empty"),

    usersCount: pick("users-count"),
    usersRefresh: pick("users-refresh"),
    usersSignupMode: pick("users-signup-mode"),
    usersInviteCode: pick("users-invite-code"),
    configDetailCard: pick("config-detail-card"),
    configDetailList: pick("config-detail-list"),
    usersError: pick("users-error"),
    usersStatus: pick("users-status"),
    usersBody: pick("users-body"),
    usersEmpty: pick("users-empty"),

    skipLink: pick("skip-link"),
    footerSession: pick("footer-session"),
  };

  // ───────────────────────────── transport ─────────────────────────────

  function apiError(message, status) {
    var error = new Error(message);
    error.status = status || 0;
    return error;
  }

  function api(path, options) {
    var settings = options || {};
    var init = {
      method: settings.method || "GET",
      // The session cookie is the only credential; nothing is ever attached
      // by hand, and no token exists on this side to leak.
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    };

    if (settings.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(settings.body);
    }

    return fetch(path, init).then(
      function (response) {
        // Read as text first: an error page, a proxy timeout, or an empty 204
        // are all things JSON.parse would throw on, and a parse crash would
        // hide the status code that actually explains the failure.
        return response.text().then(function (raw) {
          var payload = null;

          if (raw) {
            try {
              payload = JSON.parse(raw);
            } catch (error) {
              payload = null;
            }
          }

          if (!response.ok) {
            var message =
              payload && typeof payload.message === "string" && payload.message
                ? payload.message
                : "The server returned HTTP " + response.status + ".";
            throw apiError(message, response.status);
          }

          return payload || {};
        });
      },
      function () {
        throw apiError(
          "Cannot reach the runner server. Check your connection, then retry.",
          0,
        );
      },
    );
  }

  // A 401 anywhere means the session went away underneath us: it expired, the
  // server restarted (sessions are in memory), or an admin deleted the account.
  // Drop to the auth screen once, centrally, instead of leaving dead panels on
  // screen.
  function isSessionLoss(error) {
    return error && error.status === 401 && state.screen === "runner";
  }

  // Is a response that started in epoch `epoch` still worth acting on?
  //
  // Every loader captures state.epoch before it fetches and checks this before
  // it writes anything back. Requests are not cancelled when somebody signs
  // out - fetch is already on the wire - so the discipline has to be at the
  // landing end: no handler may touch state or the DOM once the session it
  // belongs to is gone, or the runner screen has been left behind.
  function stale(epoch) {
    return state.screen !== "runner" || epoch !== state.epoch;
  }

  function handleSessionLoss() {
    resetRunnerState();
    state.session = null;
    renderAuth();
    showScreen("auth");
    setText(
      dom.authNote,
      "Your session ended. Sign in again to start test runs.",
    );
    if (dom.signinUsername) dom.signinUsername.focus();
  }

  // Everything a signed-in person could see is dropped here: run history,
  // usernames, cached log text. Signing out must not leave the next person at
  // this keyboard a rendered copy of it.
  function resetRunnerState() {
    stopPolling();

    // First, and before any awaited work: from here on every response still in
    // flight belongs to a session that no longer exists.
    state.epoch += 1;

    state.flows = [];
    state.totals = null;
    state.source = "";
    state.flowsError = "";
    state.filter = "";
    state.flowSort = { key: "", dir: 1 };
    state.quickSort = { key: "", dir: 1 };
    state.starting = null;
    state.dashboard = null;
    state.runs = [];
    state.historyFilter = "";
    state.logs = {};
    state.cancelling = {};
    state.attribution = {};
    state.attributionOrder = [];
    state.users = [];
    state.signupMode = "";
    state.inviteCodeSet = false;
    state.pendingDelete = "";
    state.userBusy = "";
    state.userBusyLabel = "";
    state.awaitingRunSince = 0;
    state.loaded = {
      dashboard: false,
      flows: false,
      history: false,
      users: false,
    };

    rows = Object.create(null);

    if (dom.flowList) dom.flowList.replaceChildren();
    if (dom.historyBody) dom.historyBody.replaceChildren();
    if (dom.usersBody) dom.usersBody.replaceChildren();
    if (dom.recentRuns) dom.recentRuns.replaceChildren();
    if (dom.quickRuns) dom.quickRuns.replaceChildren();
    if (dom.flowFilter) dom.flowFilter.value = "";
    if (dom.historyFilter) dom.historyFilter.value = "";

    setStatus(dom.runStatus, "");
    setStatus(dom.quickStatus, "");
    setStatus(dom.historyStatus, "");
    setStatus(dom.usersStatus, "");
    setText(dom.dashboardError, "");
    setText(dom.usersError, "");
    setFlowsError("");
  }

  // ────────────────────────────── screens ──────────────────────────────

  function showScreen(name) {
    state.screen = name;
    show(dom.boot, name === "boot");
    show(dom.authScreen, name === "auth");
    show(dom.runnerScreen, name === "runner");

    // The skip link has to land inside the screen that is actually visible.
    if (dom.skipLink) {
      dom.skipLink.href = name === "runner" ? "#runner-main" : "#auth-main";
    }

    // Polling is a side effect of being on the runner screen, on the History
    // tab, with an active run. Re-evaluating here is what guarantees we never
    // poll a screen nobody is looking at.
    schedulePolling();
  }

  // ─────────────────────────────── auth UI ───────────────────────────────

  function signupAllowed() {
    var session = state.session || {};
    var mode = session.signupMode;

    // signupAvailable is the server's own answer to "would a signup work right
    // now". The mode alone is not enough: on a host with no writable disk the
    // mode still reads "invite" while every signup is refused, so the form used
    // to invite somebody to choose a password and then fail them. Only an
    // explicit false hides it, so a server that does not send the field behaves
    // exactly as before.
    if (session.signupAvailable === false) return false;

    return mode === "open" || mode === "invite";
  }

  function renderAuth() {
    var session = state.session || {};
    var mode = session.signupMode || "";
    var accounts = Number(session.accounts);
    var canSignUp = signupAllowed();

    // With signup off there is only one thing to do here, so the toggle is
    // noise. Hide it and make sure we are not left on a hidden form.
    show(dom.authTabs, canSignUp);
    if (!canSignUp && state.authTab === "signup") state.authTab = "signin";

    var onSignin = state.authTab === "signin";
    show(dom.signinForm, onSignin);
    show(dom.signupForm, !onSignin && canSignUp);
    show(dom.signupInviteField, mode === "invite");

    if (dom.tabSignin) {
      dom.tabSignin.classList.toggle("is-active", onSignin);
      dom.tabSignin.setAttribute("aria-pressed", onSignin ? "true" : "false");
    }
    if (dom.tabSignup) {
      dom.tabSignup.classList.toggle("is-active", !onSignin);
      dom.tabSignup.setAttribute("aria-pressed", onSignin ? "false" : "true");
    }
    if (dom.signupInvite) {
      dom.signupInvite.required = mode === "invite";
    }

    // The server's own reason comes first when there is one. It is the only
    // branch here that explains why a form the visitor may have been told to
    // expect is missing, and saying nothing would leave them retrying.
    var signupNote = firstString(session.signupNote);

    if (signupNote) {
      setText(dom.authNote, signupNote);
    } else if (mode === "off") {
      setText(
        dom.authNote,
        "Accounts on this instance are issued by an administrator. Ask them " +
          "for one if you do not have credentials yet.",
      );
    } else if (accounts === 0) {
      setText(
        dom.authNote,
        "No accounts exist yet. The first account created becomes the " +
          "administrator.",
      );
    } else {
      setText(dom.authNote, "");
    }
  }

  function setAuthTab(tab) {
    state.authTab = tab;
    setText(dom.signinError, "");
    setText(dom.signupError, "");
    renderAuth();

    var first = tab === "signin" ? dom.signinUsername : dom.signupUsername;
    if (first) first.focus();
  }

  function submitting(button, busy, busyLabel) {
    if (!button) return;

    if (busy) {
      if (!button.dataset.idleLabel) {
        // Trimmed because the markup indents button text across lines.
        button.dataset.idleLabel = button.textContent.trim();
      }
      button.disabled = true;
      button.textContent = busyLabel || button.dataset.idleLabel;
      return;
    }

    button.disabled = false;
    if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
  }

  function onSignin(event) {
    event.preventDefault();
    if (state.inFlight) return;

    var username = dom.signinUsername.value.trim();
    var password = dom.signinPassword.value;

    setText(dom.signinError, "");

    if (!username || !password) {
      setText(dom.signinError, "Enter your username and password.");
      return;
    }

    state.inFlight = true;
    submitting(dom.signinSubmit, true, "Signing in…");

    api("/api/login", {
      method: "POST",
      body: { username: username, password: password },
    })
      .then(function () {
        dom.signinPassword.value = "";
        return enterRunner();
      })
      .catch(function (error) {
        setText(dom.signinError, error.message);
        dom.signinPassword.select();
      })
      .then(function () {
        state.inFlight = false;
        submitting(dom.signinSubmit, false);
      });
  }

  function onSignup(event) {
    event.preventDefault();
    if (state.inFlight) return;

    var username = dom.signupUsername.value.trim();
    var password = dom.signupPassword.value;
    var inviteCode = dom.signupInvite.value.trim();
    var needsInvite =
      state.session && state.session.signupMode === "invite" ? true : false;

    setText(dom.signupError, "");

    if (!username || !password) {
      setText(dom.signupError, "Choose a username and a password.");
      return;
    }
    // Both checks state the server's own rule. They used to promise a shorter
    // password and a wider username than auth.js accepts, which turned a
    // correctly filled form into a refusal from the far end.
    if (!SIGNUP_USERNAME_PATTERN.test(username)) {
      setText(
        dom.signupError,
        "Username must be 3-32 characters, using letters, digits, dot, " +
          "underscore or hyphen.",
      );
      return;
    }
    if (password.length < SIGNUP_PASSWORD_MIN) {
      setText(
        dom.signupError,
        "Use a password of at least " + SIGNUP_PASSWORD_MIN + " characters.",
      );
      return;
    }
    if (needsInvite && !inviteCode) {
      setText(dom.signupError, "This instance requires an invite code.");
      return;
    }

    state.inFlight = true;
    submitting(dom.signupSubmit, true, "Creating…");

    api("/api/signup", {
      method: "POST",
      body: {
        username: username,
        password: password,
        inviteCode: inviteCode,
      },
    })
      .then(function () {
        dom.signupPassword.value = "";
        dom.signupInvite.value = "";
        return enterRunner();
      })
      .catch(function (error) {
        setText(dom.signupError, error.message);
      })
      .then(function () {
        state.inFlight = false;
        submitting(dom.signupSubmit, false);
      });
  }

  function onSignout() {
    submitting(dom.signout, true, "Signing out…");
    // Before the request, not after it: a poll that fires mid-logout would come
    // back 401 and report an expired session to somebody who chose to leave.
    stopPolling();

    api("/api/logout", { method: "POST" })
      .catch(function () {
        // A failed logout still means this tab should stop showing the panel.
        // The cookie either died with the request or is about to.
      })
      .then(function () {
        submitting(dom.signout, false);
        resetRunnerState();
        return loadSession();
      })
      .then(function () {
        renderAuth();
        showScreen("auth");
        setText(dom.authNote, "Signed out.");
        if (dom.signinUsername) dom.signinUsername.focus();
      })
      .catch(function (error) {
        showScreen("auth");
        setText(dom.authNote, error.message);
      });
  }

  // ──────────────────────────────── tabs ────────────────────────────────

  function isAdmin() {
    return Boolean(state.session && state.session.role === "admin");
  }

  function visibleTabs() {
    var admin = isAdmin();

    return TABS.filter(function (tab) {
      return !tab.adminOnly || admin;
    });
  }

  function storedTab() {
    try {
      return window.sessionStorage.getItem(TAB_KEY) || "";
    } catch (error) {
      return ""; // private mode, or storage disabled
    }
  }

  function rememberTab(id) {
    try {
      window.sessionStorage.setItem(TAB_KEY, id);
    } catch (error) {
      // Losing your place across a refresh is not worth a message, and there
      // is nothing to fall back to.
    }
  }

  // ──────────────────────────────── theme ────────────────────────────────

  // Only "light" and "dark" mean anything in storage. Anything else - a value
  // from an older build, a hand-edited one, a browser that throws on access -
  // degrades to following the OS, which is the one state that is always right.
  function storedTheme() {
    var value = "";

    try {
      value = window.localStorage.getItem(THEME_KEY) || "";
    } catch (error) {
      return "system"; // private mode, or site data blocked for this origin
    }

    return value === "light" || value === "dark" ? value : "system";
  }

  function rememberTheme(mode) {
    try {
      // "system" is written out rather than the key being deleted, so choosing
      // to follow the OS is distinguishable from never having chosen. Both read
      // back as "system", so nothing downstream has to care.
      window.localStorage.setItem(THEME_KEY, mode);
    } catch (error) {
      // A preference that does not survive a refresh is not worth a message,
      // and there is nothing to fall back to.
    }
  }

  // The entire CSS contract is one attribute on <html>, and the third state is
  // its absence: styles.css maps the dark palette on bare :root and re-maps to
  // light inside `@media (prefers-color-scheme: light) :root:not([data-theme=
  // "dark"])`, so with no attribute the page follows the OS - including a live
  // OS flip - with no JS involved and no matchMedia listener to keep alive.
  //
  // Explicit dark works only by disqualifying that :not() guard; there is no
  // :root[data-theme="dark"] rule for it to match. Tidying the guard out of the
  // stylesheet, or adding a :root:not([data-theme]) rule, breaks a state.
  function applyTheme(mode) {
    var root = document.documentElement;

    if (mode === "light" || mode === "dark") {
      root.setAttribute("data-theme", mode);
    } else {
      root.removeAttribute("data-theme");
    }
  }

  // Two copies of one control - the header's and the sign-in card's - both
  // static markup that showScreen only hides. Painting in place rather than
  // rebuilding keeps focus on the button that was just pressed, and writing
  // both every time is what keeps them in step with no re-wiring.
  function paintTheme(mode) {
    [
      { button: dom.themeToggle, label: dom.themeLabel },
      { button: dom.themeToggleAuth, label: dom.themeLabelAuth },
    ].forEach(function (pair) {
      if (!pair.button || !pair.label) return;

      // Lowercase on purpose: .theme-toggle uppercases it in CSS, and the
      // source voice in these files is lowercase.
      pair.label.textContent = mode;
      pair.button.setAttribute(
        "aria-label",
        THEME_ARIA[mode] || THEME_ARIA.system,
      );
    });
  }

  function cycleTheme() {
    themeMode = THEME_ORDER[themeMode] || "light";

    // Apply, persist, then paint - so what is on screen always describes what
    // was actually applied.
    applyTheme(themeMode);
    rememberTheme(themeMode);
    paintTheme(themeMode);
  }

  function renderTabs() {
    if (!dom.tabbar) return;

    var fragment = document.createDocumentFragment();

    visibleTabs().forEach(function (tab) {
      var button = el("button", "tab");
      button.type = "button";
      button.id = "tab-" + tab.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", "panel-" + tab.id);
      button.dataset.tab = tab.id;
      button.dataset.testid = "tab-" + tab.id;
      button.appendChild(el("span", "tab-label", tab.label));

      var count = el("span", "tab-count");
      count.dataset.testid = "tab-count-" + tab.id;
      button.appendChild(count);

      fragment.appendChild(button);
    });

    dom.tabbar.replaceChildren(fragment);
    paintTabs();
  }

  function paintTabs() {
    if (!dom.tabbar) return;

    dom.tabbar.querySelectorAll(".tab").forEach(function (button) {
      var active = button.dataset.tab === state.tab;

      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      // Roving tabindex: the strip is one tab stop, arrows move within it.
      button.tabIndex = active ? 0 : -1;
    });
  }

  function setTab(id, options) {
    var allowed = visibleTabs().some(function (tab) {
      return tab.id === id;
    });
    var next = allowed ? id : "dashboard";

    state.tab = next;
    rememberTab(next);

    // A half-confirmed delete must not still be armed when the tab comes back.
    if (next !== "users") state.pendingDelete = "";

    Object.keys(dom.panels).forEach(function (key) {
      show(dom.panels[key], key === next);
    });

    paintTabs();
    updateTabCounts();
    schedulePolling();
    ensureTabData(next, options);
  }

  function onTabbarClick(event) {
    var button = event.target.closest(".tab");
    if (!button) return;

    setTab(button.dataset.tab);
  }

  // Manual activation: arrows move focus, Enter or Space opens the tab. The
  // panels fetch when they open, so activating one on every arrow press would
  // fire requests nobody asked for.
  function onTabbarKeydown(event) {
    var keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (keys.indexOf(event.key) === -1) return;

    var buttons = Array.prototype.slice.call(
      dom.tabbar.querySelectorAll(".tab"),
    );
    if (!buttons.length) return;

    var current = buttons.indexOf(event.target);
    if (current === -1) return;

    var next = current;
    if (event.key === "ArrowLeft") next = current - 1;
    if (event.key === "ArrowRight") next = current + 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = buttons.length - 1;

    if (next < 0) next = buttons.length - 1;
    if (next >= buttons.length) next = 0;

    event.preventDefault();
    buttons.forEach(function (button, index) {
      button.tabIndex = index === next ? 0 : -1;
    });
    buttons[next].focus();
  }

  function ensureTabData(tab, options) {
    var force = Boolean(options && options.force);

    if (tab === "dashboard") {
      if (force || !state.loaded.dashboard) loadDashboard({ quiet: !force });
      // The quick-run buttons name real flows, so the catalog is needed here
      // as well as on the Run tab.
      if (force || !state.loaded.flows) loadFlows({ quiet: true });
      return;
    }

    if (tab === "run") {
      if (force || !state.loaded.flows) loadFlows({ quiet: false });
      return;
    }

    if (tab === "history") {
      if (force || !state.loaded.history) {
        loadRuns({ quiet: false }).then(function () {
          schedulePolling();
        });
      }
      return;
    }

    if (tab === "users") {
      if (force || !state.loaded.users) loadUsers({ quiet: false });
    }
  }

  function updateTabCounts() {
    if (!dom.tabbar) return;

    var badge = dom.tabbar.querySelector('[data-testid="tab-count-history"]');
    if (!badge) return;

    var active = activeRunCount();
    setText(badge, active > 0 ? String(active) : "");
    badge.title = active > 0 ? active + " run(s) still going" : "";
  }

  function activeRunCount() {
    // The History list is authoritative once it has been loaded.
    if (state.loaded.history) {
      return state.runs.filter(isActiveRun).length;
    }

    var stats = state.dashboard ? state.dashboard.stats : null;
    // A stats payload with an error in it is a diagnosis, not a count: its
    // zeros describe GitHub being unreachable, not an idle runner.
    var active =
      stats && !firstString(stats.error) ? Number(stats.active) : NaN;

    if (Number.isFinite(active) && active > 0) return active;

    // Neither list is loaded, so the only run we know about is one this tab
    // just started. Counting it is what puts the badge on History immediately.
    return state.runs.filter(isActiveRun).length;
  }

  // ─────────────────────────── shared helpers ───────────────────────────

  function setStatus(node, message, tone, url, linkLabel) {
    if (!node) return;

    node.className = "status-line";
    if (tone) node.classList.add("is-" + tone);
    node.replaceChildren(document.createTextNode(message || ""));

    var safe = httpUrl(url);
    if (!safe) return;

    node.appendChild(document.createTextNode(" "));
    node.appendChild(link(safe, linkLabel || "Open in GitHub Actions"));
  }

  // Never hand a server-provided string straight to href: a "javascript:" or
  // "data:" URL there would be a script-execution hole. Only absolute http(s)
  // survives this gate.
  function httpUrl(value) {
    if (typeof value !== "string" || !value) return "";

    var parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      return "";
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

    return parsed.href;
  }

  function link(href, text) {
    var anchor = el("a", "run-link", text);
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    return anchor;
  }

  // Run payloads are lightly reshaped GitHub objects. Accept both the
  // camelCase this API prefers and the snake_case GitHub sends, so a change on
  // either side degrades to a missing detail instead of a blank row.
  function firstString() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    return "";
  }

  function relativeTime(value) {
    if (!value) return "";

    var when = new Date(value);
    if (Number.isNaN(when.getTime())) return "";

    var seconds = Math.round((Date.now() - when.getTime()) / 1000);

    if (seconds < 0) return "just now";
    if (seconds < 60) return seconds + "s ago";
    if (seconds < 3600) return Math.round(seconds / 60) + "m ago";
    if (seconds < 86400) return Math.round(seconds / 3600) + "h ago";

    return when.toLocaleDateString();
  }

  function absoluteTime(value) {
    if (!value) return "";

    var when = new Date(value);
    return Number.isNaN(when.getTime()) ? "" : when.toLocaleString();
  }

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function setReadout(node, value) {
    if (!node) return;
    node.textContent = value || "—";
    node.title = value || "";
  }

  function countLabel(value, one, many) {
    return value + " " + (value === 1 ? one : many);
  }

  // ────────────────────────────── run facts ──────────────────────────────

  function runIdOf(run) {
    return firstString(run && run.id, run && run.runId);
  }

  function runNumberOf(run) {
    return firstString(run && run.runNumber, run && run.run_number);
  }

  function rawRunTitle(run) {
    return firstString(
      run && run.displayTitle,
      run && run.display_title,
      run && run.name,
    );
  }

  // The title is also the History "Flow" column and the Dashboard row heading,
  // so the machine-readable identity suffix comes off before it is shown -
  // otherwise every row repeats "· requested by asaf-1" beside a column that
  // already says exactly that.
  function runTitleOf(run) {
    var raw = rawRunTitle(run);
    var marker = raw ? raw.indexOf(TITLE_REQUESTER_MARKER) : -1;

    // > 0, never 0: a title that is nothing but the marker is not a title.
    if (marker > 0) return raw.slice(0, marker).trim() || "Test run";

    // Runs from before the workflow carried a requester read "<flow> · <actor>",
    // where the actor is this app's shared token owner - already reported in its
    // own right, and not the requester. Drop that suffix when it is exactly
    // that, and leave any other one alone.
    var dispatcher = runDispatcherOf(run);
    var suffix = dispatcher ? " · " + dispatcher : "";
    var trimmed =
      suffix &&
      raw.length > suffix.length &&
      raw.slice(-suffix.length) === suffix
        ? raw.slice(0, raw.length - suffix.length).trim()
        : raw;

    return trimmed || "Test run";
  }

  // ── who started this run ──
  //
  // Not `run.actor`. That is the account that dispatched the workflow, and this
  // app dispatches every run with one shared token, so it is the same login on
  // every row no matter who pressed the button. Printing it under "Started by"
  // was the defect: a wrong answer that looked like a right one.
  //
  // The requester travels on two channels, and this file reads both.
  //
  // The durable one is the run TITLE: `run-name` in the runner workflow appends
  // "· requested by <user>", and GitHub returns the title as `display_title`
  // with run metadata. It is the only caller-written string GitHub hands back,
  // so it is the only attribution that survives a reload, a second browser, or
  // a colleague opening the same run.
  //
  // The other is the run's `reason` input, which github.js writes as
  // "<user> via test runner[: <free text>]". GitHub does not return dispatch
  // inputs with run metadata, so that string reaches the browser only in the
  // response to our own POST /api/runs - hence the per-session map, which is
  // the fallback for a run this tab started that has no requester in its title.
  //
  // When neither carries a name the row says "unknown" rather than guessing. A
  // run started from GitHub's own UI, or from before the title carried one, is
  // exactly that case, and inventing an answer there repeats the old defect.

  function runDispatcherOf(run) {
    return firstString(run && run.actor, run && run.dispatchedBy);
  }

  // Splits the server's format. Anything else is a reason typed by somebody
  // starting the workflow straight from GitHub: keep it as free text and claim
  // no requester, rather than reading a name out of a string that has none.
  function parseAttributedReason(value) {
    var text =
      typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

    if (!text) return null;

    var marker = text.indexOf(ATTRIBUTION_MARKER);

    if (marker <= 0) return { requester: "", note: text };

    var rest = text.slice(marker + ATTRIBUTION_MARKER.length);

    return {
      requester: text.slice(0, marker).trim(),
      // The server joins the free text on with ": ", so drop that separator
      // and nothing else - the text itself is the operator's own words.
      note: (rest.charAt(0) === ":" ? rest.slice(1) : rest).trim(),
    };
  }

  // The requester is always last in the title, so the marker has to run to the
  // end of it. Three things follow from that, and they are the whole point: a
  // flow id can never fake the marker, because a flow id holds neither a space
  // nor a middle dot; a free-text reason can never be read as a name, because
  // the reason is not in the title at all; and a second, injected marker cannot
  // win, because the remainder then fails the shape test and the answer is "no
  // requester". It fails closed, not open.
  function parseTitleRequester(title) {
    var text =
      typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
    var marker = text.indexOf(TITLE_REQUESTER_MARKER);

    if (marker <= 0) return "";

    var token = text.slice(marker + TITLE_REQUESTER_MARKER.length);

    return TITLE_REQUESTER_SHAPE.test(token) ? token : "";
  }

  function rememberAttribution(runId, reason) {
    var parsed = parseAttributedReason(reason);

    if (!runId || !parsed) return;

    if (!Object.prototype.hasOwnProperty.call(state.attribution, runId)) {
      state.attributionOrder.push(runId);
    }

    state.attribution[runId] = parsed;

    // Oldest first. Not pruned against the visible rows: the History filter
    // hides runs without ending them, and losing the requester because
    // somebody narrowed a filter would be a new way to answer "unknown".
    while (state.attributionOrder.length > MAX_ATTRIBUTIONS) {
      delete state.attribution[state.attributionOrder.shift()];
    }
  }

  // A reason carried on the run itself wins, so the day the API sends one every
  // row gets a requester without touching this code; otherwise what this tab
  // recorded when it dispatched. Null when neither exists.
  function attributionOf(run) {
    var fromRun = parseAttributedReason(
      firstString(run && run.reason, run && run.attributedReason),
    );

    if (fromRun) return fromRun;

    var id = runIdOf(run);

    return (id && state.attribution[id]) || null;
  }

  // The title wins: it is the copy that is still there after a reload.
  function runRequesterOf(run) {
    var fromTitle = parseTitleRequester(rawRunTitle(run));

    if (fromTitle) return fromTitle;

    var attribution = attributionOf(run);

    return attribution ? attribution.requester : "";
  }

  function runReasonNoteOf(run) {
    var attribution = attributionOf(run);

    return attribution ? attribution.note : "";
  }

  // What the cell means, spelled out on hover. Three states, because the two
  // sources are not equally durable and a reader deserves to know which one is
  // answering. The dispatching account is named here as exactly what it is,
  // which is the one place it belongs.
  function requesterTitle(run) {
    var fromTitle = parseTitleRequester(rawRunTitle(run));

    if (fromTitle) {
      return (
        fromTitle +
        " started this run through the test runner. Recorded in the run's own " +
        "title, so it reads the same after a reload and in anybody's browser."
      );
    }

    var requester = runRequesterOf(run);

    if (requester) {
      return (
        requester +
        " started this run through the test runner, from this browser session. " +
        "The run itself does not carry the name, so a reload will lose it."
      );
    }

    var dispatcher = runDispatcherOf(run);

    return (
      "Not recorded. This runner starts every run with one shared GitHub " +
      "token, so GitHub reports " +
      (dispatcher ? "“" + dispatcher + "”" : "the token owner") +
      " as the actor for all of them, whoever pressed Run. A run started " +
      "before the run title carried a requester, or started from GitHub's own " +
      "UI without filling one in, has none to read."
    );
  }

  function runStartedAt(run) {
    return firstString(
      run && run.runStartedAt,
      run && run.run_started_at,
      run && run.createdAt,
      run && run.created_at,
    );
  }

  function runEndedAt(run) {
    return firstString(run && run.updatedAt, run && run.updated_at);
  }

  function runUrl(run) {
    if (!run) return "";
    return httpUrl(firstString(run.htmlUrl, run.html_url, run.url));
  }

  function runStatusOf(run) {
    return firstString(run && run.status).toLowerCase();
  }

  function runConclusionOf(run) {
    return firstString(run && run.conclusion).toLowerCase();
  }

  function isActiveRun(run) {
    return runStatusOf(run) !== "completed";
  }

  function toneForRun(run) {
    var conclusion = runConclusionOf(run);

    if (isActiveRun(run)) return "run";
    if (conclusion === "success") return "ok";
    if (!conclusion) return "warn";
    if (conclusion === "cancelled" || conclusion === "skipped") return "warn";
    return "bad";
  }

  function conclusionLabel(conclusion) {
    if (!conclusion) return "";
    return CONCLUSION_LABELS[conclusion] || conclusion;
  }

  function runLabel(run, fallbackId) {
    var number = runNumberOf(run);
    return number ? "#" + number : "run " + (fallbackId || runIdOf(run));
  }

  // A run in flight has no end time, so "now" is the honest right edge. The
  // figure only advances when the row re-renders, which the 5s poll is already
  // doing while anything is live.
  function durationText(run) {
    var start = Date.parse(runStartedAt(run));
    if (!Number.isFinite(start)) return "—";

    var end = isActiveRun(run) ? Date.now() : Date.parse(runEndedAt(run));
    if (!Number.isFinite(end) || end < start) return "—";

    var seconds = Math.round((end - start) / 1000);

    if (seconds < 60) return seconds + "s";
    if (seconds < 3600) {
      return Math.floor(seconds / 60) + "m " + pad(seconds % 60) + "s";
    }

    return (
      Math.floor(seconds / 3600) +
      "h " +
      pad(Math.floor((seconds % 3600) / 60)) +
      "m"
    );
  }

  // History is authoritative once it has been loaded; otherwise the only runs
  // this page knows about are the five on the Dashboard. Cancel is offered in
  // both places now, and without this fallback a cancel pressed by somebody who
  // has never opened History reports "run 33163908029" instead of "#4".
  function findRun(runId) {
    var id = String(runId);
    var pools = [state.runs];
    var stats = state.dashboard ? state.dashboard.stats : null;

    if (stats && Array.isArray(stats.recent)) pools.push(stats.recent);

    var hit = null;

    pools.forEach(function (pool) {
      if (hit) return;

      hit =
        pool.filter(function (run) {
          return runIdOf(run) === id;
        })[0] || null;
    });

    return hit;
  }

  // ───────────────────────────── run options ─────────────────────────────

  function restoreOptions() {
    var saved = null;

    try {
      saved = JSON.parse(window.localStorage.getItem(OPTIONS_KEY) || "null");
    } catch (error) {
      saved = null; // private mode, disabled storage, or corrupt JSON
    }

    if (!saved || typeof saved !== "object") return;

    if (typeof saved.targetUrl === "string") {
      dom.targetUrl.value = saved.targetUrl;
    }
    setSelect(dom.browser, saved.browser);
    setSelect(dom.retries, saved.retries);

    // Shards and workers are corrected rather than ignored. An earlier build of
    // this page offered 3, 5, 6 and 7, and those numbers are still sitting in
    // people's localStorage: setSelect on its own would silently leave the
    // select at its default while storage went on promising 7, so every later
    // visit restored the same undispatchable value. Blank shards is left blank -
    // that is "auto", not a count.
    var savedShards = saved.shards === undefined ? "" : String(saved.shards);
    var savedWorkers = saved.workers === undefined ? "" : String(saved.workers);
    var shards = savedShards === "" ? "" : snapToDispatchable(savedShards);
    var workers = snapToDispatchable(savedWorkers);

    setSelect(dom.shards, shards);
    if (workers) setSelect(dom.workers, workers);

    // Rewritten so the correction survives this visit instead of being made
    // again on the next one.
    if (savedShards !== shards || (workers && savedWorkers !== workers)) {
      persistOptions();
    }
  }

  // Snap a count down to a value the workflow's choice input accepts, the same
  // way snapToOption() in src/github.js does. "" for anything that is not a
  // usable count, which is how both "auto" and a junk stored value arrive.
  function snapToDispatchable(value) {
    var wanted = Number(value);

    if (!Number.isFinite(wanted) || wanted < 1) return "";

    var chosen = DISPATCHABLE_COUNTS[0];

    DISPATCHABLE_COUNTS.forEach(function (option) {
      if (option <= wanted) chosen = option;
    });

    return String(chosen);
  }

  // What the server actually dispatched with. POST /api/runs answers with the
  // resolved options - snapped to the workflow's choice lists, clamped to the
  // flow's own shard cap, the target URL normalised - and this page used to
  // discard them, so a run requested at 7 shards executed at 4 while the form
  // still said 7 and persisted 7 for next time.
  //
  // Returns a sentence naming what the server changed, or "" when it used what
  // was asked for.
  function applyResolvedOptions(resolved) {
    if (!resolved || typeof resolved !== "object") return "";

    var corrections = [];

    function reconcile(select, label, value) {
      if (!select || value === undefined || value === null) return;

      var next = String(value);
      var before = select.value;

      // "auto" is a standing instruction rather than a number: the server
      // resolved it against this flow's shard cap, and the next flow resolves
      // it differently. Pinning it to today's answer would quietly turn a
      // preference into a fixed count.
      if (select === dom.shards && before === "") return;
      if (before === next) return;

      setSelect(select, next);

      // Only claim a correction the select could actually take. A value it does
      // not offer means this page and the workflow have drifted apart, and
      // saying "now shows 16" while it shows 8 would be the original lie again.
      if (select.value === next) {
        corrections.push(label + " " + (before || "auto") + " → " + next);
      }
    }

    reconcile(dom.browser, "browser", resolved.browser);
    reconcile(dom.shards, "shards", resolved.shards);
    reconcile(dom.retries, "retries", resolved.retries);
    reconcile(dom.workers, "workers", resolved.workers);

    // The server's own normalisation of the URL it pointed the browser at, so
    // the field shows the address that was really tested.
    if (typeof resolved.targetUrl === "string" && dom.targetUrl) {
      dom.targetUrl.value = resolved.targetUrl;
    }

    persistOptions();

    return corrections.length
      ? "Resolved by the server: " +
          corrections.join(", ") +
          ". The form now shows what ran."
      : "";
  }

  // The options the run is executing with, for the status line. Read from the
  // response rather than from the form, so it describes the run and not the
  // request.
  function optionSummary(resolved) {
    if (!resolved || typeof resolved !== "object") return "";

    var parts = [];

    if (firstString(resolved.browser)) parts.push(String(resolved.browser));
    if (Number.isFinite(resolved.shards)) {
      parts.push(countLabel(resolved.shards, "shard", "shards"));
    }
    if (Number.isFinite(resolved.workers)) {
      parts.push(countLabel(resolved.workers, "worker", "workers"));
    }
    if (Number.isFinite(resolved.retries)) {
      parts.push(countLabel(resolved.retries, "retry", "retries"));
    }

    return parts.length ? "Running with " + parts.join(", ") + "." : "";
  }

  // Only accept a stored value that the select actually offers, so a stale or
  // hand-edited entry cannot smuggle an option the server would reject.
  function setSelect(select, value) {
    if (!select || value === undefined || value === null) return;

    var wanted = String(value);
    for (var i = 0; i < select.options.length; i += 1) {
      if (select.options[i].value === wanted) {
        select.value = wanted;
        return;
      }
    }
  }

  function persistOptions() {
    try {
      window.localStorage.setItem(
        OPTIONS_KEY,
        JSON.stringify({
          // The reason is deliberately not persisted: it describes one run,
          // and a stale reason on the next run is worse than an empty box.
          targetUrl: dom.targetUrl.value.trim(),
          browser: dom.browser.value,
          shards: dom.shards.value,
          retries: dom.retries.value,
          workers: dom.workers.value,
        }),
      );
    } catch (error) {
      // Storage being unavailable is not worth telling anyone about.
    }
  }

  function resetOptions() {
    dom.targetUrl.value = "";
    dom.browser.value = "chromium";
    dom.shards.value = "";
    dom.retries.value = "0";
    dom.workers.value = "2";
    dom.reason.value = "";
    updateReasonCount();
    persistOptions();
    dom.targetUrl.focus();
  }

  function updateReasonCount() {
    setText(dom.reasonCount, String(dom.reason.value.length));
  }

  // Returns the run options, or throws with a message meant for the operator.
  function readOptions() {
    var targetUrl = dom.targetUrl.value.trim();

    if (targetUrl) {
      var parsed;
      try {
        parsed = new URL(targetUrl);
      } catch (error) {
        throw new Error(
          "Target URL must be an absolute URL, for example " +
            "https://staging.example.com. Leave it blank to let the pipeline " +
            "serve the site.",
        );
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Target URL must use http or https.");
      }
    }

    var options = {
      browser: dom.browser.value,
      retries: Number(dom.retries.value),
      workers: Number(dom.workers.value),
      targetUrl: targetUrl,
      reason: dom.reason.value.replace(/\s+/g, " ").trim(),
    };

    // "auto" means "let the flow's own maxShards decide", which the API
    // expresses as the field being absent.
    if (dom.shards.value) options.shards = Number(dom.shards.value);

    return options;
  }

  // ────────────────────────────── flow list ──────────────────────────────

  function dispatchBlocked() {
    return Boolean(state.dispatch && state.dispatch.configured === false);
  }

  function flowName(flow) {
    return firstString(flow && flow.name, flow && flow.id) || "flow";
  }

  function findFlow(flowId) {
    return (
      state.flows.filter(function (flow) {
        return flow.id === flowId;
      })[0] || null
    );
  }

  function matchesFilter(flow, needle) {
    if (!needle) return true;

    var haystack = [
      flow.id,
      flow.name,
      flow.description,
      flow.area,
      flow.runner,
      flow.kind,
      Array.isArray(flow.tags) ? flow.tags.join(" ") : "",
    ]
      .join(" ")
      .toLowerCase();

    // Every whitespace-separated word must appear: "app orders" narrows
    // instead of widening, which is what a filter box should do.
    return needle.split(/\s+/).every(function (word) {
      return haystack.indexOf(word) !== -1;
    });
  }

  // ── the flow table ────────────────────────────────────────────────────
  //
  // FLOW · TESTS · SHARDS · TAGS · RUN, one line per flow, in both places a
  // flow list appears. It replaced a grid of description-filled cards: the
  // ten curated suites took a screen and a half there and take a third of
  // one here, and the Run tab's 63 rows are now a list a person can scan.
  //
  // Nothing was dropped to get there. The id is still on every row and still
  // copyable — it is the string the workflow input and a bookmark want — and
  // so is the description. Both moved into the name's title, which is the
  // right control for a fact wanted on demand rather than always.
  var FLOW_COLUMNS = [
    { key: "name", cls: "col-flow", label: "Flow", sortable: true },
    { key: "testCount", cls: "col-tests", label: "Tests", sortable: true },
    { key: "maxShards", cls: "col-shards", label: "Shards", sortable: true },
    { key: "tags", cls: "col-tags", label: "Tags", sortable: false },
    // Heading for screen readers only: a column of buttons that all say Run
    // does not need a word above it saying Run.
    { key: "run", cls: "col-run", label: "Run", sortable: false, quiet: true },
  ];

  function sortState(scope) {
    return scope === "quick" ? state.quickSort : state.flowSort;
  }

  function numberOf(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function sortedFlows(flows, sort) {
    if (!sort.key) return flows.slice();

    return flows.slice().sort(function (left, right) {
      var order =
        sort.key === "name"
          ? flowName(left).localeCompare(flowName(right))
          : numberOf(left[sort.key]) - numberOf(right[sort.key]);

      // Deliberately not multiplied by the direction: dozens of flows share a
      // test count, and with no one fixed order underneath, a poll tick could
      // reshuffle them under the pointer of somebody about to click Run.
      if (!order) return flowName(left).localeCompare(flowName(right));

      return order * sort.dir;
    });
  }

  // One string, because a row has one place to hang it. The id leads: it is
  // the fact a person hovers in order to copy.
  function flowTooltip(flow) {
    var lines = [flow.id];

    if (flow.description) lines.push(flow.description);
    if (flow.warning) lines.push("! " + flow.warning);

    return lines.join("\n");
  }

  function sortMark(column, sort) {
    if (sort.key !== column.key) return "↕";
    return sort.dir === 1 ? "▲" : "▼";
  }

  function flowTableHead(options) {
    var sort = sortState(options.scope);
    var head = el("thead");
    var row = el("tr");

    FLOW_COLUMNS.forEach(function (column) {
      var cell = el("th", column.cls);
      cell.scope = "col";

      if (!column.sortable) {
        cell.appendChild(
          el("span", column.quiet ? "sr-only" : null, column.label),
        );
        row.appendChild(cell);
        return;
      }

      // aria-sort is what a screen reader announces, the arrow is what
      // everyone else reads. Both say the same thing.
      var active = sort.key === column.key;
      cell.setAttribute(
        "aria-sort",
        active ? (sort.dir === 1 ? "ascending" : "descending") : "none",
      );

      var button = el("button", "th-sort", column.label);
      button.type = "button";
      button.dataset.sortKey = column.key;
      button.dataset.testid = options.prefix + "-sort-" + column.cls.slice(4);
      button.appendChild(el("span", "sort-mark", sortMark(column, sort)));

      cell.appendChild(button);
      row.appendChild(cell);
    });

    head.appendChild(row);
    return head;
  }

  function tierRow(label, note, count) {
    var row = el("tr", "tier-row");
    var cell = el("th");

    cell.colSpan = FLOW_COLUMNS.length;
    cell.scope = "colgroup";
    cell.appendChild(el("span", "tier-name", label));
    // The gap between the two is a CSS margin, which a screen reader cannot
    // see: without a real space the row is announced as "Suitescurated".
    cell.appendChild(document.createTextNode(" "));
    cell.appendChild(el("span", "tier-note", note + " · " + count));
    row.appendChild(cell);

    return row;
  }

  function flowTableRow(flow, options) {
    var row = el("tr", "flow-row");
    row.dataset.flowId = flow.id;
    row.dataset.testid = options.prefix + "-row";
    if (state.starting === flow.id) row.classList.add("is-starting");

    var nameCell = el("td", "col-flow");
    var name = el("span", "flow-name", flowName(flow));
    name.dataset.testid = "flow-name";
    name.title = flowTooltip(flow);
    nameCell.appendChild(name);

    // Three flows out of 63 carry a caveat. A mark beside the name costs one
    // character; the paragraph it used to print cost every row two lines.
    if (flow.warning) {
      var flag = el("span", "flow-flag", "!");
      flag.dataset.testid = "flow-warning";
      flag.title = flow.warning;
      nameCell.appendChild(flag);
    }

    row.appendChild(nameCell);

    var tests = el(
      "td",
      "col-tests",
      Number.isFinite(flow.testCount) ? String(flow.testCount) : "—",
    );
    tests.dataset.testid = "flow-tests";
    row.appendChild(tests);

    // One shard is the default, and a column of sixty-three 1s says nothing.
    // Only a flow that actually splits gets a number.
    var shards = el(
      "td",
      "col-shards",
      Number(flow.maxShards) > 1 ? String(flow.maxShards) : "",
    );
    shards.dataset.testid = "flow-shards";
    row.appendChild(shards);

    var tags = el(
      "td",
      "col-tags",
      Array.isArray(flow.tags) ? flow.tags.join(" ") : "",
    );
    tags.dataset.testid = "flow-tags";
    row.appendChild(tags);

    var runCell = el("td", "col-run");
    runCell.appendChild(runButton(flow, options.runTestid));
    row.appendChild(runCell);

    return row;
  }

  // The one Run control, built for both tables, so there is a single answer to
  // "is a run already starting?" and a single place that knows dispatch is off.
  function runButton(flow, testid) {
    var button = el("button", "btn btn-run", "Run");
    button.type = "button";
    button.dataset.testid = testid;
    button.dataset.flowId = flow.id;
    button.setAttribute(
      "aria-label",
      "Run " + flowName(flow) + " (" + flow.id + ")",
    );

    if (dispatchBlocked()) {
      button.disabled = true;
      button.title = "Runs are disabled: this server cannot start a workflow.";
    } else if (state.starting) {
      button.disabled = true;
      if (state.starting === flow.id) button.textContent = "Starting…";
    }

    return button;
  }

  function flowTableBody(flows, options) {
    var sort = sortState(options.scope);
    var body = el("tbody");

    function addRows(group) {
      sortedFlows(group, sort).forEach(function (flow) {
        body.appendChild(flowTableRow(flow, options));
      });
    }

    if (!options.grouped) {
      addRows(flows);
      return body;
    }

    var seen = Object.create(null);

    // The tier stays above the sort: sorting reorders rows inside suites,
    // spec files and test blocks rather than blending the three together,
    // because which tier a flow belongs to is the first thing about it.
    KINDS.forEach(function (group) {
      var matching = flows.filter(function (flow) {
        return flow.kind === group.kind;
      });
      if (!matching.length) return;

      matching.forEach(function (flow) {
        seen[flow.id] = true;
      });

      body.appendChild(tierRow(group.label, group.note, matching.length));
      addRows(matching);
    });

    // A catalog that grows a new kind should still render, under a heading
    // that admits as much, rather than silently dropping rows.
    var rest = flows.filter(function (flow) {
      return !seen[flow.id];
    });

    if (rest.length) {
      body.appendChild(tierRow("Other", "uncategorised", rest.length));
      addRows(rest);
    }

    return body;
  }

  function flowTable(flows, options) {
    var wrap = el("div", "table-wrap");
    var table = el("table", "grid-table flow-table");
    table.dataset.testid = options.prefix + "-table";

    table.appendChild(el("caption", "sr-only", options.caption));
    table.appendChild(flowTableHead(options));
    table.appendChild(flowTableBody(flows, options));

    wrap.appendChild(table);
    return wrap;
  }

  function toggleSort(scope, key) {
    var sort = sortState(scope);

    if (sort.key === key) {
      sort.dir = sort.dir === 1 ? -1 : 1;
    } else {
      sort.key = key;
      sort.dir = 1;
    }

    if (scope === "quick") renderQuickRuns();
    else renderFlows();

    // The header just clicked no longer exists — the table was rebuilt — so a
    // keyboard user would be dropped at the top of the document. Put focus
    // back on the same column's control.
    var host = scope === "quick" ? dom.quickRuns : dom.flowList;
    var replacement =
      host && host.querySelector('[data-sort-key="' + key + '"]');

    if (replacement) replacement.focus();
  }

  function renderFlows() {
    if (!dom.flowList) return;

    var needle = state.filter.trim().toLowerCase();
    var visible = state.flows.filter(function (flow) {
      return matchesFilter(flow, needle);
    });

    setText(
      dom.flowCount,
      needle
        ? visible.length + " of " + state.flows.length + " flows"
        : state.flows.length + " flows",
    );

    if (state.totals && dom.flowCount) {
      dom.flowCount.title =
        "Catalog totals: " +
        [
          state.totals.flows ? state.totals.flows + " flows" : "",
          state.totals.specFiles ? state.totals.specFiles + " spec files" : "",
          state.totals.e2eTests ? state.totals.e2eTests + " e2e tests" : "",
        ]
          .filter(Boolean)
          .join(", ");
    }

    var fragment = document.createDocumentFragment();

    if (!state.flows.length) {
      fragment.appendChild(
        el(
          "p",
          "empty",
          state.flowsError
            ? "No flows loaded."
            : "The catalog is empty. Nothing to run yet.",
        ),
      );
    } else if (!visible.length) {
      fragment.appendChild(
        el("p", "empty", "No flow matches “" + state.filter.trim() + "”."),
      );
    } else {
      fragment.appendChild(
        flowTable(visible, {
          scope: "flows",
          prefix: "flow",
          runTestid: "flow-run",
          grouped: true,
          caption:
            "Every flow this runner can start, by kind: curated suites, then spec files, then single test blocks",
        }),
      );
    }

    dom.flowList.replaceChildren(fragment);
  }

  // Toggling in place instead of re-rendering keeps focus on the button the
  // operator just pressed, which matters for keyboard and screen-reader use.
  // Both the catalog rows and the dashboard's quick buttons start runs, so both
  // have to agree about whether one is already starting.
  function paintRunButtons() {
    var selector = '[data-testid="flow-run"], [data-testid="quick-run"]';

    document.querySelectorAll(selector).forEach(function (button) {
      var mine = button.dataset.flowId === state.starting;
      var row = button.closest(".flow-row");

      button.disabled = Boolean(state.starting) || dispatchBlocked();
      button.classList.toggle("is-starting", mine);
      button.textContent = mine ? "Starting…" : "Run";

      if (row) row.classList.toggle("is-starting", mine);
    });
  }

  function onFlowListClick(event) {
    var sorter = event.target.closest("[data-sort-key]");
    if (sorter) {
      toggleSort("flows", sorter.dataset.sortKey);
      return;
    }

    var button = event.target.closest('[data-testid="flow-run"]');
    if (!button || button.disabled) return;

    startRun(button.dataset.flowId, "run");
  }

  function onQuickRunClick(event) {
    var sorter = event.target.closest("[data-sort-key]");
    if (sorter) {
      toggleSort("quick", sorter.dataset.sortKey);
      return;
    }

    var retry = event.target.closest('[data-testid="quick-retry"]');

    if (retry && !retry.disabled) {
      // Deliberately not quiet: this click is a person asking for the catalog,
      // so a second failure has to be visible rather than swallowed.
      submitting(retry, true, "…");
      loadFlows({ quiet: false });
      return;
    }

    var button = event.target.closest('[data-testid="quick-run"]');
    if (!button || button.disabled) return;

    startRun(button.dataset.flowId, "dashboard");
  }

  function startRun(flowId, origin) {
    if (state.starting) return;

    var statusNode = origin === "dashboard" ? dom.quickStatus : dom.runStatus;
    var flow = findFlow(flowId);

    if (!flow) {
      setStatus(
        statusNode,
        "That flow is no longer in the catalog. Refresh the catalog.",
        "bad",
      );
      return;
    }

    var options;
    try {
      options = readOptions();
    } catch (error) {
      // The offending field lives on the Run tab, so go there rather than
      // reporting a problem next to a control that cannot show it.
      setTab("run");
      setStatus(dom.runStatus, error.message, "bad");
      dom.targetUrl.focus();
      return;
    }

    state.starting = flowId;
    paintRunButtons();
    persistOptions();
    setStatus(statusNode, "Starting " + flowName(flow) + "…");

    var body = Object.assign({ flowId: flowId }, options);
    var epoch = state.epoch;

    api("/api/runs", { method: "POST", body: body })
      .then(function (payload) {
        if (stale(epoch)) return null;

        var run = payload && payload.run ? payload.run : null;
        var resolved = payload && payload.options ? payload.options : null;
        var name =
          (payload && payload.flow && payload.flow.name) || flowName(flow);
        var summary = optionSummary(resolved);
        var corrected = applyResolvedOptions(resolved);

        // The only moment the requester is on the wire: GitHub does not return
        // dispatch inputs with run metadata, so if this is not kept now the
        // History row can never say who started the run.
        if (run && resolved) {
          rememberAttribution(runIdOf(run), resolved.attributedReason);
        }

        if (run) {
          // Show it immediately rather than waiting for the next poll: the
          // operator pressed a button and deserves to see the result of it.
          state.runs = [run].concat(
            state.runs.filter(function (existing) {
              return runIdOf(existing) !== runIdOf(run);
            }),
          );
          renderHistory();
        } else {
          state.awaitingRunSince = Date.now();
        }

        setStatus(
          statusNode,
          [
            run
              ? "Started " + name + ". It is on the History tab."
              : "Started " + name + ". GitHub is still creating the run.",
            summary,
            corrected,
          ]
            .filter(Boolean)
            .join(" "),
          "ok",
          runUrl(run) || (payload && payload.workflowUrl),
          run ? "Open the run" : "Open the workflow",
        );

        return refreshRunViews();
      })
      .catch(function (error) {
        if (isSessionLoss(error)) {
          handleSessionLoss();
          return;
        }
        if (stale(epoch)) return;

        setStatus(statusNode, error.message, "bad");
      })
      .then(function () {
        if (stale(epoch)) return;

        state.starting = null;
        paintRunButtons();
        schedulePolling();
      });
  }

  // Only the views already loaded are refreshed: starting or cancelling a run is
  // no reason to fetch a tab this person has not opened.
  function refreshRunViews() {
    var work = [];

    if (state.loaded.history) work.push(loadRuns({ quiet: true }));
    if (state.loaded.dashboard) work.push(loadDashboard({ quiet: true }));

    return Promise.all(work);
  }

  // ────────────────────────────── dashboard ──────────────────────────────

  function renderDashboard() {
    var payload = state.dashboard;
    var stats = payload ? payload.stats : null;
    var flows = payload ? payload.flows : null;

    // A 200 carrying a diagnosis is not data. getStats() answers with zeros and
    // an explanation in stats.error whenever it cannot read the run list - no
    // token, an unpushed workflow, a renamed repo, a rate limit - and rendering
    // those zeros made an outage indistinguishable from a runner nobody had
    // ever used: "0 runs, 0%, nothing running, no runs yet". The counters say
    // "—" instead, and the cause is shown above them.
    var statsError = firstString(stats && stats.error);

    setText(
      dom.dashboardWindow,
      stats && !statsError
        ? "last " + countLabel(Number(stats.total) || 0, "run", "runs")
        : "—",
    );

    if (statsError) {
      renderStatsUnavailable();
    } else if (stats) {
      var byConclusion = plainObject(stats.byConclusion);
      var concluded = sumCounts(byConclusion);
      var successes = Number(byConclusion.success) || 0;
      var rate = Number(stats.successRate);
      var active = Number(stats.active) || 0;

      setText(dom.tileTotal, String(Number(stats.total) || 0));
      setText(
        dom.tileTotalNote,
        stats.lastRun
          ? "last " + (relativeTime(runStartedAt(stats.lastRun)) || "unknown")
          : "no runs yet",
      );

      // The server sends an integer percent over finished runs only, so this
      // is a clamp against a surprise rather than a conversion.
      setText(
        dom.tileSuccess,
        Number.isFinite(rate)
          ? Math.max(0, Math.min(100, Math.round(rate))) + "%"
          : "—",
      );
      setText(
        dom.tileSuccessNote,
        concluded
          ? successes + " of " + concluded + " finished runs"
          : "no finished runs yet",
      );

      setText(dom.tileActive, String(active));
      setText(
        dom.tileActiveNote,
        active ? "follow them on History" : "nothing running",
      );

      renderCounts(dom.byConclusion, byConclusion);
      renderCounts(dom.byStatus, plainObject(stats.byStatus));

      setText(
        dom.lastRun,
        stats.lastRun
          ? "newest " + (relativeTime(runStartedAt(stats.lastRun)) || "unknown")
          : "—",
      );
      renderRecentRuns(Array.isArray(stats.recent) ? stats.recent : []);
    }

    if (flows) {
      setText(dom.tileFlows, String(Number(flows.total) || 0));
      setText(dom.tileFlowsNote, kindSummary(plainObject(flows.byKind)));
    }

    renderQuickRuns();
    updateTabCounts();
  }

  // Every tile the run statistics feed, set to "not known" rather than to zero.
  // A dash is a smaller claim than a number, and the only claim we can make
  // when the run list could not be read.
  function renderStatsUnavailable() {
    setText(dom.tileTotal, "—");
    setText(dom.tileTotalNote, "run history unavailable");
    setText(dom.tileSuccess, "—");
    setText(dom.tileSuccessNote, "nothing to rate");
    setText(dom.tileActive, "—");
    setText(dom.tileActiveNote, "unknown");
    setText(dom.lastRun, "—");

    renderCounts(dom.byConclusion, {});
    renderCounts(dom.byStatus, {});

    if (dom.recentRuns) {
      dom.recentRuns.replaceChildren(
        el(
          "li",
          "empty",
          "Run history could not be read, so there is nothing to show here. " +
            "The reason is above.",
        ),
      );
    }
  }

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function sumCounts(counts) {
    return Object.keys(counts).reduce(function (total, key) {
      var value = Number(counts[key]);
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function kindSummary(byKind) {
    var parts = [];
    var seen = Object.create(null);

    KINDS.forEach(function (group) {
      var count = Number(byKind[group.kind]);
      if (!Number.isFinite(count) || count <= 0) return;

      seen[group.kind] = true;
      parts.push(count + " " + group.label.toLowerCase());
    });

    // A catalog that grows a new kind still gets counted, under its raw name.
    Object.keys(byKind).forEach(function (kind) {
      var count = Number(byKind[kind]);
      if (seen[kind] || !Number.isFinite(count) || count <= 0) return;

      parts.push(count + " " + kind);
    });

    return parts.length ? parts.join(" · ") : "catalog not loaded";
  }

  function toneForCountKey(key) {
    if (key === "success") return "ok";
    if (key === "cancelled" || key === "skipped" || key === "neutral") {
      return "warn";
    }
    if (key === "queued" || key === "in_progress" || key === "waiting") {
      return "run";
    }
    if (key === "completed") return "info";

    return "bad";
  }

  function renderCounts(node, counts) {
    if (!node) return;

    var keys = Object.keys(counts).sort(function (a, b) {
      var byCount = (Number(counts[b]) || 0) - (Number(counts[a]) || 0);
      return byCount !== 0 ? byCount : a.localeCompare(b);
    });

    if (!keys.length) {
      node.replaceChildren(el("span", "chip", "no data"));
      return;
    }

    var fragment = document.createDocumentFragment();

    keys.forEach(function (key) {
      var chip = el("span", "chip tone-" + toneForCountKey(key));
      chip.dataset.testid = "count-chip";
      chip.dataset.key = key;
      chip.appendChild(el("span", "chip-key", conclusionLabel(key) || key));
      chip.appendChild(el("span", "chip-num", String(counts[key])));
      fragment.appendChild(chip);
    });

    node.replaceChildren(fragment);
  }

  function renderRecentRuns(recent) {
    if (!dom.recentRuns) return;

    if (!recent.length) {
      dom.recentRuns.replaceChildren(
        el("li", "empty", "No runs yet. Start one above."),
      );
      return;
    }

    var fragment = document.createDocumentFragment();

    recent.slice(0, 5).forEach(function (run) {
      var tone = toneForRun(run);
      var item = el("li", "run is-" + tone);
      item.dataset.testid = "recent-run";
      item.dataset.runId = runIdOf(run);

      var top = el("div", "run-top");
      top.appendChild(el("span", "led is-" + tone));
      top.appendChild(el("span", "run-flow", runTitleOf(run)));

      var status = runStatusOf(run) || "unknown";
      var conclusion = runConclusionOf(run);
      var stateNode = el(
        "span",
        "run-state",
        conclusion ? status + " · " + conclusionLabel(conclusion) : status,
      );
      stateNode.dataset.testid = "recent-run-state";
      top.appendChild(stateNode);

      // Cancel belongs where the run was started from, not one tab away. Same
      // handler, same state.cancelling map and same request as the History
      // button, so a run stopped from either place reads the same in both.
      //
      // It sits in .run-top rather than .run-facts: .run-flow is flex:1 there,
      // so the button lands right-aligned with no new CSS, and .run-facts is a
      // mono baseline row a button would sit badly in.
      var id = runIdOf(run);

      if (isActiveRun(run)) {
        var busy = Boolean(state.cancelling[id]);
        var cancel = el(
          "button",
          "btn btn-tiny btn-danger",
          busy ? "Cancelling…" : "Cancel",
        );
        cancel.type = "button";
        // Not "run-cancel": every other node here is prefixed recent-run-, and
        // it keeps [data-testid="run-cancel"] a single match for a selector.
        cancel.dataset.testid = "recent-run-cancel";
        cancel.dataset.runId = id;
        cancel.disabled = busy;
        cancel.setAttribute(
          "aria-label",
          (busy ? "Cancelling " : "Cancel ") + runLabel(run, id),
        );
        top.appendChild(cancel);
      }

      item.appendChild(top);

      var facts = el("div", "run-facts");
      var number = runNumberOf(run);
      if (number) facts.appendChild(el("span", null, "#" + number));

      var started = runStartedAt(run);
      var when = relativeTime(started);
      if (when) {
        var whenNode = el("span", null, when);
        whenNode.dataset.testid = "recent-run-when";
        whenNode.title = absoluteTime(started);
        facts.appendChild(whenNode);
      }

      facts.appendChild(el("span", null, durationText(run)));

      var requester = runRequesterOf(run);
      var by = el("span", null, "by " + (requester || "unknown"));
      by.dataset.testid = "recent-run-by";
      by.title = requesterTitle(run);
      facts.appendChild(by);

      // The reason is why the run exists, so it belongs on the row rather than
      // only inside the string the requester was parsed out of.
      var note = runReasonNoteOf(run);
      if (note) {
        var why = el("span", "run-reason", "“" + note + "”");
        why.dataset.testid = "recent-run-reason";
        why.title = note;
        facts.appendChild(why);
      }

      var href = runUrl(run);
      if (href) facts.appendChild(link(href, "open ↗"));

      item.appendChild(facts);
      fragment.appendChild(item);
    });

    dom.recentRuns.replaceChildren(fragment);
  }

  // What the Quick run panel shows when it has no suites to offer. It must
  // always be terminal: an error with a retry beside it, or a plain statement
  // that the catalog holds no curated suites. "Loading the catalog…" is only
  // honest while a request is genuinely out — the Dashboard fetches the catalog
  // quietly, and a quiet failure used to leave that sentence on screen for
  // ever, with no error and no way to ask again.
  function quickRunsPlaceholder() {
    if (state.flowsError) {
      var fault = el("div", "quick-fault");
      var problem = el("p", "inline-error", state.flowsError);
      problem.dataset.testid = "quick-error";
      fault.appendChild(problem);

      var retry = el("button", "btn btn-tiny", "Retry");
      retry.type = "button";
      retry.dataset.testid = "quick-retry";
      fault.appendChild(retry);

      return fault;
    }

    return el(
      "p",
      "empty",
      state.loaded.flows
        ? "No curated suites in the catalog. Use the Run tab."
        : "Loading the catalog…",
    );
  }

  // The curated bundles, so the common case — "run the suite" — is one click.
  function quickFlows() {
    return state.flows.filter(function (flow) {
      return flow.kind === "group" || /^group-/.test(String(flow.id));
    });
  }

  function renderQuickRuns() {
    if (!dom.quickRuns) return;

    var flows = quickFlows();

    if (!flows.length) {
      dom.quickRuns.replaceChildren(quickRunsPlaceholder());
      return;
    }

    // The same table as the Run tab, minus the tier rows: every row here is a
    // curated suite, so a heading saying so would be the only thing on screen
    // that told the reader nothing.
    dom.quickRuns.replaceChildren(
      flowTable(flows, {
        scope: "quick",
        prefix: "quick",
        runTestid: "quick-run",
        grouped: false,
        caption: "Curated test suites, one click each",
      }),
    );
  }

  // ─────────────────────────────── history ───────────────────────────────

  function filteredRuns() {
    var filter = state.historyFilter;

    return state.runs.filter(function (run) {
      if (!runIdOf(run)) return false;
      if (!filter) return true;

      var conclusion = runConclusionOf(run);

      if (filter === "running") return isActiveRun(run);
      if (filter === "other") {
        return (
          Boolean(conclusion) && FILTERED_CONCLUSIONS.indexOf(conclusion) === -1
        );
      }

      return conclusion === filter;
    });
  }

  function renderHistory() {
    if (!dom.historyBody) return;

    var runs = filteredRuns();
    var ids = runs.map(runIdOf);

    setText(
      dom.historyCount,
      state.historyFilter
        ? runs.length + " of " + state.runs.length + " runs"
        : countLabel(state.runs.length, "run", "runs"),
    );

    var empty = "";
    if (!state.runs.length) {
      empty = state.loaded.history
        ? "No runs yet. Start one from the Run tab."
        : "Loading runs…";
    } else if (!runs.length) {
      empty = "No run matches that filter.";
    }
    setText(dom.historyEmpty, empty);
    show(dom.historyEmpty, Boolean(empty));

    if (sameRowOrder(ids)) {
      // Same runs in the same order: update the cells and move no nodes, which
      // is what keeps an open log panel scrolled and focused where it was.
      runs.forEach(function (run) {
        var bundle = rows[runIdOf(run)];
        if (!bundle) return;

        updateHistoryRow(bundle, run);
        paintLogRow(bundle, run);
      });
    } else {
      rebuildHistoryRows(runs);
    }

    pruneRunState(ids);
    updateTabCounts();
  }

  function sameRowOrder(ids) {
    var current = [];

    dom.historyBody
      .querySelectorAll('tr[data-testid="history-row"]')
      .forEach(function (node) {
        current.push(node.dataset.runId);
      });

    if (current.length !== ids.length) return false;

    return current.every(function (id, index) {
      return id === ids[index] && Boolean(rows[id]);
    });
  }

  function rebuildHistoryRows(runs) {
    var fragment = document.createDocumentFragment();

    runs.forEach(function (run) {
      var id = runIdOf(run);
      var bundle = rows[id] || (rows[id] = buildHistoryRow(id));

      updateHistoryRow(bundle, run);
      paintLogRow(bundle, run);
      fragment.appendChild(bundle.row);
      fragment.appendChild(bundle.logRow);
    });

    dom.historyBody.replaceChildren(fragment);
  }

  // Runs fall off the end of the 50-run page. Their cached rows, log text and
  // in-flight flags go with them, so none of this grows without bound.
  function pruneRunState(ids) {
    var live = Object.create(null);
    ids.forEach(function (id) {
      live[id] = true;
    });

    Object.keys(rows).forEach(function (id) {
      if (!live[id]) delete rows[id];
    });
    Object.keys(state.logs).forEach(function (id) {
      if (!live[id]) delete state.logs[id];
    });
  }

  function buildHistoryRow(id) {
    var bundle = { logVersion: -1, numberKey: "" };

    bundle.row = el("tr", "run-row");
    bundle.row.dataset.testid = "history-row";
    bundle.row.dataset.runId = id;

    var numberCell = el("td", "col-number");
    bundle.number = el("span", "mono");
    bundle.number.dataset.testid = "history-number";
    numberCell.appendChild(bundle.number);

    var titleCell = el("td", "col-title");
    bundle.title = el("span", null);
    bundle.title.dataset.testid = "history-title";
    titleCell.appendChild(bundle.title);

    // The free-text half of the run's reason, on its own line under the title:
    // the requester goes in "Started by", and this is the rest of the sentence
    // that requester wrote - the reason the run exists at all.
    bundle.reason = el("span", "run-reason");
    bundle.reason.dataset.testid = "history-reason";
    bundle.reason.setAttribute("hidden", "");
    titleCell.appendChild(bundle.reason);

    var statusCell = el("td", "col-status");
    bundle.led = el("span", "led");
    bundle.status = el("span", "mono");
    bundle.status.dataset.testid = "history-status-value";
    statusCell.appendChild(bundle.led);
    statusCell.appendChild(bundle.status);

    var conclusionCell = el("td", "col-conclusion");
    bundle.conclusion = el("span", "mono");
    bundle.conclusion.dataset.testid = "history-conclusion";
    conclusionCell.appendChild(bundle.conclusion);

    var actorCell = el("td", "col-actor");
    bundle.actor = el("span", "mono");
    bundle.actor.dataset.testid = "history-actor";
    actorCell.appendChild(bundle.actor);

    var startedCell = el("td", "col-started");
    bundle.started = el("span", "mono");
    bundle.started.dataset.testid = "history-started";
    startedCell.appendChild(bundle.started);

    var durationCell = el("td", "col-duration");
    bundle.duration = el("span", "mono");
    bundle.duration.dataset.testid = "history-duration";
    durationCell.appendChild(bundle.duration);

    var actionsCell = el("td", "col-actions");
    var actions = el("div", "row-actions");

    bundle.cancel = el("button", "btn btn-tiny btn-danger", "Cancel");
    bundle.cancel.type = "button";
    bundle.cancel.dataset.testid = "run-cancel";
    bundle.cancel.dataset.runId = id;

    bundle.logs = el("button", "btn btn-tiny", "Logs");
    bundle.logs.type = "button";
    bundle.logs.dataset.testid = "run-logs";
    bundle.logs.dataset.runId = id;
    bundle.logs.setAttribute("aria-expanded", "false");
    bundle.logs.setAttribute("aria-controls", "logs-" + id);

    actions.appendChild(bundle.cancel);
    actions.appendChild(bundle.logs);
    actionsCell.appendChild(actions);

    [
      numberCell,
      titleCell,
      statusCell,
      conclusionCell,
      actorCell,
      startedCell,
      durationCell,
      actionsCell,
    ].forEach(function (cell) {
      bundle.row.appendChild(cell);
    });

    bundle.logRow = el("tr", "log-row");
    bundle.logRow.dataset.testid = "log-row";
    bundle.logRow.dataset.runId = id;
    bundle.logRow.setAttribute("hidden", "");

    var logCell = el("td", "col-logs");
    logCell.colSpan = 8;
    bundle.logBox = el("div", "logs");
    bundle.logBox.id = "logs-" + id;
    bundle.logBox.dataset.testid = "logs";
    logCell.appendChild(bundle.logBox);
    bundle.logRow.appendChild(logCell);

    return bundle;
  }

  function updateHistoryRow(bundle, run) {
    var id = runIdOf(run);
    var tone = toneForRun(run);
    var number = runNumberOf(run);
    var href = runUrl(run);
    var label = number ? "#" + number : "run " + id;

    bundle.row.className = "run-row is-" + tone;
    bundle.row.dataset.runStatus = runStatusOf(run) || "unknown";

    // Rewritten only when it changes: replacing the anchor on every poll would
    // take focus off it mid-click.
    var numberKey = label + "|" + href;
    if (bundle.numberKey !== numberKey) {
      bundle.numberKey = numberKey;
      bundle.number.replaceChildren(
        href ? link(href, label + " ↗") : document.createTextNode(label),
      );
    }

    var title = runTitleOf(run);
    setText(bundle.title, title);
    bundle.title.title = title;

    var note = runReasonNoteOf(run);
    setText(bundle.reason, note ? "“" + note + "”" : "");
    bundle.reason.title = note;
    show(bundle.reason, Boolean(note));

    bundle.led.className = "led is-" + tone;
    setText(bundle.status, runStatusOf(run) || "unknown");

    setText(bundle.conclusion, conclusionLabel(runConclusionOf(run)) || "—");
    bundle.conclusion.className = "mono tone-" + tone;

    // "unknown" is a real answer here, and the honest one: the token owner
    // GitHub reports is not the requester, so it is not shown as one. The
    // tooltip says where the requester would have come from.
    var requester = runRequesterOf(run);
    setText(bundle.actor, requester || "unknown");
    bundle.actor.classList.toggle("is-unknown", !requester);
    bundle.actor.title = requesterTitle(run);

    var started = runStartedAt(run);
    setText(bundle.started, relativeTime(started) || "—");
    bundle.started.title = absoluteTime(started);

    setText(bundle.duration, durationText(run));

    // Cancel exists only while there is something to cancel. The server
    // answers 409 for a finished run, and a button whose only outcome is an
    // error is worse than no button.
    var busy = Boolean(state.cancelling[id]);
    show(bundle.cancel, isActiveRun(run));
    bundle.cancel.disabled = busy;
    bundle.cancel.textContent = busy ? "Cancelling…" : "Cancel";
    bundle.cancel.setAttribute(
      "aria-label",
      (busy ? "Cancelling " : "Cancel ") + label,
    );
    bundle.logs.setAttribute("aria-label", "Console output for " + label);
  }

  function logEntry(runId) {
    if (!state.logs[runId]) {
      state.logs[runId] = {
        open: false,
        loading: false,
        fetched: false,
        error: "",
        payload: null,
        version: 0,
      };
    }

    return state.logs[runId];
  }

  function paintLogRow(bundle, run) {
    var id = runIdOf(run);
    var entry = state.logs[id];
    var open = Boolean(entry && entry.open);

    show(bundle.logRow, open);
    bundle.logs.setAttribute("aria-expanded", open ? "true" : "false");
    bundle.logs.textContent = open ? "Hide logs" : "Logs";

    if (!open) {
      // Emptied rather than left hidden: a sharded run's logs are hundreds of
      // kilobytes of text, and a closed panel has no business holding them.
      if (bundle.logVersion !== -1) {
        bundle.logBox.replaceChildren();
        bundle.logVersion = -1;
      }
      return;
    }

    // Nothing new to show: leave every node alone, which is what keeps a
    // half-scrolled <pre> where the reader left it.
    if (bundle.logVersion === entry.version) return;

    bundle.logVersion = entry.version;
    bundle.logBox.replaceChildren(logsView(entry, run));

    // The end of a test log is the part worth reading — the failing assertion
    // and the summary. Start there rather than at "npm ci".
    bundle.logBox
      .querySelectorAll('[data-testid="log-output"]')
      .forEach(function (node) {
        node.scrollTop = node.scrollHeight;
      });
  }

  function hasRunningJob(payload) {
    var jobs = payload && Array.isArray(payload.jobs) ? payload.jobs : [];

    return jobs.some(function (job) {
      return firstString(job && job.status).toLowerCase() !== "completed";
    });
  }

  function logsView(entry, run) {
    var fragment = document.createDocumentFragment();
    var id = runIdOf(run);
    // A finished run's logs cannot change, so the refresh is only offered
    // while something is still producing output — or after a failed attempt.
    var refreshable =
      isActiveRun(run) || hasRunningJob(entry.payload) || Boolean(entry.error);

    if (refreshable || entry.loading) {
      var tools = el("div", "log-tools");

      if (refreshable) {
        var refresh = el(
          "button",
          "btn btn-tiny",
          entry.error ? "Try again" : "Refresh logs",
        );
        refresh.type = "button";
        refresh.dataset.testid = "log-refresh";
        refresh.dataset.runId = id;
        refresh.disabled = Boolean(entry.loading);
        tools.appendChild(refresh);
      }

      if (entry.loading) {
        tools.appendChild(
          el(
            "span",
            "log-note",
            entry.payload ? "Refreshing…" : "Fetching logs…",
          ),
        );
      }

      fragment.appendChild(tools);
    }

    if (entry.error) {
      var problem = el("p", "inline-error", entry.error);
      problem.dataset.testid = "logs-error";
      fragment.appendChild(problem);
      return fragment;
    }

    if (!entry.payload) {
      if (!entry.loading) {
        fragment.appendChild(el("p", "empty", "No logs loaded."));
      }
      return fragment;
    }

    var jobs = Array.isArray(entry.payload.jobs) ? entry.payload.jobs : [];

    if (!jobs.length) {
      fragment.appendChild(
        el("p", "empty", "This run has no jobs yet. Try again in a moment."),
      );
      return fragment;
    }

    jobs.forEach(function (job) {
      fragment.appendChild(jobBlock(job));
    });

    return fragment;
  }

  function toneForJob(job) {
    var status = firstString(job && job.status).toLowerCase();
    var conclusion = firstString(job && job.conclusion).toLowerCase();

    if (status !== "completed") return "run";
    if (conclusion === "success") return "ok";
    if (!conclusion) return "warn";
    if (conclusion === "cancelled" || conclusion === "skipped") return "warn";

    return "bad";
  }

  function jobBlock(job) {
    var tone = toneForJob(job);
    var name = firstString(job && job.name) || "job";
    var block = el("div", "job is-" + tone);
    block.dataset.testid = "log-job";

    var head = el("div", "job-head");
    head.appendChild(el("span", "led is-" + tone));

    var nameNode = el("span", "job-name", name);
    nameNode.dataset.testid = "log-job-name";
    head.appendChild(nameNode);

    var status = firstString(job && job.status) || "unknown";
    var conclusion = firstString(job && job.conclusion);
    var stateNode = el(
      "span",
      "job-state",
      conclusion ? status + " · " + conclusion : status,
    );
    stateNode.dataset.testid = "log-job-state";
    head.appendChild(stateNode);

    // Shown because it is true, not hidden because it is inconvenient: someone
    // hunting a failure has to know the head of the log is missing.
    if (job && job.truncated === true) {
      var flag = el("span", "chip tone-warn", "truncated");
      flag.dataset.testid = "log-truncated";
      head.appendChild(flag);
    }

    block.appendChild(head);

    var note = firstString(job && job.note);
    if (note) {
      var noteNode = el("p", "job-note", note);
      noteNode.dataset.testid = "log-note";
      block.appendChild(noteNode);
    }

    var text = job && typeof job.text === "string" ? job.text : "";

    if (text) {
      var output = el("pre", "log");
      output.dataset.testid = "log-output";
      // Focusable so the panel can be scrolled from the keyboard.
      output.tabIndex = 0;
      output.setAttribute("aria-label", "Console output for " + name);
      // textContent, never innerHTML. This is whatever the test run printed:
      // attacker-influenced text as far as this page is concerned.
      output.textContent = text;
      block.appendChild(output);
    } else if (!note) {
      block.appendChild(
        el("p", "job-note", "No console output for this job yet."),
      );
    }

    return block;
  }

  function toggleLogs(runId) {
    var entry = logEntry(runId);
    entry.open = !entry.open;

    repaintLogs(runId);

    // Fetched on first open only. After that the Refresh button is how you ask
    // again, so opening and closing a panel costs nothing.
    if (entry.open && !entry.fetched) loadLogs(runId);
  }

  function repaintLogs(runId) {
    var bundle = rows[runId];
    var run = findRun(runId);

    if (bundle && run) paintLogRow(bundle, run);
  }

  function loadLogs(runId) {
    var entry = logEntry(runId);
    if (entry.loading) return Promise.resolve();

    var epoch = state.epoch;

    entry.loading = true;
    entry.error = "";
    entry.version += 1;
    repaintLogs(runId);

    return api("/api/runs/" + encodeURIComponent(runId) + "/logs").then(
      function (payload) {
        // Console output is the last thing that should reappear after sign-out,
        // and the entry captured above is a detached object once state.logs has
        // been replaced - writing to it would be invisible work at best.
        if (stale(epoch)) return;

        entry.loading = false;
        entry.fetched = true;
        entry.payload = payload;
        entry.version += 1;
        repaintLogs(runId);
      },
      function (error) {
        if (isSessionLoss(error)) {
          handleSessionLoss();
          return;
        }
        if (stale(epoch)) return;

        entry.loading = false;
        // Marked fetched even on failure: Try again is the retry, not every
        // toggle of the panel.
        entry.fetched = true;
        entry.error = error.message;
        entry.version += 1;
        repaintLogs(runId);
      },
    );
  }

  // Cancel is offered on two screens, so the message has to land on the one the
  // click came from: dom.historyStatus is on a hidden tab when the press came
  // from the Dashboard. Same shape as startRun(flowId, origin).
  function cancelRun(runId, origin) {
    if (state.cancelling[runId]) return;

    var run = findRun(runId);
    var label = runLabel(run, runId);
    var epoch = state.epoch;
    // The Quick run card's live region sits directly beside Recent runs in the
    // dashboard grid, so it is already in view from where the click happened.
    var statusNode =
      origin === "dashboard" ? dom.quickStatus : dom.historyStatus;

    state.cancelling[runId] = true;
    if (rows[runId] && run) updateHistoryRow(rows[runId], run);
    paintRecentCancel(runId);

    api("/api/runs/" + encodeURIComponent(runId) + "/cancel", {
      method: "POST",
    })
      .then(
        function (payload) {
          if (stale(epoch)) return;

          setStatus(
            statusNode,
            firstString(payload && payload.message) ||
              "Cancel requested for " +
                label +
                ". GitHub unwinds the run in the background.",
            "ok",
          );
        },
        function (error) {
          if (isSessionLoss(error)) {
            handleSessionLoss();
            return;
          }
          if (stale(epoch)) return;

          setStatus(statusNode, error.message, "bad");
        },
      )
      .then(function () {
        if (stale(epoch)) return null;

        // Refreshed either way: a refusal usually means the run finished while
        // the button was on screen, so the list is the stale part. Both views
        // are refreshed, and only if they have been loaded.
        return refreshRunViews();
      })
      .then(function () {
        if (stale(epoch)) return;

        delete state.cancelling[runId];
        renderHistory();
        if (state.loaded.dashboard) renderDashboard();
        schedulePolling();
      });
  }

  // The Dashboard list is rebuilt wholesale, so renderDashboard() here would
  // take focus off the button being pressed. One button, flipped in place -
  // matched on dataset rather than through a selector built from a server-
  // supplied id.
  function paintRecentCancel(runId) {
    if (!dom.recentRuns) return;

    var id = String(runId);
    var busy = Boolean(state.cancelling[id]);

    dom.recentRuns
      .querySelectorAll('button[data-testid="recent-run-cancel"]')
      .forEach(function (button) {
        if (button.dataset.runId !== id) return;

        button.disabled = busy;
        button.textContent = busy ? "Cancelling…" : "Cancel";
      });
  }

  // Delegated, not per-button: this list is rebuilt with replaceChildren on
  // every render, so a listener on a button would not survive one.
  function onRecentRunsClick(event) {
    var button = event.target.closest("button[data-run-id]");
    if (!button || button.disabled) return;

    if (button.dataset.testid === "recent-run-cancel") {
      cancelRun(button.dataset.runId, "dashboard");
    }
  }

  function onHistoryBodyClick(event) {
    var button = event.target.closest("button[data-run-id]");
    if (!button || button.disabled) return;

    var runId = button.dataset.runId;
    var kind = button.dataset.testid;

    if (kind === "run-cancel") cancelRun(runId);
    if (kind === "run-logs") toggleLogs(runId);
    if (kind === "log-refresh") loadLogs(runId);
  }

  // ──────────────────────────────── users ────────────────────────────────

  function roleOf(user) {
    return firstString(user && user.role) === "admin" ? "admin" : "user";
  }

  // The operator detail, which the server sends only to an administrator. An
  // empty array is the normal case on a healthy runner, and the card is hidden
  // rather than left showing an empty heading.
  //
  // Rendered with textContent, never innerHTML: these strings quote values from
  // the environment, and a value quoted into markup is an injection waiting for
  // the first operator who pastes something odd into an env var.
  function renderConfigDetail() {
    if (!dom.configDetailList) return;

    var details = Array.isArray(state.session && state.session.configDetails)
      ? state.session.configDetails
      : [];

    var fragment = document.createDocumentFragment();

    details.forEach(function (line) {
      var item = document.createElement("li");
      item.textContent = String(line);
      fragment.appendChild(item);
    });

    dom.configDetailList.replaceChildren(fragment);
    show(dom.configDetailCard, details.length > 0);
  }

  function renderUsers() {
    if (!dom.usersBody) return;

    var me = state.session ? firstString(state.session.username) : "";
    var admins = state.users.filter(function (user) {
      return roleOf(user) === "admin";
    }).length;

    setText(
      dom.usersCount,
      countLabel(state.users.length, "account", "accounts"),
    );
    setReadout(dom.usersSignupMode, state.signupMode);
    setReadout(dom.usersInviteCode, state.inviteCodeSet ? "set" : "not set");
    renderConfigDetail();

    var fragment = document.createDocumentFragment();

    state.users.forEach(function (user) {
      fragment.appendChild(userRow(user, me, admins));
    });

    dom.usersBody.replaceChildren(fragment);

    var empty = state.users.length
      ? ""
      : state.loaded.users
        ? "No accounts to show."
        : "Loading accounts…";
    setText(dom.usersEmpty, empty);
    show(dom.usersEmpty, Boolean(empty));
  }

  function userRow(user, me, adminCount) {
    var username = firstString(user && user.username) || "unknown";
    var role = roleOf(user);
    var isSelf = Boolean(me) && username === me;
    var isLastAdmin = role === "admin" && adminCount <= 1;
    // Declared in TR_USERS. The server refuses every write to these accounts
    // with a 409, so the row shows why rather than offering three buttons that
    // all come back as errors.
    var isEnvDefined = Boolean(user && user.envDefined === true);
    var busy = state.userBusy === username;
    var pending = state.pendingDelete === username;

    var row = el("tr", "user-row");
    row.dataset.testid = "user-row";
    row.dataset.username = username;
    if (isSelf) row.classList.add("is-self");

    var nameCell = el("td", "col-user");
    var name = el("span", "mono", username);
    name.dataset.testid = "user-name";
    nameCell.appendChild(name);
    if (isSelf) nameCell.appendChild(el("span", "badge badge-you", "you"));
    if (isEnvDefined) {
      var envBadge = el("span", "badge badge-env", "env");
      envBadge.dataset.testid = "user-env";
      envBadge.title =
        "Defined in the TR_USERS environment variable, so this runner cannot change it.";
      nameCell.appendChild(envBadge);
    }

    var roleCell = el("td", "col-role");
    var roleBadge = el("span", "badge" + (role === "admin" ? " is-admin" : ""));
    roleBadge.dataset.testid = "user-role-value";
    setText(roleBadge, role);
    roleCell.appendChild(roleBadge);

    var createdCell = el("td", "col-created");
    var created = firstString(user && user.createdAt, user && user.created_at);
    var createdNode = el("span", "mono", relativeTime(created) || "—");
    createdNode.dataset.testid = "user-created";
    createdNode.title = absoluteTime(created);
    createdCell.appendChild(createdNode);

    var onlineCell = el("td", "col-online");
    var online = Boolean(user && user.online === true);
    onlineCell.appendChild(
      el("span", "led " + (online ? "is-ok" : "led-idle")),
    );
    // The dot is the quick read; the word is what a screen reader gets, since
    // colour on its own is not a signal.
    var onlineText = el("span", "mono", online ? "online" : "offline");
    onlineText.dataset.testid = "user-online";
    onlineCell.appendChild(onlineText);

    var actionsCell = el("td", "col-actions");
    var actions = el("div", "row-actions");
    var reasons = [];

    // Both of these are the server's rules, and it refuses either way. A
    // disabled button with the reason next to it beats a click that fails.
    if (isSelf) {
      reasons.push(
        "This is your own account — another admin has to change it.",
      );
    }
    if (isLastAdmin) {
      reasons.push("Last remaining admin — promote somebody else first.");
    }
    if (isEnvDefined) {
      reasons.push(
        "Defined in the environment (TR_USERS) — whoever runs this deployment changes it there, then restarts the runner.",
      );
    }

    var locked = isSelf || isLastAdmin || isEnvDefined;

    var roleButton = el(
      "button",
      "btn btn-tiny",
      role === "admin" ? "Demote" : "Promote",
    );
    roleButton.type = "button";
    roleButton.dataset.testid = "user-role";
    roleButton.dataset.username = username;
    roleButton.dataset.nextRole = role === "admin" ? "user" : "admin";
    roleButton.disabled = busy || locked;
    roleButton.setAttribute(
      "aria-label",
      (role === "admin" ? "Demote " : "Promote ") + username,
    );
    if (locked) roleButton.title = reasons.join(" ");
    actions.appendChild(roleButton);

    var passwordButton = el("button", "btn btn-tiny", "Reset password");
    passwordButton.type = "button";
    passwordButton.dataset.testid = "user-password";
    passwordButton.dataset.username = username;
    // Resetting your own password locks nobody out, and the server allows it -
    // so `locked` is not the condition here. An env account is the exception:
    // its password lives in the environment.
    passwordButton.disabled = busy || isEnvDefined;
    passwordButton.setAttribute("aria-label", "Reset password for " + username);
    if (isEnvDefined) passwordButton.title = reasons.join(" ");
    actions.appendChild(passwordButton);

    var deleteButton = el(
      "button",
      "btn btn-tiny btn-danger",
      pending ? "Confirm delete" : "Delete",
    );
    deleteButton.type = "button";
    deleteButton.dataset.testid = "user-delete";
    deleteButton.dataset.username = username;
    deleteButton.disabled = busy || locked;
    deleteButton.setAttribute(
      "aria-label",
      (pending ? "Confirm deleting " : "Delete ") + username,
    );
    if (locked) deleteButton.title = reasons.join(" ");
    if (pending) deleteButton.classList.add("is-armed");
    actions.appendChild(deleteButton);

    if (pending) {
      var keepButton = el("button", "btn btn-tiny", "Keep");
      keepButton.type = "button";
      keepButton.dataset.testid = "user-delete-cancel";
      keepButton.dataset.username = username;
      keepButton.setAttribute("aria-label", "Keep " + username);
      actions.appendChild(keepButton);
    }

    if (busy && state.userBusyLabel) {
      actions.appendChild(el("span", "row-note", state.userBusyLabel));
    }

    actionsCell.appendChild(actions);

    [nameCell, roleCell, createdCell, onlineCell, actionsCell].forEach(
      function (cell) {
        row.appendChild(cell);
      },
    );

    if (!reasons.length) return row;

    // A sentence does not belong in a control column. It used to be appended to
    // the actions cell, which is shrink-to-fit: the cell's min-content width
    // became one word of this prose, the column collapsed to about 70px, the
    // three buttons stacked, and the note wrapped down some thirty lines. A
    // full-width sub-row under the account is where it reads, and it leaves the
    // actions column free to be as wide as its buttons.
    //
    // renderUsers appends whatever this returns, so a fragment holding both
    // rows needs no change there - but anything else that ever calls userRow
    // must stop expecting a single <tr>.
    var note = el("p", "deny-note", reasons.join(" "));
    note.dataset.testid = "user-note";

    // The two rows read as one unit, so the line between them comes off.
    row.classList.add("has-note");

    var noteRow = el("tr", "user-note-row");
    noteRow.dataset.username = username;
    if (isSelf) noteRow.classList.add("is-self");

    var noteCell = el("td");
    noteCell.colSpan = 5;
    noteCell.appendChild(note);
    noteRow.appendChild(noteCell);

    var pair = document.createDocumentFragment();
    pair.appendChild(row);
    pair.appendChild(noteRow);

    return pair;
  }

  function focusUserButton(username, testid) {
    if (!dom.usersBody) return;

    var button = dom.usersBody.querySelector(
      '[data-testid="' +
        testid +
        '"][data-username="' +
        cssEscape(username) +
        '"]',
    );

    if (button && !button.disabled) button.focus();
  }

  // Usernames are already restricted to letters, digits, dot, underscore, at
  // and hyphen, but this value ends up in a selector, so escape it rather than
  // trusting that restriction to stay exactly as it is.
  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, "\\$&");
  }

  function onUsersBodyClick(event) {
    var button = event.target.closest("button[data-username]");
    if (!button || button.disabled) return;

    var username = button.dataset.username;
    var kind = button.dataset.testid;

    if (kind === "user-role") {
      setUserRole(username, button.dataset.nextRole);
      return;
    }

    if (kind === "user-password") {
      resetUserPassword(username);
      return;
    }

    if (kind === "user-delete-cancel") {
      state.pendingDelete = "";
      setStatus(dom.usersStatus, "");
      renderUsers();
      focusUserButton(username, "user-delete");
      return;
    }

    if (kind === "user-delete") {
      // Two clicks rather than a browser dialog: the confirm step stays in the
      // row it belongs to, where a keyboard, a screen reader and a test can
      // all see it.
      if (state.pendingDelete !== username) {
        state.pendingDelete = username;
        setStatus(
          dom.usersStatus,
          "Deleting " +
            username +
            " removes the account and signs them out. Press Confirm delete " +
            "to go ahead.",
          "warn",
        );
        renderUsers();
        focusUserButton(username, "user-delete");
        return;
      }

      deleteUser(username);
    }
  }

  function beginUserAction(username, label) {
    state.userBusy = username;
    state.userBusyLabel = label;
    renderUsers();
  }

  function endUserAction() {
    state.userBusy = "";
    state.userBusyLabel = "";

    if (state.screen !== "runner") return Promise.resolve();

    return loadUsers({ quiet: true });
  }

  function setUserRole(username, nextRole) {
    if (state.userBusy) return;

    var epoch = state.epoch;

    beginUserAction(
      username,
      nextRole === "admin" ? "Promoting…" : "Demoting…",
    );

    api("/api/users/" + encodeURIComponent(username), {
      method: "PATCH",
      body: { role: nextRole },
    })
      .then(
        function (payload) {
          if (stale(epoch)) return;

          setStatus(
            dom.usersStatus,
            firstString(payload && payload.message) ||
              username + " is now " + nextRole + ".",
            "ok",
          );
        },
        function (error) {
          if (isSessionLoss(error)) {
            handleSessionLoss();
            return;
          }
          if (stale(epoch)) return;

          setStatus(dom.usersStatus, error.message, "bad");
        },
      )
      .then(endUserAction);
  }

  function resetUserPassword(username) {
    if (state.userBusy) return;

    // window.prompt is the honest tool for this: the value is used once, in one
    // request. It never lands in state, in storage, or in a form field a
    // browser would offer to remember.
    var password = window.prompt("New password for " + username + ":", "");

    if (password === null) return; // cancelled

    if (password === "") {
      setStatus(
        dom.usersStatus,
        "No password entered. Nothing changed.",
        "warn",
      );
      return;
    }

    var epoch = state.epoch;

    beginUserAction(username, "Resetting…");

    api("/api/users/" + encodeURIComponent(username) + "/password", {
      method: "POST",
      // Sent exactly as typed. Leading and trailing spaces are legal in a
      // passphrase, and trimming one away here would lock somebody out.
      body: { password: password },
    })
      .then(
        function (payload) {
          if (stale(epoch)) return;

          setStatus(
            dom.usersStatus,
            firstString(payload && payload.message) ||
              "Password reset for " +
                username +
                ". Pass it on somewhere other than this page.",
            "ok",
          );
        },
        function (error) {
          if (isSessionLoss(error)) {
            handleSessionLoss();
            return;
          }
          if (stale(epoch)) return;

          setStatus(dom.usersStatus, error.message, "bad");
        },
      )
      .then(endUserAction);
  }

  function deleteUser(username) {
    if (state.userBusy) return;

    var epoch = state.epoch;

    beginUserAction(username, "Deleting…");

    api("/api/users/" + encodeURIComponent(username), { method: "DELETE" })
      .then(
        function (payload) {
          if (stale(epoch)) return;

          state.pendingDelete = "";
          setStatus(
            dom.usersStatus,
            firstString(payload && payload.message) ||
              username + " has been deleted.",
            "ok",
          );
        },
        function (error) {
          if (isSessionLoss(error)) {
            handleSessionLoss();
            return;
          }
          if (stale(epoch)) return;

          setStatus(dom.usersStatus, error.message, "bad");
        },
      )
      .then(endUserAction);
  }

  // ────────────────────────────── polling ──────────────────────────────

  function pollingWanted() {
    if (state.screen !== "runner") return false;
    // History and the Dashboard both show live run state, and both offer
    // Cancel, so both are allowed to spend requests keeping themselves fresh.
    // A Cancel on a row that never refreshes is a lie: GitHub unwinds the run
    // asynchronously, so without a tick the row keeps offering a button whose
    // second press is a 409. Every other tab is static and must not poll.
    if (state.tab !== "history" && state.tab !== "dashboard") return false;
    if (document.hidden) return false;
    if (state.pollCycles >= MAX_POLL_CYCLES) return false;
    if (state.pollFailures >= MAX_POLL_FAILURES) return false;

    if (
      state.awaitingRunSince &&
      Date.now() - state.awaitingRunSince < AWAIT_RUN_MS
    ) {
      return true;
    }

    // Not state.runs directly: on the Dashboard of a session that has never
    // opened History that array is empty, and the five recent rows are the only
    // thing that knows a run is still going.
    return activeRunCount() > 0;
  }

  function stopPolling() {
    if (state.pollTimer) {
      window.clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
    show(dom.historyPolling, false);
  }

  function schedulePolling() {
    stopPolling();

    if (!pollingWanted()) return;

    // The indicator lives inside the History card, so it is only shown there
    // even though the Dashboard polls on the same budget.
    show(dom.historyPolling, state.tab === "history");
    state.pollTimer = window.setTimeout(function () {
      state.pollTimer = null;
      state.pollCycles += 1;

      // One request per tick either way: refresh whichever view is on screen.
      var tick =
        state.tab === "dashboard"
          ? loadDashboard({ quiet: true })
          : loadRuns({ quiet: true });

      tick.then(function () {
        schedulePolling();
      });
    }, POLL_MS);
  }

  // Counters reset on anything that means "the operator is watching again".
  function resetPollBudget() {
    state.pollCycles = 0;
    state.pollFailures = 0;
  }

  // ─────────────────────────────── loading ───────────────────────────────

  function loadSession() {
    return api("/api/session").then(function (payload) {
      state.session = payload || {};
      return state.session;
    });
  }

  function loadDashboard(options) {
    var quiet = Boolean(options && options.quiet);
    var epoch = state.epoch;

    return api("/api/dashboard").then(
      function (payload) {
        if (stale(epoch)) return;

        state.dashboard = payload || null;
        state.dispatch = (payload && payload.dispatch) || state.dispatch;
        state.loaded.dashboard = true;

        // A 200 is not the same as good news. getStats() puts its diagnosis in
        // stats.error and fills the counters with zeros, and this handler used
        // to clear the error region and render them - so a rate limit or a
        // wrong TR_REPO produced a confident, empty dashboard while the History
        // tab reported the same failure honestly.
        var stats = payload ? payload.stats : null;

        setText(dom.dashboardError, firstString(stats && stats.error));
        renderDispatch();
        renderDashboard();
      },
      function (error) {
        if (isSessionLoss(error)) {
          handleSessionLoss();
          return;
        }
        if (stale(epoch)) return;

        // A failed refresh leaves the last good numbers on screen; only the
        // message is new.
        setText(dom.dashboardError, error.message);
        if (!quiet) renderDashboard();
      },
    );
  }

  function loadFlows(options) {
    var quiet = Boolean(options && options.quiet);
    var epoch = state.epoch;

    return api("/api/flows").then(
      function (payload) {
        if (stale(epoch)) return;

        state.flows = Array.isArray(payload.flows) ? payload.flows : [];
        state.totals = payload.totals || null;
        state.source = firstString(payload.source);
        state.dispatch = payload.dispatch || null;
        state.flowsError = firstString(payload.error);
        state.loaded.flows = true;

        renderDispatch();
        renderFlows();
        renderQuickRuns();
        setFlowsError(state.flowsError);
      },
      function (error) {
        if (isSessionLoss(error)) {
          handleSessionLoss();
          return;
        }
        if (stale(epoch)) return;

        // Quiet means "do not throw away a catalog we already have" - it never
        // meant "say nothing". The Dashboard loads the catalog quietly, and a
        // quiet failure used to leave loaded.flows false with nothing
        // re-rendered, so the Quick run panel sat on "Loading the catalog…"
        // indefinitely: no error, no retry, no way to tell it apart from a slow
        // request. Now the rows either stay or the panel explains itself.
        if (!quiet) state.flows = [];

        state.flowsError = error.message;

        renderFlows();
        renderQuickRuns();
        setFlowsError(state.flowsError);
      },
    );
  }

  function setFlowsError(message) {
    setText(dom.flowsError, message || "");
    show(dom.flowsError, Boolean(message));
  }

  function loadRuns(options) {
    var quiet = Boolean(options && options.quiet);
    var epoch = state.epoch;

    return api("/api/runs?limit=" + HISTORY_LIMIT).then(
      function (payload) {
        // The response that made sign-out leak: a poll tick or a Refresh landing
        // after resetRunnerState() refilled state.runs and set loaded.history,
        // and the next person to sign in saw the previous session's runs as
        // current until somebody pressed Refresh.
        if (stale(epoch)) return;

        var runs = Array.isArray(payload.runs) ? payload.runs : [];

        state.runs = runs;
        state.pollFailures = 0;
        state.loaded.history = true;

        // Once a real run shows up (or the list settles), the grace period for
        // a just-dispatched run has done its job.
        if (state.awaitingRunSince && runs.some(isActiveRun)) {
          state.awaitingRunSince = 0;
        }

        renderHistory();
      },
      function (error) {
        if (isSessionLoss(error)) {
          handleSessionLoss();
          return;
        }
        if (stale(epoch)) return;

        state.pollFailures += 1;

        // A background refresh that fails should not wipe the last good list;
        // say so once we have stopped trying, and stay quiet before that.
        if (!quiet) {
          setStatus(dom.historyStatus, error.message, "bad");
        } else if (state.pollFailures >= MAX_POLL_FAILURES) {
          setStatus(
            dom.historyStatus,
            "Auto-refresh stopped: " + error.message + " Use Refresh to retry.",
            "bad",
          );
        }
      },
    );
  }

  function loadUsers(options) {
    var quiet = Boolean(options && options.quiet);
    var epoch = state.epoch;

    if (state.screen !== "runner") return Promise.resolve();

    return api("/api/users").then(
      function (payload) {
        // Usernames and who is online are the most sensitive thing this page
        // renders, so a response from a session that has ended is dropped like
        // any other - it must never repaint the table after sign-out.
        if (stale(epoch)) return;

        state.users = Array.isArray(payload.users) ? payload.users : [];
        state.signupMode = firstString(payload.signupMode);
        state.inviteCodeSet = payload.inviteCodeSet === true;
        state.loaded.users = true;

        setText(dom.usersError, "");
        renderUsers();
      },
      function (error) {
        if (isSessionLoss(error)) {
          handleSessionLoss();
          return;
        }
        if (stale(epoch)) return;

        // A 403 here means this account was demoted since sign-in. The
        // server's own wording explains that better than a guess would.
        setText(dom.usersError, error.message);
        if (!quiet) renderUsers();
      },
    );
  }

  function renderDispatch() {
    var dispatch = state.dispatch || {};

    setReadout(dom.dispatchRepo, firstString(dispatch.repo));
    setReadout(dom.dispatchRef, firstString(dispatch.ref));
    setReadout(dom.dispatchWorkflow, firstString(dispatch.workflowFile));
    setReadout(dom.flowsSource, state.source);

    var reasons = Array.isArray(dispatch.reasons) ? dispatch.reasons : [];
    var blocked = dispatchBlocked();

    show(dom.dispatchBanner, blocked);

    if (!blocked) {
      if (dom.dispatchReasons) dom.dispatchReasons.replaceChildren();
    } else {
      var list = document.createDocumentFragment();

      if (!reasons.length) {
        list.appendChild(
          el("li", null, "The server did not say why. Check its logs."),
        );
      } else {
        reasons.forEach(function (reason) {
          list.appendChild(el("li", null, String(reason)));
        });
      }

      dom.dispatchReasons.replaceChildren(list);
    }

    // The Run buttons have to agree with the banner the moment it appears.
    paintRunButtons();
  }

  function renderSession() {
    var session = state.session || {};

    setText(dom.sessionUsername, firstString(session.username) || "unknown");

    var role = firstString(session.role) || "user";
    setText(dom.sessionRole, role);
    if (dom.sessionRole) {
      dom.sessionRole.classList.toggle("is-admin", role === "admin");
    }

    var hours = Number(session.sessionHours);
    setText(
      dom.footerSession,
      Number.isFinite(hours) && hours > 0
        ? "Session length: " + hours + "h of inactivity"
        : "Session length: set by the server",
    );
  }

  // Called after a successful login or signup, and on boot when the cookie is
  // already valid.
  function enterRunner() {
    return loadSession().then(function (session) {
      if (!session || !session.authenticated) {
        renderAuth();
        showScreen("auth");
        setText(
          dom.authNote,
          "The server did not accept that session. Try signing in again.",
        );
        return null;
      }

      renderSession();
      renderTabs();
      resetPollBudget();
      showScreen("runner");

      // Restored last, so a refresh lands on the tab you were reading. A
      // stored "users" from an earlier admin session falls back to Dashboard,
      // because setTab only accepts a tab this role actually has.
      setTab(storedTab() || "dashboard");

      return null;
    });
  }

  // ─────────────────────────────── events ───────────────────────────────

  function wire() {
    dom.tabSignin.addEventListener("click", function () {
      setAuthTab("signin");
    });
    dom.tabSignup.addEventListener("click", function () {
      setAuthTab("signup");
    });
    dom.signinForm.addEventListener("submit", onSignin);
    dom.signupForm.addEventListener("submit", onSignup);
    dom.signout.addEventListener("click", onSignout);

    // Both toggles are static markup, so one pass at startup is enough: no
    // delegation, and no re-wiring when showScreen swaps a screen.
    [dom.themeToggle, dom.themeToggleAuth].forEach(function (button) {
      if (button) button.addEventListener("click", cycleTheme);
    });

    dom.tabbar.addEventListener("click", onTabbarClick);
    dom.tabbar.addEventListener("keydown", onTabbarKeydown);

    dom.dashboardRefresh.addEventListener("click", function () {
      submitting(dom.dashboardRefresh, true, "…");
      Promise.all([
        loadDashboard({ quiet: false }),
        loadFlows({ quiet: true }),
      ]).then(function () {
        submitting(dom.dashboardRefresh, false);
      });
    });

    dom.quickRuns.addEventListener("click", onQuickRunClick);
    dom.recentRuns.addEventListener("click", onRecentRunsClick);

    // The options form exists for labels, autofill and Enter handling; there
    // is nothing to submit, and an accidental Enter must not reload the page.
    dom.optionsForm.addEventListener("submit", function (event) {
      event.preventDefault();
    });
    dom.optionsForm.addEventListener("change", persistOptions);
    dom.targetUrl.addEventListener("blur", persistOptions);
    dom.reason.addEventListener("input", updateReasonCount);
    dom.optionsReset.addEventListener("click", resetOptions);

    dom.flowsRefresh.addEventListener("click", function () {
      submitting(dom.flowsRefresh, true, "…");
      loadFlows({ quiet: false }).then(function () {
        submitting(dom.flowsRefresh, false);
      });
    });

    dom.flowFilter.addEventListener("input", function (event) {
      state.filter = event.target.value;
      renderFlows();
    });
    dom.flowFilter.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !event.target.value) return;
      event.target.value = "";
      state.filter = "";
      renderFlows();
    });

    dom.flowList.addEventListener("click", onFlowListClick);

    dom.historyFilter.addEventListener("change", function (event) {
      state.historyFilter = event.target.value;
      renderHistory();
    });

    dom.historyRefresh.addEventListener("click", function () {
      submitting(dom.historyRefresh, true, "…");
      resetPollBudget();
      loadRuns({ quiet: false }).then(function () {
        submitting(dom.historyRefresh, false);
        schedulePolling();
      });
    });

    dom.historyBody.addEventListener("click", onHistoryBodyClick);

    dom.usersRefresh.addEventListener("click", function () {
      submitting(dom.usersRefresh, true, "…");
      state.pendingDelete = "";
      loadUsers({ quiet: false }).then(function () {
        submitting(dom.usersRefresh, false);
      });
    });

    dom.usersBody.addEventListener("click", onUsersBodyClick);

    // A background tab must not keep hammering the API. Re-check on the way
    // back so a returning operator gets a fresh list immediately.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopPolling();
        return;
      }

      if (state.screen !== "runner") return;

      resetPollBudget();

      if (state.tab !== "history" && state.tab !== "dashboard") {
        schedulePolling();
        return;
      }

      var back =
        state.tab === "dashboard"
          ? loadDashboard({ quiet: true })
          : loadRuns({ quiet: true });

      back.then(function () {
        schedulePolling();
      });
    });

    dom.bootRetry.addEventListener("click", boot);

    // Timers survive a page-hide on some browsers; make the intent explicit.
    window.addEventListener("pagehide", stopPolling);
  }

  // ──────────────────────────────── boot ────────────────────────────────

  function boot() {
    show(dom.bootFault, false);
    setText(dom.bootMessage, "Establishing session…");
    showScreen("boot");

    loadSession()
      .then(function (session) {
        if (session && session.authenticated) return enterRunner();

        renderAuth();
        showScreen("auth");
        if (dom.signinUsername) dom.signinUsername.focus();
        return null;
      })
      .catch(function (error) {
        // Boot is the one place with nothing to fall back to: no session, no
        // catalog, nothing on screen. Say what happened and offer a retry.
        showScreen("boot");
        setText(dom.bootMessage, "Could not start.");
        setText(dom.bootError, error.message);
        show(dom.bootFault, true);
      });
  }

  wire();
  // The attribute was set before this file finished parsing; the buttons could
  // not be, because they had not been reached yet.
  paintTheme(themeMode);
  restoreOptions();
  updateReasonCount();
  boot();
})();
