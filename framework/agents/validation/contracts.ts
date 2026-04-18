export type RequiredRoleContract = {
  name?: string;
  role: string;
};

export type NumericFieldContract = {
  label: string;
  testId: string;
};

export type OverlapPairContract = {
  label?: string;
  leftTestId: string;
  rightTestId: string;
};

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

export type ContractValidationResult = {
  contractName: string;
  engine: string;
  evidence: Record<string, unknown>;
  explanation: string;
  issues: string[];
  valid: boolean;
};

export const homePageContract: PageContract = {
  name: "home-page",
  requiredTestIds: [
    "hero-heading",
    "join-now",
    "inspect-product",
    "check-health",
    "health-output",
    "triage-input",
    "triage-output"
  ],
  requiredHeadings: ["Make failures visible. Recover on purpose."],
  requiredTextTokens: [
    "Runtime Healing",
    "Scenario Coverage",
    "Operations Checkpoint",
    "Quick Triage"
  ]
};

export const dashboardPageContract: PageContract = {
  name: "dashboard-page",
  requiredTestIds: [
    "orders-mode",
    "orders-delay",
    "refresh-orders",
    "orders-status",
    "orders-table"
  ],
  requiredHeadings: ["Orders Recovery Console", "Live orders feed"],
  requiredTextTokens: ["Automatic Retry Rules", "Live orders feed"],
  forbiddenTextTokens: ["undefined", "NaN"]
};

export const userManagerPageContract: PageContract = {
  name: "user-manager-page",
  requiredTestIds: [
    "user-manager-heading",
    "user-table",
    "add-user-btn",
    "user-search",
    "user-count"
  ],
  requiredHeadings: ["User Manager"],
  requiredTextTokens: ["Add User", "Search"],
  forbiddenTextTokens: ["undefined", "NaN", "null"]
};

export const ordersPageContract: PageContract = {
  name: "orders-page",
  requiredTestIds: [
    "orders-heading",
    "orders-list",
    "orders-count",
    "refresh-orders-btn",
    "orders-filter-status"
  ],
  requiredHeadings: ["Orders"],
  requiredTextTokens: ["Open orders", "Total"],
  forbiddenTextTokens: ["undefined", "NaN"]
};

export const adminPageContract: PageContract = {
  name: "admin-page",
  requiredTestIds: [
    "admin-heading",
    "admin-log",
    "admin-action-count",
    "refresh-admin-log-btn",
    "clear-admin-log-btn"
  ],
  requiredHeadings: ["Admin Console"],
  requiredTextTokens: ["Audit Log", "Recent actions"],
  forbiddenTextTokens: ["undefined", "NaN"]
};

export const profilePageContract: PageContract = {
  name: "profile-page",
  requiredTestIds: [
    "profile-heading",
    "profile-name",
    "profile-email",
    "edit-profile-btn",
    "save-profile-btn",
    "profile-status"
  ],
  requiredHeadings: ["Profile"],
  requiredTextTokens: ["Display Name", "Email"],
  forbiddenTextTokens: ["undefined", "NaN", "null"]
};

export const settingsPageContract: PageContract = {
  name: "settings-page",
  requiredTestIds: [
    "settings-heading",
    "settings-theme",
    "settings-notifications",
    "save-settings-btn",
    "settings-status"
  ],
  requiredHeadings: ["Settings"],
  requiredTextTokens: ["Theme", "Notifications"],
  forbiddenTextTokens: ["undefined", "NaN"]
};

export const productPageContract: PageContract = {
  name: "product-page",
  requiredTestIds: [
    "product-layout",
    "product-title",
    "product-summary",
    "product-price",
    "buy-button",
    "product-notes"
  ],
  requiredHeadings: ["Agentic QA Console"],
  numericFields: [{ label: "product price", testId: "product-price" }],
  overlapPairs: [{ leftTestId: "product-price", rightTestId: "buy-button" }],
  forbiddenTextTokens: ["undefined", "NaN"]
};
