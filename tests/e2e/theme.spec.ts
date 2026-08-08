import { expect, test } from "@playwright/test";

test("@smoke applies and persists the OpenGate light and dark themes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".home-shell")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Use dark theme" })).toBeVisible();

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("OpenSketch-theme"))).toBe("dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(29, 25, 22)");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
});
