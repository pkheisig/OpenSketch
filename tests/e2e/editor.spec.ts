import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

test("creates, edits, saves, reopens, and exports a local figure", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "New figure" })).toBeVisible();
  await page.getByRole("button", { name: "Create blank figure" }).click();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  await expect(page.getByText("rectangle", { exact: true }).last()).toBeVisible();
  await page.getByRole("tab", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: /Point text/ }).click();
  await page.keyboard.type("CD8 T cell");
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  const firstAsset = page.locator(".asset-card-image").first();
  await expect(firstAsset).toBeVisible();
  await firstAsset.click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
  await expect(page.locator(".asset-effects")).toBeVisible();
  await page
    .locator("label.range-field")
    .filter({ hasText: "Tint strength" })
    .locator('input[type="range"]')
    .fill("0.2");
  await page.getByRole("button", { name: "Reset all" }).click();
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
  await page.getByRole("tab", { name: /PNG/ }).click();
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

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("tab", { name: /PDF/ }).click();
  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pdfPath = await (await pdfDownloadPromise).path();
  expect(pdfPath).not.toBeNull();
  const pdfBytes = await readFile(pdfPath!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfBytes.toString("latin1")).toContain("/FontName /Source#20Sans#203");
  const pdf = await PDFDocument.load(pdfBytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe("Untitled figure");
  expect(pdf.getAuthor()).toBe("Paul Heisig");
  expect(pdf.getCreator()).toBe("OpenSketch");
  const pageSize = pdf.getPage(0).getSize();
  expect(pageSize.width).toBeGreaterThan(pageSize.height);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.getByText("rectangle", { exact: true }).last()).toBeVisible();
  await expect(page.locator(".layers-title small")).toHaveText("3");

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByLabel("Project actions for Untitled figure").click();
  const projectDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project" }).click();
  const projectDownload = await projectDownloadPromise;
  expect(projectDownload.suggestedFilename()).toBe("Untitled-figure.OpenSketch");
  const projectPath = await projectDownload.path();
  expect(projectPath).not.toBeNull();
  const portable = JSON.parse(await readFile(projectPath!, "utf8")) as {
    format: string;
    formatVersion: number;
    objects: {
      objects: Array<{ type?: string; text?: string; width?: number }>;
    };
  };
  expect(portable.format).toBe("OpenSketch");
  expect(portable.formatVersion).toBe(1);
  expect(portable.objects.objects).toHaveLength(3);
  const textObject = portable.objects.objects.find((object) => object.text === "CD8 T cell");
  expect(textObject?.width).toBeGreaterThan(150);

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import project" }).click();
  await (await chooserPromise).setFiles(projectPath!);
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();
  await expect(page.locator(".layers-title small")).toHaveText("3");
  expect(externalRequests).toEqual([]);
});

test("builds and persists a styled object-attached connector", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Arrow", exact: true }).click();

  await expect(page.locator(".layers-title small")).toHaveText("3");
  await expect(page.locator(".inspector-header h2")).toHaveText("Connector");
  await page.getByLabel("Start anchor").selectOption("left");
  await page.getByLabel("End anchor").selectOption("right");
  await page.getByLabel("Start head").selectOption("open");
  await page.getByLabel("End head").selectOption("circle");
  await page.getByLabel("Line style").selectOption("dashed");
  await page.getByLabel("Routing").selectOption("direct");
  await page
    .locator("label.range-field")
    .filter({ hasText: "Curvature" })
    .locator('input[type="range"]')
    .fill("0.36");

  await page.getByRole("button", { name: "Project information" }).click();
  await page
    .getByLabel("Accessible scientific description")
    .fill("Two biological objects connected by a directional signaling path.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Untitled figure" })).toHaveCount(0);

  await page.getByRole("button", { name: "Export" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const path = await (await downloadPromise).path();
  expect(path).not.toBeNull();
  const svg = await readFile(path!, "utf8");
  expect(svg).toContain("stroke-dasharray");
  expect(svg).toContain("directional signaling path");

  await expect(page.getByText("Saved locally")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.locator(".layer-list button").filter({ hasText: "Connector" }).click();
  await expect(page.getByLabel("Line style")).toHaveValue("dashed");
  await expect(page.getByLabel("Start head")).toHaveValue("open");
  await expect(page.getByLabel("End head")).toHaveValue("circle");
  await expect(page.getByLabel("Routing")).toHaveValue("direct");
});

test("opens a fully editable scientific starter layout", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Experimental workflow figure" }).click();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();
  await expect(page.locator(".layers-title small")).toHaveText("23");
  await expect(
    page.locator(".layer-list button").filter({ hasText: "EXPERIMENTAL WORKFLOW" })
  ).toBeVisible();

  const backToProjects = page.getByRole("button", { name: "Back to projects" });
  await expect(backToProjects).toBeVisible();
  await expect(backToProjects).toContainText("Projects");

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();

  await backToProjects.click();
  const savedTemplate = page.locator(".project-title").filter({ hasText: "Experimental workflow" });
  await expect(savedTemplate).toBeVisible();
  await savedTemplate.click();
  await expect(page.locator(".layers-title small")).toHaveText("23");
});

test("keeps the canvas responsive with one hundred ordinary objects", async ({
  page,
  browserName
}) => {
  test.skip(
    browserName !== "chromium",
    "The stress benchmark runs once; workflows run in all engines."
  );
  test.setTimeout(45_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const rectangle = page.getByRole("button", { name: "Rectangle", exact: true });
  for (let index = 0; index < 100; index += 1) {
    await rectangle.click();
  }
  await expect(page.locator(".layers-title small")).toHaveText("100");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByText("Saved locally")).toBeVisible({ timeout: 10_000 });
});
