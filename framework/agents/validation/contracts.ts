// Page contracts: what each of the bank's pages must show to count as whole
// and readable. The page checker (PageValidationAgent.ts) tests a page against
// one; the AI agents' scenarios, the sanity and the functional tests use them.

// A control that must be there, found by its role and, optionally, its name.
export type RequiredRoleContract = {
  name?: string;
  role: string;
};

// A field that must show a real number.
export type NumericFieldContract = {
  label: string;
  testId: string;
};

// Two parts that must not overlap on screen.
export type OverlapPairContract = {
  label?: string;
  leftTestId: string;
  rightTestId: string;
};

// One page's contract: the test ids, headings, roles and words it must show,
// the words it must never show (like "NaN"), its number fields, and the parts
// that must not overlap.
export type PageContract = {
  forbiddenTextTokens?: string[];
  name: string;
  numericFields?: NumericFieldContract[];
  overlapPairs?: OverlapPairContract[];
  requiredHeadings?: string[];
  requiredRoles?: RequiredRoleContract[];
  requiredTestIds?: string[];
  requiredTextTokens?: string[];
};

// What a check reports: pass or fail, each problem, and the evidence.
export type ContractValidationResult = {
  contractName: string;
  engine: string;
  evidence: Record<string, unknown>;
  explanation: string;
  issues: string[];
  valid: boolean;
};

// The bank's home page (/app): its hero, the four areas, and the way into the
// back office.
export const homePageContract: PageContract = {
  name: "home-page",
  requiredTestIds: [
    "app-home",
    "app-heading",
    "hub-cta-practice",
    "hub-card-bank",
    "hub-card-crypto",
    "hub-card-shop",
    "hub-card-backoffice",
    "hub-link-orders",
    "hub-link-users",
  ],
  requiredHeadings: ["Explore", "What you can practice here"],
  requiredTextTokens: ["Bank", "Crypto exchange", "Gear shop", "Back office"],
  forbiddenTextTokens: ["undefined", "NaN"],
};

// The back office's Orders page (/app/orders): its modes, Refresh, and the
// table once the orders are in.
export const ordersPageContract: PageContract = {
  name: "orders-page",
  requiredTestIds: [
    "orders-page",
    "orders-controls",
    "orders-mode-stable",
    "orders-mode-slow",
    "orders-mode-flaky",
    "orders-refresh",
    "orders-table",
  ],
  requiredHeadings: ["Orders"],
  requiredTextTokens: ["Customer", "Status", "Total", "Region"],
  forbiddenTextTokens: ["undefined", "NaN"],
};

// The back office's Users page (/app/users): search, New user, and the table.
// No heading by role: the AI agents' demos check it with a dialog open, and a
// Radix dialog hides the rest of the page from the accessibility tree; the
// test ids and the words still show it is whole.
export const usersPageContract: PageContract = {
  name: "users-page",
  requiredTestIds: [
    "users-page",
    "users-asof",
    "users-search",
    "users-create-open",
    "users-table",
  ],
  requiredTextTokens: ["Directory as of", "New user", "Role", "Status"],
  forbiddenTextTokens: ["undefined", "NaN", "null"],
};

// One gear-shop product (/app/products/:id). The AI agents' broken state (the
// test flag productRenderBroken) fails this on purpose: a NaN price drawn over
// the buy area.
export const productPageContract: PageContract = {
  name: "product-page",
  requiredTestIds: [
    "product-detail",
    "app-heading",
    "product-sku",
    "product-category",
    "product-detail-price",
    "product-stock",
    "product-detail-status",
    "product-buy",
  ],
  numericFields: [{ label: "product price", testId: "product-detail-price" }],
  overlapPairs: [
    { leftTestId: "product-detail-price", rightTestId: "product-buy" },
  ],
  forbiddenTextTokens: ["undefined", "NaN"],
};

// The sign-in status page (/app/account): the bank account and the
// back-office session.
export const accountPageContract: PageContract = {
  name: "account-page",
  requiredTestIds: ["account-page", "account-bank", "account-backoffice"],
  requiredHeadings: ["Playground Bank account", "Back-office session"],
  requiredTextTokens: ["Back-office session"],
  forbiddenTextTokens: ["undefined", "NaN"],
};
