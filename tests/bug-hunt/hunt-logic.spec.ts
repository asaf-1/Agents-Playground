// The bug hunt's own rules, checked before any walk starts (the "logic"
// project; "walk" depends on it). Pure functions, no server, milliseconds:
// route patterns, the honesty labels, fingerprints, merging, masking, the
// planted-fault paths and the score.

// The app's route table, as the walk reads it.
import { appRoutes } from "../../framework/helpers/bugHunt/walk";
// The [RESULT] block's test tools.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// The pieces under test.
import {
  HONESTY,
  classify,
  fingerprint,
  maskSecrets,
  mergeFindings,
  routePattern,
  toFinding,
  type Signal,
} from "../../framework/helpers/bugHunt/findings";
import {
  pathsIn,
  renderReport,
  scoreFindings,
} from "../../framework/helpers/bugHunt/score";

// A signal on a page, with the parts a test sets.
function signal(part: Partial<Signal>): Signal {
  return {
    kind: "server-error",
    page: "/app/bank",
    action: "open the page",
    ...part,
  } as Signal;
}

test.describe("The bug hunt's rules", () => {
  // The walk starts from the app's own route table, like a sitemap.
  test("knows the app's pages from its route table", () => {
    expected(
      "web/src/App.tsx read as /app patterns: the home, the bank, detail pages as :id, no repeats",
    );
    const routes = appRoutes();
    fact("routes", routes.length);
    expect(routes.length).toBeGreaterThan(30);
    expect(routes).toContain("/app");
    expect(routes).toContain("/app/bank");
    expect(routes).toContain("/app/bank/accounts/:id");
    expect(routes).toContain("/app/notifications");
    expect(new Set(routes).size).toBe(routes.length);
  });

  // Pages that differ only by an id, a uuid or a coin symbol are one pattern.
  test("gives one pattern to pages that differ only by an id", () => {
    expected(
      "ids, uuids and coin symbols become :id; words stay; the query string goes",
    );
    const patterns = {
      account: routePattern("/app/bank/accounts/12"),
      coin: routePattern("/app/markets/BTC"),
      payee: routePattern(
        "/api/bank/payees/6100d643-2bc9-4258-b743-c90f93208e7d",
      ),
      admin: routePattern("/app/admin/shop-orders"),
      query: routePattern("/app/bank?tab=history"),
    };
    fact("patterns", patterns);
    expect(patterns).toEqual({
      account: "/app/bank/accounts/:id",
      coin: "/app/markets/:id",
      payee: "/api/bank/payees/:id",
      admin: "/app/admin/shop-orders",
      query: "/app/bank",
    });
  });

  // The honesty labels: seen twice earns high; the walk never says
  // expected-bad-ux or test-gap, and a lone console error stays inconclusive.
  test("labels each kind of finding by the honesty rules", () => {
    expected(
      "5xx twice bug/high/major, once medium; console once inconclusive/low, CSP bug/high; dead link bug/high/minor; slow inconclusive/nit",
    );
    const labels = {
      serverTwice: classify(
        signal({
          method: "GET",
          path: "/api/bank/x",
          status: 500,
          reproduced: true,
        }),
      ),
      serverOnce: classify(
        signal({ method: "POST", path: "/api/bank/x", status: 502 }),
      ),
      consoleOnce: classify(signal({ kind: "console-error", message: "boom" })),
      csp: classify(
        signal({
          kind: "console-error",
          message:
            "Refused to load the script because it violates the Content Security Policy",
        }),
      ),
      deadLink: classify(
        signal({ kind: "dead-link", page: "/app/nowhere", from: "/app/bank" }),
      ),
      slow: classify(
        signal({
          kind: "slow",
          method: "GET",
          path: "/api/bank/market",
          ms: 2500,
        }),
      ),
    };
    fact(
      "labels",
      Object.fromEntries(
        Object.entries(labels).map(([k, v]) => [
          k,
          `${v.classification}/${v.confidence}/${v.severity}`,
        ]),
      ),
    );

    expect(labels.serverTwice).toMatchObject({
      classification: "bug",
      confidence: "high",
      severity: "major",
    });
    expect(labels.serverOnce).toMatchObject({
      classification: "bug",
      confidence: "medium",
    });
    expect(labels.consoleOnce).toMatchObject({
      classification: "inconclusive",
      confidence: "low",
    });
    expect(labels.csp).toMatchObject({
      classification: "bug",
      confidence: "high",
      severity: "minor",
    });
    expect(labels.deadLink).toMatchObject({
      classification: "bug",
      confidence: "high",
      severity: "minor",
    });
    expect(labels.slow).toMatchObject({
      classification: "inconclusive",
      severity: "nit",
    });
    // Every label the walk gives is one honesty.json defines.
    for (const value of Object.values(labels)) {
      expect(Object.keys(HONESTY.classifications)).toContain(
        value.classification,
      );
      expect(Object.keys(HONESTY.confidence)).toContain(value.confidence);
      expect(Object.keys(HONESTY.severity)).toContain(value.severity);
    }
  });

  // One problem, one finding: the same endpoint failing on two pages and in
  // two walks merges, with the stronger confidence kept.
  test("merges the same problem seen on many pages into one finding", () => {
    expected(
      "two server errors on one endpoint from two pages and two walks: one finding, both pages and walks, high confidence",
    );
    const one = toFinding(
      signal({
        page: "/app/bank",
        method: "GET",
        path: "/api/bank/accounts/1",
        status: 500,
      }),
      "customer, practice off",
    );
    const two = toFinding(
      signal({
        page: "/app/wallet",
        method: "GET",
        path: "/api/bank/accounts/2",
        status: 500,
        reproduced: true,
      }),
      "customer, practice on",
    );
    const merged = mergeFindings([one, two]);
    fact("fingerprint", merged[0].fingerprint);

    expect(one.fingerprint).toBe(two.fingerprint);
    expect(merged).toHaveLength(1);
    expect(merged[0].pages).toEqual(["/app/bank", "/app/wallet"]);
    expect(merged[0].passes).toEqual([
      "customer, practice off",
      "customer, practice on",
    ]);
    expect(merged[0].confidence).toBe("high");
    expect(fingerprint(signal({ kind: "dead-link", page: "/app/x/1" }))).toBe(
      "local|/app/x/:id|dead-link",
    );
  });

  // Nothing secret reaches a finding.
  test("masks keys, tokens and passwords in what a finding keeps", () => {
    expected("pbk_ keys, Bearer tokens and password values become ***");
    const masked = maskSecrets(
      'key pbk_abc123 with Bearer xyz.789 and {"password":"hunter2"}',
    );
    fact("masked", masked);
    expect(masked).toBe('key pbk_*** with Bearer *** and {"password":"***"}');
    const finding = toFinding(
      signal({ kind: "console-error", message: "token pbk_zzz9" }),
      "signed out",
    );
    expect(finding.message).toBe("token pbk_***");
  });

  // The paths a planted fault's "where" names, as patterns.
  test("reads the paths out of a planted fault's where", () => {
    expected("app and API paths, {id} as :id, the words around them dropped");
    const paths = {
      page: pathsIn(
        "/app/bank/accounts/{id} — the history filter, and the CSV",
      ),
      api: pathsIn("POST /api/bank/transfers"),
      two: pathsIn("POST /api/bank/graphql, and the explorer at /app/graphql"),
      classic: pathsIn("/user-manager, signed in as an Editor"),
    };
    fact("paths", paths);
    expect(paths).toEqual({
      page: ["/app/bank/accounts/:id"],
      api: ["/api/bank/transfers"],
      two: ["/api/bank/graphql", "/app/graphql"],
      classic: [],
    });
  });

  // The score: seen with practice off is new; practice-only by endpoint is
  // found, by page only maybe, by nothing unmatched; noise is never counted.
  test("scores findings against the planted faults", () => {
    expected(
      "off-walk bug new; on-only endpoint match found; on-only page match maybe; on-only no match unmatched; inconclusive not counted",
    );
    const faults = [
      {
        flag: "aTransfer",
        title: "Transfers break",
        where: "POST /api/bank/transfers",
      },
      {
        flag: "aWallet",
        title: "Wallet breaks",
        where: "/app/wallet — the send form",
      },
    ];
    const findings = [
      toFinding(
        signal({
          page: "/app/bank",
          method: "GET",
          path: "/api/bank/me",
          status: 500,
          reproduced: true,
        }),
        "customer, practice off",
      ),
      toFinding(
        signal({
          page: "/app/bank/transfer",
          method: "POST",
          path: "/api/bank/transfers",
          status: 500,
        }),
        "customer, practice on",
      ),
      toFinding(
        signal({
          kind: "page-error",
          page: "/app/wallet",
          message: "x is undefined",
          reproduced: true,
        }),
        "customer, practice on",
      ),
      toFinding(
        signal({ kind: "blank-page", page: "/app/cards", reproduced: true }),
        "customer, practice on",
      ),
      toFinding(
        signal({ kind: "console-error", page: "/app/bank", message: "once" }),
        "customer, practice on",
      ),
    ];
    const score = scoreFindings(findings, faults);
    fact("score", {
      found: score.found.map((m) => m.fault.flag),
      maybe: score.maybe.map((m) => m.fault.flag),
      fresh: score.fresh.length,
      unmatched: score.unmatched.length,
    });

    expect(score.planted).toBe(2);
    expect(score.found.map((m) => m.fault.flag)).toEqual(["aTransfer"]);
    expect(score.maybe.map((m) => m.fault.flag)).toEqual(["aWallet"]);
    expect(score.fresh.map((f) => f.endpoint)).toEqual(["GET /api/bank/me"]);
    expect(score.unmatched.map((f) => f.kind)).toEqual(["blank-page"]);

    const report = renderReport({
      when: "now",
      base: "http://127.0.0.1:4173",
      walks: [{ pass: "customer, practice on", pages: 5, pressed: 3 }],
      findings,
      score,
    });
    expect(report).toContain(
      "**Score: found 1 of 2 planted faults, 1 maybe, 1 new.**",
    );
    expect(report).toContain("## Hand-off");
  });
});
