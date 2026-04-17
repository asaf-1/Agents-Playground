import type { FailureClassification, FailureSignalInput } from "./types";

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: unknown) {
  return String(value || "").toLowerCase();
}

export class FailureClassifier {
  classify(input: FailureSignalInput): FailureClassification {
    const message = input.errorMessage || "";
    const messageLower = normalizeText(message);
    const requestUrl = input.requestUrl || "";
    const responseBody = isObject(input.responseBody) ? input.responseBody : {};
    const parsedProblem = isObject(responseBody.problem) ? responseBody.problem : {};
    const responseCode = normalizeText((responseBody as Record<string, unknown>).code);
    const responseMessage = normalizeText((responseBody as Record<string, unknown>).message);
    const responseDetail = normalizeText((responseBody as Record<string, unknown>).detail);
    const signals: string[] = [];
    const hasRenderSignals =
      (input.missingElements?.length || 0) > 0 ||
      (input.missingHeadings?.length || 0) > 0 ||
      (input.missingRoles?.length || 0) > 0 ||
      (input.missingTextTokens?.length || 0) > 0 ||
      (input.forbiddenTextMatches?.length || 0) > 0 ||
      (input.invalidNumericFields?.length || 0) > 0 ||
      (input.overlapPairs?.length || 0) > 0;
    const hasNetworkSignals =
      Boolean(input.spinnerVisible) ||
      (input.activeRequests || 0) > 0 ||
      (input.failedRequests || 0) > 0 ||
      /network|loading|orders|retry|timed out/i.test(`${message} ${requestUrl}`);
    const hasLocatorSignals =
      Boolean(input.staleSelector) ||
      /locator|selector|getbyrole|getbytestid|has-text|strict mode/i.test(message);
    const navigationMismatch =
      Boolean(input.expectedUrl && input.actualUrl && input.expectedUrl !== input.actualUrl);

    if (
      input.authRequired ||
      input.responseStatus === 401 ||
      /login required|session expired|sign in|unauthorized|auth/i.test(messageLower)
    ) {
      signals.push(`response-status:${input.responseStatus || 401}`);

      return {
        category: "auth-or-session",
        confidence: input.responseStatus === 401 || input.authRequired ? 0.97 : 0.88,
        explanation:
          "The incident matches an authentication or session-expiry branch, so recovery should stop at evidence capture and escalate instead of retrying blindly.",
        signals
      };
    }

    if (
      input.permissionDenied ||
      input.responseStatus === 403 ||
      /permission denied|forbidden|rbac|not allowed|access denied/i.test(messageLower)
    ) {
      signals.push(`response-status:${input.responseStatus || 403}`);

      return {
        category: "permissions-or-rbac",
        confidence: input.responseStatus === 403 || input.permissionDenied ? 0.97 : 0.89,
        explanation:
          "The available evidence points to a permissions or RBAC branch rather than a generic client error, so the incident should route through diagnosis and escalation.",
        signals
      };
    }

    if (
      (input.modalExpected && !input.modalVisible) ||
      (/modal|dialog/i.test(messageLower) && /not open|never opened|hidden|closed/i.test(messageLower))
    ) {
      signals.push(`modal-visible:${input.modalVisible === true ? "yes" : "no"}`);

      return {
        category: "ui-modal-not-opened",
        confidence: input.modalExpected ? 0.94 : 0.86,
        explanation:
          "The failure indicates that a modal or dialog never opened, so the likely fix path is to recover the opener or dialog action before validating the page.",
        signals
      };
    }

    if (
      navigationMismatch ||
      /navigation|route|redirect|url/i.test(messageLower) &&
      /failed|mismatch|did not change|stayed on/i.test(messageLower)
    ) {
      if (input.expectedUrl) {
        signals.push(`expected-url:${input.expectedUrl}`);
      }

      if (input.actualUrl) {
        signals.push(`actual-url:${input.actualUrl}`);
      }

      return {
        category: "ui-route-or-navigation",
        confidence: navigationMismatch ? 0.95 : 0.84,
        explanation:
          "The interaction failed because the route transition or destination URL did not match expectations, which is distinct from a missing locator or render issue.",
        signals
      };
    }

    if (typeof input.responseStatus === "number") {
      signals.push(`response-status:${input.responseStatus}`);

      if (
        input.responseStatus >= 500 &&
        (
          input.timedOut ||
          /timeout|timed out|gateway timeout|upstream timeout|etimedout/i.test(
            `${messageLower} ${responseCode} ${responseMessage} ${responseDetail}`
          )
        )
      ) {
        if (input.requestUrl) {
          signals.push(`request-url:${input.requestUrl}`);
        }

        return {
          category: "api-timeout",
          confidence: input.timedOut ? 0.97 : 0.9,
          explanation:
            "The API returned a timeout-shaped failure rather than a generic server exception, so it should route through timeout diagnosis instead of contract drift handling.",
          signals
        };
      }

      if (
        input.responseStatus >= 500 &&
        (parsedProblem.field || parsedProblem.expectedType || parsedProblem.receivedType)
      ) {
        signals.push("response-body:typed-contract-mismatch");

        return {
          category: "api-contract-drift",
          confidence: 0.97,
          explanation:
            "The API returned a server-side failure, but the response payload identifies a typed request or contract mismatch rather than a generic outage.",
          signals
        };
      }

      if (input.responseStatus >= 500) {
        return {
          category: "api-server-error",
          confidence: 0.91,
          explanation:
            "The API returned a server-side failure without a narrower typed mismatch or timeout signal, so the failure is classified as a backend or route-level error.",
          signals
        };
      }

      if (input.responseStatus >= 400) {
        return {
          category: "api-client-error",
          confidence: 0.9,
          explanation:
            "The API returned a client-facing failure status, which points to an invalid request, authorization issue, or unsupported input path.",
          signals
        };
      }
    }

    if (
      input.emptyStateDetected ||
      /empty state|no users found|orders are not available yet|no results/i.test(
        `${messageLower} ${normalizeText(input.emptyStateText)}`
      )
    ) {
      if (input.emptyStateText) {
        signals.push(`empty-state:${input.emptyStateText}`);
      }

      return {
        category: "ui-empty-state",
        confidence: input.emptyStateDetected ? 0.93 : 0.81,
        explanation:
          "The page resolved into an unexpected empty state, which is better handled as a data-loading or refresh branch than a missing-element render bug.",
        signals
      };
    }

    if (
      input.delayedDataVisible ||
      /delayed data|still loading|rendered late/i.test(messageLower) ||
      (Boolean(input.spinnerVisible) && (input.activeRequests || 0) === 0)
    ) {
      signals.push(`spinner-visible:${input.spinnerVisible ? "yes" : "no"}`);
      signals.push(`active-requests:${input.activeRequests || 0}`);

      return {
        category: "ui-delayed-data",
        confidence: input.delayedDataVisible ? 0.92 : 0.83,
        explanation:
          "The failure matches a delayed-data branch where the page is present but the expected content arrived too late for the first assertion window.",
        signals
      };
    }

    if (hasRenderSignals) {
      if ((input.missingElements?.length || 0) > 0) {
        signals.push(`missing-elements:${input.missingElements?.join(",")}`);
      }

      if ((input.invalidNumericFields?.length || 0) > 0) {
        signals.push(`invalid-numeric-fields:${input.invalidNumericFields?.join(",")}`);
      }

      if ((input.overlapPairs?.length || 0) > 0) {
        signals.push(`overlap:${input.overlapPairs?.join(",")}`);
      }

      if ((input.forbiddenTextMatches?.length || 0) > 0) {
        signals.push(`forbidden-text:${input.forbiddenTextMatches?.join(",")}`);
      }

      return {
        category: "ui-contract-or-render",
        confidence: 0.93,
        explanation:
          "The page is present but violates its render contract through missing elements, invalid content, forbidden tokens, or visual overlap.",
        signals
      };
    }

    if (hasNetworkSignals) {
      signals.push(`active-requests:${input.activeRequests || 0}`);
      signals.push(`failed-requests:${input.failedRequests || 0}`);

      if (input.spinnerVisible) {
        signals.push("spinner-visible");
      }

      return {
        category: "ui-loading-or-network",
        confidence: 0.89,
        explanation:
          "The failure matches a loading, wait-state, or retryable network branch where the page is still transitioning or the first request failed.",
        signals
      };
    }

    if (hasLocatorSignals) {
      signals.push(`stale-selector:${input.staleSelector || "unknown"}`);

      if (input.targetType) {
        signals.push(`target-type:${input.targetType}`);
      }

      return {
        category: "ui-missing-locator",
        confidence: 0.94,
        explanation:
          "The failed action points to a missing or outdated locator rather than a render or network outage.",
        signals
      };
    }

    return {
      category: "unknown",
      confidence: 0.42,
      explanation:
        "The available evidence does not match the current deterministic UI or API failure rules, so the failure remains unknown.",
      signals: signals.length > 0 ? signals : ["no-recognized-signals"]
    };
  }
}
