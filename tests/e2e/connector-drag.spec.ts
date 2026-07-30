import { expect, test } from "@playwright/test";

async function pointerDrag(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator
) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Drag source or target is not visible.");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 12,
    sourceBox.y + sourceBox.height / 2,
    { steps: 4 }
  );
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 16
  });
  await page.mouse.up();
}

test("pointer-drags connector and shape presets directly onto the canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  await page.getByRole("button", { name: "Lines", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Line and arrow tools" });
  await menu
    .locator(".tool-flyout-primary")
    .getByRole("menuitem", { name: /^Inhibitor/ })
    .hover();

  const preset = menu
    .locator(".tool-flyout-secondary")
    .getByRole("menuitem", { name: "Rounded inhibitor", exact: true });
  await expect(preset).toHaveAttribute("draggable", "true");
  await pointerDrag(page, preset, page.locator(".artboard-stage"));

  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(page.locator(".layers-panel")).toContainText("arrow");
  await expect(page.locator(".canvas-workspace")).not.toHaveClass(/is-creating/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const shapeMenu = page.getByRole("menu", { name: "Shape tools" });
  await shapeMenu.getByRole("menuitem", { name: /^Polygons/ }).hover();
  const pentagon = shapeMenu.getByRole("menuitem", { name: "Pentagon", exact: true });
  await expect(pentagon).toHaveAttribute("draggable", "true");
  await pointerDrag(page, pentagon, page.locator(".artboard-stage"));

  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await expect(page.locator(".layers-panel")).toContainText("pentagon");
  await expect(page.locator(".canvas-workspace")).not.toHaveClass(/is-creating/);
});
