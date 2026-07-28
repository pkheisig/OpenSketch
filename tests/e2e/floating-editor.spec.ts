import { expect, test } from "@playwright/test";

test("uses floating BioRender-style tools, flyouts, and left-side properties", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  await expect(page.locator(".floating-tool-rail")).toBeVisible();
  await expect(page.locator(".floating-panel")).toBeVisible();
  await expect(page.locator(".right-sidebar")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(3);

  const lines = page.getByRole("button", { name: "Lines", exact: true });
  await lines.hover();
  const lineMenu = page.getByRole("menu", { name: "Line and arrow tools" });
  await expect(lineMenu).toBeVisible();
  await expect(lineMenu.getByRole("menuitem", { name: "Custom defaults" })).toHaveCount(0);
  await lineMenu.getByRole("menuitem", { name: /^Lines/ }).hover();
  const lineGlyphs = await lineMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
  await lineMenu.getByRole("menuitem", { name: /Arrows/ }).hover();
  await expect(lineMenu.getByRole("menuitem", { name: "Curved arrow" })).toBeVisible();
  await expect(lineMenu.getByRole("menuitem", { name: "Dashed arrow" })).toBeVisible();
  const arrowGlyphs = await lineMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
  const arrowGeometry = await lineMenu
    .locator(".tool-flyout-secondary button svg > path")
    .evaluateAll((paths) =>
      paths.map((path) => ({
        start: path.getAttribute("marker-start"),
        end: path.getAttribute("marker-end")
      }))
    );
  expect(arrowGeometry.every(({ end }) => end?.startsWith("url(#"))).toBe(true);
  expect(arrowGeometry.filter(({ start }) => start?.startsWith("url(#")).length).toBeGreaterThan(1);
  await expect(lineMenu.locator(".tool-flyout-secondary button svg > circle")).toHaveCount(0);
  await lineMenu.getByRole("menuitem", { name: /Inhibitor/ }).hover();
  await expect(
    lineMenu.getByRole("menuitem", { name: "Inhibitor", exact: true }).last()
  ).toBeVisible();
  await expect(
    lineMenu.getByRole("menuitem", { name: "Curved inhibitor", exact: true })
  ).toBeVisible();
  await expect(
    lineMenu.getByRole("menuitem", { name: "Dashed step inhibitor", exact: true })
  ).toBeVisible();
  await lineMenu.getByRole("menuitem", { name: /Neurons/ }).hover();
  await expect(
    lineMenu.getByRole("menuitem", { name: "Neuron connector", exact: true })
  ).toBeVisible();
  await lineMenu.getByRole("menuitem", { name: /Circular/ }).hover();
  await expect(
    lineMenu.getByRole("menuitem", { name: "Circular arrow", exact: true })
  ).toBeVisible();
  await lineMenu.getByRole("menuitem", { name: /Brackets/ }).hover();
  await expect(lineMenu.getByRole("menuitem", { name: "Curly brace", exact: true })).toBeVisible();
  expect(new Set([...lineGlyphs, ...arrowGlyphs]).size).toBe(
    lineGlyphs.length + arrowGlyphs.length
  );

  await page.getByRole("tab", { name: "Shapes", exact: true }).hover();
  const shapeMenu = page.getByRole("menu", { name: "Shape tools" });
  await expect(shapeMenu).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem")).toHaveCount(9);
  const basicGlyphs = await shapeMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
  await shapeMenu.getByRole("menuitem", { name: /Polygons/ }).hover();
  const polygonGlyphs = await shapeMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
  expect(new Set([...basicGlyphs, ...polygonGlyphs]).size).toBe(
    basicGlyphs.length + polygonGlyphs.length
  );
  await shapeMenu.getByRole("menuitem", { name: /Shapes/ }).hover();
  await expect(page.locator(".sidebar-content-shapes")).toHaveCount(0);
  await shapeMenu.getByRole("menuitem", { name: "Rectangle", exact: true }).click();

  const artboard = await page.locator(".artboard-stage").boundingBox();
  if (!artboard) throw new Error("Artboard is not visible.");
  await page.mouse.click(artboard.x + artboard.width / 2, artboard.y + artboard.height / 2);

  await expect(page.locator(".inspector-embedded")).toBeVisible();
  await expect(page.locator(".selection-quick-toolbar")).toBeVisible();
  const selectionToolbar = page.getByRole("toolbar", { name: "Selection actions" });
  await expect(selectionToolbar).toContainText("Align");
  await expect(selectionToolbar).toContainText("Arrange");
  await expect(selectionToolbar).toContainText("Flip");
  await expect(selectionToolbar).toContainText("Transform");
  await expect(selectionToolbar).toContainText("Lock");
  await expect(page.locator(".layers-title")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Object actions" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await selectionToolbar.getByRole("button", { name: "More selection actions" }).click();
  await expect(page.locator(".selection-toolbar-menu.more")).toContainText("Duplicate");
  await expect(page.locator(".selection-toolbar-menu.more")).toContainText("Cmd/Ctrl C");
  await expect(page.getByRole("button", { name: "Style", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(page.getByRole("button", { name: "Shape" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await page.getByRole("button", { name: "Close properties" }).click();
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  await expect(selectionToolbar).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-embedded")).toBeVisible();
  await expect(page.locator(".workspace-controls")).toBeVisible();
  await expect(page.locator(".top-toolbar").getByRole("button", { name: "Zoom in" })).toHaveCount(
    0
  );
  await expect(page.getByRole("button", { name: "Canvas size" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Canvas color" })).toBeVisible();
  await expect(page.locator(".canvas-workspace")).not.toHaveClass(/grid-visible/);
  await expect(page.getByRole("button", { name: "Show grid" })).toBeVisible();
  await page.getByRole("button", { name: "Show grid" }).click();
  await expect(page.locator(".canvas-workspace")).toHaveClass(/grid-visible/);
});

test("creates every distinct shape variant exposed by the shape pop-out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  const families = [
    {
      menu: /Shapes/,
      tools: ["Rectangle", "Rounded rectangle", "Pill", "Circle", "Ellipse", "Donut"]
    },
    {
      menu: /Polygons/,
      tools: [
        "Triangle",
        "Right triangle",
        "Pentagon",
        "Hexagon",
        "Octagon",
        "Diamond",
        "Trapezoid",
        "Parallelogram",
        "Star"
      ]
    }
  ];

  let inserted = 0;
  for (const family of families) {
    for (const tool of family.tools) {
      await page.getByRole("tab", { name: "Shapes", exact: true }).click();
      const menu = page.getByRole("menu", { name: "Shape tools" });
      await menu.getByRole("menuitem", { name: family.menu }).hover();
      await menu.getByRole("menuitem", { name: tool, exact: true }).click();
      await expect(page.locator(".floating-panel")).toHaveCount(0);
      const artboard = await page.locator(".artboard-stage").boundingBox();
      if (!artboard) throw new Error("Artboard is not visible.");
      const column = inserted % 5;
      const row = Math.floor(inserted / 5);
      await page.mouse.click(
        artboard.x + artboard.width * (0.18 + column * 0.16),
        artboard.y + artboard.height * (0.25 + row * 0.23)
      );
      inserted += 1;
      await expect(page.locator(".layers-title small")).toHaveText(String(inserted));
    }
  }
});
