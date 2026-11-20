// seed: tests/e2e/seed.spec.ts
//
// RBAC scenarios on the bank (authenticated project). The back office's roles
// (Admin, Editor, Viewer) come from POST /api/test/set-session, and rbacEnforce
// and rbacBug are armed per the test's own runKey; then the gated API status
// codes are asserted. The bank's own staff roles guard its audit log. Lights
// the permissions-or-rbac category and reproduces the INTENTIONAL
// over-permission defect (the reporter's target). Serial so the file's
// create-user calls never race each other. (Until 2026-11-20 the audit test
// used the original demo site's /api/admin/audit.)

/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
/** The bank's demo staff, a fresh customer, and signing in. */
import { DEMO, signIn, signUpCustomer } from "../../../framework/helpers/bank";

/** The tests in this file run one after another. */
test.describe.configure({ mode: "serial" });

test.describe("RBAC", () => {
  // After each test, clear only the flags this test armed.
  test.afterEach(async ({ page }) => {
    await page.request.delete(
      `/api/test/flags?runKey=${encodeURIComponent(test.info().testId)}`,
    );
  });

  // Arms flags under this test's own id, which is also its runKey.
  async function arm(page, flags) {
    const runKey = test.info().testId;
    fact("runKey", runKey);
    fact("flags", flags);
    await page.request.post("/api/test/flags", { data: { runKey, flags } });
    return runKey;
  }

  // Switches the back-office session to a role, through the test hook.
  async function setRole(page, role) {
    fact("role", role);
    const response = await page.request.post("/api/test/set-session", {
      data: { role },
    });
    expect(response.ok(), `signed in as ${role}`).toBeTruthy();
  }

  // An Admin creates a user to delete, and returns its id.
  async function createAsAdmin(page, runKey, name) {
    await setRole(page, "Admin");
    const created = await page.request.post(`/api/users?runKey=${runKey}`, {
      data: { name, role: "Viewer" },
    });
    expect(created.status(), "the Admin creates the user").toBe(201);
    const id = (await created.json()).user.id;
    fact("userId", id);
    return id;
  }

  // With RBAC on, a Viewer is refused when creating a user.
  test("Viewer cannot create a user (permissions-or-rbac 403)", async ({
    page,
  }) => {
    expected("403 RBAC_FORBIDDEN with permissionDenied true");
    const runKey = await arm(page, { rbacEnforce: true });
    await setRole(page, "Viewer");
    const res = await page.request.post(`/api/users?runKey=${runKey}`, {
      data: { name: "Temp User", role: "Viewer" },
    });
    expect(res.status(), "refused").toBe(403);
    const body = await res.json();
    expect(body.code, "as RBAC").toBe("RBAC_FORBIDDEN");
    expect(body.permissionDenied, "permission denied").toBe(true);
  });

  // An Editor is refused when deleting a user; only an Admin may, always.
  test("Editor cannot delete a user (permissions-or-rbac 403)", async ({
    page,
  }) => {
    expected(
      "Admin creates (201); Editor's delete 403 with requiredRole Admin, with no flag armed",
    );
    const runKey = await arm(page, {});
    const id = await createAsAdmin(page, runKey, "Deletable One");
    // As an Editor, delete it: refused, with no role checks armed.
    await setRole(page, "Editor");
    const res = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    expect(res.status(), "refused").toBe(403);
    expect((await res.json()).requiredRole, "an Admin is needed").toBe("Admin");
  });

  // The planted over-permission defect: with rbacBug armed, the Editor's delete
  // goes through. This test proves the defect is there; the defect stays.
  test("INTENTIONAL DEFECT: Editor is wrongly allowed to delete (server returns 200)", async ({
    page,
  }) => {
    expected(
      "with rbacBug editor-delete armed: the Editor's delete answers 200 'User deleted.' (the planted defect)",
    );
    // An Admin creates a user to delete, with the defect armed the way the
    // practice switch arms it.
    const runKey = await arm(page, { rbacBug: "editor-delete" });
    const id = await createAsAdmin(page, runKey, "Deletable Two");
    // As an Editor, delete it.
    await setRole(page, "Editor");
    const res = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    // This SHOULD be 403. The over-permission defect returns 200 -> the reporter files a local bug.
    expect(res.status(), "the defect lets it through").toBe(200);
    expect((await res.json()).message, "and deletes").toBe("User deleted.");
  });

  // An Admin can create a user and delete it.
  test("Admin can create and delete (positive control)", async ({ page }) => {
    expected("Admin create 201, delete 200");
    const runKey = await arm(page, { rbacEnforce: true });
    const id = await createAsAdmin(page, runKey, "Admin Made");
    const del = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    expect(del.status(), "the Admin deletes it").toBe(200);
  });

  // The bank's audit log is for its Admin only: a customer and Support are
  // refused, the demo Admin reads it.
  test("the bank's audit log is forbidden for a customer and Support, and open to its Admin", async ({
    page,
  }) => {
    expected(
      "a new customer 403 FORBIDDEN; Support (sam) 403; the Admin (alex) 200 with entries",
    );
    // A customer of the test's own.
    await signUpCustomer(page.request, "RBAC Customer");
    const asCustomer = await page.request.get("/api/bank/admin/audit");
    expect(asCustomer.status(), "a customer is refused").toBe(403);
    expect((await asCustomer.json()).code, "as forbidden").toBe("FORBIDDEN");

    // Support.
    await signIn(page.request, DEMO.support);
    const asSupport = await page.request.get("/api/bank/admin/audit");
    expect(asSupport.status(), "Support is refused").toBe(403);

    // The Admin.
    await signIn(page.request, DEMO.admin);
    const asAdmin = await page.request.get("/api/bank/admin/audit");
    fact("admin status", asAdmin.status());
    expect(asAdmin.status(), "the Admin reads it").toBe(200);
  });
});
