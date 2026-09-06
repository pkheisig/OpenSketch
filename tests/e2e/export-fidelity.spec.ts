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

async function ensureEditorOpen(page: Page) {
  const inspector = page.locator(
    ".sidebar-expanded:not(.motion-presence-closing) .inspector-embedded"
  );
  if (await inspector.isVisible().catch(() => false)) return;
  const editButton = page
    .getByLabel("Editor tools")
    .getByRole("button", { name: "Edit", exact: true });
  await expect(editButton).toBeVisible();
  await editButton.click();
  await expect(inspector).toBeVisible();
}

test("preserves editable color, gradients, clipping, fonts, and raster dimensions", async ({
  page
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("menuitem", { name: "Figure", exact: true }).click();
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await page.locator('input[type="file"][accept*="image/svg+xml"]').setInputFiles(fixturePath);
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  const persistedArtboard = await page.locator(".artboard-stage").boundingBox();
  if (!persistedArtboard) throw new Error("Persisted artboard is not visible.");
  await page.mouse.click(
    persistedArtboard.x + persistedArtboard.width / 2,
    persistedArtboard.y + persistedArtboard.height / 2
  );
  await ensureEditorOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menu", { name: "Shape tools" })
    .getByRole("menuitem", { name: /Shapes/ })
    .hover();
  await page.getByRole("menuitem", { name: "Rectangle", exact: true }).click();
  const canvasBounds = await page.locator(".artboard-stage").boundingBox();
  if (!canvasBounds) throw new Error("Artboard is not visible.");
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.68,
    canvasBounds.y + canvasBounds.height * 0.65
  );
  await ensureEditorOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("2");

  const fill = page.getByLabel("Fill color value");
  await expect(fill).toBeVisible();
  const originalColor = await fill.inputValue();
  const replacement = originalColor.toLowerCase() === "#c2185b" ? "#00796b" : "#c2185b";
  await page.getByRole("button", { name: "Fill color", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Fill color palette" });
  await palette.getByLabel("Fill color hex value").fill(replacement);
  await palette.getByLabel("Fill color hex value").press("Enter");
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
