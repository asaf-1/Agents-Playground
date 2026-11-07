// Page contracts: what each page of the classic site must show to count as
// whole and readable. The page checker (PageValidationAgent.ts) tests a page
// against one.

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

// The landing page.
export const homePageContract: PageContract = {
  name: "home-page",
  requiredTestIds: [
    "hero-heading",
    "join-now",
    "inspect-product",
    "check-health",
    "health-output",
    "triage-input",
    "triage-output",
  ],
  requiredHeadings: ["Make failures visible. Recover on purpose."],
  requiredTextTokens: [
    "Runtime Healing",
    "Scenario Coverage",
    "Operations Checkpoint",
    "Quick Triage",
  ],
};

// The dashboard.
export const dashboardPageContract: PageContract = {
  name: "dashboard-page",
  requiredTestIds: [
    "orders-mode",
    "orders-delay",
    "refresh-orders",
    "orders-status",
    "orders-table",
  ],
  requiredHeadings: ["Orders Recovery Console", "Live orders feed"],
  requiredTextTokens: ["Automatic Retry Rules", "Live orders feed"],
  forbiddenTextTokens: ["undefined", "NaN"],
};

// User Manager.
export const userManagerPageContract: PageContract = {
  name: "user-manager-page",
  requiredTestIds: [
    "user-manager-heading",
    "user-table",
    "add-user-btn",
    "user-search",
    "user-count",
  ],
  requiredHeadings: ["User Manager"],
  requiredTextTokens: ["Add User", "Search"],
  forbiddenTextTokens: ["undefined", "NaN", "null"],
};

// The Orders page.
export const ordersPageContract: PageContract = {
  name: "orders-page",
  requiredTestIds: [
    "orders-heading",
    "orders-list",
    "orders-count",
    "refresh-orders-btn",
    "orders-filter-status",
  ],
  requiredHeadings: ["Orders"],
  requiredTextTokens: ["Open orders", "Total"],
  forbiddenTextTokens: ["undefined", "NaN"],
};

// The Admin page.
export const adminPageContract: PageContract = {
  name: "admin-page",
  requiredTestIds: [
    "admin-heading",
    "admin-log",
    "admin-action-count",
    "refresh-admin-log-btn",
    "clear-admin-log-btn",
  ],
  requiredHeadings: ["Admin Console"],
  requiredTextTokens: ["Audit Log", "Recent actions"],
  forbiddenTextTokens: ["undefined", "NaN"],
};

// The Profile page.
export const profilePageContract: PageContract = {
  name: "profile-page",
  requiredTestIds: [
    "profile-heading",
    "profile-name",
    "profile-email",
    "edit-profile-btn",
    "save-profile-btn",
    "profile-status",
  ],
  requiredHeadings: ["Profile"],
  requiredTextTokens: ["Display Name", "Email"],
  forbiddenTextTokens: ["undefined", "NaN", "null"],
};

// The Settings page.
export const settingsPageContract: PageContract = {
  name: "settings-page",
  requiredTestIds: [
    "settings-heading",
    "settings-theme",
    "settings-notifications",
    "save-settings-btn",
    "settings-status",
  ],
  requiredHeadings: ["Settings"],
  requiredTextTokens: ["Theme", "Notifications"],
  forbiddenTextTokens: ["undefined", "NaN"],
};

// The product page. Its broken state fails this on purpose: a NaN price and a
// price that overlaps the buy button.
export const productPageContract: PageContract = {
  name: "product-page",
  requiredTestIds: [
    "product-layout",
    "product-title",
    "product-summary",
    "product-price",
    "buy-button",
    "product-notes",
  ],
  requiredHeadings: ["Agentic QA Console"],
  numericFields: [{ label: "product price", testId: "product-price" }],
  overlapPairs: [{ leftTestId: "product-price", rightTestId: "buy-button" }],
  forbiddenTextTokens: ["undefined", "NaN"],
};

// The login page.
export const loginPageContract: PageContract = {
  name: "login-page",
  requiredTestIds: [
    "login-form",
    "login-heading",
    "login-email",
    "login-password",
    "login-submit",
    "login-error",
  ],
  requiredHeadings: ["Sign In"],
  requiredTextTokens: ["Email", "Password"],
  forbiddenTextTokens: ["undefined", "NaN"],
};
