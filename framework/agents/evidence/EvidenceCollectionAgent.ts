import { promises as fs } from "fs";
import path from "path";
import type { Page } from "@playwright/test";
import type { FailureSignalInput } from "../diagnosis/types";
import type { PageContract } from "../validation/contracts";

export type EvidenceCollectionRequest = {
  apiRoute?: string;
  contract?: PageContract;
  failureEvidence: FailureSignalInput;
  incidentId: string;
  page: Page;
  pageLabel?: string;
  scenario: string;
};

export type EvidenceCollectionResult = {
  agentDecision: string;
  artifactPaths: string[];
  engine: string;
  evidence: Record<string, unknown>;
};

export class EvidenceCollectionAgent {
  async collect(
    request: EvidenceCollectionRequest,
  ): Promise<EvidenceCollectionResult> {
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

    const title = await request.page.title().catch(() => "");
    const dom = await request.page.content().catch(() => "");
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
      .catch(() => ({
        bodyTextExcerpt: "",
        headings: [],
        readyState: "unknown",
        visibleDialogs: [],
        visibleTestIds: [],
      }));

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

    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    await fs.writeFile(domPath, dom);
    await request.page
      .screenshot({
        fullPage: true,
        path: screenshotPath,
      })
      .catch(() => undefined);

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
