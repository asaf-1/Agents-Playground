// Recovery for the dashboard's orders list when its request fails or is slow. A
// tracker watches the page's /api/orders requests; the agent reads it and the
// spinner, then asks the recovery router to wait longer or press refresh,
// whichever fits what it sees.

// Playwright's types for a page and a network request.
import type { Page, Request } from "@playwright/test";
// The router that runs the strategies.
import { RecoveryRouter } from "./RecoveryRouter";

// What the agent reports: the strategy that worked, the rows shown at the end,
// and the evidence.
type RecoveryResult = {
  agentDecision: string;
  engine: string;
  evidence: Record<string, unknown>;
  finalRowCount: number;
  strategy: "extend-wait" | "refresh-and-retry";
};

// Options: the refresh button, the row and spinner to look for, and how long to
// wait. Each has a default for the dashboard.
type RecoveryOptions = {
  refreshTestId?: string;
  rowSelector?: string;
  spinnerTestId?: string;
  timeoutMs?: number;
};

// Counts the page's /api/orders requests: open now, finished and failed.
export class OrdersRequestTracker {
  private readonly activeRequests = new Set<Request>();
  private completedRequests = 0;
  private failedRequests = 0;

  // Watches one page.
  constructor(private readonly page: Page) {}

  // A request to /api/orders started.
  private readonly onRequest = (request: Request) => {
    if (request.url().includes("/api/orders")) {
      this.activeRequests.add(request);
    }
  };

  // One finished.
  private readonly onRequestFinished = (request: Request) => {
    if (request.url().includes("/api/orders")) {
      this.activeRequests.delete(request);
      this.completedRequests += 1;
    }
  };

  // One failed.
  private readonly onRequestFailed = (request: Request) => {
    if (request.url().includes("/api/orders")) {
      this.activeRequests.delete(request);
      this.failedRequests += 1;
    }
  };

  // Starts listening to the page's requests.
  start() {
    this.page.on("request", this.onRequest);
    this.page.on("requestfinished", this.onRequestFinished);
    this.page.on("requestfailed", this.onRequestFailed);
  }

  // Stops listening.
  stop() {
    this.page.off("request", this.onRequest);
    this.page.off("requestfinished", this.onRequestFinished);
    this.page.off("requestfailed", this.onRequestFailed);
  }

  // The counts right now.
  snapshot() {
    return {
      activeCount: this.activeRequests.size,
      completedRequests: this.completedRequests,
      failedRequests: this.failedRequests,
    };
  }
}

// Brings the orders list back.
export class NetworkRecoveryAgent {
  constructor(
    private readonly page: Page,
    private readonly tracker: OrdersRequestTracker,
  ) {}

  // Recovers the list and reports how.
  async recover(options: RecoveryOptions = {}): Promise<RecoveryResult> {
    // What to look for, with the dashboard's defaults.
    const rowSelector = options.rowSelector || "[data-testid='orders-row']";
    const spinnerTestId = options.spinnerTestId || "orders-spinner";
    const refreshTestId = options.refreshTestId || "refresh-orders";
    const timeoutMs = options.timeoutMs || 8000;
    // What the page looks like now: open requests and whether the spinner
    // shows.
    const snapshotBefore = this.tracker.snapshot();
    const spinnerVisible = await this.page
      .getByTestId(spinnerTestId)
      .isVisible()
      .catch(() => false);
    const router = new RecoveryRouter(this.page);
    // Still loading? Then waiting is tried first, refresh second; otherwise
    // refresh first.
    const prefersWait = snapshotBefore.activeCount > 0 || spinnerVisible;
    const routerResult = await router.recover({
      apiRoute: "/api/orders",
      failureEvidence: {
        activeRequests: snapshotBefore.activeCount,
        errorMessage:
          "Orders rows were missing after the initial dashboard load.",
        failedRequests: snapshotBefore.failedRequests,
        requestUrl: "/api/orders",
        spinnerVisible,
      },
      pageLabel: "Orders Recovery Console",
      scenario: "flaky-network-recovery",
      strategies: prefersWait
        ? [
            {
              kind: "extend-wait",
              selector: rowSelector,
              timeoutMs,
            },
            {
              kind: "refresh-and-retry",
              successSelector: rowSelector,
              timeoutMs,
              triggerTestId: refreshTestId,
            },
          ]
        : [
            {
              kind: "refresh-and-retry",
              successSelector: rowSelector,
              timeoutMs,
              triggerTestId: refreshTestId,
            },
            {
              kind: "extend-wait",
              selector: rowSelector,
              timeoutMs,
            },
          ],
    });

    // Neither worked: the step fails with the router's reason.
    if (
      routerResult.finalStatus !== "recovered" ||
      !routerResult.strategyUsed
    ) {
      throw new Error(routerResult.agentDecision);
    }

    // How it ended: the rows on screen and the request counts after.
    const finalRowCount = await this.page.locator(rowSelector).count();
    const snapshotAfter = this.tracker.snapshot();
    const strategy = routerResult.strategyUsed as RecoveryResult["strategy"];

    // Says which strategy worked and why, with the evidence for the report.
    return {
      agentDecision:
        strategy === "extend-wait"
          ? "Classified the dashboard failure as a loading-or-network issue and extended the wait while live loading signals were still present."
          : "Classified the dashboard failure as a loading-or-network issue and triggered the retry control after the first request branch had already failed.",
      engine: routerResult.engine,
      evidence: {
        attempts: routerResult.attempts,
        classification: routerResult.classification,
        patchProposal: routerResult.patchProposal,
        recoveryEvidence: routerResult.recoveryEvidence,
        snapshotAfter,
        snapshotBefore,
        spinnerVisible,
      },
      finalRowCount,
      strategy,
    };
  }
}
