import type { Page } from "@playwright/test";
import type { ContractValidationResult, PageContract } from "./contracts";
import { productPageContract } from "./contracts";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function intersectionArea(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
) {
  const overlapWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)
  );

  return overlapWidth * overlapHeight;
}

export class PageValidationAgent {
  constructor(private readonly page: Page) {}

  async validateContract(contract: PageContract): Promise<ContractValidationResult> {
    const missingElements: string[] = [];
    const missingHeadings: string[] = [];
    const missingRoles: string[] = [];
    const invalidNumericFields: string[] = [];
    const numericFieldReadings: Array<{ label: string; text: string }> = [];
    const overlapPairs: string[] = [];
    const requiredTestIds = contract.requiredTestIds || [];
    const requiredHeadings = contract.requiredHeadings || [];
    const requiredRoles = contract.requiredRoles || [];
    const requiredTextTokens = contract.requiredTextTokens || [];
    const forbiddenTextTokens = contract.forbiddenTextTokens || [];
    const numericFields = contract.numericFields || [];
    const overlapCandidates = contract.overlapPairs || [];

    for (const testId of requiredTestIds) {
      const isVisible = await this.page.getByTestId(testId).isVisible().catch(() => false);

      if (!isVisible) {
        missingElements.push(testId);
      }
    }

    for (const heading of requiredHeadings) {
      const isVisible = await this.page.getByRole("heading", { name: heading }).isVisible().catch(() => false);

      if (!isVisible) {
        missingHeadings.push(heading);
      }
    }

    for (const requiredRole of requiredRoles) {
      const locator = this.page.getByRole(
        requiredRole.role as any,
        requiredRole.name ? { name: requiredRole.name } : {}
      );
      const isVisible = await locator.isVisible().catch(() => false);

      if (!isVisible) {
        missingRoles.push(`${requiredRole.role}:${requiredRole.name || "*"}`);
      }
    }

    const pageText = await this.page.locator("body").innerText();
    const pageTextLower = pageText.toLowerCase();
    const missingTextTokens = requiredTextTokens.filter((token) => {
      return !pageTextLower.includes(token.toLowerCase());
    });
    const forbiddenTextMatches = forbiddenTextTokens.filter((token) => {
      return new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(pageText);
    });
    const issues: string[] = [];

    if (missingElements.length > 0) {
      issues.push(`Missing required elements: ${missingElements.join(", ")}.`);
    }

    if (missingHeadings.length > 0) {
      issues.push(`Missing required headings: ${missingHeadings.join(", ")}.`);
    }

    if (missingRoles.length > 0) {
      issues.push(`Missing required roles: ${missingRoles.join(", ")}.`);
    }

    if (missingTextTokens.length > 0) {
      issues.push(`Missing required text tokens: ${missingTextTokens.join(", ")}.`);
    }

    for (const field of numericFields) {
      const fieldText = (await this.page.getByTestId(field.testId).textContent().catch(() => "")) || "";
      const numericMatch = fieldText.match(/-?\d+(?:\.\d+)?/);
      const numericValue = numericMatch ? Number(numericMatch[0]) : Number.NaN;

      numericFieldReadings.push({
        label: field.label,
        text: fieldText
      });

      if (!Number.isFinite(numericValue)) {
        invalidNumericFields.push(field.label);
      }
    }

    for (const invalidField of invalidNumericFields) {
      issues.push(`Rendered ${invalidField} is not a finite number.`);
    }

    for (const forbiddenToken of forbiddenTextMatches) {
      issues.push(`Rendered page contains a ${forbiddenToken} token.`);
    }

    for (const overlapCandidate of overlapCandidates) {
      const leftBox = await this.page.getByTestId(overlapCandidate.leftTestId).boundingBox();
      const rightBox = await this.page.getByTestId(overlapCandidate.rightTestId).boundingBox();

      if (leftBox && rightBox && intersectionArea(leftBox, rightBox) > 0) {
        overlapPairs.push(
          overlapCandidate.label ||
            `${overlapCandidate.leftTestId} overlaps ${overlapCandidate.rightTestId}`
        );
      }
    }

    if (overlapPairs.length > 0) {
      issues.push(`Visual overlap detected: ${overlapPairs.join("; ")}.`);
    }

    return {
      contractName: contract.name,
      engine: "deterministic",
      evidence: {
        forbiddenTextMatches,
        invalidNumericFields,
        missingElements,
        missingHeadings,
        missingRoles,
        missingTextTokens,
        numericFieldReadings,
        overlapPairs,
        pageText
      },
      explanation:
        issues.length === 0
          ? `The ${contract.name} contract passed: required elements, text signals, numeric fields, and overlap checks all succeeded.`
          : `Validation failed because: ${issues.join(" ")}`,
      issues,
      valid: issues.length === 0
    };
  }

  async validateProductPage(): Promise<ContractValidationResult> {
    return this.validateContract(productPageContract);
  }
}
