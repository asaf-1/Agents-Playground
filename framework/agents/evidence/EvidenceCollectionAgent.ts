// The evidence collector: before any recovery runs, it saves what the page
// looked like (a summary, the full HTML and a screenshot) under
// .artifacts/incidents/<scenario>/<incident id>/.

// Node's file and path tools.
import { promises as fs } from "fs";
import path from "path";
// Playwright's type for a page.
import type { Page } from "@playwright/test";
// The failure signals and page contract shapes.
import type { FailureSignalInput } from "../diagnosis/types";
import type { PageContract } from "../validation/contracts";

// What it is given: the page, the failure, and where it happened.
export type EvidenceCollectionRequest = {
  apiRoute?: string;
  contract?: PageContract;
  failureEvidence: FailureSignalInput;
  incidentId: string;
  page: Page;
  pageLabel?: string;
  scenario: string;
};

// What it reports: the files it wrote and the evidence itself.
export type EvidenceCollectionResult = {
  agentDecision: string;
  artifactPaths: string[];
  engine: string;
  evidence: Record<string, unknown>;
};

// One collector, used by the incident router.
export class EvidenceCollectionAgent {
  // Saves the evidence for one incident.
  async collect(
    request: EvidenceCollectionRequest,
  ): Promise<EvidenceCollectionResult> {
    // The incident's folder and its three files.
    const outputDir = path.join(
      process.cwd(),
      ".artifacts",
      "incidents",
      request.scenario,
      request.incidentId,
    );
    const evidencePath = path.join(outputDir, "evidence.json");
    const domPath = path.join(outputDir, "dom.html");
    const screenshotPath = path.join(outputDir, "page.png");

    await fs.mkdir(outputDir, { recursive: true });

    // The page's title and HTML; an empty one if the page is gone.
    const title = await request.page.title().catch(() => "");
    const dom = await request.page.content().catch(() => "");
    // A summary read in the browser: headings, test ids, open dialogs, the
    // page's state and the start of its text.
    const pageSnapshot = await request.page
      .evaluate(() => {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
          .map((heading) => heading.textContent?.trim() || "")
          .filter(Boolean)
          .slice(0, 10);
        const visibleTestIds = Array.from(
          document.querySelectorAll("[data-testid]"),
        )
          .map((element) => element.getAttribute("data-testid") || "")
          .filter(Boolean)
          .slice(0, 25);
        const visibleDialogs = Array.from(
          document.querySelectorAll("[role='dialog'], dialog"),
        )
          .filter((element) => {
            const htmlElement = element as HTMLElement;
            const rect = htmlElement.getBoundingClientRect();
            const style = window.getComputedStyle(htmlElement);

            return (
              style.visibility !== "hidden" &&
              style.display !== "none" &&
              !htmlElement.hasAttribute("hidden") &&
              rect.width > 0 &&
              rect.height > 0
            );
          })
          .map((element) => element.textContent?.trim() || "")
          .filter(Boolean)
          .slice(0, 5);

        return {
          bodyTextExcerpt: (document.body?.innerText || "")
            .trim()
            .slice(0, 600),
          headings,
          readyState: document.readyState,
          visibleDialogs,
          visibleTestIds,
        };
      })
      // If the page can't be read, an empty summary.
      .catch(() => ({
        bodyTextExcerpt: "",
        headings: [],
        readyState: "unknown",
        visibleDialogs: [],
        visibleTestIds: [],
      }));

    // The evidence file's content.
    const evidence = {
      apiRoute: request.apiRoute || null,
      collectedAt: new Date().toISOString(),
      contractName: request.contract?.name || null,
      failureEvidence: request.failureEvidence,
      pageLabel: request.pageLabel || null,
      pageSnapshot,
      title,
      url: request.page.url(),
    };

    // Write the three files; a failed screenshot does not stop the run.
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    await fs.writeFile(domPath, dom);
    await request.page
      .screenshot({
        fullPage: true,
        path: screenshotPath,
      })
      .catch(() => undefined);

    // Report the files, with paths from the repository root.
    return {
      agentDecision:
        "Captured live page evidence, DOM markup, and a screenshot artifact before recovery executed.",
      artifactPaths: [evidencePath, domPath, screenshotPath].map((filePath) => {
        return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
      }),
      engine: "deterministic",
      evidence,
    };
  }
}
