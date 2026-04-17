import type { Page, Request } from "@playwright/test";
import { RecoveryRouter } from "./RecoveryRouter";

type RecoveryResult = {
  agentDecision: string;
  engine: string;
  evidence: Record<string, unknown>;
  finalRowCount: number;
  strategy: "extend-wait" | "refresh-and-retry";
};

type RecoveryOptions = {
  refreshTestId?: string;
  rowSelector?: string;
  spinnerTestId?: string;
  timeoutMs?: number;
};

export class OrdersRequestTracker {
  private readonly activeRequests = new Set<Request>();
  private completedRequests = 0;
  private failedRequests = 0;

  constructor(private readonly page: Page) {}

  private readonly onRequest = (request: Request) => {
    if (request.url().includes("/api/orders")) {
      this.activeRequests.add(request);
    }
  };

  private readonly onRequestFinished = (request: Request) => {
    if (request.url().includes("/api/orders")) {
      this.activeRequests.delete(request);
      this.completedRequests += 1;
    }
  };

  private readonly onRequestFailed = (request: Request) => {
    if (request.url().includes("/api/orders")) {
      this.activeRequests.delete(request);
      this.failedRequests += 1;
    }
  };

  start() {
    this.page.on("request", this.onRequest);
    this.page.on("requestfinished", this.onRequestFinished);
    this.page.on("requestfailed", this.onRequestFailed);
  }

  stop() {
    this.page.off("request", this.onRequest);
    this.page.off("requestfinished", this.onRequestFinished);
    this.page.off("requestfailed", this.onRequestFailed);
  }

  snapshot() {
    return {
      activeCount: this.activeRequests.size,
      completedRequests: this.completedRequests,
      failedRequests: this.failedRequests
    };
  }
}

export class NetworkRecoveryAgent {
  constructor(
    private readonly page: Page,
    private readonly tracker: OrdersRequestTracker
  ) {}

  async recover(options: RecoveryOptions = {}): Promise<RecoveryResult> {
    const rowSelector = options.rowSelector || "[data-testid='orders-row']";
    const spinnerTestId = options.spinnerTestId || "orders-spinner";
    const refreshTestId = options.refreshTestId || "refresh-orders";
    const timeoutMs = options.timeoutMs || 8000;
    const snapshotBefore = this.tracker.snapshot();
    const spinnerVisible = await this.page.getByTestId(spinnerTestId).isVisible().catch(() => false);
    const router = new RecoveryRouter(this.page);
    const prefersWait = snapshotBefore.activeCount > 0 || spinnerVisible;
    const routerResult = await router.recover({
      apiRoute: "/api/orders",
      failureEvidence: {
        activeRequests: snapshotBefore.activeCount,
        errorMessage: "Orders rows were missing after the initial dashboard load.",
        failedRequests: snapshotBefore.failedRequests,
        requestUrl: "/api/orders",
        spinnerVisible
      },
      pageLabel: "Orders Recovery Console",
      scenario: "flaky-network-recovery",
      strategies: prefersWait
        ? [
            {
              kind: "extend-wait",
              selector: rowSelector,
              timeoutMs
            },
            {
              kind: "refresh-and-retry",
              successSelector: rowSelector,
              timeoutMs,
              triggerTestId: refreshTestId
            }
          ]
        : [
            {
              kind: "refresh-and-retry",
              successSelector: rowSelector,
              timeoutMs,
              triggerTestId: refreshTestId
            },
            {
              kind: "extend-wait",
              selector: rowSelector,
              timeoutMs
            }
          ]
    });

    if (routerResult.finalStatus !== "recovered" || !routerResult.strategyUsed) {
      throw new Error(routerResult.agentDecision);
    }

    const finalRowCount = await this.page.locator(rowSelector).count();
    const snapshotAfter = this.tracker.snapshot();
    const strategy = routerResult.strategyUsed as RecoveryResult["strategy"];

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
        spinnerVisible
      },
      finalRowCount,
      strategy
    };
  }
}
