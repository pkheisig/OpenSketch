import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("creates, edits, saves, reopens, and exports a local figure", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build the figure your data deserves." })
  ).toBeVisible();
  await page.getByRole("button", { name: "New figure", exact: true }).first().click();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  await expect(page.getByText("rectangle", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: /Point text/ }).click();
  await page.keyboard.type("CD8 T cell");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Assets", exact: true }).click();
  const firstAsset = page.locator(".asset-card-image").first();
  await expect(firstAsset).toBeVisible();
  await firstAsset.click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
  const resetPalette = page.getByRole("button", { name: "Reset", exact: true });
  if (await resetPalette.isVisible()) {
    const firstSwatch = page.locator(".palette input[type=color]").first();
    const originalColor = await firstSwatch.inputValue();
    const replacement = originalColor.toLowerCase() === "#ff0000" ? "#00ff00" : "#ff0000";
    await firstSwatch.fill(replacement);
    await expect(page.locator(".palette input[type=color]").first()).toHaveValue(replacement);
    await resetPalette.click();
    await expect(page.locator(".palette input[type=color]").first()).toHaveValue(originalColor);
  }
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("3");

  await expect(page.getByText("Saved locally")).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const svgDownload = await download;
  expect(svgDownload.suggestedFilename()).toMatch(/untitled-figure\.svg/i);
  const svgPath = await svgDownload.path();
  expect(svgPath).not.toBeNull();
  const svg = await readFile(svgPath!, "utf8");
  expect(svg).toContain("<metadata>");
  expect(svg).toContain("OpenSketch is an independent project");
  expect(svg).toContain("<rect");
  expect(svg).toContain("CD8 T cell");

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("button", { name: /PNG/ }).click();
  await page.getByLabel("Pixel scaling").selectOption("1");
  await page.getByLabel("Output DPI").selectOption("150");
  const pngDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const pngPath = await (await pngDownloadPromise).path();
  expect(pngPath).not.toBeNull();
  const png = await readFile(pngPath!);
  expect(png.readUInt32BE(16)).toBe(960);
  expect(png.readUInt32BE(20)).toBe(540);
  const physicalChunk = png.indexOf(Buffer.from("pHYs"));
  expect(physicalChunk).toBeGreaterThan(0);
  expect(png.readUInt32BE(physicalChunk + 4)).toBe(5906);

  await page.getByRole("button", { name: "Project home" }).click();
  await expect(page.getByRole("heading", { name: "Recent projects" })).toBeVisible();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.getByText("rectangle", { exact: true }).last()).toBeVisible();
  await expect(page.locator(".layers-title small")).toHaveText("3");

  await page.getByRole("button", { name: "Project home" }).click();
  await page.getByLabel("Project actions for Untitled figure").click();
  const projectDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project" }).click();
  const projectDownload = await projectDownloadPromise;
  expect(projectDownload.suggestedFilename()).toBe("Untitled-figure.opensketch");
  const projectPath = await projectDownload.path();
  expect(projectPath).not.toBeNull();
  const portable = JSON.parse(await readFile(projectPath!, "utf8")) as {
    format: string;
    formatVersion: number;
    objects: { objects: unknown[] };
  };
  expect(portable.format).toBe("opensketch");
  expect(portable.formatVersion).toBe(1);
  expect(portable.objects.objects).toHaveLength(3);

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import project" }).click();
  await (await chooserPromise).setFiles(projectPath!);
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();
  await expect(page.locator(".layers-title small")).toHaveText("3");
  expect(externalRequests).toEqual([]);
});
