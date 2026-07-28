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

async function ensureLayersOpen(page: Page) {
  const toggle = page.locator(".layers-title");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

async function placeTool(page: Page, name: string | RegExp, xRatio = 0.5, yRatio = 0.5) {
  if (name === "Text") {
    await page.getByRole("button", { name: "Text", exact: true }).click();
  } else if (name === "Line" || name === "Arrow") {
    await page.getByRole("button", { name: "Lines", exact: true }).click();
    await page
      .getByRole("menu", { name: "Line and arrow tools" })
      .getByRole("menuitem", { name: name === "Arrow" ? /Arrows/ : /^Lines/ })
      .hover();
  } else {
    await page.getByRole("tab", { name: "Shapes", exact: true }).click();
    const family = [
      "Triangle",
      "Right triangle",
      "Pentagon",
      "Hexagon",
      "Octagon",
      "Diamond",
      "Trapezoid",
      "Parallelogram",
      "Star"
    ].includes(String(name))
      ? /Polygons/
      : /Shapes/;
    await page
      .getByRole("menu", { name: "Shape tools" })
      .getByRole("menuitem", { name: family })
      .hover();
  }
  if (name !== "Text") {
    const menuName = name === "Line" ? "Straight line" : name === "Arrow" ? "Straight arrow" : name;
    await page
      .getByRole("menuitem", { name: menuName, exact: typeof menuName === "string" })
      .click();
  }
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  const point = await artboardPoint(page, xRatio, yRatio);
  await page.mouse.click(point.x, point.y);
}

test("creates, edits, saves, reopens, and exports a local figure", async ({ page }) => {
  test.setTimeout(60_000);
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
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Text", 0.55, 0.35);
  const fabricTextarea = page.locator('textarea[data-fabric="textarea"]');
  await expect(fabricTextarea).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("CD8 T cell");
  await expect(fabricTextarea).toHaveValue("CD8 T cell");
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  const singleVariantAsset = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^Cajal-Retzius Cell$/ }) })
    .first();
  await expect(singleVariantAsset).toBeVisible();
  await singleVariantAsset.getByRole("button", { name: "Insert Cajal-Retzius Cell" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
  await expect(page.getByText("Asset palette", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Part colors", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Variant", exact: true })).toHaveCount(0);
  await expect(
    page.locator("label.inspector-value-range").filter({ hasText: "Transparency" })
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await ensureLayersOpen(page);
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
  await ensureLayersOpen(page);
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
  await page.getByRole("button", { name: "Edit", exact: true }).click();

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
  await page.getByRole("button", { name: "Lines", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Line and arrow tools" })
    .getByRole("menuitem", { name: /Arrows/ })
    .hover();
  await page
    .getByRole("menu", { name: "Line and arrow tools" })
    .getByRole("menuitem", { name: "Straight arrow", exact: true })
    .click();
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
  await expect(page.getByLabel("Accessible description")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const path = await (await downloadPromise).path();
  expect(path).not.toBeNull();
  const svg = await readFile(path!, "utf8");
  expect(svg).toContain("stroke-dasharray");
  expect(svg).not.toContain("directional signaling path");

  await expect(page.locator(".save-state")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await ensureLayersOpen(page);
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
  const shapeMenu = page.getByRole("menu", { name: "Shape tools" });
  await expect(shapeMenu.getByRole("menuitem", { name: /Shapes/ })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: /Polygons/ })).toBeVisible();
  const basicShapeGlyphs = await shapeMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
  expect(new Set(basicShapeGlyphs).size).toBe(basicShapeGlyphs.length);
  await shapeMenu.getByRole("menuitem", { name: /Polygons/ }).hover();
  await expect(shapeMenu.getByRole("menuitem", { name: "Right triangle" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Octagon" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Star" })).toBeVisible();
  await shapeMenu.getByRole("menuitem", { name: /Defaults/ }).click();
  await expect(page.locator(".creation-defaults summary")).toHaveText([
    "New text defaults",
    "New shape defaults",
    "New line & arrow defaults"
  ]);
  await expect(page.locator(".shape-grid")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Polygon", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Membrane", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Callout", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bracket", exact: true })).toHaveCount(0);
  await selectUiOption(page, "Default text typeface", "Source Serif 4");
  await page.getByLabel("Default text color").fill("#3157a4");
  await page.getByLabel("Default text size").fill("28");
  await selectUiOption(page, "Default text weight", "Semibold");

  await placeTool(page, "Pentagon", 0.5, 0.18);
  await expect(page.locator(".inspector-header h2")).toHaveText("pentagon");
  await page.keyboard.press("Delete");
  await expect(page.locator(".floating-panel")).toHaveCount(0);

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menu", { name: "Shape tools" })
    .getByRole("menuitem", { name: /Shapes/ })
    .hover();
  const rectangle = page.getByRole("menuitem", { name: "Rectangle", exact: true });
  await rectangle.click();
  await expect(page.locator(".canvas-workspace")).toHaveClass(/is-creating/);
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  const rectanglePoint = await artboardPoint(page, 0.25, 0.3);
  await page.mouse.click(rectanglePoint.x, rectanglePoint.y);
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(page.getByRole("menuitem", { name: "Rectangle", exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("menu", { name: "Shape tools" })
    .getByRole("menuitem", { name: /Defaults/ })
    .click();
  await page.getByLabel("Default line color").fill("#c026d3");
  await page.getByLabel("Default line thickness").fill("9");
  await selectUiOption(page, "Line style", "Dashed");
  await selectUiOption(page, "End head", "Circle");

  await page.getByRole("button", { name: "Lines", exact: true }).click();
  const lineMenu = page.getByRole("menu", { name: "Line and arrow tools" });
  await lineMenu.getByRole("menuitem", { name: /^Dots/ }).hover();
  await lineMenu.getByRole("menuitem", { name: "Dashed dot endpoint", exact: true }).click();
  await expect(page.locator(".canvas-workspace")).toHaveClass(/is-creating/);
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
  await page.getByRole("menuitem", { name: /Defaults/ }).click();
  await expect(page.getByLabel("Default line color")).toHaveValue("#c026d3");
  await expect(page.getByLabel("Default line thickness")).toHaveValue("9");
  await expect(page.getByRole("combobox", { name: "Line style" })).toHaveText(/Dashed/i);
  await expect(page.getByRole("combobox", { name: "Start head" })).toHaveText(/None/i);
  await expect(page.getByRole("combobox", { name: "End head" })).toHaveText(/Circle/i);
  await expect(page.getByRole("combobox", { name: "Default text typeface" })).toHaveText(
    /Source Serif 4/i
  );
  await expect(page.getByLabel("Default text color")).toHaveValue("#3157a4");
  await expect(page.getByLabel("Default text size")).toHaveValue("28");
  await expect(page.getByRole("combobox", { name: "Default text weight" })).toHaveText(/Semibold/i);

  await placeTool(page, "Line", 0.3, 0.28);
  await expect(page.locator(".layers-title small")).toHaveText("3");
  expect(
    Number(await page.locator(".field-row.dimensions input").first().inputValue())
  ).toBeGreaterThan(150);

  await placeTool(page, "Arrow", 0.44, 0.42);
  await expect(page.locator(".layers-title small")).toHaveText("4");

  await page.getByRole("button", { name: "Lines", exact: true }).click();
  await page
    .getByRole("menu", { name: "Line and arrow tools" })
    .getByRole("menuitem", { name: /^Lines/ })
    .hover();
  const line = page.getByRole("menuitem", { name: "Straight line", exact: true });
  await line.click();
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  const lineFrom = await artboardPoint(page, 0.2, 0.78);
  const lineTo = await artboardPoint(page, 0.7, 0.6);
  await page.mouse.move(lineFrom.x, lineFrom.y);
  await page.mouse.down();
  await page.mouse.move(lineTo.x, lineTo.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".layers-title small")).toHaveText("5");

  const pointText = page.getByRole("button", { name: "Text", exact: true });
  await pointText.click();
  await expect(pointText).toHaveAttribute("aria-pressed", "true");
  const textPoint = await artboardPoint(page, 0.52, 0.22);
  await page.mouse.click(textPoint.x, textPoint.y);
  await page.keyboard.type("Placed label");
  await page.keyboard.press("Escape");
  await expect(page.locator(".layers-title small")).toHaveText("6");
  await page.waitForTimeout(250);
  await ensureLayersOpen(page);
  await expect(page.locator(".layer-list button").filter({ hasText: "Text" })).toBeVisible();
  const textInspector = page.locator(".inspector-scroll");
  await expect(textInspector.getByRole("combobox", { name: "Font" })).toHaveText(/Source Serif 4/i);
  await expect(textInspector.getByLabel("Size", { exact: true })).toHaveValue("28");
  await expect(textInspector.getByRole("combobox", { name: "Weight" })).toHaveText(/Semibold/i);
  await expect(
    textInspector
      .locator("label.color-field")
      .filter({ hasText: "Color" })
      .locator('input[type="color"]')
  ).toHaveValue("#3157a4");
});

test("places text from the first Shapes tool without blanking the editor", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.getByRole("tab", { name: "Text", exact: true })).toHaveCount(0);
  await expect(page.locator(".shape-grid")).toHaveCount(0);
  const pointText = page.getByRole("button", { name: "Text", exact: true });
  await pointText.click();
  await expect(pointText).toHaveAttribute("aria-pressed", "true");

  const point = await artboardPoint(page, 0.52, 0.32);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.type("Stable label");
  await page.keyboard.press("Escape");

  await expect(pointText).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();
  await ensureLayersOpen(page);
  await expect(page.locator(".layer-list button").filter({ hasText: "Text" })).toBeVisible();
  await expect(page.getByText("Figure title", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Section label", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Body annotation/)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("shows only controls supported by each editor object type", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  const inspector = page.locator(".inspector-embedded");

  await placeTool(page, "Rectangle", 0.35, 0.45);
  await expect(inspector.getByRole("button", { name: "Shape", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(inspector.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Variant", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Line", exact: true })).toHaveCount(0);

  await placeTool(page, "Line", 0.55, 0.45);
  await expect(inspector.getByRole("button", { name: "Line", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(inspector.getByRole("button", { name: "Shape", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Variant", exact: true })).toHaveCount(0);

  await placeTool(page, "Text", 0.7, 0.35);
  await expect(inspector.getByRole("button", { name: "Text", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(inspector.getByRole("button", { name: "Shape", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Line", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Variant", exact: true })).toHaveCount(0);
  await expect(
    inspector.locator("label.inspector-value-range").filter({ hasText: "Transparency" })
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("optionally creates Text on an empty-artboard double-click and persists the preference", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("button", { name: "Canvas size" }).click();

  const preference = page.getByLabel("Double-click to add text");
  await expect(preference).toBeChecked();
  const point = await artboardPoint(page, 0.68, 0.3);
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator(".layers-title small")).toHaveText("1");
  const fabricTextarea = page.locator('textarea[data-fabric="textarea"]');
  await expect(fabricTextarea).toBeFocused();
  await expect(fabricTextarea).toHaveValue("Text");
  await page.keyboard.press("Escape");
  await ensureLayersOpen(page);
  await expect(page.locator(".layer-list button").filter({ hasText: "Text" })).toBeVisible();

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.getByRole("button", { name: "Canvas size" }).click();
  await expect(page.getByLabel("Double-click to add text")).toBeChecked();
});

test("preserves clipboard object size across repeated pastes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.45, 0.45);

  const width = page.locator(".field-row.dimensions input").first();
  const originalWidth = Number(await width.inputValue());
  await page.keyboard.press("ControlOrMeta+C");
  await page.waitForTimeout(50);
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(originalWidth, 0);

  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.locator(".layers-title small")).toHaveText("3");
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(originalWidth, 0);
});

test("copies canvas objects to the system clipboard as PNG and SVG", async ({
  page,
  context,
  browserName
}) => {
  test.skip(browserName !== "chromium", "Clipboard image reads are only exposed by Chromium.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.5, 0.5);

  await page.keyboard.press("ControlOrMeta+C");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await navigator.clipboard.read()).some((item) => item.types.includes("image/png"))
      )
    )
    .toBe(true);
  const pngSignature = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read()).find((entry) =>
      entry.types.includes("image/png")
    );
    const bytes = new Uint8Array(await (await item!.getType("image/png")).arrayBuffer());
    return [...bytes.slice(0, 8)];
  });
  expect(pngSignature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.locator(".layers-title small")).toHaveText("2");

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await page.getByRole("button", { name: "Insert Cajal-Retzius Cell", exact: true }).click();
  await page.getByLabel("X", { exact: true }).fill("1400");
  await page.getByLabel("X", { exact: true }).press("Enter");
  const point = await artboardPoint(page, 1400 / 1920, 0.5);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Cajal-Retzius Cell actions" });
  await expect(menu.getByRole("menuitem", { name: "Copy as SVG" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Copy as PNG" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Copy as SVG" }).click();

  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await navigator.clipboard.read()).some((item) => item.types.includes("text/plain"))
      )
    )
    .toBe(true);
  const clipboardSvg = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read()).find((entry) =>
      entry.types.includes("text/plain")
    );
    return (await item!.getType("text/plain")).text();
  });
  expect(clipboardSvg).toContain("<svg");
  expect(clipboardSvg.match(/<path\b/g)?.length).toBeGreaterThanOrEqual(3);
});

test("inserts assets from the sidebar at the reduced default size", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("T Cell");
  await page.getByRole("button", { name: "Insert T Cell", exact: true }).click();

  const dimensions = page.locator(".field-row.dimensions input");
  const width = Number(await dimensions.nth(0).inputValue());
  const height = Number(await dimensions.nth(1).inputValue());
  expect(Math.max(width, height)).toBeCloseTo(180, 0);
});

test("previews bundled variants and inserts nested-clip-path assets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Immune Cell");
  const immuneCell = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^Immune Cell$/ }) });
  await expect(immuneCell).toBeVisible();

  await immuneCell.getByRole("combobox", { name: "Immune Cell variant" }).click();
  const variants = page.getByRole("listbox", { name: "Immune Cell variants" });
  await expect(variants).toBeVisible();
  await expect(variants.getByRole("option")).toHaveCount(9);
  await expect(variants.locator("img")).toHaveCount(9);
  for (const source of await variants
    .locator("img")
    .evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).getAttribute("src"))
    )) {
    expect(source).toMatch(/\/assets\/nih-bioart\/.+\.svg$/);
  }
  await variants.getByRole("option", { name: "Select Immune Cell variant 2" }).click();
  await expect(immuneCell.getByRole("combobox", { name: "Immune Cell variant" })).toHaveText(
    "Variant 2"
  );

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Immune Cell");
  const persistedImmuneCell = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^Immune Cell$/ }) });
  await expect(
    persistedImmuneCell.getByRole("combobox", { name: "Immune Cell variant" })
  ).toHaveText("Variant 2");

  await persistedImmuneCell.getByRole("button", { name: "Insert Immune Cell" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(page.locator(".inspector-header h2")).toHaveText("Immune Cell");
  await expect(page.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Variant", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(page.getByRole("button", { name: "Asset colors", exact: true })).toHaveCount(0);
  await expect(page.getByText("Color presets", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Shape", exact: true })).toHaveCount(0);
  const inspectorVariant = page
    .locator(".inspector-embedded")
    .getByRole("combobox", { name: "Immune Cell variant" });
  await expect(inspectorVariant).toHaveText("Variant 2");
  await inspectorVariant.click();
  await page
    .getByRole("listbox", { name: "Immune Cell variants" })
    .getByRole("option", { name: "Select Immune Cell variant 3" })
    .click();
  await expect(inspectorVariant).toHaveText("Variant 3");
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await ensureLayersOpen(page);
  await page.locator(".layer-list button").filter({ hasText: "Immune Cell" }).click();
  await expect(
    page.locator(".inspector-embedded").getByRole("combobox", { name: "Immune Cell variant" })
  ).toHaveText("Variant 3");
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Immune Cell");
  const newProjectImmuneCell = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^Immune Cell$/ }) });
  await expect(
    newProjectImmuneCell.getByRole("combobox", { name: "Immune Cell variant" })
  ).toHaveText("Variant 3");
});

test("parses every bundled NIH BioArt variant into editable objects", async ({
  page,
  browserName
}) => {
  test.skip(
    browserName !== "chromium",
    "The browser-independent asset corpus only needs one pass."
  );
  test.setTimeout(60_000);
  const manifest = JSON.parse(
    await readFile(
      new URL("../../apps/web/src/generated/nih-bioart-manifest.json", import.meta.url),
      "utf8"
    )
  ) as {
    families: Array<{
      title: string;
      variants: Array<{ id: string; assetPath: string }>;
    }>;
  };
  const variants = manifest.families.flatMap((family) =>
    family.variants.map((variant) => ({ ...variant, family: family.title }))
  );
  await page.goto("/");
  const failures = await page.evaluate(async (items) => {
    const { loadEditableSvg } = await import("/OpenSketch/src/editor/svg.ts");
    const failed: Array<{ id: string; family: string; error: string }> = [];
    for (let offset = 0; offset < items.length; offset += 40) {
      const results = await Promise.all(
        items.slice(offset, offset + 40).map(async (item) => {
          try {
            const response = await fetch(`/OpenSketch${item.assetPath}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const parsed = await loadEditableSvg(await response.text());
            if (!parsed.objects.some(Boolean)) throw new Error("No editable objects");
            return null;
          } catch (reason) {
            return { ...item, error: String(reason) };
          }
        })
      );
      failed.push(
        ...results.filter((result): result is { id: string; family: string; error: string } =>
          Boolean(result)
        )
      );
    }
    return failed;
  }, variants);

  expect(failures).toEqual([]);
});

test("uses accessible in-app dropdowns with keyboard and outside-click behavior", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("button", { name: "Canvas size" }).click();

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
  await page.locator(".top-toolbar").click();
  await expect(page.getByRole("listbox", { name: "Unit" })).toHaveCount(0);
  await expect(page.getByText("Export DPI", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByLabel("Accessible description")).toHaveCount(0);
  await page.getByRole("tab", { name: /PNG/ }).click();
  const outputDpi = page.getByRole("combobox", { name: "Output DPI" });
  await expect(page.getByRole("combobox", { name: "Pixel scaling" })).toHaveCount(0);
  await expect(page.getByLabel("Pixel width")).toHaveCount(0);
  await expect(page.getByLabel("Pixel height")).toHaveCount(0);
  await expect(page.locator(".export-summary")).toHaveCount(0);
  await outputDpi.click();
  await expect(page.getByRole("option", { name: "150 DPI" })).toBeVisible();
  await expect(page.getByRole("option", { name: "1200 DPI" })).toBeVisible();
  await expect(page.getByRole("option", { name: "72 DPI" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Export figure" })).toBeVisible();
  await expect(page.getByRole("listbox", { name: "Output DPI" })).toHaveCount(0);

  await selectUiOption(page, "Output DPI", "1200 DPI");
  await page.getByRole("button", { name: "Close export dialog" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("tab", { name: /PNG/ }).click();
  await expect(page.getByRole("combobox", { name: "Output DPI" })).toHaveAttribute(
    "data-value",
    "1200"
  );
  await page.getByRole("tab", { name: /PDF/ }).click();
  await expect(page.getByLabel("Accessible description")).toHaveCount(0);
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
  await expect(multipleMenu.getByRole("menuitem", { name: /ruler/i })).toHaveCount(0);
  await multipleMenu.getByRole("menuitem", { name: "Group" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await page.mouse.click(firstRectangle.x, firstRectangle.y, { button: "right" });
  const groupMenu = page.getByRole("menu", { name: "Group actions" });
  await expect(groupMenu.getByRole("menuitem", { name: "Ungroup" })).toBeVisible();
  await groupMenu.getByRole("menuitem", { name: "Ungroup" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("2");

  await ensureLayersOpen(page);
  await page.locator(".layer-list > button").first().click();
  const fill = page
    .locator("label.color-field")
    .filter({ hasText: "Fill" })
    .locator('input[type="color"]');
  await fill.fill("#ff0000");
  await expect(fill).toHaveValue("#ff0000");
  const secondRectangle = await artboardPoint(page, 0.65, 0.5);
  await page.mouse.click(secondRectangle.x, secondRectangle.y, { button: "right" });
  const shapeMenu = page.getByRole("menu", { name: "rectangle actions" });
  await expect(shapeMenu.getByRole("menuitem", { name: "Save styling" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Reset styling" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Copy as SVG" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Copy as PNG" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Bring one up" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Bring to front" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Send one down" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Send to back" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: /ruler/i })).toHaveCount(0);
  await expect(shapeMenu.getByRole("menuitem", { name: "Delete object" })).toBeVisible();
  await shapeMenu.getByRole("menuitem", { name: "Reset styling" }).click();
  await expect(fill).toHaveValue("#d8efe9");

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const textPoint = await artboardPoint(page, 0.5, 0.25);
  await placeTool(page, "Text", 0.5, 0.25);
  await page.keyboard.type("Context label");
  await page.keyboard.press("Escape");
  const textFill = page
    .locator("label.color-field")
    .filter({ hasText: "Fill" })
    .locator('input[type="color"]');
  await textFill.fill("#00ff00");
  await page.mouse.click(textPoint.x, textPoint.y, { button: "right" });
  const textMenu = page.getByRole("menu", { name: "Text actions" });
  await expect(textMenu.getByRole("menuitem", { name: "Save styling" })).toBeVisible();
  await expect(textMenu.getByRole("menuitem", { name: "Reset styling" })).toBeVisible();
  await textMenu.getByRole("menuitem", { name: "Reset styling" }).click();
  await expect(textFill).toHaveValue("#183133");
});

test("saves and resets per-element styling for future sidebar shapes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();

  const firstPoint = await artboardPoint(page, 0.35, 0.5);
  await placeTool(page, "Rectangle", 0.35, 0.5);
  const fill = page
    .locator("label.color-field")
    .filter({ hasText: "Fill" })
    .locator('input[type="color"]');
  await fill.fill("#ff0000");
  await page.mouse.click(firstPoint.x, firstPoint.y, { button: "right" });
  await page
    .getByRole("menu", { name: "rectangle actions" })
    .getByRole("menuitem", { name: "Save styling" })
    .click();

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const secondPoint = await artboardPoint(page, 0.65, 0.5);
  await placeTool(page, "Rectangle", 0.65, 0.5);
  await expect(fill).toHaveValue("#ff0000");

  await page.mouse.click(secondPoint.x, secondPoint.y, { button: "right" });
  await page
    .getByRole("menu", { name: "rectangle actions" })
    .getByRole("menuitem", { name: "Reset styling" })
    .click();
  await expect(fill).toHaveValue("#d8efe9");

  await placeTool(page, "Rectangle", 0.82, 0.5);
  await expect(fill).toHaveValue("#d8efe9");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const styles = JSON.parse(localStorage.getItem("OpenSketch:element-styles") ?? "{}");
        return styles["shape:rectangle"];
      })
    )
    .toBeUndefined();
});

test("ungroups exactly one level of a nested group hierarchy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.3, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);

  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await placeTool(page, "Triangle", 0.7, 0.5);
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");

  const nestedGroupPoint = await artboardPoint(page, 0.5, 0.5);
  await page.mouse.click(nestedGroupPoint.x, nestedGroupPoint.y, { button: "right" });
  const outerGroupMenu = page.getByRole("menu", { name: "Group actions" });
  await expect(outerGroupMenu.getByRole("menuitem", { name: "Ungroup" })).toBeVisible();
  await outerGroupMenu.getByRole("menuitem", { name: "Ungroup" }).click();

  await expect(page.locator(".layers-title small")).toHaveText("2");
  await ensureLayersOpen(page);
  const innerGroupLayer = page
    .locator(".layer-list > button")
    .filter({ has: page.getByText("Group", { exact: true }) });
  await expect(innerGroupLayer).toHaveCount(1);
  await innerGroupLayer.click();
  await expect(page.getByRole("button", { name: "Ungroup", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
});

test("double-clicks through overlapping objects and into grouped children", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.5, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);

  const overlap = await artboardPoint(page, 0.5, 0.5);
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");

  await page.mouse.dblclick(overlap.x, overlap.y);
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");
  const ungroupedX = page.locator(".inspector-scroll").getByLabel("X", { exact: true });
  const ungroupedStartX = Number(await ungroupedX.inputValue());
  await page.mouse.move(overlap.x, overlap.y);
  await page.mouse.down();
  await page.mouse.move(overlap.x + 140, overlap.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");
  await expect
    .poll(async () => Number(await ungroupedX.inputValue()))
    .toBeGreaterThan(ungroupedStartX + 100);

  await page.mouse.move(overlap.x + 140, overlap.y);
  await page.mouse.down();
  await page.mouse.move(overlap.x, overlap.y, { steps: 5 });
  await page.mouse.up();
  await page.mouse.dblclick(overlap.x, overlap.y);
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");

  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");

  await page.mouse.dblclick(overlap.x, overlap.y);
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");
  const groupedX = page.locator(".inspector-scroll").getByLabel("X", { exact: true });
  const groupedStartX = Number(await groupedX.inputValue());
  await page.mouse.move(overlap.x, overlap.y);
  await page.mouse.down();
  await page.mouse.move(overlap.x + 140, overlap.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect
    .poll(async () => Number(await groupedX.inputValue()))
    .toBeGreaterThan(groupedStartX + 100);

  await page.mouse.dblclick(overlap.x, overlap.y);
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");
});

test("double-clicks into nested groups one hierarchy level at a time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.4, 0.5);
  await placeTool(page, "Circle", 0.4, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  const widthField = page.locator(".inspector-scroll").getByLabel("W", { exact: true });
  const innerGroupWidth = Number(await widthField.inputValue());
  await placeTool(page, "Triangle", 0.7, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");

  const nestedGroupPoint = await artboardPoint(page, 0.4, 0.5);
  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");
  await expect
    .poll(async () => Number(await widthField.inputValue()))
    .toBeCloseTo(innerGroupWidth, 0);

  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  await expect(page.locator(".inspector-header h2")).not.toHaveText("Group");
});

test("preserves nested group dimensions when duplicating by modifier-drag", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.4, 0.5);
  await placeTool(page, "Circle", 0.4, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  const widthField = page.locator(".inspector-scroll").getByLabel("W", { exact: true });
  const innerGroupWidth = Number(await widthField.inputValue());
  await placeTool(page, "Triangle", 0.7, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  const nestedGroupPoint = await artboardPoint(page, 0.4, 0.5);
  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");
  await page.mouse.move(nestedGroupPoint.x, nestedGroupPoint.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(nestedGroupPoint.x + 220, nestedGroupPoint.y - 100, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect
    .poll(async () => Number(await widthField.inputValue()))
    .toBeCloseTo(innerGroupWidth, 0);

  await page.getByRole("button", { name: "Back to projects" }).click();
  const nestedGroupWidths = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const open = indexedDB.open("OpenSketch");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction("projects").objectStore("projects").getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const outer = request.result[0]?.objects?.objects?.[0] as
              | {
                  objects?: Array<{
                    type?: string;
                    width?: number;
                    scaleX?: number;
                  }>;
                }
              | undefined;
            resolve(
              (outer?.objects ?? [])
                .filter((object) => object.type === "Group")
                .map((object) => (object.width ?? 0) * (object.scaleX ?? 1))
            );
          };
        };
      })
  );
  expect(nestedGroupWidths).toHaveLength(2);
  nestedGroupWidths.forEach((width) => expect(width).toBeCloseTo(innerGroupWidth, 0));
});

test("shows every visible layer of a grouped stack in the project preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();

  for (const width of [400, 300, 200]) {
    await placeTool(page, "Circle", 0.5, 0.5);
    const widthField = page.locator(".inspector-scroll").getByLabel("W", { exact: true });
    await widthField.fill(String(width));
    await widthField.blur();
  }

  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("button", { name: "Back to projects" }).click();

  const preview = page.locator("canvas[data-opensketch-project-preview]").first();
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext("2d")!;
        const row = context.getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data;
        let runs = 0;
        let insideDarkRun = false;
        for (let index = 0; index < row.length; index += 4) {
          const dark = row[index] < 200 && row[index + 1] < 200 && row[index + 2] < 200;
          if (dark && !insideDarkRun) runs += 1;
          insideDarkRun = dark;
        }
        return runs;
      })
    )
    .toBeGreaterThanOrEqual(6);
});

test("moves objects exactly one layer through the canvas context menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.25, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);
  await placeTool(page, "Triangle", 0.75, 0.5);

  await ensureLayersOpen(page);
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

test("renders project previews with Fabric and upgrades legacy raster thumbnails", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Dentritic");
  await page.waitForTimeout(250);
  await page.locator(".asset-card-image").first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Back to projects" }).click();

  const preview = page.locator("canvas[data-opensketch-project-preview]").first();
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let colored = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) {
            colored += 1;
          }
        }
        return colored;
      })
    )
    .toBeGreaterThan(100);

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
  await expect(page.locator("canvas[data-opensketch-project-preview]").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("OpenSketch");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("projects", "readonly");
        const request = transaction.objectStore("projects").getAll();
        const projects = await new Promise<Array<{ thumbnail?: string }>>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return decodeURIComponent(projects[0]?.thumbnail ?? "").includes(
          'data-opensketch-thumbnail="3"'
        );
      })
    )
    .toBe(true);
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
  const emptyProjectPreview = page.locator(".project-preview").first();
  const emptyProjectCanvas = emptyProjectPreview.locator("canvas[data-opensketch-project-preview]");
  await expect(emptyProjectCanvas).toBeVisible();
  await expect(page.locator(".empty-preview")).toHaveCount(0);
  const [previewBounds, previewCanvasBounds] = await Promise.all([
    emptyProjectPreview.boundingBox(),
    emptyProjectCanvas.boundingBox()
  ]);
  expect(previewBounds).not.toBeNull();
  expect(previewCanvasBounds).not.toBeNull();
  expect(previewCanvasBounds!.width).toBeGreaterThanOrEqual(previewBounds!.width - 2);
  expect(previewCanvasBounds!.height).toBeGreaterThanOrEqual(previewBounds!.height - 2);
});

test("archives projects and organizes newest-first project rows with folders", async ({ page }) => {
  const createNamedProject = async (name: string) => {
    await page.getByRole("button", { name: "New figure" }).click();
    const title = page.getByLabel("Document title");
    await title.fill(name);
    await title.blur();
    await page.getByRole("button", { name: "Back to projects" }).click();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  };

  await page.goto("/");
  await createNamedProject("Alpha");
  await createNamedProject("Beta");

  const mainRow = page.getByLabel("Projects, newest edited first", { exact: true });
  await expect(mainRow.locator(".project-title").first()).toContainText("Beta");

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill("Lab figures");
  await page.getByRole("button", { name: "Create folder" }).click();
  const folder = page.locator(".folder-card").filter({ hasText: "Lab figures" });
  await expect(folder).toContainText("0 projects");

  const alpha = mainRow.locator(".project-card").filter({ hasText: "Alpha" });
  await alpha.dragTo(folder);
  await expect(folder).toContainText("1 project");
  await expect(alpha).toHaveCount(0);

  await folder.locator(".folder-card-main").click();
  const folderDrawer = page.getByRole("region", { name: "Lab figures folder" });
  const filedAlpha = folderDrawer.locator(".project-card").filter({ hasText: "Alpha" });
  await expect(filedAlpha).toBeVisible();
  await filedAlpha.getByLabel("Project actions for Alpha").click();
  await filedAlpha.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(filedAlpha).toHaveCount(0);

  await page.reload();
  await expect(folder).toHaveClass(/open/);
  await expect(folderDrawer).toBeVisible();
  const archiveDisclosure = page.getByRole("button", { name: /Archived/ });
  await expect(archiveDisclosure).toContainText("1");
  await archiveDisclosure.click();
  const archivedRow = page.getByLabel("Archived projects, newest edited first");
  const archivedAlpha = archivedRow.locator(".project-card").filter({ hasText: "Alpha" });
  await expect(archivedAlpha).toBeVisible();
  await archivedAlpha.getByLabel("Project actions for Alpha").click();
  await archivedAlpha.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(archivedAlpha).toHaveCount(0);
  const restoredAlpha = folderDrawer.locator(".project-card").filter({ hasText: "Alpha" });
  await expect(restoredAlpha).toBeVisible();

  await restoredAlpha.locator(".project-title").click();
  await expect(page.getByLabel("Document title")).toHaveValue("Alpha");
  await page.getByRole("button", { name: "Back to projects" }).click();
  await expect(folder).toHaveClass(/open/);
  await expect(folderDrawer.locator(".project-card").filter({ hasText: "Alpha" })).toBeVisible();

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill("Other figures");
  await page.getByRole("button", { name: "Create folder" }).click();
  const otherFolder = page.locator(".folder-card").filter({ hasText: "Other figures" });
  await otherFolder.locator(".folder-card-main").click();
  await expect(otherFolder).toHaveClass(/open/);
  await expect(folder).not.toHaveClass(/open/);
  await expect(folderDrawer).toHaveCount(0);
  const otherFolderDrawer = page.getByRole("region", { name: "Other figures folder" });
  await expect(otherFolderDrawer).toBeVisible();
  await page.getByRole("button", { name: "Close Other figures folder" }).click();
  await expect(page.locator(".folder-card.open")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".folder-card.open")).toHaveCount(0);
  await expect(otherFolderDrawer).toHaveCount(0);

  for (let index = 0; index < 4; index += 1) {
    await mainRow.getByLabel("Project actions for Beta", { exact: true }).click();
    await mainRow.getByRole("button", { name: "Duplicate", exact: true }).click();
  }
  await expect(mainRow.locator(".project-card")).toHaveCount(5);
  await expect(mainRow.locator(".project-title").first()).toContainText("Beta copy");
  expect(
    await mainRow.evaluate((row) => ({
      overflow: row.scrollWidth > row.clientWidth,
      wrap: getComputedStyle(row).flexWrap
    }))
  ).toEqual({ overflow: true, wrap: "nowrap" });
});

test("previews canvas zoom without resizing its backing stores or the page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  const workspace = page.locator(".workspace-scroll");

  const result = await workspace.evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
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
      const stageRect = stage.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -1,
        clientX: stageRect.left + stageRect.width * 0.75,
        clientY: stageRect.top + stageRect.height * 0.3
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const workspacePrevented = dispatchZoom(element);
    for (let index = 0; index < 39; index += 1) dispatchZoom(element);
    const outside = document.querySelector(".floating-tool-rail")!;
    const outsidePrevented = dispatchZoom(outside);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const previewBackingStoreChanges = backingStoreChanges;
    const previewStageWidth = stage.getBoundingClientRect().width;
    await new Promise((resolve) => setTimeout(resolve, 210));
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
  expect(result.settledBackingStoreChanges).toBeGreaterThan(0);
});

test("zooms around the cursor instead of the artboard center", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  const workspace = page.locator(".workspace-scroll");
  const stage = workspace.locator(".artboard-stage");

  const before = await stage.boundingBox();
  expect(before).not.toBeNull();
  const cursor = {
    x: before!.x + before!.width * 0.78,
    y: before!.y + before!.height * 0.32
  };
  const logicalBefore = {
    x: ((cursor.x - before!.x) / before!.width) * 1920,
    y: ((cursor.y - before!.y) / before!.height) * 1080
  };

  await page.mouse.move(cursor.x, cursor.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await page.waitForTimeout(150);

  const after = await stage.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width);
  const logicalAfter = {
    x: ((cursor.x - after!.x) / after!.width) * 1920,
    y: ((cursor.y - after!.y) / after!.height) * 1080
  };
  expect(Math.abs(logicalAfter.x - logicalBefore.x)).toBeLessThan(2);
  expect(Math.abs(logicalAfter.y - logicalBefore.y)).toBeLessThan(2);
});

test("rerenders vector artwork at the current zoom resolution", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("T Cell");
  await page.getByRole("button", { name: "Insert T Cell", exact: true }).click();
  const workspace = page.locator(".workspace-scroll");
  const zoomIn = page.getByRole("button", { name: "Zoom in" }).first();

  for (let index = 0; index < 25; index += 1) await zoomIn.click();
  await expect
    .poll(async () =>
      Number.parseInt(
        (await page.locator(".workspace-controls .zoom-readout").textContent()) ?? "0",
        10
      )
    )
    .toBeGreaterThan(270);

  const result = await workspace.evaluate((element) => {
    const stage = element.querySelector<HTMLElement>(".artboard-stage")!;
    const lowerCanvas = element.querySelector<HTMLCanvasElement>(".lower-canvas")!;
    const stageRect = stage.getBoundingClientRect();
    return {
      devicePixelRatio: window.devicePixelRatio,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
      backingWidth: lowerCanvas.width,
      backingHeight: lowerCanvas.height
    };
  });

  expect(result.stageWidth).toBeGreaterThan(1920 * 2.7);
  expect(result.backingWidth / result.stageWidth).toBeCloseTo(result.devicePixelRatio, 1);
  expect(result.backingHeight / result.stageHeight).toBeCloseTo(result.devicePixelRatio, 1);
});

test("keeps mirror controls out of the header and toggles grid and rulers", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const workspace = page.locator(".workspace-scroll");
  await page.locator(".layers-title").focus();
  await page.keyboard.press("Tab");
  await expect(workspace).toBeFocused();
  await expect.poll(() => workspace.evaluate((element) => element.matches(":focus-visible"))).toBe(
    true
  );
  expect(await workspace.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");

  await expect(page.getByRole("button", { name: "Mirror horizontally" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mirror vertically" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show grid" })).toBeVisible();
  await page.getByRole("button", { name: "Show grid" }).click();
  await expect(page.locator(".canvas-workspace")).toHaveClass(/grid-visible/);

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Triangle", 0.5, 0.5);
  await page.getByRole("button", { name: "Flip H", exact: true }).click();
  await page.getByRole("button", { name: "Flip V", exact: true }).click();

  const stageWithRuler = await page.locator(".artboard-stage").boundingBox();
  expect(stageWithRuler).not.toBeNull();
  const emptyCanvasPoint = await artboardPoint(page, 0.82, 0.15);
  await page.mouse.click(emptyCanvasPoint.x, emptyCanvasPoint.y, { button: "right" });
  const canvasMenu = page.getByRole("menu", { name: "Canvas actions" });
  await expect(canvasMenu.getByRole("menuitem", { name: "Hide grid" })).toBeVisible();
  await canvasMenu.getByRole("menuitem", { name: "Hide ruler" }).click();
  await expect(page.locator(".canvas-ruler")).toHaveCount(0);
  await expect(page.locator(".canvas-workspace")).toHaveClass(/ruler-hidden/);
  const stageWithoutRuler = await page.locator(".artboard-stage").boundingBox();
  expect(stageWithoutRuler?.x).toBeCloseTo(stageWithRuler!.x, 0);
  expect(stageWithoutRuler?.y).toBeCloseTo(stageWithRuler!.y, 0);

  await page.mouse.click(emptyCanvasPoint.x, emptyCanvasPoint.y, { button: "right" });
  const showRuler = page
    .getByRole("menu", { name: "Canvas actions" })
    .getByRole("menuitem", { name: "Show ruler" });
  await expect(showRuler).toBeVisible();
  await showRuler.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.locator(".canvas-ruler")).toHaveCount(2);
  await expect(page.locator(".canvas-workspace")).toHaveClass(/grid-visible/);
  const restoredStage = await page.locator(".artboard-stage").boundingBox();
  expect(restoredStage?.x).toBeCloseTo(stageWithRuler!.x, 0);
  expect(restoredStage?.y).toBeCloseTo(stageWithRuler!.y, 0);

  await page.getByRole("button", { name: "Back to projects" }).click();
  const transforms = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("OpenSketch");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("projects", "readonly");
    const request = transaction.objectStore("projects").getAll();
    const projects = await new Promise<
      Array<{ objects: { objects: Array<{ flipX?: boolean; flipY?: boolean }> } }>
    >((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return projects[0]?.objects.objects[0];
  });
  expect(transforms).toMatchObject({ flipX: true, flipY: true });
});

test("centers a new artboard and restores each project's zoom and pan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const viewportGeometry = async () => {
    const [workspace, stage, footer] = await Promise.all([
      page.locator(".workspace-scroll").boundingBox(),
      page.locator(".artboard-stage").boundingBox(),
      page.locator(".workspace-footer").boundingBox()
    ]);
    if (!workspace || !stage || !footer) return null;
    return {
      x: stage.x + stage.width / 2 - (workspace.x + workspace.width / 2),
      y: stage.y + stage.height / 2 - (workspace.y + (footer.y - workspace.y) / 2)
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

  const closePanel = page.getByRole("button", { name: /Close (panel|properties)/ }).first();
  if (await closePanel.isVisible()) await closePanel.click();
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

test("duplicates with modifier-drag and disables snapping while Alt is held", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Rectangle", 0.65, 0.5);
  const fill = page
    .locator("label.color-field")
    .filter({ hasText: "Fill" })
    .locator('input[type="color"]');
  await fill.fill("#000000");
  await expect(page.locator(".layers-title small")).toHaveText("2");

  const secondRectangle = await artboardPoint(page, 0.65, 0.5);
  const movedRectangle = {
    x: secondRectangle.x + 110,
    y: secondRectangle.y - 70
  };
  await page.mouse.move(secondRectangle.x, secondRectangle.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(movedRectangle.x, movedRectangle.y, { steps: 8 });
  await expect(page.locator(".layers-title small")).toHaveText("3");
  const transparency = page
    .locator("label.inspector-value-range")
    .filter({ hasText: "Transparency" })
    .locator('input[type="range"]');
  await expect(transparency).toHaveValue("65");
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(page.locator(".layers-title small")).toHaveText("3");
  await expect(transparency).toHaveValue("0");

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

  const canvasCenter = await artboardPoint(page, 0.5, 0.5);
  await page.mouse.move(movedRectangle.x, movedRectangle.y);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(canvasCenter.x, canvasCenter.y, { steps: 8 });
  await expect.poll(redGuidePixels).toBe(0);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(page.locator(".layers-title small")).toHaveText("3");

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
});

test("preserves an asset's rendered size when duplicating by modifier-drag", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await page.getByRole("button", { name: "Insert Cajal-Retzius Cell", exact: true }).click();

  const dimensions = page.locator(".field-row.dimensions input");
  const originalWidth = Number(await dimensions.nth(0).inputValue());
  const originalHeight = Number(await dimensions.nth(1).inputValue());
  const center = await artboardPoint(page, 0.5, 0.5);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(center.x + 130, center.y - 80, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(page.locator(".layers-title small")).toHaveText("2");
  await expect
    .poll(async () => Number(await dimensions.nth(0).inputValue()))
    .toBeCloseTo(originalWidth, 0);
  await expect
    .poll(async () => Number(await dimensions.nth(1).inputValue()))
    .toBeCloseTo(originalHeight, 0);

  await ensureLayersOpen(page);
  await page.locator(".layer-list > button").last().click();
  await expect
    .poll(async () => Number(await dimensions.nth(0).inputValue()))
    .toBeCloseTo(originalWidth, 0);
  await expect
    .poll(async () => Number(await dimensions.nth(1).inputValue()))
    .toBeCloseTo(originalHeight, 0);
});

test("documents large cross-platform shortcuts and accepts Ctrl commands", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("button", { name: "Help" }).click();

  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Cmd/Ctrl plus Z or Shift plus Cmd/Ctrl plus Z")).toBeVisible();
  await expect(
    dialog.getByLabel("Cmd/Ctrl plus X or Cmd/Ctrl plus C or Cmd/Ctrl plus V")
  ).toBeVisible();
  await expect(dialog.getByLabel("Backspace or Delete")).toBeVisible();
  const zoomShortcut = dialog.getByLabel("Cmd/Ctrl plus + or Cmd/Ctrl plus − or Cmd/Ctrl plus 0");
  await expect(zoomShortcut.locator("kbd").filter({ hasText: /^\+$/ })).toHaveCount(1);
  await expect(zoomShortcut.locator(".shortcut-plus")).toHaveCount(3);
  await expect(dialog.getByText(/Hold Cmd\/Ctrl while scrolling to zoom/)).toBeVisible();
  const keyStyle = await dialog
    .locator("kbd")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        paddingTop: Number.parseFloat(style.paddingTop)
      };
    });
  expect(keyStyle.fontSize).toBeGreaterThanOrEqual(11);
  expect(keyStyle.paddingTop).toBeGreaterThanOrEqual(7);
  await dialog.getByRole("button", { name: "Got it" }).click();

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.5, 0.5);
  await page.keyboard.press("Control+D");
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await page.keyboard.press("Control+Z");
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.keyboard.press("Control+Shift+Z");
  await expect(page.locator(".layers-title small")).toHaveText("2");
});

test.skip("selects across the artboard and previews collapsed sidebars without shifting the canvas", async ({
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
  await page.mouse.move(stage!.x + stage!.width * 0.5, stage!.y + stage!.height * 0.7, {
    steps: 4
  });
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");
  await page.mouse.move(stage!.x + stage!.width * 0.8, stage!.y + stage!.height * 0.7, {
    steps: 4
  });
  await expect(page.locator(".inspector-header")).toContainText("2 selected");
  await page.mouse.up();
  await expect(page.locator(".inspector-header")).toContainText("2 selected");

  const insideStart = {
    x: stage!.x + stage!.width * 0.1,
    y: stage!.y + stage!.height * 0.2
  };
  await page.mouse.move(insideStart.x, insideStart.y);
  await page.mouse.down();
  await page.mouse.move(stage!.x + stage!.width * 0.5, stage!.y + stage!.height * 0.7, {
    steps: 4
  });
  await expect(page.locator(".workspace-marquee")).toBeVisible();
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");
  await page.mouse.move(stage!.x + stage!.width * 0.8, stage!.y + stage!.height * 0.7, {
    steps: 4
  });
  await expect(page.locator(".inspector-header")).toContainText("2 selected");
  await page.mouse.up();

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
  await expect(insertTabs).toHaveCount(3);
  for (const label of ["Assets", "Shapes", "Imports"]) {
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
    "Damaged Mitochondria"
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
  expect(Math.abs(dimensions.listHeight - dimensions.shellHeight)).toBeLessThan(14);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  const firstAsset = page.locator(".asset-card").first();
  await expect(page.locator(".asset-info")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^About / })).toHaveCount(0);
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

test("uses title-free insert panels and supports the expanded offline font catalog", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  await expect(page.getByRole("heading", { name: "Illustration library" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Text", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Text", 0.5, 0.5);
  const typeface = page.locator(".inspector-embedded").getByRole("combobox", { name: "Font" });
  await typeface.click();
  await expect(page.getByRole("option")).toHaveCount(13);
  for (const font of [
    "Atkinson Hyperlegible",
    "IBM Plex Sans",
    "IBM Plex Serif",
    "Merriweather",
    "Noto Sans",
    "Noto Serif",
    "Roboto Mono"
  ]) {
    await expect(page.getByRole("option", { name: font, exact: true })).toBeVisible();
  }
  await page.getByRole("option", { name: "IBM Plex Sans", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "IBM Plex Sans"')))
    .toBe(true);
  await expect(typeface).toHaveText("IBM Plex Sans");

  await expect(page.getByRole("heading", { name: /Shapes.*connectors/i })).toHaveCount(0);
  await expect(page.getByText("Connect two objects precisely.", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Imports", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Imported SVGs are sanitized locally/)).toHaveCount(0);
});

test("shows favorites only in a dedicated asset category", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const assetTitles = page.locator(".asset-card-copy strong");
  const cd8 = page.locator(".asset-card").filter({ hasText: "CD8 TCell" }).first();
  await cd8.hover();
  await cd8.getByRole("button", { name: "Toggle favorite" }).click();
  await expect(assetTitles.first()).not.toHaveText("CD8 TCell");
  await expect(page.locator(".asset-results-meta")).toHaveCount(0);

  await page.getByRole("button", { name: "Cells", exact: true }).click();
  await expect(assetTitles.first()).not.toHaveText("CD8 TCell");

  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(assetTitles.first()).toHaveText("CD8 TCell");
  const pinnedCd8 = page.locator(".asset-card").filter({ hasText: "CD8 TCell" }).first();
  await pinnedCd8.hover();
  await pinnedCd8.getByRole("button", { name: "Toggle favorite" }).click();
  await expect(page.getByRole("heading", { name: "No match" })).toBeVisible();
});

test("shows a minimal no-match state and preserves native page-text copying", async ({
  page,
  context,
  browserName
}) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const search = page.getByPlaceholder("Search cells, proteins, equipment…");
  await search.fill("definitely-not-a-biological-asset");
  await expect(page.getByRole("heading", { name: "No match", exact: true })).toBeVisible();
  await expect(page.getByText(/Try a synonym/)).toHaveCount(0);

  await page.getByRole("heading", { name: "No match", exact: true }).evaluate((heading) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(heading);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("No match");
  if (browserName === "chromium") {
    await page.keyboard.press("ControlOrMeta+C");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("No match");
  }
});

test("orders the audited taxonomy from cell biology to macroscopic assets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  await expect(page.locator(".category-strip button")).toHaveText([
    "Favorites",
    "All",
    "Cells",
    "Proteins",
    "Molecules",
    "Nucleic acids & genetics",
    "Cellular processes",
    "Equipment",
    "Bacteria",
    "Viruses",
    "Parasites",
    "Anatomy",
    "People",
    "Animals",
    "Arthropods",
    "Plants",
    "Food",
    "Symbols & diagrams",
    "Other"
  ]);

  const search = page.getByPlaceholder("Search cells, proteins, equipment…");
  await page.getByRole("button", { name: "Cells", exact: true }).click();
  await search.fill("Activated Neutrophil");
  await expect(
    page.locator(".asset-card").filter({ hasText: "Activated Neutrophil" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Viruses", exact: true }).click();
  await search.fill("Bunyavirus");
  await expect(page.locator(".asset-card").filter({ hasText: "Bunyavirus" })).toBeVisible();

  await page.getByRole("button", { name: "Proteins", exact: true }).click();
  await search.fill("CD80");
  await expect(page.locator(".asset-card").filter({ hasText: "CD80" })).toBeVisible();

  await page.getByRole("button", { name: "Animals", exact: true }).click();
  await search.fill("Tree Dwelling Crab Eating Macaque");
  await expect(
    page.locator(".asset-card").filter({ hasText: "Tree Dwelling Crab Eating Macaque" })
  ).toBeVisible();
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
  const dendriticCenter = await artboardPoint(page);
  await page.mouse.click(dendriticCenter.x, dendriticCenter.y, { button: "right" });
  const dendriticMenu = page.getByRole("menu", { name: "Dendritic Cell actions" });
  await expect(dendriticMenu.getByRole("menuitem", { name: "Ungroup" })).toBeVisible();
  await page.keyboard.press("Escape");

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

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("dendritic");
  const repeatedInsert = page
    .locator(".asset-card")
    .filter({ hasText: "Dendritic Cell" })
    .first()
    .locator(".asset-card-image");
  await repeatedInsert.evaluate((button: HTMLButtonElement) => {
    for (let index = 0; index < 20; index += 1) button.click();
  });
  await expect(page.locator(".layers-title small")).toHaveText("21", { timeout: 30_000 });

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("21");
  await expect.poll(async () => (await visibleCellColors()).peach).toBeGreaterThan(100);
});

test("restores an asset's semantic identity when its exact parts are regrouped", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("T Cell");
  await page.getByRole("button", { name: "Insert T Cell", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("T Cell");

  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(page.getByRole("button", { name: "Group", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Group", exact: true }).click();

  await expect(page.locator(".inspector-header h2")).toHaveText("T Cell");
  await expect(page.getByText("Edit individual parts", { exact: true })).toHaveCount(0);
  await ensureLayersOpen(page);
  await expect(page.locator(".layer-list > button").filter({ hasText: "T Cell" })).toHaveCount(1);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-embedded")).toHaveCount(0);
  await ensureLayersOpen(page);
  await page.locator(".layer-list > button").filter({ hasText: "T Cell" }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("T Cell");
});

test("shows no synthetic style or variant menu for a single-variant biological asset", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await page.getByRole("button", { name: "Insert Cajal-Retzius Cell", exact: true }).click();

  await expect(page.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Variant", exact: true })).toHaveCount(0);
  await expect(page.getByText("Asset colors", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Color presets", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Shape", exact: true })).toHaveCount(0);
  await expect(
    page.locator("label.inspector-value-range").filter({ hasText: "Transparency" })
  ).toBeVisible();
});

test("saves and resets styling for future copies of the same biological asset", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  const insertAsset = page.getByRole("button", {
    name: "Insert Cajal-Retzius Cell",
    exact: true
  });
  const assetCard = page.locator(".asset-card").filter({ hasText: "Cajal-Retzius Cell" }).first();
  const assetPreview = assetCard.locator(".asset-card-image");
  const assetPreviewImage = assetPreview.locator("img");
  const originalPreviewSource = await assetPreviewImage.getAttribute("src");
  const originalPreviewBounds = await assetPreview.boundingBox();
  await insertAsset.click();

  const transparency = page
    .locator("label.inspector-value-range")
    .filter({ hasText: "Transparency" })
    .locator('input[type="number"]');
  await transparency.fill("40");
  await transparency.blur();
  await expect(transparency).toHaveValue("40");
  const width = page.locator(".field-row.dimensions input").first();
  const originalWidth = Number(await width.inputValue());
  const savedWidth = Math.round(originalWidth * 0.6);
  await width.fill(String(savedWidth));
  await width.blur();
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(savedWidth, 0);
  const center = await artboardPoint(page);
  await page.mouse.click(center.x, center.y, { button: "right" });
  await page
    .getByRole("menu", { name: "Cajal-Retzius Cell actions" })
    .getByRole("menuitem", { name: "Save styling" })
    .click();

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await expect.poll(() => assetPreviewImage.getAttribute("src")).toMatch(/^data:image\/png/);
  expect(await assetPreviewImage.getAttribute("src")).not.toBe(originalPreviewSource);
  await expect
    .poll(() =>
      assetPreviewImage.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
      )
    )
    .toBe(true);
  const savedPreviewBounds = await assetPreview.boundingBox();
  expect(
    Math.abs((savedPreviewBounds?.width ?? 0) - (originalPreviewBounds?.width ?? 0))
  ).toBeLessThan(1.1);
  expect(
    Math.abs((savedPreviewBounds?.height ?? 0) - (originalPreviewBounds?.height ?? 0))
  ).toBeLessThan(1.1);

  await insertAsset.click();
  await expect(transparency).toHaveValue("40");
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(savedWidth, 0);

  await page.mouse.click(center.x, center.y, { button: "right" });
  await page
    .getByRole("menu", { name: "Cajal-Retzius Cell actions" })
    .getByRole("menuitem", { name: "Reset styling" })
    .click();
  await expect(transparency).toHaveValue("0");
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(originalWidth, 0);
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await expect(assetPreviewImage).toHaveAttribute("src", originalPreviewSource ?? "");

  await insertAsset.click();
  await expect(transparency).toHaveValue("0");
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(originalWidth, 0);
});

test("renders every styled eosinophil part in a stable sidebar preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Eosinophil");
  const eosinophilCard = page.locator(".asset-card").filter({ hasText: "Eosinophil" }).first();
  const previewImage = eosinophilCard.locator("img");
  await eosinophilCard.locator(".asset-card-image").click();
  const variantPicker = page
    .locator(".inspector-embedded")
    .getByRole("combobox", { name: "Eosinophil variant" });
  await expect(variantPicker).toBeVisible();
  await expect(page.getByText("Color presets", { exact: true })).toHaveCount(0);
  await variantPicker.click();
  await page
    .getByRole("listbox", { name: "Eosinophil variants" })
    .getByRole("option", { name: "Select Eosinophil variant 2" })
    .click();

  const center = await artboardPoint(page);
  await page.mouse.click(center.x, center.y, { button: "right" });
  await page
    .getByRole("menu", { name: "Eosinophil actions" })
    .getByRole("menuitem", { name: "Save styling" })
    .click();
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Eosinophil");
  await expect.poll(() => previewImage.getAttribute("src")).toMatch(/^data:image\/png/);
  await expect
    .poll(() =>
      previewImage.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth === 448
      )
    )
    .toBe(true);

  const previewStats = await previewImage.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = new Set<string>();
    let occupied = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 64) continue;
      occupied += 1;
      buckets.add(`${pixels[index] >> 5}:${pixels[index + 1] >> 5}:${pixels[index + 2] >> 5}`);
    }
    return { occupied, buckets: buckets.size };
  });
  expect(previewStats.occupied).toBeGreaterThan(10_000);
  expect(previewStats.buckets).toBeGreaterThan(8);

  const styledSource = await previewImage.getAttribute("src");
  await page.evaluate(() => {
    const state = { sources: [] as string[], timer: 0 };
    state.timer = window.setInterval(() => {
      const image = document.querySelector<HTMLImageElement>(".asset-card img");
      if (image?.src) state.sources.push(image.src);
    }, 5);
    (window as unknown as { previewSampler: typeof state }).previewSampler = state;
  });
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 100, center.y + 45, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const sampledSources = await page.evaluate(() => {
    const state = (
      window as unknown as {
        previewSampler: { sources: string[]; timer: number };
      }
    ).previewSampler;
    window.clearInterval(state.timer);
    return [...new Set(state.sources)];
  });
  expect(sampledSources).toEqual([styledSource]);
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
  await ensureLayersOpen(page);
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
  await expect(page.getByText("Edit individual parts", { exact: true })).toHaveCount(0);
  await expect(page.locator(".inspector-header h2")).toHaveText("Dendritic Cell");
  await expect(page.locator(".inspector-header .eyebrow")).toHaveCount(0);

  const canvas = page.locator(".upper-canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.dblclick({
    position: { x: bounds!.width / 2, y: bounds!.height / 2 }
  });

  await expect(page.getByText("Inside Dendritic Cell", { exact: true })).toBeVisible();
  const editTools = page.getByLabel("edit tools");
  await expect(editTools.getByRole("button", { name: "Transform", exact: true })).toBeVisible();
  await expect(editTools.getByRole("button", { name: "Shape", exact: true })).toBeVisible();
  const fill = page
    .locator("label.color-field")
    .filter({ hasText: "Fill" })
    .locator('input[type="color"]');
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
  for (let index = 0; index < 100; index += 1) {
    await placeTool(page, "Rectangle", 0.25 + (index % 10) * 0.05, 0.25 + (index % 8) * 0.06);
  }
  await expect(page.locator(".layers-title small")).toHaveText("100");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("100");
});
