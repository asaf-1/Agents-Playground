// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The type of a page, for the helpers below.
import type { Page } from "@playwright/test";

// The home page's picture (2026-11-12): three coins travel all the way round
// a tilted ring about the core, behind it on the far side and in front on the
// near side; with reduced motion they stand still. Each coin is drawn twice,
// once behind the core and once in front, and only one copy is visible.

// Each coin's position (the visible copy's transform) and which side it is on.
async function coins(page: Page) {
  return page.evaluate(() =>
    [0, 1, 2].map((index) => {
      const back = document.querySelector(
        `[data-testid="hero-coin-back-${index}"]`,
      );
      const front = document.querySelector(
        `[data-testid="hero-coin-front-${index}"]`,
      );
      const inFront = front?.getAttribute("visibility") === "visible";
      const shown = inFront ? front : back;
      return {
        side: inFront ? "front" : "back",
        transform: shown?.getAttribute("transform") ?? "",
        otherHidden:
          (inFront ? back : front)?.getAttribute("visibility") === "hidden",
      };
    }),
  );
}

// How wide the core looks right now, from 1 (face on) through 0 (edge on) to
// -1 (its back): the first number of its computed transform, which for a
// turn about the upright axis is the cosine of the angle.
async function coreWidth(page: Page) {
  return page.evaluate(() => {
    const core = document.querySelector('[data-testid="hero-core"]');
    const transform = core ? getComputedStyle(core).transform : "none";
    if (!transform || transform === "none") return 1;
    return Number(transform.replace(/^matrix(3d)?\(/, "").split(",")[0]);
  });
}

test.describe("The home page picture", () => {
  // The core flips a full turn, rests, and flips again.
  test("the core flips over and over on its upright axis", async ({ page }) => {
    expected(
      "the core runs the hero-flip animation, forever; within one cycle it is seen edge-on or from behind (width below 0.5)",
    );
    await page.goto("/app");
    await expect(page.getByTestId("hero-art")).toBeVisible();
    const animation = await page.evaluate(() => {
      const core = document.querySelector('[data-testid="hero-core"]');
      const running = core?.getAnimations()[0] as CSSAnimation | undefined;
      return {
        name: running?.animationName,
        state: running?.playState,
        iterations: running?.effect?.getComputedTiming().iterations,
      };
    });
    fact("animation", animation);
    expect(animation).toEqual({
      name: "hero-flip",
      state: "running",
      iterations: Infinity,
    });
    // Within one 4.5-second cycle it turns far enough to look edge-on.
    await expect
      .poll(() => coreWidth(page), { timeout: 6000, intervals: [100] })
      .toBeLessThan(0.5);
  });

  // The coins go round, one copy each, on both sides of the core.
  test("the coins travel round the core, behind it and in front", async ({
    page,
  }) => {
    expected(
      "each coin has exactly one visible copy; at least one coin in front of the core and one behind; every coin's position changes within a second",
    );
    await page.goto("/app");
    await expect(page.getByTestId("hero-art")).toBeVisible();

    // Wait for the loop to place the coins, then take two readings.
    await expect
      .poll(async () => (await coins(page))[0].transform)
      .toContain("translate");
    const first = await coins(page);
    await page.waitForTimeout(1000);
    const second = await coins(page);
    fact("first", first);
    fact("second", second);

    // One copy of each coin shows; the core always has a coin on each side.
    expect(first.every((coin) => coin.otherHidden)).toBe(true);
    const sides = new Set(first.map((coin) => coin.side));
    expect(sides).toEqual(new Set(["front", "back"]));

    // Every coin moved.
    first.forEach((coin, index) => {
      expect(second[index].transform, `coin ${index}`).not.toBe(coin.transform);
    });
  });

  // Reduced motion: the picture stands still.
  test("with reduced motion the coins stand still", async ({ page }) => {
    expected(
      "with prefers-reduced-motion: reduce, the coins are placed and do not move over a second, and the core faces front",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app");
    await expect
      .poll(async () => (await coins(page))[0].transform)
      .toContain("translate");
    const first = await coins(page);
    await page.waitForTimeout(1000);
    const second = await coins(page);
    fact(
      "transforms",
      first.map((coin) => coin.transform),
    );
    expect(second.map((coin) => coin.transform)).toEqual(
      first.map((coin) => coin.transform),
    );
    // The core faces front and stays so.
    expect(await coreWidth(page)).toBeCloseTo(1, 3);
  });
});
