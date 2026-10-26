import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Shared helpers for the test runner's own specs. The runner is started by
// playwright.runner.config.ts with GitHub stubbed, so every "run" here is
// pretend and nothing reaches a pipeline.

export const ADMIN = {
  username: "runner-admin",
  password: "runner-admin-pass-1",
};
export const USER = { username: "runner-user", password: "runner-user-pass-1" };

export const AUTH_DIR = path.join(".artifacts", "runner-auth");
export const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
export const USER_STATE = path.join(AUTH_DIR, "user.json");

// Signed out: a spec that wants the sign-in card starts from here.
export const SIGNED_OUT = { cookies: [], origins: [] };

const ROOT = path.resolve(__dirname, "..", "..");

interface CatalogFlow {
  id: string;
  kind: "group" | "spec" | "suite";
  name: string;
  label?: string;
  description: string;
  summary?: string;
  title?: string;
  path: string | null;
  testCount: number | null;
}

// The committed catalog, which the stub serves to the runner unchanged, so a
// test can expect what the page shows against what the file says.
export function catalog(): { flows: CatalogFlow[] } {
  return JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "scripts", "test-runner", "flow-catalog.json"),
      "utf8",
    ),
  );
}

export function groups(): { id: string; label: string; description: string }[] {
  return JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "scripts", "test-runner", "flow-groups.json"),
      "utf8",
    ),
  ).groups;
}

export function countByKind(kind: CatalogFlow["kind"]): number {
  return catalog().flows.filter((flow) => flow.kind === kind).length;
}

export function flowById(id: string): CatalogFlow {
  const flow = catalog().flows.find((entry) => entry.id === id);
  if (!flow) throw new Error(`no flow ${id} in the catalog`);
  return flow;
}

// Signs in, or creates the account when it does not exist yet. The first
// account on a fresh runner becomes the administrator, which is why the setup
// project creates the admin before the user.
export async function signInOrUp(
  request: APIRequestContext,
  account: { username: string; password: string },
): Promise<void> {
  const login = await request.post("/api/login", { data: account });
  if (login.ok()) return;

  const signup = await request.post("/api/signup", { data: account });
  expect(signup.status(), await signup.text()).toBe(201);
}

let counter = 0;

// A reason no other test uses, so a run can be found again in History.
export function uniqueReason(prefix: string): string {
  counter += 1;
  return `${prefix} ${Date.now().toString(36)}-${process.pid}-${counter}`;
}

export async function openRunner(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("runner-screen")).toBeVisible();
}

export async function openRunTab(page: Page): Promise<void> {
  await openRunner(page);
  await page.getByTestId("tab-run").click();
  await expect(page.getByTestId("flow-row").first()).toBeVisible();
}

export function runButton(page: Page, flowId: string) {
  return page.locator(`[data-testid="flow-run"][data-flow-id="${flowId}"]`);
}

// Presses Run on a suite, answers the question, and lands on the run page.
export async function startRun(
  page: Page,
  flowId: string,
  reason: string,
): Promise<void> {
  await openRunTab(page);
  await runButton(page, flowId).click();
  await expect(page.getByTestId("run-confirm")).toBeVisible();
  await page.getByTestId("run-confirm-reason").fill(reason);
  await page.getByTestId("run-confirm-start").click();
  await expect(page.getByTestId("panel-run-view")).toBeVisible();
}

export async function expectOutcome(page: Page, text: RegExp | string) {
  await expect(page.getByTestId("run-view-outcome")).toHaveText(text, {
    timeout: 20_000,
  });
}
