// What every scenario spec saves: a report.json and a final screenshot, under
// .artifacts/scenarios/<scenario>/. A recording (trace) is no longer made
// here: since 2026-11-19 Playwright itself keeps one for every failed test, in
// .artifacts/test-results, so there is one kind of recording, not two.

// Node's file and path tools.
import { promises as fs } from "fs";
import path from "path";
// Playwright's types for a browser context and a page.
import type { BrowserContext, Page } from "@playwright/test";
// The report's shape.
import type { ScenarioReport } from "./types";

// What writing the artifacts needs. The context is still passed by the
// scenario specs; nothing here uses it since the recording moved to Playwright.
type ScenarioArtifactsOptions = {
  context: BrowserContext;
  page: Page;
  scenario: string;
  report: ScenarioReport;
};

// An empty report for a scenario, filled in as it runs.
export function createScenarioReport(scenario: string): ScenarioReport {
  return {
    scenario,
    initialFailure: "",
    evidence: {},
    agentDecision: "",
    finalStatus: "not-started",
    suggestedPermanentFix: "",
    engine: "deterministic",
  };
}

// An error as one line of text.
export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

// Writes the report and the screenshot.
export async function writeScenarioArtifacts({
  page,
  scenario,
  report,
}: ScenarioArtifactsOptions) {
  // The scenario's folder.
  const outputDir = path.join(
    process.cwd(),
    ".artifacts",
    "scenarios",
    scenario,
  );

  // The report and the screenshot.
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await page.screenshot({
    path: path.join(outputDir, "final.png"),
    fullPage: true,
  });
}
