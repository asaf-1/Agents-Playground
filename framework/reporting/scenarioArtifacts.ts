import { promises as fs } from "fs";
import path from "path";
import type { BrowserContext, Page } from "@playwright/test";
import type { ScenarioReport } from "./types";

type ScenarioArtifactsOptions = {
  context: BrowserContext;
  page: Page;
  scenario: string;
  report: ScenarioReport;
};

export function createScenarioReport(scenario: string): ScenarioReport {
  return {
    scenario,
    initialFailure: "",
    evidence: {},
    agentDecision: "",
    finalStatus: "not-started",
    suggestedPermanentFix: "",
    engine: "deterministic"
  };
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function startScenarioTrace(context: BrowserContext) {
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true
  });
}

export async function writeScenarioArtifacts({
  context,
  page,
  scenario,
  report
}: ScenarioArtifactsOptions) {
  const outputDir = path.join(process.cwd(), ".artifacts", "scenarios", scenario);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({
    path: path.join(outputDir, "final.png"),
    fullPage: true
  });
  await context.tracing.stop({
    path: path.join(outputDir, "trace.zip")
  });
}
