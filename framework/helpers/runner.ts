// Node's file and path tools.
import fs from "node:fs";
import path from "node:path";
// Playwright's expect, and the types of a request context and a page.
import { expect, type APIRequestContext, type Page } from "@playwright/test";
// Adds a line to the running test's [RESULT] block.
import { fact } from "../fixtures/resultBlock";

// Shared helpers for the test runner's own specs. The runner is started by
// playwright.runner.config.ts with GitHub stubbed, so every "run" here is
// pretend and nothing reaches a pipeline.

// The two accounts the setup project makes: an administrator and a plain user.
// They exist only on the local stub runner the suite starts.
export const ADMIN = {
  username: "runner-admin",
  password: "runner-admin-pass-1",
};
export const USER = { username: "runner-user", password: "runner-user-pass-1" };

// Where each role's saved session lives.
export const AUTH_DIR = path.join(".artifacts", "runner-auth");
export const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
export const USER_STATE = path.join(AUTH_DIR, "user.json");

// Signed out: a spec that wants the sign-in card starts from here.
export const SIGNED_OUT = { cookies: [], origins: [] };

// The repository root, two folders up from this file.
const ROOT = path.resolve(__dirname, "..", "..");

// One flow in the catalog, as the runner lists it.
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

// The curated groups (sanity, regression and the rest), from their own file.
export function groups(): { id: string; label: string; description: string }[] {
  return JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "scripts", "test-runner", "flow-groups.json"),
      "utf8",
    ),
  ).groups;
}

// How many flows of one kind the catalog has.
export function countByKind(kind: CatalogFlow["kind"]): number {
  return catalog().flows.filter((flow) => flow.kind === kind).length;
}

// One flow by its id; throws when the catalog has no such flow.
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
  // The block names the account, never its password.
  fact("account", account.username);
  const login = await request.post("/api/login", { data: account });
  if (login.ok()) return;

  // No such account yet: sign up instead.
  const signup = await request.post("/api/signup", { data: account });
  expect(signup.status(), await signup.text()).toBe(201);
}

// Counts the reasons made by this worker, so two in the same millisecond differ.
let counter = 0;

// A reason no other test uses, so a run can be found again in History.
export function uniqueReason(prefix: string): string {
  counter += 1;
  return `${prefix} ${Date.now().toString(36)}-${process.pid}-${counter}`;
}

// Opens the runner's main screen.
export async function openRunner(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("runner-screen")).toBeVisible();
}

// Opens the Run tab and waits for its list of flows.
export async function openRunTab(page: Page): Promise<void> {
  await openRunner(page);
  await page.getByTestId("tab-run").click();
  await expect(page.getByTestId("flow-row").first()).toBeVisible();
}

// The Run button of one flow.
export function runButton(page: Page, flowId: string) {
  return page.locator(`[data-testid="flow-run"][data-flow-id="${flowId}"]`);
}

// Presses Run on a suite, answers the question, and lands on the run page.
export async function startRun(
  page: Page,
  flowId: string,
  reason: string,
): Promise<void> {
  fact("run", `${flowId}: ${reason}`);
  await openRunTab(page);
  await runButton(page, flowId).click();
  await expect(page.getByTestId("run-confirm")).toBeVisible();
  await page.getByTestId("run-confirm-reason").fill(reason);
  await page.getByTestId("run-confirm-start").click();
  await expect(page.getByTestId("panel-run-view")).toBeVisible();
}

// Waits up to 20 seconds for the run page to show an outcome.
export async function expectOutcome(page: Page, text: RegExp | string) {
  await expect(page.getByTestId("run-view-outcome")).toHaveText(text, {
    timeout: 20_000,
  });
}
