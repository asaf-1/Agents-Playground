// What every scenario spec saves: a report.json, a final screenshot and a
// trace, under .artifacts/scenarios/<scenario>/.

// Node's file and path tools.
import { promises as fs } from "fs";
import path from "path";
// Playwright's types for a browser context and a page.
import type { BrowserContext, Page } from "@playwright/test";
// The report's shape.
import type { ScenarioReport } from "./types";

// What writing the artifacts needs.
type ScenarioArtifactsOptions = {
  context: BrowserContext;
  page: Page;
  scenario: string;
  report: ScenarioReport;
};

// The contexts whose trace this file started, so it only stops its own.
const ownedTraceContexts = new WeakSet<BrowserContext>();

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

// Starts a trace with screenshots and snapshots, unless one already runs.
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

// Writes the report and the screenshot, then stops and saves the trace.
export async function writeScenarioArtifacts({
  context,
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
  if (!ownedTraceContexts.has(context)) {
    // We did not start tracing for this context (UI mode or parent runner owns it).
    // Stopping here would consume the parent's trace and make its teardown throw
    // "Must start tracing before stopping".
    return;
  }

  // Stop the trace this file started and save it as trace.zip.
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
