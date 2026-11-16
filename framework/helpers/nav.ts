// The sidebar's groups fold away (web/src/components/Layout.tsx): only the
// group of the page you are on starts open. A test that clicks or checks a link
// in another group opens that group first, the way a person would, through
// this one helper.

// Playwright's page and locator types.
import type { Locator, Page } from "@playwright/test";

// A sidebar link by its test id, with its group opened if it was shut. Links
// outside any group (Practice guide, Home) are returned as they are. It waits
// for the link to be in the page (staff links arrive once the sign-in is
// known), so a test that checks a link is missing reads the test id directly
// instead.
export async function navLink(page: Page, testId: string): Promise<Locator> {
  const link = page.getByTestId(testId);
  await link.waitFor({ state: "attached" });
  // The group the link sits in, if any (data-nav-group on its section).
  const group = await link.evaluate(
    (element) =>
      element.closest("[data-nav-group]")?.getAttribute("data-nav-group") ??
      null,
  );
  if (group) {
    const toggle = page.getByTestId(`nav-group-${group}`);
    if ((await toggle.getAttribute("aria-expanded")) === "false") {
      await toggle.click();
    }
  }
  return link;
}
