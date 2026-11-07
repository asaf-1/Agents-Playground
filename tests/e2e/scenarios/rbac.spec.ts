// seed: tests/e2e/seed.spec.ts
//
// RBAC scenarios (authenticated project). Drives roles via POST /api/test/set-session and arms
// rbacEnforce/adminGate/rbacBug per the test's own runKey, then asserts the gated API status
// codes. Lights the permissions-or-rbac category and reproduces the INTENTIONAL over-permission
// defect (the reporter's target). Serial so the file's create-user calls never race each other.

/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

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

  // Switches the classic site's session to a role, through the test hook.
  async function setRole(page, role) {
    fact("role", role);
    const response = await page.request.post("/api/test/set-session", {
      data: { role },
    });
    expect(response.ok()).toBeTruthy();
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
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("RBAC_FORBIDDEN");
    expect(body.permissionDenied).toBe(true);
  });

  // With RBAC on, an Editor is refused when deleting a user; only an Admin may.
  test("Editor cannot delete a user (permissions-or-rbac 403)", async ({
    page,
  }) => {
    expected(
      "Admin creates (201); Editor's delete 403 with requiredRole Admin",
    );
    // An Admin creates a user to delete.
    const runKey = await arm(page, { rbacEnforce: true });
    await setRole(page, "Admin");
    const created = await page.request.post(`/api/users?runKey=${runKey}`, {
      data: { name: "Deletable One", role: "Viewer" },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).user.id;
    fact("userId", id);
    // As an Editor, delete it: refused.
    await setRole(page, "Editor");
    const res = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    expect(res.status()).toBe(403);
    expect((await res.json()).requiredRole).toBe("Admin");
  });

  // The planted over-permission defect: with rbacBug armed, the Editor's delete
  // goes through. This test proves the defect is there; the defect stays.
  test("INTENTIONAL DEFECT: Editor is wrongly allowed to delete (server returns 200)", async ({
    page,
  }) => {
    expected(
      "with rbacBug editor-delete armed: the Editor's delete answers 200 'User deleted.' (the planted defect)",
    );
    // An Admin creates a user to delete, with the defect armed.
    const runKey = await arm(page, {
      rbacEnforce: true,
      rbacBug: "editor-delete",
    });
    await setRole(page, "Admin");
    const created = await page.request.post(`/api/users?runKey=${runKey}`, {
      data: { name: "Deletable Two", role: "Viewer" },
    });
    const id = (await created.json()).user.id;
    fact("userId", id);
    // As an Editor, delete it.
    await setRole(page, "Editor");
    const res = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    // This SHOULD be 403. The over-permission defect returns 200 -> the reporter files a local bug.
    expect(res.status()).toBe(200);
    expect((await res.json()).message).toBe("User deleted.");
  });

  // An Admin can create a user and delete it.
  test("Admin can create and delete (positive control)", async ({ page }) => {
    expected("Admin create 201, delete 200");
    const runKey = await arm(page, { rbacEnforce: true });
    await setRole(page, "Admin");
    const created = await page.request.post(`/api/users?runKey=${runKey}`, {
      data: { name: "Admin Made", role: "Editor" },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).user.id;
    fact("userId", id);
    const del = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    expect(del.status()).toBe(200);
  });

  // The audit is for Admins only, and even an Admin is refused while the gate is locked.
  test("Admin audit is forbidden for non-admins and when the gate is locked", async ({
    page,
  }) => {
    expected(
      "Viewer 403 with requiredRole Admin; with adminGate locked, the Admin 403 too",
    );
    // As a Viewer.
    const runKey = await arm(page, { rbacEnforce: true });
    await setRole(page, "Viewer");
    const viewerRes = await page.request.get(
      `/api/admin/audit?runKey=${runKey}`,
    );
    expect(viewerRes.status()).toBe(403);
    expect((await viewerRes.json()).requiredRole).toBe("Admin");

    // Lock the gate, then as an Admin.
    await page.request.post("/api/test/flags", {
      data: { runKey, flags: { adminGate: "locked" } },
    });
    await setRole(page, "Admin");
    const lockedRes = await page.request.get(
      `/api/admin/audit?runKey=${runKey}`,
    );
    expect(lockedRes.status()).toBe(403);
  });
});
