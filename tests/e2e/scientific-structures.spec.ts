import { expect, test, type Page } from "@playwright/test";
import type { Canvas } from "../../apps/web/node_modules/fabric";
import { readFile } from "node:fs/promises";

type ProbeWindow = Window & { structureQaCanvas?: Canvas };
/** Observe the existing canvas only; all mutations below use real UI interactions. */
async function observeCanvas(page: Page) {
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .find((url) => /\/fabric\.js\?/.test(url));
    if (!url) throw new Error("Fabric development module was not loaded.");
    const { Canvas } = (await import(url)) as typeof import("../../apps/web/node_modules/fabric");
    const add = Canvas.prototype.add,
      select = Canvas.prototype.setActiveObject;
    Canvas.prototype.add = function (...objects) {
      (window as ProbeWindow).structureQaCanvas = this;
      return add.apply(this, objects);
    };
    Canvas.prototype.setActiveObject = function (...args) {
      (window as ProbeWindow).structureQaCanvas = this;
      return select.apply(this, args);
    };
  });
}
async function state(page: Page) {
  return page.evaluate(() => {
    const canvas = (window as ProbeWindow).structureQaCanvas;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || !object.scientificBrush)
      throw new Error("Select a scientific brush.");
    object.setCoords();
    return {
      id: object.objectId,
      spec: JSON.parse(JSON.stringify(object.scientificBrush)),
      controls: Object.fromEntries(
        Object.entries(object.oCoords).map(([key, p]) => [key, { x: p.x, y: p.y }])
      ),
      svg: object.toSVG()
    };
  });
}
async function choose(page: Page, name: string, x: number, y: number) {
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Scientific structures", exact: true }).hover();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("menu", { name: "Shape tools", exact: true })).toBeHidden();
  await page.locator(".upper-canvas").click({ position: { x, y } });
}

test("flat membrane supports extension, undo, bending, reload, SVG export and editable parts", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.getByRole("button", { name: "New figure", exact: true }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await choose(page, "Lipid bilayer", 480, 330);
  const before = await state(page);
  const box = (await page.locator(".upper-canvas").boundingBox())!;
  const p = before.controls.brushPoint1;
  await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.mouse.down();
  await page.mouse.move(box.x + p.x + 180, box.y + p.y, { steps: 18 });
  await page.mouse.up();
  const extended = await state(page);
  expect(extended.id).toBe(before.id);
  expect(extended.controls.brushPoint0.x).toBeCloseTo(before.controls.brushPoint0.x, 3);
  expect(extended.controls.brushPoint1.x).toBeGreaterThan(p.x + 170);
  expect(extended.spec.unitSize).toBe(before.spec.unitSize);
  await page.keyboard.press("ControlOrMeta+z");
  await page.locator(".upper-canvas").click({ position: { x: 480, y: 330 } });
  expect((await state(page)).spec).toEqual(before.spec);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.locator(".upper-canvas").click({ position: { x: 480, y: 330 } });
  expect((await state(page)).spec).toEqual(extended.spec);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Add bend point", exact: true }).click();
  const middle = (await state(page)).controls.brushPoint1;
  await page.mouse.move(box.x + middle.x, box.y + middle.y);
  await page.mouse.down();
  await page.mouse.move(box.x + middle.x, box.y + middle.y - 90, { steps: 16 });
  await page.mouse.up();
  await page.getByLabel("Smooth path", { exact: true }).check();
  await page.getByLabel("Structure fill color").fill("#83b9ad");
  const saved = await state(page);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: testInfo.outputPath("bent-membrane.png"), fullPage: true });
  await page.reload();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page
    .locator(".upper-canvas")
    .click({ position: { x: saved.controls.brushPoint1.x, y: saved.controls.brushPoint1.y } });
  expect((await state(page)).spec).toEqual(saved.spec);
  expect((await state(page)).id).toBe(saved.id);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const download = await downloadPromise;
  const svg = await readFile((await download.path())!, "utf8");
  expect(svg).toMatch(/<circle|<path/);
  expect(svg).not.toMatch(/<image|NaN|Infinity/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Convert to editable parts", exact: true }).click();
  await expect(page.getByLabel("Structure unit size")).toHaveCount(0);
  const released = await page.evaluate(() => {
    const object = (window as ProbeWindow).structureQaCanvas?.getActiveObject();
    return { type: object?.OpenSketchType, brush: object?.scientificBrush };
  });
  expect(released).toEqual({ type: "group", brush: undefined });
  expect(errors).toEqual([]);
});

test("generated artwork is searchable, inserts as editable vectors and reloads", async ({
  page
}, testInfo) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New figure", exact: true }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page.getByRole("button", { name: "Toggle asset filters" }).click();
  await page.getByRole("combobox", { name: "Filter by source" }).click();
  await page.getByRole("option", { name: "OpenSketch generated", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("nucleolus");
  await page.getByRole("button", { name: "Insert nucleolus", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as ProbeWindow).structureQaCanvas?.getActiveObject()?.assetId)
    )
    .toBe("opensketch-generated-nucleolus");
  const inserted = await page.evaluate(() => {
    const o = (window as ProbeWindow).structureQaCanvas!.getActiveObject()!;
    return { id: o.objectId, svg: o.toSVG() };
  });
  expect(inserted.svg).toContain("<path");
  expect(inserted.svg).not.toMatch(/<image|NaN|Infinity/);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: testInfo.outputPath("generated-artwork.png"), fullPage: true });
  await page.reload();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page.locator(".upper-canvas").click({ position: { x: 480, y: 330 } });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+a");
  expect(
    await page.evaluate(
      (id) =>
        (window as ProbeWindow).structureQaCanvas?.getObjects().some((o) => o.objectId === id),
      inserted.id
    )
  ).toBe(true);
  // Reopen the library and verify a deliberate alias resolves to the canonical card.
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("regulatory T cell");
  await expect(
    page.getByRole("button", { name: "Insert T lymphocyte", exact: true })
  ).toBeVisible();
});

test("sidebar identifies editable structures and hides legacy sources", async ({
  page
}, testInfo) => {
  await page.goto("./");
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText(/NIH BioArt|SciDraw|BioIcons|Arcadia/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New figure", exact: true }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page.getByRole("button", { name: "Toggle asset filters" }).click();
  await page.getByRole("combobox", { name: "Filter by source" }).click();
  await expect(page.getByRole("listbox")).not.toContainText(/NIH BioArt|SciDraw|BioIcons|Arcadia/);
  await page.getByRole("option", { name: "OpenSketch structures", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Lipid bilayer");
  const card = page
    .locator(".asset-card")
    .filter({ has: page.getByRole("button", { name: "Insert Lipid bilayer", exact: true }) });
  await expect(card.getByText("Editable", { exact: true })).toBeVisible();
  await expect(card).toHaveCSS("border-top-color", "rgb(40, 133, 120)");
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await page.waitForTimeout(400); // Let the sidebar transition settle for visual evidence.
  await page.screenshot({ path: testInfo.outputPath("editable-sidebar.png"), fullPage: true });
  await card.getByRole("button", { name: "Insert Lipid bilayer", exact: true }).click();
  await expect.poll(async () => (await state(page)).spec.kind).toBe("membrane");
  const current = await state(page);
  expect(current.controls.brushPoint0).toBeDefined();
  expect(current.controls.brushPoint1).toBeDefined();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Structure spacing")).toBeVisible();
  await page.waitForTimeout(400); // Capture the settled inspector.
  await page.screenshot({ path: testInfo.outputPath("editable-inserted.png"), fullPage: true });
});

test("round membrane expands to a full circle and fixed circles remain separate choices", async ({
  page
}, testInfo) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New figure", exact: true }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await choose(page, "Curved membrane", 480, 330);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Membrane arc angle")).toHaveValue("180");
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath("round-arc.png"), fullPage: true });
  await page.getByLabel("Membrane arc angle").fill("270");
  expect((await state(page)).spec.arcSweep).toBe(270);
  await page.getByRole("button", { name: "Make full circle", exact: true }).click();
  const full = await state(page);
  expect(full.spec.arcSweep).toBe(360);
  expect(full.spec.closed).toBe(true);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath("full-circle.png"), fullPage: true });
  await page.reload();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page.locator(".upper-canvas").click({ position: full.controls.brushPoint1 });
  expect((await state(page)).spec).toEqual(full.spec);
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page
    .getByPlaceholder("Search cells, proteins, equipment…")
    .fill("Circular membrane (fixed)");
  const card = page.locator(".asset-card").filter({
    has: page.getByRole("button", { name: "Insert Circular membrane (fixed)", exact: true })
  });
  await expect(card).toBeVisible();
  await expect(card.getByText("Editable", { exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "Insert Circular membrane (fixed)", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as ProbeWindow).structureQaCanvas?.getActiveObject()?.assetId)
    )
    .toBe("fixed-circular-bilayer");
  expect(
    await page.evaluate(
      () => (window as ProbeWindow).structureQaCanvas?.getActiveObject()?.scientificBrush
    )
  ).toBeUndefined();
});

test("curvature slider bends and straightens a membrane and vessel, with undo and reload", async ({
  page
}, testInfo) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New figure", exact: true }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await choose(page, "Lipid bilayer", 480, 330);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const before = await state(page);
  await page.getByRole("slider", { name: "Structure curvature", exact: true }).focus();
  for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowRight");
  const bent = await state(page);
  expect(bent.spec.arcSweep).toBe(90);
  expect(bent.id).toBe(before.id);
  expect(bent.spec.unitSize).toBe(before.spec.unitSize);
  // Property edits within 600 ms intentionally share one undo entry.
  await page.waitForTimeout(700);
  await page.screenshot({ path: testInfo.outputPath("curvature.png"), fullPage: true });
  await page.getByRole("button", { name: "Straighten", exact: true }).click();
  expect((await state(page)).spec.arcSweep).toBeUndefined();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator(".upper-canvas").click({ position: bent.controls.brushPoint1 });
  expect((await state(page)).spec.arcSweep).toBe(90);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page.locator(".upper-canvas").click({ position: bent.controls.brushPoint1 });
  expect((await state(page)).spec.arcSweep).toBe(90);
  await choose(page, "Vessel segment", 680, 450);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Straighten", exact: true }).click();
  await page.getByRole("slider", { name: "Structure curvature", exact: true }).focus();
  for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowLeft");
  expect((await state(page)).spec.arcSweep).toBe(-90);
});

test("organized asset palettes preserve details, restore originals and survive reload", async ({
  page
}, testInfo) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New figure", exact: true }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("generic epithelial cell");
  await page.getByRole("button", { name: "Insert generic epithelial cell", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as ProbeWindow).structureQaCanvas?.getActiveObject()?.assetId)
    )
    .toBe("opensketch-generated-generic-epithelial-cell");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const paints = () =>
    page.evaluate(() => {
      const o = (window as ProbeWindow).structureQaCanvas!.getActiveObject()!;
      const walk = (p: typeof o): string[] =>
        "getObjects" in p
          ? (p as import("../../apps/web/node_modules/fabric").Group).getObjects().flatMap(walk)
          : [String(p.fill), String(p.stroke)];
      return walk(o);
    });
  const original = await paints();
  await expect(page.locator(".asset-palette-row button")).toHaveCount(48);
  await page.screenshot({ path: testInfo.outputPath("original.png") });
  await page.getByRole("button", { name: "Red classic", exact: true }).click();
  await expect(page.getByRole("button", { name: "Red classic", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  const red = await paints();
  expect(red.some((p, i) => p !== original[i])).toBe(true);
  // The purple nucleus is large enough to theme; tiny regions sharing its paint remain.
  expect(red.some((p, i) => original[i] === "#a263d2" && p !== original[i])).toBe(true);
  expect(red.some((p, i) => original[i] === "#a263d2" && p === original[i])).toBe(true);
  expect(red.some((p, i) => p === original[i] && p !== "null")).toBe(true);
  await page.waitForTimeout(700);
  await page.screenshot({ path: testInfo.outputPath("red.png") });
  await page.getByRole("button", { name: "Blue soft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Blue soft", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(await paints()).not.toEqual(red);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator(".upper-canvas").click({ position: { x: 480, y: 330 } });
  await page.keyboard.press("ControlOrMeta+a");
  await expect.poll(paints).toEqual(red);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Original colors", exact: true }).click();
  expect(await paints()).toEqual(original);
  await page.getByRole("button", { name: "Red classic", exact: true }).click();
  await expect.poll(paints).toEqual(red);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page.locator(".upper-canvas").click({ position: { x: 480, y: 330 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Red classic", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(await paints()).toEqual(red);
  await page.getByRole("button", { name: "Original colors", exact: true }).click();
  expect(await paints()).toEqual(original);
});

test("membrane palette survives bending and restores original semantic colors", async ({
  page
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New figure", exact: true }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await choose(page, "Lipid bilayer", 480, 330);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const before = await state(page);
  await page.getByRole("button", { name: "Blue deep", exact: true }).click();
  await expect(page.getByRole("button", { name: "Blue deep", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  const themed = await state(page);
  expect(themed.spec.fill).not.toBe(before.spec.fill);
  expect(themed.spec.accent).not.toBe(before.spec.accent);
  await page.getByRole("slider", { name: "Structure curvature", exact: true }).focus();
  for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowRight");
  expect((await state(page)).spec.fill).toBe(themed.spec.fill);
  const bent = await state(page);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await observeCanvas(page);
  await page.locator(".upper-canvas").click({ position: bent.controls.brushPoint1 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Blue deep", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: "Original colors", exact: true }).click();
  const restored = await state(page);
  expect(restored.spec.fill).toBe(before.spec.fill);
  expect(restored.spec.arcSweep).toBe(90);
});
