import { expect, test } from "@playwright/test";
import { FailureClassifier } from "../../../framework/agents/diagnosis/FailureClassifier";

test("classifies the new auth, modal, navigation, timeout, empty-state, delayed-data, and RBAC branches", async () => {
  const classifier = new FailureClassifier();

  expect(
    classifier.classify({
      errorMessage: "Session expired and login required before the route can continue.",
      responseStatus: 401
    }).category
  ).toBe("auth-or-session");

  expect(
    classifier.classify({
      errorMessage: "Permission denied by RBAC policy for this action.",
      responseStatus: 403
    }).category
  ).toBe("permissions-or-rbac");

  expect(
    classifier.classify({
      errorMessage: "Invite modal did not open after the trigger click.",
      modalExpected: true,
      modalVisible: false
    }).category
  ).toBe("ui-modal-not-opened");

  expect(
    classifier.classify({
      actualUrl: "http://127.0.0.1:4173/",
      errorMessage: "Navigation failed because the page stayed on the same route.",
      expectedUrl: "http://127.0.0.1:4173/dashboard"
    }).category
  ).toBe("ui-route-or-navigation");

  expect(
    classifier.classify({
      errorMessage: "Orders upstream timeout on the first attempt.",
      requestUrl: "/api/orders",
      responseBody: {
        code: "ORDERS_UPSTREAM_TIMEOUT",
        message: "Orders API timed out on the first request."
      },
      responseStatus: 503,
      timedOut: true
    }).category
  ).toBe("api-timeout");

  expect(
    classifier.classify({
      emptyStateDetected: true,
      emptyStateText: "No users found."
    }).category
  ).toBe("ui-empty-state");

  expect(
    classifier.classify({
      activeRequests: 0,
      delayedDataVisible: true,
      errorMessage: "The dashboard widget rendered late after the spinner cleared.",
      spinnerVisible: true
    }).category
  ).toBe("ui-delayed-data");

  expect(
    classifier.classify({
      errorMessage: "Gateway exploded without a typed mismatch signal.",
      responseStatus: 502
    }).category
  ).toBe("api-server-error");
});
