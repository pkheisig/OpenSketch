import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

async function selectUiOption(
  page: Page,
  label: string,
  option: string,
  occurrence: "first" | "last" = "first"
) {
  const matches = page.getByRole("combobox", { name: label });
  await (occurrence === "last" ? matches.last() : matches.first()).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function artboardPoint(page: Page, xRatio = 0.5, yRatio = 0.5) {
  const bounds = await page.locator(".artboard-stage").boundingBox();
  if (!bounds) throw new Error("Artboard is not visible.");
  return {
    x: bounds.x + bounds.width * xRatio,
    y: bounds.y + bounds.height * yRatio
  };
}

async function placeTool(page: Page, name: string | RegExp, xRatio = 0.5, yRatio = 0.5) {
  await page.getByRole("button", { name, exact: typeof name === "string" }).click();
  const point = await artboardPoint(page, xRatio, yRatio);
  await page.mouse.click(point.x, point.y);
}

test("creates, edits, saves, reopens, and exports a local figure", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.38, 0.46);
  await expect(page.getByText("rectangle", { exact: true }).last()).toBeVisible();
  await page.getByRole("tab", { name: "Text", exact: true }).click();
  await placeTool(page, /Point text/, 0.55, 0.35);
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

  await expect(page.locator(".save-state")).toHaveCount(0);

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
  await selectUiOption(page, "Pixel scaling", "1× · screen");
  await selectUiOption(page, "Output DPI", "150 DPI");
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
  const projectActions = page.getByLabel("Project actions for Untitled figure");
  await projectActions.click();
  await expect(page.getByRole("button", { name: "Save to folder" })).toHaveCount(0);
  await page.getByRole("heading", { name: "Projects" }).click();
  await expect(projectActions.locator("xpath=..")).not.toHaveAttribute("open", "");
  await projectActions.click();
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

test("keeps the canvas preset label synchronized with its dimensions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const preset = page.getByRole("combobox", { name: "Preset" });
  await expect(preset).toContainText("Presentation 16:9");

  await selectUiOption(page, "Preset", "A4 landscape");
  await expect(preset).toContainText("A4 landscape");
  await expect(page.getByLabel("W", { exact: true })).toHaveValue("3508");
  await expect(page.getByLabel("H", { exact: true })).toHaveValue("2480");

  await page.getByLabel("W", { exact: true }).fill("3509");
  await expect(preset).toContainText("Custom dimensions");

  await page.getByLabel("W", { exact: true }).fill("3508");
  await expect(preset).toContainText("A4 landscape");
});

test("builds and persists a styled object-attached connector", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Rectangle", 0.65, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  const connectorPoint = await artboardPoint(page);
  await page.mouse.click(connectorPoint.x, connectorPoint.y);

  await expect(page.locator(".layers-title small")).toHaveText("3");
  await expect(page.locator(".inspector-header h2")).toHaveText("Connector");
  await selectUiOption(page, "Start anchor", "left", "last");
  await selectUiOption(page, "End anchor", "right", "last");
  await selectUiOption(page, "Start head", "open", "last");
  await selectUiOption(page, "End head", "circle", "last");
  await selectUiOption(page, "Line style", "dashed", "last");
  await selectUiOption(page, "Routing", "direct", "last");
  await page
    .locator("label.range-field")
    .filter({ hasText: "Curvature" })
    .locator('input[type="range"]')
    .fill("0.36");

  await expect(page.getByRole("button", { name: "Project information" })).toHaveCount(0);
  await page.getByRole("button", { name: "Export" }).click();
  await page
    .getByLabel("Accessible description")
    .fill("Two biological objects connected by a directional signaling path.");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const path = await (await downloadPromise).path();
  expect(path).not.toBeNull();
  const svg = await readFile(path!, "utf8");
  expect(svg).toContain("stroke-dasharray");
  expect(svg).toContain("directional signaling path");

  await expect(page.locator(".save-state")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.locator(".layer-list button").filter({ hasText: "Connector" }).click();
  await expect(page.getByRole("combobox", { name: "Line style" })).toHaveAttribute(
    "data-value",
    "dashed"
  );
  await expect(page.getByRole("combobox", { name: "Start head" })).toHaveAttribute(
    "data-value",
    "open"
  );
  await expect(page.getByRole("combobox", { name: "End head" })).toHaveAttribute(
    "data-value",
    "circle"
  );
  await expect(page.getByRole("combobox", { name: "Routing" })).toHaveAttribute(
    "data-value",
    "direct"
  );
});

test("places text and shapes from active tools and persists line creation defaults", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();

  const rectangle = page.getByRole("button", { name: "Rectangle", exact: true });
  await rectangle.click();
  await expect(rectangle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".layers-title small")).toHaveText("0");
  const rectanglePoint = await artboardPoint(page, 0.25, 0.3);
  await page.mouse.click(rectanglePoint.x, rectanglePoint.y);
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(rectangle).toHaveAttribute("aria-pressed", "false");

  await page.getByLabel("Default line color").fill("#c026d3");
  await page.getByLabel("Default line thickness").fill("9");
  await selectUiOption(page, "Line style", "Dashed");
  await selectUiOption(page, "End head", "Circle");

  const arrow = page.getByRole("button", { name: "Arrow", exact: true });
  await arrow.click();
  await expect(arrow).toHaveAttribute("aria-pressed", "true");
  const from = await artboardPoint(page, 0.25, 0.55);
  const to = await artboardPoint(page, 0.78, 0.72);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".layers-title small")).toHaveText("2");
  const drawnWidth = Number(await page.locator(".field-row.dimensions input").first().inputValue());
  expect(drawnWidth).toBeGreaterThan(300);

  await page.getByRole("button", { name: "Export" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const svgPath = await (await downloadPromise).path();
  expect(svgPath).not.toBeNull();
  const svg = (await readFile(svgPath!, "utf8")).toLowerCase();
  expect(svg).toContain("rgb(192,38,211)");
  expect(svg).toContain("stroke-dasharray");
  expect(svg).toContain("<circle");

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await expect(page.getByLabel("Default line color")).toHaveValue("#c026d3");
  await expect(page.getByLabel("Default line thickness")).toHaveValue("9");
  await expect(page.getByRole("combobox", { name: "Line style" })).toHaveText(/Dashed/i);
  await expect(page.getByRole("combobox", { name: "End head" })).toHaveText(/Circle/i);

  await placeTool(page, "Line", 0.3, 0.28);
  await expect(page.locator(".layers-title small")).toHaveText("3");
  expect(
    Number(await page.locator(".field-row.dimensions input").first().inputValue())
  ).toBeGreaterThan(150);

  await placeTool(page, "Arrow", 0.44, 0.42);
  await expect(page.locator(".layers-title small")).toHaveText("4");

  const line = page.getByRole("button", { name: "Line", exact: true });
  await line.click();
  const lineFrom = await artboardPoint(page, 0.2, 0.78);
  const lineTo = await artboardPoint(page, 0.7, 0.6);
  await page.mouse.move(lineFrom.x, lineFrom.y);
  await page.mouse.down();
  await page.mouse.move(lineTo.x, lineTo.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".layers-title small")).toHaveText("5");

  await page.getByRole("tab", { name: "Text", exact: true }).click();
  const pointText = page.getByRole("button", { name: /Point text/ });
  await pointText.click();
  await expect(pointText).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".layers-title small")).toHaveText("5");
  const textPoint = await artboardPoint(page, 0.52, 0.22);
  await page.mouse.click(textPoint.x, textPoint.y);
  await page.keyboard.type("Placed label");
  await page.keyboard.press("Escape");
  await expect(page.locator(".layers-title small")).toHaveText("6");
  await expect(page.locator(".layer-list button").filter({ hasText: "Label" })).toBeVisible();
});

test("uses accessible in-app dropdowns with keyboard and outside-click behavior", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  await expect(page.locator("select")).toHaveCount(0);
  const unit = page.getByRole("combobox", { name: "Unit" });
  await unit.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox", { name: "Unit" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(unit).toHaveAttribute("data-value", "mm");

  await unit.click();
  await expect(page.getByRole("listbox", { name: "Unit" })).toBeVisible();
  await page.getByText("Canvas", { exact: true }).first().click();
  await expect(page.getByRole("listbox", { name: "Unit" })).toHaveCount(0);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("tab", { name: /PNG/ }).click();
  const scaling = page.getByRole("combobox", { name: "Pixel scaling" });
  const outputDpi = page.getByRole("combobox", { name: "Output DPI" });
  await scaling.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Export figure" })).toBeVisible();
  await expect(page.getByRole("listbox", { name: "Pixel scaling" })).toHaveCount(0);

  await scaling.click();
  await page.keyboard.press("Tab");
  await expect(outputDpi).toBeFocused();
});

test("offers selection-aware canvas context actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Rectangle", 0.65, 0.5);

  await page.keyboard.press("ControlOrMeta+A");
  const firstRectangle = await artboardPoint(page, 0.35, 0.5);
  await page.mouse.click(firstRectangle.x, firstRectangle.y, { button: "right" });
  const multipleMenu = page.getByRole("menu", { name: "2 selected actions" });
  await expect(multipleMenu).toBeVisible();
  await expect(multipleMenu.getByRole("menuitem", { name: "Group" })).toBeVisible();
  await multipleMenu.getByRole("menuitem", { name: "Group" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await page.mouse.click(firstRectangle.x, firstRectangle.y, { button: "right" });
  const groupMenu = page.getByRole("menu", { name: "Group actions" });
  await expect(groupMenu.getByRole("menuitem", { name: "Ungroup" })).toBeVisible();
  await groupMenu.getByRole("menuitem", { name: "Ungroup" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("2");

  await page.locator(".layer-list > button").first().click();
  const fill = page.locator("label.color-field").filter({ hasText: "Fill" }).locator("input");
  await fill.fill("#ff0000");
  await expect(fill).toHaveValue("#ff0000");
  const secondRectangle = await artboardPoint(page, 0.65, 0.5);
  await page.mouse.click(secondRectangle.x, secondRectangle.y, { button: "right" });
  const shapeMenu = page.getByRole("menu", { name: "rectangle actions" });
  await expect(shapeMenu.getByRole("menuitem", { name: "Reset to defaults" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Bring one up" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Bring to front" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Send one down" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Send to back" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Delete object" })).toBeVisible();
  await shapeMenu.getByRole("menuitem", { name: "Reset to defaults" }).click();
  await expect(fill).toHaveValue("#d8efe9");

  await page.getByRole("tab", { name: "Text", exact: true }).click();
  const textPoint = await artboardPoint(page, 0.5, 0.25);
  await placeTool(page, /Point text/, 0.5, 0.25);
  await page.keyboard.type("Context label");
  await page.keyboard.press("Escape");
  const textFill = page.locator("label.color-field").filter({ hasText: "Fill" }).locator("input");
  await textFill.fill("#00ff00");
  await page.mouse.click(textPoint.x, textPoint.y, { button: "right" });
  const textMenu = page.getByRole("menu", { name: "Label actions" });
  await expect(textMenu.getByRole("menuitem", { name: "Reset to defaults" })).toBeVisible();
  await textMenu.getByRole("menuitem", { name: "Reset to defaults" }).click();
  await expect(textFill).toHaveValue("#183133");
});

test("moves objects exactly one layer through the canvas context menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.25, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);
  await placeTool(page, "Triangle", 0.75, 0.5);

  const layerNames = page.locator(".layer-copy strong");
  await expect(layerNames).toHaveText(["triangle", "circle", "rectangle"]);

  const rectanglePoint = await artboardPoint(page, 0.25, 0.5);
  await page.mouse.click(rectanglePoint.x, rectanglePoint.y, { button: "right" });
  await page
    .getByRole("menu", { name: "rectangle actions" })
    .getByRole("menuitem", { name: "Bring one up" })
    .click();
  await expect(layerNames).toHaveText(["triangle", "rectangle", "circle"]);

  const trianglePoint = await artboardPoint(page, 0.75, 0.5);
  await page.mouse.click(trianglePoint.x, trianglePoint.y, { button: "right" });
  await page
    .getByRole("menu", { name: "triangle actions" })
    .getByRole("menuitem", { name: "Send one down" })
    .click();
  await expect(layerNames).toHaveText(["rectangle", "triangle", "circle"]);
});

test("keeps project overview previews vector-sharp and upgrades legacy raster thumbnails", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Dentritic");
  await page.waitForTimeout(250);
  await page.locator(".asset-card-image").first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Back to projects" }).click();

  await expect(page.locator(".project-preview svg").first()).toHaveAttribute(
    "data-opensketch-thumbnail",
    "2"
  );

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("OpenSketch");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("projects", "readwrite");
    const store = transaction.objectStore("projects");
    const projects = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
    const project = projects[0];
    if (project) {
      project.thumbnail =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA" +
        "DUlEQVR42mP8z8BQDwAFgwJ/lm9ZAAAAAElFTkSuQmCC";
      store.put(project);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await expect(page.locator(".project-preview svg").first()).toHaveAttribute(
    "data-opensketch-thumbnail",
    "2"
  );
});

test("supports visible and native navigation for new figures", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "New figure" })).toHaveCount(0);
  await expect(page.getByText(/Local only|Preparing offline copy/)).toHaveCount(0);
  await page.getByRole("button", { name: "About", exact: true }).click();
  const aboutDialog = page.getByRole("dialog", { name: "About OpenSketch" });
  await expect(aboutDialog).toBeVisible();
  await expect(aboutDialog.getByText("ABOUT THE STUDIO", { exact: true })).toHaveCount(0);
  await expect(aboutDialog.getByText("Biology, drawn openly.", { exact: true })).toHaveCount(0);
  await expect(aboutDialog.getByRole("button", { name: "Copy artwork credit" })).toHaveCount(0);
  await expect(aboutDialog.getByRole("button", { name: "Continue" })).toHaveCount(0);
  const github = aboutDialog.getByRole("link", { name: "GitHub", exact: true });
  await expect(github).toHaveAttribute("href", "https://github.com/pkheisig/OpenSketch");
  await expect(github.locator("svg")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(aboutDialog).toHaveCount(0);
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();
  await expect(page.locator(".layers-title small")).toHaveText("0");
  await expect(page.locator(".top-toolbar .brand-mark")).toHaveCount(0);

  const zoomReadout = page.locator(".workspace-controls .zoom-readout");
  await expect(zoomReadout).not.toContainText("100%");
  const initialZoom = Number.parseInt((await zoomReadout.innerText()).match(/\d+/)?.[0] ?? "", 10);
  await page.locator(".workspace-scroll").hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(zoomReadout).toContainText(`${initialZoom + 6}%`);

  const backToProjects = page.getByRole("button", { name: "Back to projects" });
  await expect(backToProjects).toBeVisible();
  await expect(backToProjects).toContainText("Projects");

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();

  await backToProjects.click();
  await expect(page.getByRole("button", { name: "Untitled figure" })).toBeVisible();
});

test("previews canvas zoom without resizing its backing stores or the page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  const workspace = page.locator(".workspace-scroll");

  const result = await workspace.evaluate(async (element) => {
    const canvases = [...element.querySelectorAll("canvas")];
    const stage = element.querySelector<HTMLElement>(".artboard-stage")!;
    const initialStageWidth = stage.getBoundingClientRect().width;
    let backingStoreChanges = 0;
    const observer = new MutationObserver((records) => {
      backingStoreChanges += records.filter(
        (record) => record.attributeName === "width" || record.attributeName === "height"
      ).length;
    });
    canvases.forEach((canvas) =>
      observer.observe(canvas, { attributes: true, attributeFilter: ["width", "height"] })
    );
    const dispatchZoom = (target: Element) => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -1
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const workspacePrevented = dispatchZoom(element);
    for (let index = 0; index < 39; index += 1) dispatchZoom(element);
    const outside = document.querySelector(".right-sidebar")!;
    const outsidePrevented = dispatchZoom(outside);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const previewBackingStoreChanges = backingStoreChanges;
    const previewStageWidth = stage.getBoundingClientRect().width;
    await new Promise((resolve) => setTimeout(resolve, 130));
    observer.disconnect();
    return {
      workspacePrevented,
      outsidePrevented,
      initialStageWidth,
      previewStageWidth,
      settledStageWidth: stage.getBoundingClientRect().width,
      previewBackingStoreChanges,
      settledBackingStoreChanges: backingStoreChanges
    };
  });

  expect(result.workspacePrevented).toBe(true);
  expect(result.outsidePrevented).toBe(false);
  expect(result.previewStageWidth).toBeGreaterThan(result.initialStageWidth);
  expect(result.settledStageWidth).toBeCloseTo(result.previewStageWidth, 0);
  expect(result.previewBackingStoreChanges).toBe(0);
  expect(result.settledBackingStoreChanges).toBe(0);
});

test("centers a new artboard and restores each project's zoom and pan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const viewportGeometry = async () => {
    const [workspace, stage] = await Promise.all([
      page.locator(".workspace-scroll").boundingBox(),
      page.locator(".artboard-stage").boundingBox()
    ]);
    if (!workspace || !stage) return null;
    return {
      x: stage.x + stage.width / 2 - (workspace.x + workspace.width / 2),
      y: stage.y + stage.height / 2 - (workspace.y + workspace.height / 2)
    };
  };

  await expect.poll(async () => Math.abs((await viewportGeometry())?.x ?? 999)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await viewportGeometry())?.y ?? 999)).toBeLessThan(2);

  await page.getByRole("button", { name: "Zoom in" }).first().click();
  const savedZoom = await page.locator(".workspace-controls .zoom-readout").textContent();
  const workspace = await page.locator(".workspace-scroll").boundingBox();
  expect(workspace).not.toBeNull();
  const start = {
    x: workspace!.x + workspace!.width / 2,
    y: workspace!.y + workspace!.height / 2
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(start.x + 120, start.y + 75, { steps: 6 });
  await page.mouse.up({ button: "middle" });
  const panned = await viewportGeometry();
  expect(panned?.x).toBeGreaterThan(100);
  expect(panned?.y).toBeGreaterThan(55);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.locator(".workspace-controls .zoom-readout")).toContainText(
    savedZoom?.trim() ?? ""
  );
  await expect
    .poll(async () => {
      const restored = await viewportGeometry();
      return restored && panned
        ? Math.max(Math.abs(restored.x - panned.x), Math.abs(restored.y - panned.y))
        : 999;
    })
    .toBeLessThan(3);

  await page.getByRole("button", { name: "Fit canvas" }).last().click();
  await expect.poll(async () => Math.abs((await viewportGeometry())?.x ?? 999)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await viewportGeometry())?.y ?? 999)).toBeLessThan(2);

  await page.getByRole("button", { name: "Minimize left sidebar" }).click();
  await expect.poll(async () => Math.abs((await viewportGeometry())?.x ?? 999)).toBeLessThan(2);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => Math.abs((await viewportGeometry())?.x ?? 999)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await viewportGeometry())?.y ?? 999)).toBeLessThan(2);
});

test("shows alignment guides only while an object is moving", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Rectangle", 0.65, 0.5);

  const redGuidePixels = () =>
    page.locator(".canvas-container").evaluate((container) => {
      let redPixels = 0;
      container.querySelectorAll("canvas").forEach((element) => {
        const canvas = element as HTMLCanvasElement;
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 0; index < pixels.length; index += 4) {
          const [red, green, blue, alpha] = pixels.slice(index, index + 4);
          if (alpha > 0 && red > 180 && green < 130 && blue < 130) redPixels += 1;
        }
      });
      return redPixels;
    });

  const movingCenter = await artboardPoint(page, 0.65, 0.5);
  const canvasCenter = await artboardPoint(page, 0.5, 0.5);
  await page.mouse.move(movingCenter.x, movingCenter.y);
  await page.mouse.down();
  await page.mouse.move(canvasCenter.x, canvasCenter.y, { steps: 8 });
  await expect.poll(redGuidePixels).toBeGreaterThan(20);
  await page.mouse.up();
  await expect.poll(redGuidePixels).toBe(0);
});

test("selects across the artboard and previews collapsed sidebars without shifting the canvas", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Rectangle", 0.65, 0.5);
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await expect(page.locator(".workspace-controls .zoom-readout")).not.toContainText("100%");

  const stageLocator = page.locator(".artboard-stage");
  await stageLocator.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "center" })
  );
  await expect
    .poll(async () => {
      const [stageBounds, workspaceBounds] = await Promise.all([
        stageLocator.boundingBox(),
        page.locator(".workspace-scroll").boundingBox()
      ]);
      return stageBounds && workspaceBounds ? stageBounds.y - workspaceBounds.y : 0;
    })
    .toBeGreaterThan(30);
  const stage = await stageLocator.boundingBox();
  const workspace = await page.locator(".workspace-scroll").boundingBox();
  expect(stage).not.toBeNull();
  expect(workspace).not.toBeNull();
  const start = {
    x: stage!.x + stage!.width / 2 - 120,
    y: workspace!.y + (stage!.y - workspace!.y) / 2
  };
  expect(start.y).toBeLessThan(stage!.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 12);
  await expect(page.locator(".workspace-marquee")).toBeVisible();
  await page.mouse.move(stage!.x + stage!.width / 2 + 120, stage!.y + stage!.height / 2 + 120, {
    steps: 8
  });
  await page.mouse.up();
  await expect(page.locator(".inspector-header")).toContainText("2 selected");

  const sidebarMotion = await page.locator(".editor-grid").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      property: style.transitionProperty,
      duration: Number.parseFloat(style.transitionDuration) * 1000
    };
  });
  expect(sidebarMotion.property).toContain("grid-template-columns");
  expect(sidebarMotion.duration).toBeGreaterThanOrEqual(200);

  await page.getByRole("button", { name: "Minimize left sidebar" }).click();
  await expect(page.locator(".editor-grid")).toHaveClass(/sidebar-collapsed/);
  const collapsedWorkspace = await page.locator(".workspace-scroll").boundingBox();
  await page.mouse.move(
    collapsedWorkspace!.x + collapsedWorkspace!.width / 2,
    collapsedWorkspace!.y + collapsedWorkspace!.height / 2
  );
  await expect(page.getByRole("button", { name: "Expand left sidebar" })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".left-sidebar").evaluate((element) => element.getBoundingClientRect().width)
    )
    .toBeLessThan(50);
  const expandLeftSidebar = page.getByRole("button", { name: "Expand left sidebar" });
  await expandLeftSidebar.hover();
  await page.waitForTimeout(150);
  await expect(page.locator(".left-sidebar")).not.toHaveClass(/hover-expanded/);
  const leftSidebarBounds = await page.locator(".left-sidebar").boundingBox();
  expect(leftSidebarBounds).not.toBeNull();
  await page.mouse.move(leftSidebarBounds!.x + 22, leftSidebarBounds!.y + 52);
  await page.waitForTimeout(150);
  await expect(page.locator(".left-sidebar")).not.toHaveClass(/hover-expanded/);
  await expandLeftSidebar.click();
  await expect(page.locator(".editor-grid")).not.toHaveClass(/sidebar-collapsed/);
  await page.getByRole("button", { name: "Minimize left sidebar" }).click();
  await page.mouse.move(
    collapsedWorkspace!.x + collapsedWorkspace!.width / 2,
    collapsedWorkspace!.y + collapsedWorkspace!.height / 2
  );
  await page.waitForTimeout(300);
  const workspaceWithLeftCollapsed = await page.locator(".workspace-scroll").boundingBox();
  await page.locator(".left-sidebar .sidebar-hover-trigger").hover();
  await expect(page.locator(".left-sidebar")).toHaveClass(/hover-expanded/);
  await expect(page.getByRole("tab", { name: "Assets", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".sidebar-expanded").evaluate((element) => element.getBoundingClientRect().width)
    )
    .toBeGreaterThan(250);
  const hoverTransitionMs = await page.locator(".sidebar-expanded").evaluate((element) =>
    Math.max(
      ...getComputedStyle(element)
        .transitionDuration.split(",")
        .map((duration) => Number.parseFloat(duration) * 1000)
    )
  );
  expect(hoverTransitionMs).toBeGreaterThanOrEqual(340);
  const expandedSurfaceColor = await page
    .locator(".sidebar-expanded")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(expandedSurfaceColor).not.toBe("rgba(0, 0, 0, 0)");
  const workspaceWithLeftPreview = await page.locator(".workspace-scroll").boundingBox();
  expect(workspaceWithLeftPreview?.x).toBeCloseTo(workspaceWithLeftCollapsed?.x ?? 0, 1);
  expect(workspaceWithLeftPreview?.width).toBeCloseTo(workspaceWithLeftCollapsed?.width ?? 0, 1);
  await page.locator(".left-sidebar").evaluate((element) => {
    const target = element as HTMLElement & {
      hoverClassChanges?: string[];
      hoverClassObserver?: MutationObserver;
    };
    target.hoverClassChanges = [];
    target.hoverClassObserver = new MutationObserver(() => {
      target.hoverClassChanges?.push(target.className);
    });
    target.hoverClassObserver.observe(target, { attributes: true, attributeFilter: ["class"] });
  });
  await page.mouse.move(
    workspaceWithLeftPreview!.x + workspaceWithLeftPreview!.width / 2,
    workspaceWithLeftPreview!.y + workspaceWithLeftPreview!.height / 2
  );
  await expect(page.locator(".left-sidebar")).not.toHaveClass(/hover-expanded/);
  await expect
    .poll(() =>
      page
        .locator(".sidebar-expanded")
        .evaluate((element) => getComputedStyle(element).backgroundColor)
    )
    .toBe(expandedSurfaceColor);
  await page.waitForTimeout(450);
  const hoverClassChanges = await page.locator(".left-sidebar").evaluate((element) => {
    const target = element as HTMLElement & {
      hoverClassChanges?: string[];
      hoverClassObserver?: MutationObserver;
    };
    target.hoverClassObserver?.disconnect();
    return target.hoverClassChanges ?? [];
  });
  expect(hoverClassChanges.filter((value) => value.includes("hover-expanded"))).toHaveLength(0);
  await page.locator(".left-sidebar .sidebar-hover-trigger").hover();
  await page.getByRole("button", { name: "Keep left sidebar open" }).click();
  await expect(page.locator(".editor-grid")).not.toHaveClass(/sidebar-collapsed/);

  await page.getByRole("button", { name: "Minimize right sidebar" }).click();
  await expect(page.locator(".editor-grid")).toHaveClass(/right-sidebar-collapsed/);
  const rightCollapsedWorkspace = await page.locator(".workspace-scroll").boundingBox();
  await page.mouse.move(
    rightCollapsedWorkspace!.x + rightCollapsedWorkspace!.width / 2,
    rightCollapsedWorkspace!.y + rightCollapsedWorkspace!.height / 2
  );
  await expect(page.getByRole("button", { name: "Expand right sidebar" })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".right-sidebar").evaluate((element) => element.getBoundingClientRect().width)
    )
    .toBeLessThan(50);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("OpenSketch:right-sidebar-collapsed")))
    .toBe("true");
  const expandRightSidebar = page.getByRole("button", { name: "Expand right sidebar" });
  await expandRightSidebar.hover();
  await page.waitForTimeout(150);
  await expect(page.locator(".right-sidebar")).not.toHaveClass(/hover-expanded/);
  const rightSidebarBounds = await page.locator(".right-sidebar").boundingBox();
  expect(rightSidebarBounds).not.toBeNull();
  await page.mouse.move(rightSidebarBounds!.x + 22, rightSidebarBounds!.y + 52);
  await page.waitForTimeout(150);
  await expect(page.locator(".right-sidebar")).not.toHaveClass(/hover-expanded/);
  await page.mouse.move(
    rightCollapsedWorkspace!.x + rightCollapsedWorkspace!.width / 2,
    rightCollapsedWorkspace!.y + rightCollapsedWorkspace!.height / 2
  );
  await page.waitForTimeout(300);
  const workspaceWithRightCollapsed = await page.locator(".workspace-scroll").boundingBox();
  await page.locator(".right-sidebar .sidebar-hover-trigger").hover();
  await expect(page.locator(".right-sidebar")).toHaveClass(/hover-expanded/);
  await expect(page.locator(".inspector-header")).toBeVisible();
  const workspaceWithRightPreview = await page.locator(".workspace-scroll").boundingBox();
  expect(workspaceWithRightPreview?.x).toBeCloseTo(workspaceWithRightCollapsed?.x ?? 0, 1);
  expect(workspaceWithRightPreview?.width).toBeCloseTo(workspaceWithRightCollapsed?.width ?? 0, 1);
  await page.mouse.move(
    workspaceWithRightPreview!.x + workspaceWithRightPreview!.width / 2,
    workspaceWithRightPreview!.y + workspaceWithRightPreview!.height / 2
  );
  await expect(page.locator(".right-sidebar")).not.toHaveClass(/hover-expanded/);
  await page.locator(".right-sidebar .sidebar-hover-trigger").hover();
  await page.getByRole("button", { name: "Keep right sidebar open" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("OpenSketch:right-sidebar-collapsed")))
    .toBe("false");
});

test("fills the asset sidebar and presents laboratory assets before organisms", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const insertTabs = page.getByRole("tab");
  await expect(insertTabs).toHaveCount(4);
  for (const label of ["Assets", "Text", "Shapes", "Imports"]) {
    const tab = page.getByRole("tab", { name: label, exact: true });
    await expect(tab).toHaveAttribute("title", label);
    await expect(tab).toHaveText("");
  }

  const visibleAssetTitles = page.locator(".asset-card-copy strong");
  await expect(visibleAssetTitles.nth(7)).toBeVisible();
  expect((await visibleAssetTitles.allTextContents()).slice(0, 8)).toEqual([
    "Activated Neutrophil",
    "Astrocyte",
    "B Cell with IgM Receptors",
    "Basophil",
    "Cajal-Retzius Cell",
    "CD8 TCell",
    "Cell Nucleus",
    "Dendritic Cell"
  ]);

  const dimensions = await page.locator(".asset-list-shell").evaluate((shell) => {
    const list = shell.querySelector<HTMLElement>(".asset-list")!;
    return {
      shellHeight: shell.getBoundingClientRect().height,
      listHeight: list.getBoundingClientRect().height,
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight
    };
  });
  expect(dimensions.shellHeight).toBeGreaterThan(300);
  expect(dimensions.listHeight).toBeCloseTo(dimensions.shellHeight, 0);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  const firstAsset = page.locator(".asset-card").first();
  await expect(firstAsset.locator(".asset-card-image")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );
  await expect(firstAsset.locator(".asset-card-image")).toHaveCSS("background-image", "none");
  const restingAssetBounds = await firstAsset.boundingBox();
  expect(restingAssetBounds).not.toBeNull();
  await page.mouse.move(
    restingAssetBounds!.x + restingAssetBounds!.width / 2,
    restingAssetBounds!.y + restingAssetBounds!.height / 2
  );
  await page.waitForTimeout(150);
  const hoveredAssetBounds = await firstAsset.boundingBox();
  const assetListBounds = await page.locator(".asset-list").boundingBox();
  expect(hoveredAssetBounds).not.toBeNull();
  expect(assetListBounds).not.toBeNull();
  await expect(firstAsset).toHaveCSS("transform", "none");
  expect(hoveredAssetBounds!.y).toBeGreaterThanOrEqual(assetListBounds!.y);

  await page.locator(".asset-list").evaluate((list) => {
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event("scroll"));
  });
  await expect(page.locator(".asset-card").last()).toBeVisible();
});

test("pins favorite assets above normal All and category results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const assetTitles = page.locator(".asset-card-copy strong");
  const cd8 = page.locator(".asset-card").filter({ hasText: "CD8 TCell" }).first();
  await cd8.hover();
  await cd8.getByRole("button", { name: "Toggle favorite" }).click();
  await expect(assetTitles.first()).toHaveText("CD8 TCell");
  await expect(page.locator(".asset-results-meta")).toHaveCount(0);

  await page.getByRole("button", { name: "Cells and organelles", exact: true }).click();
  await expect(assetTitles.first()).toHaveText("CD8 TCell");

  const pinnedCd8 = page.locator(".asset-card").filter({ hasText: "CD8 TCell" }).first();
  await pinnedCd8.hover();
  await pinnedCd8.getByRole("button", { name: "Toggle favorite" }).click();
  await expect(assetTitles.first()).toHaveText("Basophil");
});

test("renders and persists complex NIH illustrations without losing their colors", async ({
  page
}) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("dendritic");
  const dendriticCell = page.locator(".asset-card").filter({ hasText: "Dendritic Cell" }).first();
  await expect(dendriticCell).toBeVisible();
  const insert = dendriticCell.locator(".asset-card-image");
  await insert.click();
  await expect(page.locator(".layers-title small")).toHaveText("1");

  const visibleCellColors = async () =>
    page.locator(".lower-canvas").evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      let peach = 0;
      let brown = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const [red, green, blue, alpha] = pixels.slice(index, index + 4);
        if (alpha > 0 && red > 180 && red < 245 && green > 120 && green < 215 && blue < 190) {
          peach += 1;
        }
        if (alpha > 0 && red > 70 && red < 170 && green > 35 && green < 130 && blue < 110) {
          brown += 1;
        }
      }
      return { peach, brown };
    });

  expect((await visibleCellColors()).peach).toBeGreaterThan(100);
  expect((await visibleCellColors()).brown).toBeGreaterThan(100);

  await insert.evaluate((button: HTMLButtonElement) => {
    for (let index = 0; index < 20; index += 1) button.click();
  });
  await expect(page.locator(".layers-title small")).toHaveText("21", { timeout: 30_000 });

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("21");
  await expect.poll(async () => (await visibleCellColors()).peach).toBeGreaterThan(100);
});

test("saves an inserted SVG before immediately leaving the editor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("dendritic");
  const dendriticCell = page.locator(".asset-card").filter({ hasText: "Dendritic Cell" }).first();
  await expect(dendriticCell).toBeVisible();
  await dendriticCell.locator(".asset-card-image").click();
  await page.getByRole("button", { name: "Back to projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "Untitled figure" }).click();

  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(
    page.locator(".layer-list button").filter({ hasText: "Dendritic Cell" })
  ).toHaveCount(1);
});

test("drills into an SVG asset and persists an independently edited part", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("dendritic");
  const dendriticCell = page.locator(".asset-card").filter({ hasText: "Dendritic Cell" }).first();
  await dendriticCell.locator(".asset-card-image").click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(page.getByText("Edit individual parts", { exact: true })).toBeVisible();
  await expect(page.locator(".inspector-header h2")).toHaveText("Dendritic Cell");
  await expect(page.locator(".inspector-header .eyebrow")).toHaveCount(0);

  const canvas = page.locator(".upper-canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.dblclick({
    position: { x: bounds!.width / 2, y: bounds!.height / 2 }
  });

  await expect(page.getByText("Inside Dendritic Cell", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Transform", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Appearance", exact: true })).toBeVisible();
  const fill = page.locator("label.color-field").filter({ hasText: "Fill" }).locator("input");
  await expect(fill).toBeVisible();
  await fill.fill("#00ff00");
  await page
    .locator("label.range-field")
    .filter({ hasText: "Opacity" })
    .locator('input[type="range"]')
    .fill("0.65");

  const visibleColors = async () =>
    page.locator(".lower-canvas").evaluate((element: HTMLCanvasElement) => {
      const pixels = element
        .getContext("2d")!
        .getImageData(0, 0, element.width, element.height).data;
      let green = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const [red, greenChannel, blue, alpha] = pixels.slice(index, index + 4);
        if (alpha > 0 && greenChannel > 180 && red < 80 && blue < 80) green += 1;
      }
      return green;
    });

  await expect.poll(visibleColors).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(visibleColors).toBe(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(visibleColors).toBeGreaterThan(20);
  await canvas.dblclick({
    position: { x: bounds!.width / 2, y: bounds!.height / 2 }
  });
  await expect(page.locator(".inspector-header .eyebrow")).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Dendritic Cell");

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByLabel("Project actions for Untitled figure").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project" }).click();
  const projectPath = await (await downloadPromise).path();
  expect(projectPath).not.toBeNull();
  const portable = JSON.parse(await readFile(projectPath!, "utf8")) as {
    objects: { objects: Array<{ objects?: Array<{ fill?: unknown; opacity?: number }> }> };
  };
  const parts = portable.objects.objects[0].objects ?? [];
  const editedPart = parts.find((part) => part.fill === "#00ff00");
  expect(editedPart?.opacity).toBe(0.65);
  expect(
    parts.some(
      (part) => typeof part.fill === "string" && part.fill !== "" && part.fill !== "#00ff00"
    )
  ).toBe(true);

  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect.poll(visibleColors).toBeGreaterThan(20);
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
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const rectangle = page.getByRole("button", { name: "Rectangle", exact: true });
  for (let index = 0; index < 100; index += 1) {
    await rectangle.click();
    const point = await artboardPoint(page, 0.25 + (index % 10) * 0.05, 0.25 + (index % 8) * 0.06);
    await page.mouse.click(point.x, point.y);
  }
  await expect(page.locator(".layers-title small")).toHaveText("100");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("100");
});
