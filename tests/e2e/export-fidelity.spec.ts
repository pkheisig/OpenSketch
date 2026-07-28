import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const fixturePath = path.resolve("tests/fixtures/export-fidelity.svg");

async function selectUiOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function hexToCssRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255})`;
}

test("preserves editable color, gradients, clipping, fonts, and raster dimensions", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await page.locator('input[type="file"][accept*="image/svg+xml"]').setInputFiles(fixturePath);
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rectangle", exact: true }).click();
  const canvasBounds = await page.locator(".artboard-stage").boundingBox();
  if (!canvasBounds) throw new Error("Artboard is not visible.");
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.68,
    canvasBounds.y + canvasBounds.height * 0.65
  );
  await expect(page.locator(".layers-title small")).toHaveText("2");

  const artboard = page.locator(".artboard-stage");
  const artboardBounds = await artboard.boundingBox();
  expect(artboardBounds).not.toBeNull();
  await artboard.dblclick({
    position: {
      x: artboardBounds!.width / 2,
      y: artboardBounds!.height / 2 + 78 * (artboardBounds!.width / 1920)
    }
  });
  const fill = page.locator("label.color-field").filter({ hasText: "Fill" }).locator("input");
  await expect(fill).toBeVisible();
  const originalColor = await fill.inputValue();
  const replacement = originalColor.toLowerCase() === "#c2185b" ? "#00796b" : "#c2185b";
  await fill.fill(replacement);
  await expect(fill).toHaveValue(replacement);
  await expect(page.locator(".save-state")).toHaveCount(0);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const svgPath = await (await svgDownloadPromise).path();
  expect(svgPath).not.toBeNull();
  const svg = await readFile(svgPath!, "utf8");
  expect(svg).toContain("<linearGradient");
  expect(svg).toContain("<radialGradient");
  expect(svg).toContain("<clipPath");
  expect(svg).toContain("Source Sans 3");
  expect(svg.toLowerCase()).toContain(hexToCssRgb(replacement));

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("tab", { name: /PNG/ }).click();
  await selectUiOption(page, "Output DPI", "150 DPI");
  const pngDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const pngPath = await (await pngDownloadPromise).path();
  expect(pngPath).not.toBeNull();
  const png = sharp(pngPath!);
  const [metadata, stats] = await Promise.all([png.metadata(), png.stats()]);
  expect(metadata.width).toBe(960);
  expect(metadata.height).toBe(540);
  expect(stats.channels.slice(0, 3).every((channel) => channel.max > channel.min)).toBe(true);
  expect(stats.channels.slice(0, 3).some((channel) => channel.stdev > 18)).toBe(true);
});
