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

const ownedTraceContexts = new WeakSet<BrowserContext>();

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

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function startScenarioTrace(context: BrowserContext) {
  try {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    ownedTraceContexts.add(context);
  } catch (error) {
    // Playwright UI mode / a parent runner already owns tracing for this context —
    // don't take ownership, and don't stop it later (the owner must stop it).
    const message = serializeError(error);
    const isTracingLifecycleError =
      /already started|already been started/i.test(message);
    if (!isTracingLifecycleError) {
      throw error;
    }
  }
}

export async function writeScenarioArtifacts({
  context,
  page,
  scenario,
  report,
}: ScenarioArtifactsOptions) {
  const outputDir = path.join(
    process.cwd(),
    ".artifacts",
    "scenarios",
    scenario,
  );

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await page.screenshot({
    path: path.join(outputDir, "final.png"),
    fullPage: true,
  });
  if (!ownedTraceContexts.has(context)) {
    // We did not start tracing for this context (UI mode or parent runner owns it).
    // Stopping here would consume the parent's trace and make its teardown throw
    // "Must start tracing before stopping".
    return;
  }

  ownedTraceContexts.delete(context);
  try {
    await context.tracing.stop({
      path: path.join(outputDir, "trace.zip"),
    });
  } catch (error) {
    const message = serializeError(error);
    const isTracingLifecycleError =
      /has not been started|not started|must start tracing/i.test(message);
    if (!isTracingLifecycleError) {
      throw error;
    }
  }
}
