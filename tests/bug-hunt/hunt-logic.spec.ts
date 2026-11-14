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
  checkFinding,
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
  placeOf,
  renderReport,
  scoreFindings,
  wordWeights,
  wordsOf,
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

  // The score: seen with practice off is new; practice-only at a fault's
  // place with its story is found, with a weak story a maybe, with nothing in
  // common unmatched; noise is never counted.
  test("scores findings against the planted faults", () => {
    expected(
      "off-walk bug new; on-only 500 at the transfer fault's endpoint with its words found; on-only wallet error sharing one word maybe; on-only empty cards page unmatched; inconclusive not counted",
    );
    const faults = [
      {
        flag: "aTransfer",
        title: "A transfer answers 500 when its memo is long",
        hint: "Write a long memo.",
        where: "POST /api/bank/transfers",
      },
      {
        flag: "aWallet",
        title: "The wallet send form loses the fee",
        hint: "Send a small amount.",
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
    expect(report).toContain(
      "Matched at the same endpoint or page; words in common: transfers, answers, 500",
    );
    expect(report).toContain("## Hand-off");
  });

  // One finding finds one fault at most. A page fault is found from its API
  // (the same area), and two faults on one endpoint are told apart by their
  // rare words: the first Claude hunt credited one GraphQL finding with all
  // six GraphQL faults before this.
  test("finds one fault per finding, by place and rare words", () => {
    expected(
      "negative amount at POST /api/bank/transfers finds the page fault at /app/bank/transfer (same area), not the race at that endpoint; an 18-levels-deep query finds the depth fault, not the leak on the same endpoint",
    );
    const faults = [
      {
        flag: "aNegative",
        title: "A negative amount moves money the other way",
        hint: "Try an amount below zero.",
        where: "/app/bank/transfer",
      },
      {
        flag: "aRace",
        title: "Two transfers at once overdraw the account",
        where: "POST /api/bank/transfers",
      },
      {
        flag: "aLeak",
        title: "A nested field returns another customer's email",
        where: "POST /api/bank/graphql",
      },
      {
        flag: "aDepth",
        title: "A deeply nested query is run instead of refused",
        where: "POST /api/bank/graphql",
      },
    ];
    // Written by hand, the way the /bug-hunt skill writes them.
    const written = (path: string, title: string) => ({
      ...toFinding(
        signal({ method: "POST", path, status: 200, reproduced: true }),
        "customer, practice on",
      ),
      kind: "logic",
      title,
    });
    const negative = written(
      "/api/bank/transfers",
      "A negative amount is accepted and pulls money in",
    );
    const deep = written(
      "/api/bank/graphql",
      "A query 18 levels deep is answered",
    );

    // The pieces: rough stems, rarity, and the two kinds of place.
    const weights = wordWeights(faults);
    const pieces = {
      stems: [...wordsOf("deeply nested queries")],
      nested: weights.get("nest"),
      negative: weights.get("negative"),
      pageFault: placeOf(negative, faults[0]),
      endpointFault: placeOf(negative, faults[1]),
      elsewhere: placeOf(negative, faults[2]),
    };
    fact("pieces", pieces);
    expect(pieces).toEqual({
      stems: ["deep", "nest", "query"],
      nested: 0.5,
      negative: 1,
      pageFault: "area",
      endpointFault: "same",
      elsewhere: null,
    });

    const score = scoreFindings([negative, deep], faults);
    fact("score", {
      found: score.found.map((m) => m.fault.flag),
      maybe: score.maybe.map((m) => m.fault.flag),
    });
    expect(score.found.map((m) => m.fault.flag)).toEqual([
      "aNegative",
      "aDepth",
    ]);
    expect(score.maybe).toEqual([]);
    expect(score.found[0].why[0]).toContain("in the same area");
  });

  // A finding the /bug-hunt skill writes by hand is checked against the
  // honesty rules before it is scored: an unknown label, "high" without being
  // seen again, or no walk is refused.
  test("refuses a written finding that breaks the honesty rules", () => {
    expected(
      "a good finding has no problems; a made-up label, high without reproduced, and no passes are each named",
    );
    const good = {
      fingerprint: "local|POST /api/bank/x|wrong-total",
      title: "The total is wrong",
      page: "/app/bank",
      classification: "bug",
      confidence: "high" as const,
      severity: "major" as const,
      reproduced: true,
      passes: ["customer, practice on" as const],
    };
    const problems = {
      good: checkFinding(good),
      label: checkFinding({ ...good, classification: "probably-bad" }),
      unrepeated: checkFinding({ ...good, reproduced: false }),
      nowhere: checkFinding({ ...good, passes: [] }),
    };
    fact("problems", problems);

    expect(problems.good).toEqual([]);
    expect(problems.label.join(" ")).toContain(
      '"probably-bad" is not in honesty.json',
    );
    expect(problems.unrepeated.join(" ")).toContain(
      "needs it to be seen again",
    );
    expect(problems.nowhere.join(" ")).toContain("no passes");
  });

  // Claude's own steps, expected and actual reach the report, which says who
  // hunted; a practice-only finding at a fault's endpoint, telling its story,
  // is found.
  test("scores and reports a written finding with its own steps", () => {
    expected(
      "a practice-only finding at DELETE /api/bank/payees/:id about deleting a payee finds the fault living there; the report shows its steps, expected, actual, who hunted and the requests sent",
    );
    const faults = [
      {
        flag: "aPayee",
        title: "Another customer's payee can be deleted",
        hint: "Delete a payee by its id while signed in as someone else.",
        where: "DELETE /api/bank/payees/{id}",
      },
    ];
    const written = {
      ...toFinding(
        signal({
          page: "/app/bank/bills",
          method: "DELETE",
          path: "/api/bank/payees/9f0c1d2e-0000-4000-8000-000000000001",
          status: 200,
          reproduced: true,
        }),
        "customer, practice on",
      ),
      kind: "access",
      classification: "bug",
      title: "Customer A deletes customer B's payee",
      steps: ["Sign up A and B.", "As A, delete B's payee by its id."],
      expected: "404: it is not A's payee.",
      actual: "200, and B's payee is gone.",
    };
    const score = scoreFindings([written], faults);
    const report = renderReport({
      when: "now",
      base: "http://127.0.0.1:4173",
      walks: [
        { pass: "customer, practice on", pages: 3, pressed: 2, requests: 7 },
      ],
      findings: [written],
      score,
      by: "Hunted by Claude.",
    });
    fact(
      "found",
      score.found.map((m) => m.fault.flag),
    );

    expect(score.found.map((m) => m.fault.flag)).toEqual(["aPayee"]);
    expect(report).toContain("Hunted by Claude.");
    // The requests sent by hand, counted against the skill's cap.
    expect(report).toContain("| customer, practice on | 3 | 2 | 7 |");
    expect(report).toContain("1. Sign up A and B.");
    expect(report).toContain("2. As A, delete B's payee by its id.");
    expect(report).toContain("Expected: 404: it is not A's payee.");
    expect(report).toContain("Actual: 200, and B's payee is gone.");
  });
});
