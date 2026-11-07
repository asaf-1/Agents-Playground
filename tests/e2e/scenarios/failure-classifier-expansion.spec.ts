/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  test,
} from "../../../framework/fixtures/resultBlock";
/** The classifier under test: it names the kind of a failure from its signals. */
import { FailureClassifier } from "../../../framework/agents/diagnosis/FailureClassifier";

/**
 * Each failure signal lands in its own category. No page or server: the
 * classifier is given the signals directly.
 */
test("classifies the new auth, modal, navigation, timeout, empty-state, delayed-data, and RBAC branches", async () => {
  expected(
    "auth-or-session, permissions-or-rbac, ui-modal-not-opened, ui-route-or-navigation, api-timeout, ui-empty-state, ui-delayed-data, api-server-error",
  );
  const classifier = new FailureClassifier();

  // A 401 that says the session expired.
  expect(
    classifier.classify({
      errorMessage:
        "Session expired and login required before the route can continue.",
      responseStatus: 401,
    }).category,
  ).toBe("auth-or-session");

  // A 403 that says RBAC refused it.
  expect(
    classifier.classify({
      errorMessage: "Permission denied by RBAC policy for this action.",
      responseStatus: 403,
    }).category,
  ).toBe("permissions-or-rbac");

  // A modal that was expected and isn't there.
  expect(
    classifier.classify({
      errorMessage: "Invite modal did not open after the trigger click.",
      modalExpected: true,
      modalVisible: false,
    }).category,
  ).toBe("ui-modal-not-opened");

  // A page that stayed on the wrong URL.
  expect(
    classifier.classify({
      actualUrl: "http://127.0.0.1:4173/",
      errorMessage:
        "Navigation failed because the page stayed on the same route.",
      expectedUrl: "http://127.0.0.1:4173/dashboard",
    }).category,
  ).toBe("ui-route-or-navigation");

  // A 503 timeout from the orders API.
  expect(
    classifier.classify({
      errorMessage: "Orders upstream timeout on the first attempt.",
      requestUrl: "/api/orders",
      responseBody: {
        code: "ORDERS_UPSTREAM_TIMEOUT",
        message: "Orders API timed out on the first request.",
      },
      responseStatus: 503,
      timedOut: true,
    }).category,
  ).toBe("api-timeout");

  // An empty list.
  expect(
    classifier.classify({
      emptyStateDetected: true,
      emptyStateText: "No users found.",
    }).category,
  ).toBe("ui-empty-state");

  // Data that showed up late, after the spinner.
  expect(
    classifier.classify({
      activeRequests: 0,
      delayedDataVisible: true,
      errorMessage:
        "The dashboard widget rendered late after the spinner cleared.",
      spinnerVisible: true,
    }).category,
  ).toBe("ui-delayed-data");

  // A plain 502 with nothing more specific.
  expect(
    classifier.classify({
      errorMessage: "Gateway exploded without a typed mismatch signal.",
      responseStatus: 502,
    }).category,
  ).toBe("api-server-error");
});
