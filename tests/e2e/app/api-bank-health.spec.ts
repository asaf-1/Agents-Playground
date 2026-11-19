// Reads the bank's migration files, to count them.
import { readdirSync } from "node:fs";
// The type of an API answer.
import type { APIResponse } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// A status check that says what the server answered.
import { expectStatus } from "../../../framework/helpers/apiCheck";
// A short-lived bank server with its own settings.
import { startBankServer } from "../../../framework/helpers/bankServer";
// An answer checked against bank/openapi.json.
import { matchesSchema } from "../../../framework/helpers/openApiSchema";

// The bank's own health checks (bank/health.js): live says the bank is
// running, ready says it can serve money. The canaries, the cluster's probes
// and Render ask these instead of the classic site's /api/health. No sign-in.
// The two tests that need a database to fail, or a setting the suite's server
// doesn't have, start a short-lived server of their own, never touching the
// suite's.

// The two checks, and the test hook that exists only with BANK_TEST_HOOKS=true.
const LIVE = "/api/bank/health/live";
const READY = "/api/bank/health/ready";
const CLOSE_DATABASE = "/api/bank/test/close-database";

// How many migration files the bank has, counted the way bank/migrate.js
// counts them, so no number is written here.
const MIGRATION_FILES = readdirSync("bank/migrations").filter((file) =>
  /^\d{3}_[a-z0-9_-]+\.sql$/.test(file),
).length;

// The headers every bank answer carries (security-headers.js), and no caching.
function expectBankHeaders(response: APIResponse, what: string): void {
  const headers = response.headers();
  expect(headers["x-content-type-options"], `${what}: no MIME sniffing`).toBe(
    "nosniff",
  );
  expect(headers["x-frame-options"], `${what}: never framed`).toBe("DENY");
  expect(
    headers["content-security-policy"],
    `${what}: a content security policy`,
  ).toBeTruthy();
  expect(headers["cache-control"], `${what}: never cached`).toBe("no-store");
}

test.describe("Bank health checks (/api/bank/health)", () => {
  // Live: 200 at once, no sign-in, with the bank's headers, as the spec says.
  test("live answers 200 without signing in, as the spec says", async ({
    request,
  }) => {
    expected(
      "GET /api/bank/health/live, not signed in: 200, { status: 'live' }, matches BankLiveResponse, with the bank's security headers and no caching",
    );
    const response = await test.step("ask live, not signed in", () =>
      request.get(LIVE));

    await test.step("check the answer", async () => {
      await expectStatus(response, 200, "live answers 200 without a sign-in");
      const body = await response.json();
      fact("live", JSON.stringify(body));
      expect(body.status, "live says the bank is live").toBe("live");
      const schema = matchesSchema("BankLiveResponse", body);
      expect(
        schema.valid,
        `the answer matches BankLiveResponse in bank/openapi.json: ${schema.errors}`,
      ).toBe(true);
      expectBankHeaders(response, "live");
    });
  });

  // Ready: 200 with the database, every migration and the revision.
  test("ready answers 200 with the database, every migration and the revision, as the spec says", async ({
    request,
  }) => {
    expected(
      "GET /api/bank/health/ready, not signed in: 200, status 'ready', the database /api/bank/status names, applied = expected = the files in bank/migrations, a revision; matches BankReadyResponse, with the bank's headers",
    );
    fact("migration files", MIGRATION_FILES);
    const status =
      await test.step("read which database the bank says it runs on", async () => {
        const response = await request.get("/api/bank/status");
        await expectStatus(response, 200, "the bank's status answers");
        return response.json();
      });
    const response = await test.step("ask ready, not signed in", () =>
      request.get(READY));

    await test.step("check the answer", async () => {
      await expectStatus(
        response,
        200,
        "ready answers 200: the database answered and every migration ran",
      );
      const body = await response.json();
      fact("ready", JSON.stringify(body));
      expect(body.status, "ready says ready").toBe("ready");
      expect(body.database, "the same database the status names").toBe(
        status.database,
      );
      expect(
        body.migrations.expected,
        "it expects every migration file in bank/migrations",
      ).toBe(MIGRATION_FILES);
      expect(body.migrations.applied, "every migration ran").toBe(
        body.migrations.expected,
      );
      expect(body.revision, "it names the revision it runs").toBeTruthy();
      const schema = matchesSchema("BankReadyResponse", body);
      expect(
        schema.valid,
        `the answer matches BankReadyResponse in bank/openapi.json: ${schema.errors}`,
      ).toBe(true);
      expectBankHeaders(response, "ready");
    });
  });

  // A database that can't answer: ready says 503 and what is missing, while
  // live still answers. On a short-lived server whose database the test hook
  // closes, started with a revision of the test's own.
  test("ready answers 503 when the database can't answer, while live still answers 200", async ({
    playwright,
  }) => {
    const revision = `health-test-${Date.now()}`;
    expected(
      "a short-lived bank with APP_REVISION set: ready 200 naming it; its database closed: ready 503 'not ready', DATABASE_UNAVAILABLE, 'The database did not answer.', applied null, matches BankReadyResponse; live still 200",
    );
    fact("revision", revision);
    const server =
      await test.step("start a bank whose database a test can close", () =>
        startBankServer({
          BANK_TEST_HOOKS: "true",
          APP_REVISION: revision,
          RENDER_GIT_COMMIT: "",
        }));
    const api = await playwright.request.newContext({
      baseURL: server.baseURL,
    });
    try {
      await test.step("ready answers 200 and names the revision", async () => {
        const response = await api.get(READY);
        await expectStatus(response, 200, "the new bank is ready");
        const body = await response.json();
        expect(body.revision, "ready names the commit from APP_REVISION").toBe(
          revision,
        );
      });

      await test.step("close the bank's database with the test hook", async () => {
        const response = await api.post(CLOSE_DATABASE);
        await expectStatus(response, 200, "the test hook closes the database");
      });

      await test.step("ready answers 503 and says the database did not answer", async () => {
        const response = await api.get(READY);
        await expectStatus(
          response,
          503,
          "ready refuses while the database can't answer",
        );
        const body = await response.json();
        fact("ready", JSON.stringify(body));
        expect(body.status, "ready says not ready").toBe("not ready");
        expect(body.code, "the code names what is missing").toBe(
          "DATABASE_UNAVAILABLE",
        );
        expect(body.message, "the message says it in words").toBe(
          "The database did not answer.",
        );
        expect(
          body.migrations.applied,
          "no migration count without an answer",
        ).toBeNull();
        expect(
          body.migrations.expected,
          "it still says how many it expects",
        ).toBe(MIGRATION_FILES);
        const schema = matchesSchema("BankReadyResponse", body);
        expect(
          schema.valid,
          `the 503 matches BankReadyResponse in bank/openapi.json: ${schema.errors}`,
        ).toBe(true);
      });

      await test.step("live still answers 200", async () => {
        const response = await api.get(LIVE);
        await expectStatus(
          response,
          200,
          "live never asks the database, so a host never restarts the bank for a slow one",
        );
      });
    } finally {
      await api.dispose();
      await server.stop();
    }
  });

  // The hook is a test's alone: a bank without the setting has no such
  // address, and its database stays open.
  test("the close-the-database hook does not exist without BANK_TEST_HOOKS", async ({
    playwright,
  }) => {
    expected(
      "a short-lived bank without BANK_TEST_HOOKS: POST /api/bank/test/close-database 404; ready still 200",
    );
    const server = await test.step("start a bank without the setting", () =>
      startBankServer({ BANK_TEST_HOOKS: "" }));
    const api = await playwright.request.newContext({
      baseURL: server.baseURL,
    });
    try {
      await test.step("ask the hook's address", async () => {
        const response = await api.post(CLOSE_DATABASE);
        await expectStatus(
          response,
          404,
          "without the setting, the hook's address does not exist",
        );
      });

      await test.step("ready still answers 200", async () => {
        const response = await api.get(READY);
        await expectStatus(response, 200, "the database is still open");
      });
    } finally {
      await api.dispose();
      await server.stop();
    }
  });
});
