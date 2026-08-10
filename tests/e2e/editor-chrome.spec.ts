import { expect, test } from "@playwright/test";

test("@smoke keeps artboard rulers stable beneath the floating editor chrome", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator(".canvas-workspace")).toBeVisible();
  await expect(page.locator(".floating-tool-rail")).toBeVisible();
  await expect(page.locator(".workspace-footer")).toBeVisible();
  await page.waitForTimeout(500);

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
        text: element.textContent,
        background: getComputedStyle(element).backgroundColor,
        zIndex: Number.parseInt(getComputedStyle(element).zIndex, 10) || 0
      };
    };
    return {
      workspace: rect(".canvas-workspace"),
      sidebar: rect(".left-sidebar"),
      rail: rect(".floating-tool-rail"),
      panel: rect(".sidebar-expanded"),
      footer: rect(".workspace-footer"),
      artboard: rect(".artboard-stage"),
      horizontalRuler: rect(".ruler-horizontal"),
      verticalRuler: rect(".ruler-vertical"),
      horizontalZero: rect('.ruler-horizontal .ruler-major-tick[data-value="0"]'),
      horizontalTwoHundred: rect('.ruler-horizontal .ruler-major-tick[data-value="200"]'),
      verticalZero: rect('.ruler-vertical .ruler-major-tick[data-value="0"]')
    };
  });

  expect(geometry.workspace).not.toBeNull();
  expect(geometry.sidebar).not.toBeNull();
  expect(geometry.rail).not.toBeNull();
  expect(geometry.panel).not.toBeNull();
  expect(geometry.footer).not.toBeNull();
  expect(geometry.artboard).not.toBeNull();
  expect(geometry.horizontalRuler).not.toBeNull();
  expect(geometry.verticalRuler).not.toBeNull();
  expect(geometry.horizontalZero).not.toBeNull();
  expect(geometry.horizontalTwoHundred).not.toBeNull();
  expect(geometry.verticalZero).not.toBeNull();

  expect(geometry.sidebar!.background).toBe("rgba(0, 0, 0, 0)");
  expect(geometry.horizontalRuler!.left).toBeCloseTo(geometry.workspace!.left, 1);
  expect(geometry.horizontalRuler!.right).toBeGreaterThanOrEqual(geometry.workspace!.right - 1);
  expect(geometry.verticalRuler!.left).toBeCloseTo(geometry.workspace!.left, 1);
  expect(geometry.horizontalRuler!.left).toBeLessThan(geometry.panel!.right);
  expect(geometry.horizontalZero!.left).toBeCloseTo(geometry.artboard!.left, 1);
  expect(geometry.verticalZero!.top).toBeCloseTo(geometry.artboard!.top, 1);
  expect(geometry.footer!.left).toBeGreaterThanOrEqual(geometry.panel!.right);
  expect(geometry.footer!.zIndex).toBeGreaterThan(geometry.rail!.zIndex);

  const initialTwoHundredOffset =
    geometry.horizontalTwoHundred!.left - geometry.horizontalZero!.left;
  const scrollBox = await page.locator(".workspace-scroll").boundingBox();
  expect(scrollBox).not.toBeNull();
  await page.mouse.move(scrollBox!.x + scrollBox!.width / 2, scrollBox!.y + scrollBox!.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect
    .poll(
      async () => {
        const zero = await page
          .locator('.ruler-horizontal .ruler-major-tick[data-value="0"]')
          .boundingBox();
        const twoHundred = await page
          .locator('.ruler-horizontal .ruler-major-tick[data-value="200"]')
          .boundingBox();
        return zero && twoHundred ? twoHundred.x - zero.x : 0;
      },
      { timeout: 120 }
    )
    .toBeGreaterThan(initialTwoHundredOffset);
  await expect
    .poll(
      async () => {
        const artboard = await page.locator(".artboard-stage").boundingBox();
        const zero = await page
          .locator('.ruler-vertical .ruler-major-tick[data-value="0"]')
          .boundingBox();
        return artboard && zero ? Math.abs(artboard.y - zero.y) : Number.POSITIVE_INFINITY;
      },
      { timeout: 120 }
    )
    .toBeLessThan(1);
});
