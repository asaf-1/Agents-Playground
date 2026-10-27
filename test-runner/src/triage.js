// Failure triage: which kind of problem a failed test looks like, read from the
// one thing the results file always carries - the error message.
//
// The category names are FailureClassifier's, word for word
// (framework/agents/diagnosis/FailureClassifier.ts), so a failure is called the
// same thing here, in the framework's healing notes and in an interview. That
// classifier cannot be imported: it is TypeScript inside the main repository,
// and this app is plain JavaScript built from test-runner/ alone. It also reads
// signals this app never sees (a live page, a spinner, a response body), so the
// rules below are the message-only half of it, kept deliberately plain: one
// ordered list of patterns, first match wins, no model and no guessing beyond
// what the text says.

// Ordered as the rules below are tried. `meaning` and `fix` are written for a
// person reading a failure, and double as the category notes the "similar
// known problems" search ranks (knowledge.js).
const CATEGORIES = [
  {
    id: "auth-or-session",
    label: "Signed out or session lost",
    tone: "warn",
    meaning:
      "The request or page needed a signed-in user and did not have one: the session expired, the cookie was not sent, or the log-in step failed first.",
    fix: "Check the sign-in step and the stored session the test starts from. A 401 after a server restart is expected: sessions live in memory.",
    keywords:
      "401 unauthorized unauthenticated login sign in session expired cookie token storage state",
  },
  {
    id: "permissions-or-rbac",
    label: "Permissions",
    tone: "bad",
    meaning:
      "The user was signed in but the role check went the wrong way: a 403 where access was expected, or a success where it should have been refused.",
    fix: "Compare what the role should be allowed to do with what the server answered. A success where a 403 was expected is a server-side permission gap, not a test problem.",
    keywords:
      "403 forbidden permission role rbac admin editor viewer allowed refused access control scope",
  },
  {
    id: "api-timeout",
    label: "API timed out",
    tone: "warn",
    meaning:
      "A request, or a wait for one, ran out of time before the server answered.",
    fix: "Look for a slow or stuck endpoint, or a wait for a response the page never sends. A cold free-tier server can take most of a minute on its first request.",
    keywords:
      "timeout exceeded waitforresponse request response api slow hang econnreset socket",
  },
  {
    id: "api-contract-drift",
    label: "API shape changed",
    tone: "bad",
    meaning:
      "The response arrived but its shape is not the agreed one: a field renamed, missing, or of a different type.",
    fix: "Compare the response with the OpenAPI document or the contract test. A number arriving as a string is the classic case.",
    keywords:
      "schema contract openapi tomatchobject toHaveProperty type number string field missing renamed drift",
  },
  {
    id: "api-server-error",
    label: "Server error (5xx)",
    tone: "bad",
    meaning: "The server failed while handling the request: a 5xx answer.",
    fix: "Read the server log for the request. A 500 is never the test's fault; a 502 or 503 is usually the host restarting.",
    keywords:
      "500 502 503 504 internal server error crash exception unavailable",
  },
  {
    id: "api-client-error",
    label: "Request refused (4xx)",
    tone: "warn",
    meaning:
      "The server rejected the request as invalid: a 400, 404, 409 or 422.",
    fix: "Check the data the test sent and that the record still exists. A 409 is a conflict, often state left over from another test.",
    keywords:
      "400 404 409 422 bad request not found conflict validation invalid unprocessable",
  },
  {
    id: "ui-modal-not-opened",
    label: "Dialog did not open",
    tone: "warn",
    meaning: "A dialog or modal the test expected never appeared.",
    fix: "Check the button that opens it and anything that could block the click, such as an overlay or a disabled state.",
    keywords: "dialog modal popup confirm sheet overlay open",
  },
  {
    id: "ui-route-or-navigation",
    label: "Wrong page",
    tone: "warn",
    meaning:
      "The browser ended up somewhere other than expected, or a page failed to load.",
    fix: "Look for a redirect: to the log-in page when the session is gone, or to an error page. Compare the expected and received URL.",
    keywords: "tohaveurl url navigation goto redirect route page net err",
  },
  {
    id: "ui-missing-locator",
    label: "Element not found",
    tone: "warn",
    meaning:
      "The test could not find the element it wanted: the selector no longer matches, or matches more than one thing.",
    fix: "Check whether the page changed (a renamed button or test id) or whether two elements now match. This is the case self-healing locators exist for.",
    keywords:
      "locator selector getbytestid getbyrole getbytext strict mode violation element not found waiting for click",
  },
  {
    id: "ui-empty-state",
    label: "List came back empty",
    tone: "warn",
    meaning:
      "A list or table the test counted had no rows, or fewer than expected.",
    fix: "Check the data the test relies on was created first, and that nothing cleared it.",
    keywords: "tohavecount count empty zero rows list table no results",
  },
  {
    id: "ui-delayed-data",
    label: "Data arrived late or stale",
    tone: "warn",
    meaning:
      "The page showed old or partial text when the test read it: the data had not arrived or was not refreshed.",
    fix: "Wait for the data the assertion needs rather than a fixed time, and look for a cache that is not refreshed after a change.",
    keywords:
      "tohavetext tocontaintext text stale old value balance refresh cache late",
  },
  {
    id: "ui-loading-or-network",
    label: "Page never settled",
    tone: "warn",
    meaning:
      "The test ran out of time while the page was still loading or waiting on the network.",
    fix: "Look for a request that never finished or a spinner that never cleared. A whole-test timeout often hides one slow call.",
    keywords:
      "test timeout exceeded loading spinner network idle pending load slow",
  },
  {
    id: "ui-contract-or-render",
    label: "Page rendered wrong",
    tone: "warn",
    meaning:
      "The page loaded but something on it is not as expected: hidden, misplaced, or different from the saved picture.",
    fix: "Compare with the screenshot or the page contract. A visual difference may be a real change that needs a new baseline.",
    keywords:
      "tobevisible visible hidden screenshot snapshot render layout heading",
  },
  {
    id: "unknown",
    label: "Unclassified",
    tone: "mute",
    meaning: "The message does not match any known pattern.",
    fix: "Read the full error on the run page and the trace in the HTML report.",
    keywords: "",
  },
];

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

// "Expected: 200 / Received: 500" in either Playwright layout, numbers only.
function statusPair(text) {
  const expected = text.match(/Expected[^:\n]*:\s*"?(\d{3})\b/);
  const received = text.match(/Received[^:\n]*:\s*"?(\d{3})\b/);

  return {
    expected: expected ? Number(expected[1]) : null,
    received: received ? Number(received[1]) : null,
  };
}

function isStatus(code) {
  return Number.isInteger(code) && code >= 100 && code <= 599;
}

// One message in, one category id out. First match wins, so the order below is
// the order of confidence: an HTTP status says more than the word "timeout".
function classify(message) {
  const text = typeof message === "string" ? message : "";
  const lower = text.toLowerCase();

  if (!text.trim()) return "unknown";

  const { expected, received } = statusPair(text);

  if (isStatus(expected) && isStatus(received) && expected !== received) {
    if (expected === 401 || received === 401) return "auth-or-session";
    if (expected === 403 || received === 403) return "permissions-or-rbac";
    if (received >= 500) return "api-server-error";
    if (received >= 400) return "api-client-error";
  }

  // A bare number is only a status when something says so: "1,500.00" in a
  // balance assertion contains 500 and is not a server error.
  if (
    /unauthori[sz]ed|session expired|login required|(status|http|code)\D{0,12}401\b/.test(
      lower,
    )
  ) {
    return "auth-or-session";
  }
  if (
    /forbidden|permission denied|(status|http|code)\D{0,12}403\b/.test(lower)
  ) {
    return "permissions-or-rbac";
  }
  if (
    /internal server error|bad gateway|service unavailable|(status|http|code)\D{0,12}50[0-4]\b/.test(
      lower,
    )
  ) {
    return "api-server-error";
  }
  if (
    /waitforresponse|apirequestcontext|request\.(get|post|put|patch|delete)/.test(
      lower,
    ) &&
    /timeout|timed out/.test(lower)
  ) {
    return "api-timeout";
  }
  if (/tomatchobject|toHaveProperty|schema|contract|any<\w+>/i.test(text)) {
    return "api-contract-drift";
  }
  if (/dialog|modal/.test(lower)) return "ui-modal-not-opened";
  if (/tohaveurl|page\.goto|net::err|navigat/.test(lower)) {
    return "ui-route-or-navigation";
  }
  if (
    /strict mode violation|waiting for (locator|getby)|locator\.\w+: (timeout|error)|element\(s\) not found|resolved to 0 elements/.test(
      lower,
    )
  ) {
    return "ui-missing-locator";
  }
  if (/tohavecount/.test(lower) && /received:?\s*0\b/.test(lower)) {
    return "ui-empty-state";
  }
  if (/tohavetext|tocontaintext|tohavevalue/.test(lower)) {
    return "ui-delayed-data";
  }
  if (/test timeout|timeout \d+ms exceeded|timed out/.test(lower)) {
    return "ui-loading-or-network";
  }
  if (/tobevisible|tohavescreenshot|snapshot/.test(lower)) {
    return "ui-contract-or-render";
  }

  return "unknown";
}

function categoryOf(id) {
  return BY_ID.get(id) || BY_ID.get("unknown");
}

module.exports = { CATEGORIES, classify, categoryOf };
