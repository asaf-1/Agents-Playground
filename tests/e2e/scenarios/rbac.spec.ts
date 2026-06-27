// seed: tests/e2e/seed.spec.ts
//
// RBAC scenarios (authenticated project). Drives roles via POST /api/test/set-session and arms
// rbacEnforce/adminGate/rbacBug per the test's own runKey, then asserts the gated API status
// codes. Lights the permissions-or-rbac category and reproduces the INTENTIONAL over-permission
// defect (the reporter's target). Serial so the file's create-user calls never race each other.
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("RBAC", () => {
  test.afterEach(async ({ page }) => {
    await page.request.delete(
      `/api/test/flags?runKey=${encodeURIComponent(test.info().testId)}`,
    );
  });

  async function arm(page, flags) {
    const runKey = test.info().testId;
    await page.request.post("/api/test/flags", { data: { runKey, flags } });
    return runKey;
  }

  async function setRole(page, role) {
    const response = await page.request.post("/api/test/set-session", {
      data: { role },
    });
    expect(response.ok()).toBeTruthy();
  }

  test("Viewer cannot create a user (permissions-or-rbac 403)", async ({
    page,
  }) => {
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

  test("Editor cannot delete a user (permissions-or-rbac 403)", async ({
    page,
  }) => {
    const runKey = await arm(page, { rbacEnforce: true });
    await setRole(page, "Admin");
    const created = await page.request.post(`/api/users?runKey=${runKey}`, {
      data: { name: "Deletable One", role: "Viewer" },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).user.id;
    await setRole(page, "Editor");
    const res = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    expect(res.status()).toBe(403);
    expect((await res.json()).requiredRole).toBe("Admin");
  });

  test("INTENTIONAL DEFECT: Editor is wrongly allowed to delete (server returns 200)", async ({
    page,
  }) => {
    const runKey = await arm(page, {
      rbacEnforce: true,
      rbacBug: "editor-delete",
    });
    await setRole(page, "Admin");
    const created = await page.request.post(`/api/users?runKey=${runKey}`, {
      data: { name: "Deletable Two", role: "Viewer" },
    });
    const id = (await created.json()).user.id;
    await setRole(page, "Editor");
    const res = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    // This SHOULD be 403. The over-permission defect returns 200 -> the reporter files a local bug.
    expect(res.status()).toBe(200);
    expect((await res.json()).message).toBe("User deleted.");
  });

  test("Admin can create and delete (positive control)", async ({ page }) => {
    const runKey = await arm(page, { rbacEnforce: true });
    await setRole(page, "Admin");
    const created = await page.request.post(`/api/users?runKey=${runKey}`, {
      data: { name: "Admin Made", role: "Editor" },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).user.id;
    const del = await page.request.delete(`/api/users/${id}?runKey=${runKey}`);
    expect(del.status()).toBe(200);
  });

  test("Admin audit is forbidden for non-admins and when the gate is locked", async ({
    page,
  }) => {
    const runKey = await arm(page, { rbacEnforce: true });
    await setRole(page, "Viewer");
    const viewerRes = await page.request.get(
      `/api/admin/audit?runKey=${runKey}`,
    );
    expect(viewerRes.status()).toBe(403);
    expect((await viewerRes.json()).requiredRole).toBe("Admin");

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
