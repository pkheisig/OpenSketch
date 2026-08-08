import { expect, test } from "@playwright/test";

test("@smoke keeps the footer above the floating rail and reserves the ruler lane", async ({
  page
}) => {
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
      horizontalRuler: rect(".ruler-horizontal"),
      verticalRuler: rect(".ruler-vertical"),
      horizontalZero: rect(".ruler-horizontal span:first-child"),
      verticalZero: rect(".ruler-vertical span:first-child")
    };
  });

  expect(geometry.workspace).not.toBeNull();
  expect(geometry.sidebar).not.toBeNull();
  expect(geometry.rail).not.toBeNull();
  expect(geometry.panel).not.toBeNull();
  expect(geometry.footer).not.toBeNull();
  expect(geometry.horizontalRuler).not.toBeNull();
  expect(geometry.verticalRuler).not.toBeNull();
  expect(geometry.horizontalZero).not.toBeNull();
  expect(geometry.verticalZero).not.toBeNull();

  expect(geometry.sidebar!.background).toBe("rgba(0, 0, 0, 0)");
  expect(geometry.horizontalRuler!.left).toBeGreaterThanOrEqual(geometry.panel!.right);
  expect(geometry.horizontalRuler!.right).toBeGreaterThanOrEqual(geometry.workspace!.right - 1);
  expect(geometry.verticalRuler!.left).toBeGreaterThanOrEqual(geometry.panel!.right);
  expect(geometry.horizontalZero!.left).toBeCloseTo(geometry.horizontalRuler!.left, 1);
  expect(geometry.verticalZero!.top).toBeCloseTo(geometry.verticalRuler!.top, 1);
  expect(geometry.horizontalZero!.text).toBe("0");
  expect(geometry.verticalZero!.text).toBe("");
  expect(geometry.footer!.left).toBeGreaterThanOrEqual(geometry.panel!.right);
  expect(geometry.verticalRuler!.bottom).toBeLessThanOrEqual(geometry.footer!.top);
  expect(geometry.footer!.zIndex).toBeGreaterThan(geometry.rail!.zIndex);

  const initialStep = geometry.horizontalZero!.width;
  const scrollBox = await page.locator(".workspace-scroll").boundingBox();
  expect(scrollBox).not.toBeNull();
  await page.mouse.move(scrollBox!.x + scrollBox!.width / 2, scrollBox!.y + scrollBox!.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect
    .poll(
      async () => (await page.locator(".ruler-horizontal span:first-child").boundingBox())?.width,
      { timeout: 120 }
    )
    .toBeGreaterThan(initialStep);
  await expect
    .poll(
      async () => (await page.locator(".ruler-vertical span:first-child").boundingBox())?.height,
      { timeout: 120 }
    )
    .toBeGreaterThan(geometry.verticalZero!.height);
});
