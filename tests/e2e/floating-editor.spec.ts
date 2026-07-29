import { expect, test } from "@playwright/test";

test("uses floating BioRender-style tools, flyouts, and left-side properties", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  await expect(page.locator(".floating-tool-rail")).toBeVisible();
  await expect(page.locator(".floating-panel")).toBeVisible();
  await expect(page.locator(".right-sidebar")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);

  const assets = page.getByRole("tab", { name: "Assets", exact: true });
  await assets.click();
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  await assets.click();
  await expect(page.locator(".floating-panel")).toBeVisible();
  await page.mouse.click(900, 500);
  await expect(page.locator(".floating-panel")).toHaveCount(0);

  const lines = page.getByRole("button", { name: "Lines", exact: true });
  await lines.hover();
  await expect(page.getByRole("menu", { name: "Line and arrow tools" })).toHaveCount(0);
  await lines.click();
  const lineMenu = page.getByRole("menu", { name: "Line and arrow tools" });
  await expect(lineMenu).toBeVisible();
  await page.mouse.move(900, 500);
  await expect(lineMenu).toBeVisible();
  await expect(lineMenu.locator(".tool-flyout-secondary")).toHaveCount(0);
  await page.mouse.click(900, 500);
  await expect(lineMenu).toHaveCount(0);
  await lines.click();
  await expect(lineMenu).toBeVisible();
  await lines.click();
  await expect(lineMenu).toHaveCount(0);
  await lines.click();
  await expect(lineMenu).toBeVisible();
  await expect(lineMenu.getByRole("menuitem", { name: "Custom defaults" })).toHaveCount(0);
  await lineMenu.getByRole("menuitem", { name: /^Lines/ }).hover();
  const lineGlyphs = await lineMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.outerHTML));
  await expect(lineMenu.locator(".connector-family-lines button")).toHaveCount(21);
  const linePanelHeights = await lineMenu.evaluate((menu) => ({
    categories: menu.querySelector(".tool-flyout-primary")?.getBoundingClientRect().height ?? 0,
    subtypes: menu.querySelector(".tool-flyout-secondary")?.getBoundingClientRect().height ?? 0
  }));
  expect(linePanelHeights.categories).toBeLessThan(linePanelHeights.subtypes);
  await lineMenu.getByRole("menuitem", { name: /Arrows/ }).hover();
  await expect(
    lineMenu.getByRole("menuitem", { name: "Shallow curved arrow", exact: true })
  ).toBeVisible();
  await expect(lineMenu.getByRole("menuitem", { name: "Dashed arrow", exact: true })).toBeVisible();
  await expect(lineMenu.locator(".connector-family-arrows button")).toHaveCount(28);
  const fittedArrowIcons = await lineMenu
    .locator(".connector-family-arrows button svg")
    .evaluateAll((icons) =>
      icons.map((icon) => {
        const svg = icon as SVGSVGElement;
        const graphic = svg.querySelector("g") as SVGGElement;
        const bounds = graphic.getBBox();
        const viewBox = svg.viewBox.baseVal;
        return {
          centeredX: Math.abs(bounds.x + bounds.width / 2 - (viewBox.x + viewBox.width / 2)),
          centeredY: Math.abs(bounds.y + bounds.height / 2 - (viewBox.y + viewBox.height / 2)),
          contained:
            bounds.x >= viewBox.x - 0.01 &&
            bounds.y >= viewBox.y - 0.01 &&
            bounds.x + bounds.width <= viewBox.x + viewBox.width + 0.01 &&
            bounds.y + bounds.height <= viewBox.y + viewBox.height + 0.01
        };
      })
    );
  expect(fittedArrowIcons.every(({ contained }) => contained)).toBe(true);
  expect(
    fittedArrowIcons.every(({ centeredX, centeredY }) => centeredX < 0.01 && centeredY < 0.01)
  ).toBe(true);
  const arrowGlyphs = await lineMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.outerHTML));
  const arrowGeometry = await lineMenu
    .locator(".tool-flyout-secondary button")
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        paths: button.querySelectorAll("svg path").length,
        transformedHeads: button.querySelectorAll('svg path[transform*="rotate"]').length
      }))
    );
  expect(arrowGeometry.every(({ paths }) => paths >= 2)).toBe(true);
  expect(arrowGeometry.every(({ transformedHeads }) => transformedHeads >= 1)).toBe(true);
  expect(
    arrowGeometry.filter(({ transformedHeads }) => transformedHeads > 1).length
  ).toBeGreaterThan(1);
  const arrowCenterlineCaps = await lineMenu
    .locator(".connector-family-arrows button svg > g > path:first-child")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke-linecap")));
  expect(arrowCenterlineCaps.every((lineCap) => lineCap === "butt")).toBe(true);
  await expect(lineMenu.locator(".tool-flyout-secondary button svg circle")).toHaveCount(0);
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
  const circularCenters = await lineMenu
    .locator(".connector-family-circular button svg")
    .evaluateAll((icons) =>
      icons.map((icon) => {
        const svg = icon as SVGSVGElement;
        const bounds = (svg.querySelector("g") as SVGGElement).getBBox();
        const viewBox = svg.viewBox.baseVal;
        return {
          x: Math.abs(bounds.x + bounds.width / 2 - (viewBox.x + viewBox.width / 2)),
          y: Math.abs(bounds.y + bounds.height / 2 - (viewBox.y + viewBox.height / 2))
        };
      })
    );
  expect(circularCenters.every(({ x, y }) => x < 0.01 && y < 0.01)).toBe(true);
  await lineMenu.getByRole("menuitem", { name: /Brackets/ }).hover();
  await expect(lineMenu.getByRole("menuitem", { name: "Curly brace", exact: true })).toBeVisible();
  expect(new Set([...lineGlyphs, ...arrowGlyphs]).size).toBe(
    lineGlyphs.length + arrowGlyphs.length
  );

  await page.getByRole("tab", { name: "Shapes", exact: true }).hover();
  await expect(page.getByRole("menu", { name: "Shape tools" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const shapeMenu = page.getByRole("menu", { name: "Shape tools" });
  await expect(shapeMenu).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem")).toHaveCount(2);
  await page.mouse.move(900, 500);
  await expect(shapeMenu).toBeVisible();
  await expect(shapeMenu.locator(".tool-flyout-secondary")).toHaveCount(0);
  const shapeFamilySpacing = await shapeMenu
    .locator(".tool-flyout-primary button")
    .first()
    .evaluate((button) => {
      const icon = button.querySelector("svg")?.getBoundingClientRect();
      const text = Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (!icon || !text) return 0;
      const range = document.createRange();
      range.selectNodeContents(text);
      return range.getBoundingClientRect().left - icon.right;
    });
  expect(shapeFamilySpacing).toBeGreaterThanOrEqual(8);
  await shapeMenu.getByRole("menuitem", { name: /Shapes/ }).hover();
  const basicGlyphs = await shapeMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.outerHTML));
  await shapeMenu.getByRole("menuitem", { name: /Polygons/ }).hover();
  const polygonGlyphs = await shapeMenu
    .locator(".tool-flyout-secondary button svg")
    .evaluateAll((icons) => icons.map((icon) => icon.outerHTML));
  expect(new Set([...basicGlyphs, ...polygonGlyphs]).size).toBe(
    basicGlyphs.length + polygonGlyphs.length
  );
  await shapeMenu.getByRole("menuitem", { name: /Shapes/ }).hover();
  await expect(page.locator(".sidebar-content-shapes")).toHaveCount(0);
  await shapeMenu.getByRole("menuitem", { name: "Rectangle", exact: true }).click();
  await expect(page.locator(".canvas-workspace")).toHaveClass(/is-creating/);

  const artboard = await page.locator(".artboard-stage").boundingBox();
  if (!artboard) throw new Error("Artboard is not visible.");
  await page.mouse.click(artboard.x + artboard.width / 2, artboard.y + artboard.height / 2);

  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /automatic edit panel/i })).toHaveCount(0);
  await expect(page.locator(".inspector-embedded")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "Canvas color" })).toHaveCount(0);
  await page.getByRole("button", { name: "Canvas size" }).click();
  const canvasSettings = page.getByRole("dialog", { name: "Canvas settings" });
  await expect(canvasSettings.getByRole("combobox", { name: "Preset" })).toBeVisible();
  await expect(canvasSettings.getByRole("combobox", { name: "Unit" })).toBeVisible();
  const canvasBackground = canvasSettings.getByRole("button", {
    name: "Canvas background",
    exact: true
  });
  await expect(canvasBackground).toBeVisible();
  await expect(canvasSettings.getByText("Transparent background", { exact: true })).toBeVisible();
  await expect(canvasSettings.getByText("Double-click to add text", { exact: true })).toBeVisible();
  await expect(canvasSettings.locator(".canvas-color-control")).toHaveCount(1);
  await canvasBackground.click();
  const colorPalette = page.getByRole("dialog", { name: "Canvas background palette" });
  await expect(colorPalette.locator(".color-palette-swatch")).toHaveCount(70);
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await colorPalette.getByRole("button", { name: "#ff0000", exact: true }).click();
  await expect(colorPalette).toHaveCount(0);
  await canvasBackground.click();
  await expect(
    page
      .getByRole("dialog", { name: "Canvas background palette" })
      .getByRole("button", { name: "#ff0000", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Canvas size" }).click();
  await expect(page.locator(".canvas-workspace")).not.toHaveClass(/grid-visible/);
  await expect(page.getByRole("button", { name: "Show grid" })).toBeVisible();
  await page.getByRole("button", { name: "Show grid" }).click();
  await expect(page.locator(".canvas-workspace")).toHaveClass(/grid-visible/);

  await page.keyboard.press("Delete");
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.locator(".inspector-header").getByText("Canvas", { exact: true })).toHaveCount(
    0
  );
});

test("expands all creation defaults initially and restores each disclosure state", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("button", { name: "Defaults", exact: true }).click();

  const defaults = page.getByRole("dialog", { name: "New object defaults" });
  const sections = defaults.locator("details.creation-defaults");
  await expect(sections).toHaveCount(3);
  await expect(sections.nth(0)).toHaveAttribute("open", "");
  await expect(sections.nth(1)).toHaveAttribute("open", "");
  await expect(sections.nth(2)).toHaveAttribute("open", "");

  const textSize = defaults.getByRole("spinbutton", { name: "Default text size" });
  await textSize.fill("2");
  await expect(textSize).toHaveValue("2");
  await textSize.press("8");
  await expect(textSize).toHaveValue("28");
  await textSize.press("Enter");
  await expect(textSize).toHaveValue("28");

  await textSize.fill("35");
  await defaults.getByText("Weight", { exact: true }).click();
  await expect(textSize).toHaveValue("35");

  await defaults.getByText("New shape defaults", { exact: true }).click();
  await expect(sections.nth(1)).not.toHaveAttribute("open", "");
  await defaults.getByText("New line & arrow defaults", { exact: true }).click();
  await expect(sections.nth(2)).not.toHaveAttribute("open", "");

  await page.getByRole("button", { name: "Defaults", exact: true }).click();
  await expect(defaults).toHaveCount(0);
  await page.getByRole("button", { name: "Defaults", exact: true }).click();

  const restored = page
    .getByRole("dialog", { name: "New object defaults" })
    .locator("details.creation-defaults");
  await expect(restored.nth(0)).toHaveAttribute("open", "");
  await expect(restored.nth(1)).not.toHaveAttribute("open", "");
  await expect(restored.nth(2)).not.toHaveAttribute("open", "");
});

test("shows variant grids with viewport margins and invisible scrollbars", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Male Child");
  await expect(page.getByRole("combobox", { name: "Male Child variant" })).toBeVisible();
  await page.getByRole("combobox", { name: "Male Child variant" }).click();

  const menu = page.getByRole("listbox", { name: "Male Child variants" });
  await expect(menu.getByRole("option")).toHaveCount(12);
  await expect
    .poll(() => menu.evaluate((element) => element.clientHeight === element.scrollHeight))
    .toBe(true);
  const spaciousLayout = await menu.evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    viewport: window.innerHeight,
    columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
    scrollbar: getComputedStyle(element).scrollbarWidth
  }));
  expect(spaciousLayout.bottom).toBeLessThanOrEqual(spaciousLayout.viewport - 16);
  expect(spaciousLayout.columns).toBe(4);
  expect(spaciousLayout.scrollbar).toBe("none");

  await page.setViewportSize({ width: 900, height: 320 });
  await page.getByRole("combobox", { name: "Male Child variant" }).click();
  await expect(menu).toBeVisible();
  await expect
    .poll(() => menu.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await menu.evaluate((element) => {
    element.scrollTop = 80;
  });
  await expect.poll(() => menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
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
        "Parallelogram"
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
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(page.locator(".layers-title small")).toHaveText(String(inserted));
    }
  }
});

test("creates every connector path and endpoint family with valid canvas geometry", async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const tools = [
    ["Lines", "Straight line"],
    ["Lines", "Square elbow"],
    ["Lines", "Rounded elbow"],
    ["Lines", "Step line"],
    ["Lines", "Rounded step"],
    ["Lines", "Arc"],
    ["Lines", "Arch"],
    ["Lines", "Wave"],
    ["Lines", "Pulse"],
    ["Arrows", "Open arrow"],
    ["Inhibitor", "Rounded step inhibitor"],
    ["Dots", "Elbow dot endpoint"],
    ["Neurons", "Wave neuron"],
    ["Circular", "Dashed circular arrow"],
    ["Brackets", "Square bracket"],
    ["Brackets", "Square brace"],
    ["Brackets", "Round bracket"],
    ["Brackets", "Curly brace"]
  ] as const;

  const artboard = await page.locator(".artboard-stage").boundingBox();
  if (!artboard) throw new Error("Artboard is not visible.");

  for (const [index, [family, tool]] of tools.entries()) {
    await page.getByRole("button", { name: "Lines", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Line and arrow tools" });
    await menu
      .locator(".tool-flyout-primary")
      .getByRole("menuitem", { name: new RegExp(`^${family}`) })
      .hover();
    await menu
      .locator(".tool-flyout-secondary")
      .getByRole("menuitem", { name: tool, exact: true })
      .click();
    await expect(page.locator(".floating-panel")).toHaveCount(0);
    const column = index % 4;
    const row = Math.floor(index / 4);
    await page.mouse.click(
      artboard.x + artboard.width * (0.1 + column * 0.23),
      artboard.y + artboard.height * (0.1 + row * 0.19)
    );
  }

  if ((await page.locator(".floating-panel").count()) === 0) {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
  }
  await expect(page.locator(".layers-title small")).toHaveText(String(tools.length));
  expect(pageErrors).toEqual([]);
});
