import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const fixturePath = path.resolve("tests/fixtures/export-fidelity.svg");

function hexToCssRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255})`;
}

test("preserves editable color, gradients, clipping, fonts, and raster dimensions", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank figure" }).click();
  await page.getByRole("tab", { name: "Uploads", exact: true }).click();
  await page.locator('input[type="file"][accept*="image/svg+xml"]').setInputFiles(fixturePath);
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("2");

  const swatches = page.locator(".palette input[type=color]");
  await expect(swatches.first()).toBeVisible();
  const originalColor = await swatches.first().inputValue();
  const replacement = originalColor.toLowerCase() === "#c2185b" ? "#00796b" : "#c2185b";
  await swatches.first().evaluate((input, color) => {
    const colorInput = input as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(colorInput, color);
    colorInput.dispatchEvent(new Event("input", { bubbles: true }));
    colorInput.dispatchEvent(new Event("change", { bubbles: true }));
  }, replacement);
  await expect(swatches.first()).toHaveValue(replacement);
  await expect(page.getByText("Saved locally")).toBeVisible();

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
  await page.getByLabel("Pixel scaling").selectOption("1");
  await page.getByLabel("Output DPI").selectOption("150");
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
