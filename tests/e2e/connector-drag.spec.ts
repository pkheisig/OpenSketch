import { expect, test } from "@playwright/test";

test("drags a connector preset directly from the sidebar onto the canvas", async ({ page }) => {
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
  await preset.dragTo(page.locator(".artboard-stage"));

  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(page.locator(".layers-panel")).toContainText("arrow");
  await expect(page.locator(".canvas-workspace")).not.toHaveClass(/is-creating/);
});
