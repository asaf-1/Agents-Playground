import type { Page } from "@playwright/test";
import type {
  HealedLocatorCandidate,
  LocatorHealRequest,
  LocatorHealResult,
  LocatorTargetType
} from "./types";

function getCandidateSelector(targetType: LocatorTargetType) {
  switch (targetType) {
    case "link":
      return "a[href], [role='link']";
    case "input":
      return "input:not([type='hidden']), textarea, select, [role='textbox'], [role='searchbox'], [role='combobox']";
    case "menuitem":
      return "[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']";
    case "select":
      return "select, [role='combobox']";
    default:
      return "button, [role='button'], summary";
  }
}

function tokenize(value: string | undefined | null) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreTokens(searchable: string, tokens: string[], pointsPerMatch: number) {
  return tokens.reduce((score, token) => {
    return searchable.includes(token.toLowerCase()) ? score + pointsPerMatch : score;
  }, 0);
}

function matchesContext(context: string, tokens?: string[]) {
  const normalized = context.toLowerCase();

  return (tokens || []).length === 0 || (tokens || []).every((token) => normalized.includes(token.toLowerCase()));
}

function scoreCandidate(candidate: Omit<HealedLocatorCandidate, "score">, request: LocatorHealRequest) {
  const searchable = [
    candidate.text,
    candidate.className,
    candidate.testId || "",
    candidate.ariaLabel || "",
    candidate.labelText || "",
    candidate.name || "",
    candidate.placeholder || "",
    candidate.href || "",
    candidate.id || "",
    candidate.role || "",
    candidate.rowText,
    candidate.sectionText
  ]
    .join(" ")
    .toLowerCase();
  const staleSelectorTokens = tokenize(request.staleSelector);
  const intentScore = scoreTokens(searchable, request.intentTokens, 5);
  const staleSelectorScore = scoreTokens(searchable, staleSelectorTokens, 1.4);
  const labelScore = scoreTokens(candidate.labelText.toLowerCase(), request.labelTokens || [], 6);
  const placeholderScore = scoreTokens(
    `${candidate.placeholder || ""} ${candidate.text}`.toLowerCase(),
    request.placeholderTokens || [],
    5
  );
  const sectionScore = scoreTokens(candidate.sectionText.toLowerCase(), request.sectionTokens || [], 4.5);
  const rowScore = scoreTokens(candidate.rowText.toLowerCase(), request.rowTokens || [], 6);
  const semanticScore =
    (candidate.testId ? 1.5 : 0) +
    (candidate.id ? 1.25 : 0) +
    (candidate.ariaLabel ? 1.25 : 0) +
    (candidate.labelText ? 1.5 : 0) +
    (candidate.placeholder ? 1.25 : 0);
  const classScore = /rounded|primary|cta|nav|field|input|menu|dialog|table|row/.test(
    candidate.className.toLowerCase()
  )
    ? 2
    : 0;
  const typeBonus =
    request.targetType === "menuitem" && /menuitem/.test(candidate.role || "")
      ? 8
      : request.targetType === "select" && (candidate.tagName === "select" || candidate.role === "combobox")
      ? 8
      : request.targetType === "link" && (candidate.tagName === "a" || candidate.role === "link")
      ? 6
      : request.targetType === "input" &&
        (
          /input|textarea|select/.test(candidate.tagName) ||
          /textbox|searchbox|combobox/.test(candidate.role || "")
        )
      ? 6
      : request.targetType === "button" && (candidate.tagName === "button" || candidate.role === "button")
      ? 6
      : 0;
  const locationScore = Math.max(0, 4 - candidate.top / 120) + Math.max(0, 1.5 - candidate.left / 600);
  const contextPenalty =
    (request.sectionTokens?.length && !matchesContext(candidate.sectionText, request.sectionTokens) ? 10 : 0) +
    (request.rowTokens?.length && !matchesContext(candidate.rowText, request.rowTokens) ? 12 : 0) +
    (request.labelTokens?.length && !matchesContext(candidate.labelText, request.labelTokens) ? 10 : 0) +
    (request.placeholderTokens?.length &&
    !matchesContext(`${candidate.placeholder || ""} ${candidate.text}`, request.placeholderTokens)
      ? 8
      : 0);

  return Number(
    (
      intentScore +
      staleSelectorScore +
      labelScore +
      placeholderScore +
      sectionScore +
      rowScore +
      semanticScore +
      classScore +
      typeBonus +
      locationScore -
      contextPenalty
    ).toFixed(2)
  );
}

export class GenericLocatorHealer {
  constructor(private readonly page: Page) {}

  async heal(request: LocatorHealRequest): Promise<LocatorHealResult> {
    const candidateSelector = getCandidateSelector(request.targetType);
    const rawCandidates = await this.page.locator(candidateSelector).evaluateAll((elements) => {
      return elements
        .map((element, index) => {
          const htmlElement = element as HTMLElement & {
            href?: string;
            labels?: NodeListOf<HTMLLabelElement>;
            name?: string;
            placeholder?: string;
            type?: string;
            value?: string;
          };
          const rect = htmlElement.getBoundingClientRect();
          const style = window.getComputedStyle(htmlElement);
          const isVisible =
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            !htmlElement.hasAttribute("hidden") &&
            rect.width > 0 &&
            rect.height > 0;

          if (!isVisible) {
            return null;
          }

          const htmlId = htmlElement.getAttribute("id");
          const associatedLabels =
            "labels" in htmlElement && htmlElement.labels
              ? Array.from(htmlElement.labels)
              : htmlId
              ? Array.from(document.querySelectorAll(`label[for="${htmlId}"]`))
              : [];
          const labelText = associatedLabels
            .map((label) => label.textContent?.trim() || "")
            .filter(Boolean)
            .join(" ");
          const closestRow = htmlElement.closest("tr, [role='row'], li");
          const closestSection = htmlElement.closest(
            "dialog, [role='dialog'], section, article, form, [data-testid], .user-manager-container"
          );

          return {
            ariaLabel: htmlElement.getAttribute("aria-label"),
            className: htmlElement.className || "",
            href: htmlElement.getAttribute("href"),
            id: htmlId,
            index,
            labelText,
            left: rect.left,
            name: htmlElement.getAttribute("name"),
            placeholder: htmlElement.getAttribute("placeholder"),
            role: htmlElement.getAttribute("role"),
            rowText: closestRow?.textContent?.trim() || "",
            sectionText: closestSection?.textContent?.trim() || "",
            tagName: htmlElement.tagName.toLowerCase(),
            testId: htmlElement.getAttribute("data-testid"),
            text:
              htmlElement.textContent?.trim() ||
              htmlElement.getAttribute("value") ||
              htmlElement.getAttribute("aria-label") ||
              labelText ||
              htmlElement.getAttribute("placeholder") ||
              "",
            top: rect.top,
            type: htmlElement.getAttribute("type")
          };
        })
        .filter(Boolean);
    });

    const scoredCandidates = (rawCandidates as Array<Omit<HealedLocatorCandidate, "score">>)
      .map((candidate) => ({
        ...candidate,
        score: scoreCandidate(candidate, request)
      }))
      .sort((left, right) => right.score - left.score);
    const selectedCandidate = scoredCandidates[0];

    if (!selectedCandidate) {
      throw new Error(
        `Generic locator healer found no visible ${request.targetType} candidates after ${request.staleSelector} failed.`
      );
    }

    const target = this.page.locator(candidateSelector).nth(selectedCandidate.index);
    const performedAction = request.action || "click";

    if (performedAction === "fill") {
      await target.fill(request.fillValue || "");
    } else if (performedAction === "select") {
      if (selectedCandidate.tagName === "select") {
        await target.selectOption(request.selectValue || "");
      } else {
        await target.click();

        if (request.selectValue) {
          await this.page.getByRole("option", { name: request.selectValue }).first().click();
        }
      }
    } else {
      await target.click();
    }

    return {
      agentDecision:
        `Recovered from ${request.staleSelector} by rescoring visible ${request.targetType} candidates against intent, label, section, row, and semantic signals.`,
      engine: "deterministic",
      performedAction,
      selectedCandidate,
      strategy: "locator-heal",
      topCandidates: scoredCandidates.slice(0, 3)
    };
  }
}
