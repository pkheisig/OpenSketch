import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

function decodeXml(value: string): string {
  return value.replace(/&(quot|apos|lt|gt|amp);/g, (_, entity: string) => {
    const values: Record<string, string> = {
      quot: '"',
      apos: "'",
      lt: "<",
      gt: ">",
      amp: "&"
    };
    return values[entity];
  });
}

function svgExportMetadata(svg: string): { provenance: { version: number; assets: unknown[] } } {
  const encoded = svg.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
  if (!encoded) throw new Error("The SVG export has no metadata element.");
  return JSON.parse(decodeXml(encoded)) as {
    provenance: { version: number; assets: unknown[] };
  };
}

function pngProvenance(bytes: Buffer): unknown {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error("The PNG export contains a truncated chunk.");
    if (type === "iTXt") {
      const keywordEnd = bytes.indexOf(0, dataStart);
      const keyword = bytes.toString("utf8", dataStart, keywordEnd);
      if (keyword === "OpenSketch:provenance") {
        return JSON.parse(bytes.toString("utf8", keywordEnd + 5, dataEnd));
      }
    }
    offset = dataEnd + 4;
  }
  throw new Error("The PNG export has no OpenSketch provenance metadata.");
}

async function selectUiOption(
  page: Page,
  label: string,
  option: string,
  occurrence: "first" | "last" = "first"
) {
  const matches = page.getByRole("combobox", { name: label });
  await (occurrence === "last" ? matches.last() : matches.first()).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(page.getByRole("listbox", { name: label })).toHaveCount(0);
}

async function setPaletteColor(page: Page, label: string, color: string) {
  const trigger = page.getByRole("button", { name: label, exact: true });
  if (!(await trigger.isVisible().catch(() => false))) await ensureEditorOpen(page);
  await expect(trigger).toBeVisible();
  await trigger.click({ force: true });
  const palette = page.getByRole("dialog", { name: `${label} palette` });
  await expect(palette).toBeVisible();
  await palette.getByLabel(`${label} hex value`).fill(color);
  await palette.getByLabel(`${label} hex value`).press("Enter");
  await expect(palette).toHaveCount(0);
}

async function fillStable(field: Locator, value: string) {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 750 });
  }).toPass({ timeout: 5_000 });
}

async function artboardPoint(page: Page, xRatio = 0.5, yRatio = 0.5) {
  const bounds = await page.locator(".artboard-stage").boundingBox();
  if (!bounds) throw new Error("Artboard is not visible.");
  return {
    x: bounds.x + bounds.width * xRatio,
    y: bounds.y + bounds.height * yRatio
  };
}

async function renderedArtworkCenter(page: Page) {
  let center: { x: number; y: number } | null | undefined;
  await expect
    .poll(async () => {
      try {
        center = await page.locator(".lower-canvas").evaluate((canvas: HTMLCanvasElement) => {
          const pixels = canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          let left = canvas.width;
          let top = canvas.height;
          let right = -1;
          let bottom = -1;
          let sumX = 0;
          let sumY = 0;
          let count = 0;
          for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
              const offset = (y * canvas.width + x) * 4;
              if (
                pixels[offset + 3] === 0 ||
                (pixels[offset] > 245 && pixels[offset + 1] > 245 && pixels[offset + 2] > 245)
              ) {
                continue;
              }
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
              sumX += x;
              sumY += y;
              count += 1;
            }
          }
          if (right < left || bottom < top) return null;
          const centroidX = sumX / count;
          const centroidY = sumY / count;
          let closestX = left;
          let closestY = top;
          let closestDistance = Number.POSITIVE_INFINITY;
          for (let y = top; y <= bottom; y += 1) {
            for (let x = left; x <= right; x += 1) {
              const offset = (y * canvas.width + x) * 4;
              if (
                pixels[offset + 3] === 0 ||
                (pixels[offset] > 245 && pixels[offset + 1] > 245 && pixels[offset + 2] > 245)
              ) {
                continue;
              }
              const distance = (x - centroidX) ** 2 + (y - centroidY) ** 2;
              if (distance < closestDistance) {
                closestX = x;
                closestY = y;
                closestDistance = distance;
              }
            }
          }
          const bounds = canvas.getBoundingClientRect();
          return {
            x: bounds.left + (closestX / canvas.width) * bounds.width,
            y: bounds.top + (closestY / canvas.height) * bounds.height
          };
        });
        return center !== undefined && center !== null;
      } catch {
        return false;
      }
    })
    .toBe(true);
  if (!center) throw new Error("No rendered artwork is visible.");
  return center;
}

async function ensureEditorOpen(page: Page) {
  const inspector = page.locator(
    ".sidebar-expanded:not(.motion-presence-closing) .inspector-embedded"
  );
  if (await inspector.isVisible().catch(() => false)) return;

  let editButton = page.getByRole("button", { name: "Edit", exact: true });
  if (!(await editButton.isVisible().catch(() => false))) {
    const point = await artboardPoint(page);
    await page.mouse.click(point.x, point.y);
    editButton = page.getByRole("button", { name: "Edit", exact: true });
  }
  await expect(editButton).toBeVisible();
  await editButton.click();
  await expect(inspector).toBeVisible();
}

async function ensureLayersOpen(page: Page) {
  await ensureEditorOpen(page);
  const toggle = page.locator(".sidebar-expanded:not(.motion-presence-closing) .layers-title");
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click({ force: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
}

async function expectLayerCount(page: Page, count: number) {
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText(String(count));
}

async function placeTool(page: Page, name: string | RegExp, xRatio = 0.5, yRatio = 0.5) {
  if (name === "Text") {
    await page
      .getByLabel("Editor tools")
      .getByRole("button", { name: "Text", exact: true })
      .click();
  } else if (name === "Line" || name === "Arrow") {
    const lineMenu = page.getByRole("menu", { name: "Line and arrow tools" });
    if (!(await lineMenu.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "Lines", exact: true }).click();
    }
    await lineMenu.getByRole("menuitem", { name: name === "Arrow" ? /Arrows/ : /^Lines/ }).hover();
  } else {
    const shapeMenu = page.getByRole("menu", { name: "Shape tools" });
    if (!(await shapeMenu.isVisible().catch(() => false))) {
      await page.getByRole("tab", { name: "Shapes", exact: true }).click();
    }
    const family = [
      "Triangle",
      "Right triangle",
      "Pentagon",
      "Hexagon",
      "Octagon",
      "Diamond",
      "Trapezoid",
      "Parallelogram"
    ].includes(String(name))
      ? /Polygons/
      : /Shapes/;
    await shapeMenu.getByRole("menuitem", { name: family }).hover();
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

test("@smoke never paints fallback asset sizing or uninitialized canvas geometry", async ({
  page
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const states: Array<{
      ready: string | null;
      visibility: string;
      width: number;
      height: number;
    }> = [];
    const capture = () => {
      const plane = document.querySelector<HTMLElement>(".workspace-plane");
      const stage = document.querySelector<HTMLElement>(".artboard-stage");
      if (!plane || !stage) return;
      const bounds = stage.getBoundingClientRect();
      states.push({
        ready: plane.dataset.canvasReady ?? null,
        visibility: getComputedStyle(plane).visibility,
        width: bounds.width,
        height: bounds.height
      });
    };
    const observer = new MutationObserver(capture);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true
    });
    (window as typeof window & { __canvasPaintStates?: typeof states }).__canvasPaintStates =
      states;
  });

  await page.getByRole("button", { name: "New figure" }).click();
  const plane = page.locator(".workspace-plane");
  await expect(plane).toHaveAttribute("data-canvas-ready", "true");
  await expect(plane).toBeVisible();

  const paintStates = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __canvasPaintStates?: Array<{
            ready: string | null;
            visibility: string;
            width: number;
            height: number;
          }>;
        }
      ).__canvasPaintStates ?? []
  );
  expect(
    paintStates.filter((state) => state.ready !== "true" && state.visibility === "visible")
  ).toEqual([]);

  const preview = page.locator(".asset-card-image img").first();
  const previewFrame = page.locator(".asset-card-image").first();
  await page.getByRole("button", { name: "All", exact: true }).click();
  const initialBounds = await previewFrame.boundingBox();
  expect(initialBounds).not.toBeNull();
  const initialPreviewState = await preview.evaluate((image) => ({
    ready: image.dataset.previewReady,
    visibility: getComputedStyle(image).visibility
  }));
  expect(initialPreviewState.visibility).toBe("visible");
  await expect(preview).toHaveAttribute("data-preview-ready", "true");
  await expect(preview).toHaveCSS("visibility", "visible");
  const finalBounds = await previewFrame.boundingBox();
  expect(finalBounds).not.toBeNull();
  for (const dimension of ["x", "y", "width", "height"] as const) {
    expect(finalBounds![dimension]).toBeCloseTo(initialBounds![dimension], 1);
  }
});

test("@smoke keeps the canvas mounted during drag saves and restores the active project after reload", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle");
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await page.locator(".lower-canvas").evaluate((canvas) => {
    (window as typeof window & { __initialCanvas?: Element }).__initialCanvas = canvas;
  });
  const center = await artboardPoint(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 180, center.y + 100, { steps: 60 });
  await page.mouse.up();

  await expect(page.locator(".home-shell")).toHaveCount(0);
  await expect(page.locator(".loading-screen")).toHaveCount(0);
  expect(
    await page
      .locator(".lower-canvas")
      .evaluate(
        (canvas) =>
          canvas === (window as typeof window & { __initialCanvas?: Element }).__initialCanvas
      )
  ).toBe(true);
  await expect(page.locator(".workspace-scroll")).toHaveCSS("overscroll-behavior", "none");

  const projectId = await page.evaluate(
    () => (history.state as Record<string, string> | null)?.OpenSketchProjectId
  );
  if (!projectId) throw new Error("The active project was not recorded in browser history.");
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) =>
            new Promise<number>((resolve, reject) => {
              const request = indexedDB.open("OpenSketch");
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const transaction = request.result.transaction("projects", "readonly");
                const project = transaction.objectStore("projects").get(id);
                project.onerror = () => reject(project.error);
                project.onsuccess = () => resolve(project.result?.objects?.objects?.length ?? 0);
                transaction.oncomplete = () => request.result.close();
              };
            }),
          projectId
        ),
      { timeout: 5_000 }
    )
    .toBe(1);

  await page.reload();
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await expect(page.locator(".home-shell")).toHaveCount(0);
  await expect.poll(() => renderedArtworkCenter(page)).not.toBeNull();
  expect(
    await page.evaluate(() => (history.state as Record<string, string> | null)?.OpenSketchProjectId)
  ).toBe(projectId);
});

test("clears the text tool when another sidebar section or the page is clicked", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  const textTool = page.getByRole("button", { name: "Text", exact: true });

  await textTool.click();
  await expect(textTool).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Lines", exact: true }).click();
  await expect(textTool).toHaveAttribute("aria-pressed", "false");

  await textTool.click();
  await expect(textTool).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Document title" }).click();
  await expect(textTool).toHaveAttribute("aria-pressed", "false");
});

test("debounces focused title saves and keeps blank titles loadable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  const title = page.getByLabel("Document title");

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let projectPuts = 0;
    Object.defineProperty(window, "__opensketchProjectPutCount", {
      configurable: true,
      get: () => projectPuts
    });
    IDBObjectStore.prototype.put = new Proxy(originalPut, {
      apply(target, thisArg, args) {
        if ((thisArg as IDBObjectStore).name === "projects") projectPuts += 1;
        return Reflect.apply(target, thisArg, args);
      }
    });
  });

  await title.fill("");
  await title.pressSequentially("Draft figure");
  await expect(page.locator('[data-save-state="saving"]')).toBeVisible();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __opensketchProjectPutCount?: number })
          .__opensketchProjectPutCount
    )
  ).toBe(1);

  await title.fill("   ");
  await expect(page.locator('[data-save-state="saving"]')).toBeVisible();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __opensketchProjectPutCount?: number })
          .__opensketchProjectPutCount
    )
  ).toBe(2);

  await page.reload();
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled figure");
});

test("rotates an object by dragging its rotation handle", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle");
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const center = await artboardPoint(page);
  const zoom =
    Number(
      ((await page.locator(".workspace-controls .zoom-readout").textContent()) ?? "100").replace(
        /[^0-9.]/g,
        ""
      )
    ) / 100;
  const height = Number(
    await page.getByRole("spinbutton", { name: "H", exact: true }).inputValue()
  );
  const rotationHandle = {
    x: center.x,
    y: center.y - (height * zoom) / 2 - 40
  };

  await page.mouse.move(rotationHandle.x, rotationHandle.y);
  await expect
    .poll(() => page.locator(".upper-canvas").evaluate((element) => element.style.cursor))
    .toContain("data:image/svg+xml");
  await page.mouse.down();
  await page.mouse.move(center.x + 120, center.y, { steps: 12 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Rotation")).toHaveValue("90");
});

test("resizes through the enlarged invisible control hitbox with a UI cursor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle");
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const center = await artboardPoint(page);
  const zoom =
    Number(
      ((await page.locator(".workspace-controls .zoom-readout").textContent()) ?? "100").replace(
        /[^0-9.]/g,
        ""
      )
    ) / 100;
  const widthField = page.getByRole("spinbutton", { name: "W", exact: true });
  const heightField = page.getByRole("spinbutton", { name: "H", exact: true });
  const width = Number(await widthField.inputValue());
  const height = Number(await heightField.inputValue());
  const outsideVisibleCorner = {
    x: center.x + (width * zoom) / 2 + 8,
    y: center.y + (height * zoom) / 2 + 8
  };

  await page.mouse.move(outsideVisibleCorner.x, outsideVisibleCorner.y);
  await expect
    .poll(() => page.locator(".upper-canvas").evaluate((element) => element.style.cursor))
    .toBe("nwse-resize");
  await page.mouse.down();
  await page.mouse.move(outsideVisibleCorner.x + 60, outsideVisibleCorner.y + 40, { steps: 10 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await page
          .locator(".inspector-scroll")
          .getByRole("spinbutton", { name: "W", exact: true })
          .inputValue()
      )
    )
    .toBeGreaterThan(width);
});

test("inserts editable standard top-view labware", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("24 well plate top view");

  const card = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^24 Well Plate Top View$/ }) })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Insert 24 Well Plate Top View" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  await expect(page.locator(".inspector-header h2")).toHaveText("24 Well Plate Top View");
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect
    .poll(async () =>
      Number(
        await page.locator(".inspector-scroll").getByRole("spinbutton", { name: "W" }).inputValue()
      )
    )
    .toBeCloseTo(250, 0);
});

test("previews and inserts the selected top-view plate color variant", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("24 well plate top view");

  const card = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^24 Well Plate Top View$/ }) })
    .first();
  const variantTrigger = card.getByRole("combobox", { name: "24 Well Plate Top View variant" });
  await variantTrigger.click();

  const menu = page.getByRole("listbox", { name: "24 Well Plate Top View variants" });
  await expect(menu.getByRole("option")).toHaveCount(32);
  await menu
    .getByRole("option")
    .filter({ hasText: /^Pink$/ })
    .click();
  await expect(variantTrigger).toHaveText(/Pink/);
  await expect(card.locator("img")).toHaveAttribute("src", /%23f5a3bd/i);

  await card.getByRole("button", { name: "Insert 24 Well Plate Top View" }).click();
  await expect
    .poll(() =>
      page.locator(".lower-canvas").evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let pinkPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (
            pixels[offset] > 225 &&
            pixels[offset + 1] >= 125 &&
            pixels[offset + 1] <= 190 &&
            pixels[offset + 2] >= 145 &&
            pixels[offset + 2] <= 210 &&
            pixels[offset + 3] > 200
          ) {
            pinkPixels += 1;
          }
        }
        return pinkPixels;
      })
    )
    .toBeGreaterThan(100);
});

test("drags the chosen top-view plate variant preview instead of the default plate", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("24 well plate top view");

  const card = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^24 Well Plate Top View$/ }) })
    .first();
  await card.getByRole("combobox", { name: "24 Well Plate Top View variant" }).click();

  const pinkCheckerboard = page
    .getByRole("listbox", { name: "24 Well Plate Top View variants" })
    .getByRole("option")
    .filter({ hasText: /^Pink · checkerboard$/ });
  await expect(pinkCheckerboard).toBeVisible();
  await pinkCheckerboard.dragTo(page.locator(".artboard-stage"));

  await expect
    .poll(() =>
      page.locator(".lower-canvas").evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let pinkPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (
            pixels[offset] > 225 &&
            pixels[offset + 1] >= 125 &&
            pixels[offset + 1] <= 190 &&
            pixels[offset + 2] >= 145 &&
            pixels[offset + 2] <= 210 &&
            pixels[offset + 3] > 200
          ) {
            pinkPixels += 1;
          }
        }
        return pinkPixels;
      })
    )
    .toBeGreaterThan(50);
});

test("uses the complete SVG selector bounds as its canvas hitbox", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator(".upper-canvas")).toBeVisible();
  await page.evaluate(() => {
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><circle cx="12" cy="12" r="10" fill="#183133"/><circle cx="188" cy="108" r="10" fill="#183133"/></svg>'
      ],
      "transparent-bounds.svg",
      { type: "image/svg+xml" }
    );
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: transfer });
    window.dispatchEvent(event);
  });
  await expect(page.locator(".layers-title small")).toHaveText("1");

  const center = await artboardPoint(page);
  await page.mouse.click(center.x + 220, center.y);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);

  // The SVG center contains no painted pixels, but it is inside the rectangular
  // selector bounds and must select the complete object.
  await page.mouse.click(center.x, center.y);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Clipboard SVG.svg");
});

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
  await expectLayerCount(page, 1);
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
  await expectLayerCount(page, 3);
  await expect(page.getByText("Asset palette", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Part colors", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Variant", exact: true })).toHaveCount(0);
  await expect(
    page.locator("label.inspector-value-range").filter({ hasText: "Transparency" })
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expectLayerCount(page, 1);
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expectLayerCount(page, 3);
  await page.getByRole("button", { name: "Undo" }).click();
  await ensureLayersOpen(page);
  await expectLayerCount(page, 1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expectLayerCount(page, 3);

  await expect(page.locator(".save-state")).toHaveCount(0);

  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const svgDownload = await download;
  expect(svgDownload.suggestedFilename()).toMatch(/untitled-figure\.svg/i);
  const svgPath = await svgDownload.path();
  expect(svgPath).not.toBeNull();
  const svg = await readFile(svgPath!, "utf8");
  const svgMetadata = svgExportMetadata(svg);
  expect(svgMetadata.provenance.version).toBe(1);
  expect(svgMetadata.provenance.assets).toHaveLength(1);
  const assetRecord = svgMetadata.provenance.assets[0] as {
    assetId: string;
    source: string;
    author: string;
    license: string;
    credit: string;
  };
  expect(assetRecord.source).toMatch(/^https?:/);
  expect(assetRecord.author).toBeTruthy();
  expect(assetRecord.license).toBeTruthy();
  expect(assetRecord.credit).toBeTruthy();
  expect(svg).toContain("<metadata>");
  expect(svg).toContain("Per-asset authorship");
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
  expect(pngProvenance(png)).toEqual(svgMetadata.provenance);

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("tab", { name: /PDF/ }).click();
  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pdfPath = await (await pdfDownloadPromise).path();
  expect(pdfPath).not.toBeNull();
  const pdfBytes = await readFile(pdfPath!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfBytes.toString("latin1")).toContain("/FontName /Source#20Sans#203");
  expect(pdfBytes.toString("latin1")).toContain("/Producer (OpenSketch)");
  expect(pdfBytes.toString("latin1")).not.toContain("/Producer (jsPDF");
  const pdf = await PDFDocument.load(pdfBytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe("Untitled figure");
  expect(pdf.getAuthor()).toBeUndefined();
  expect(pdf.getCreator()).toBe("OpenSketch");
  expect(pdf.getSubject()).toContain(assetRecord.credit);
  expect(pdfBytes.toString("utf8")).toContain("opensketch:provenanceManifest");
  expect(pdfBytes.toString("utf8")).toContain(assetRecord.assetId);
  const pageSize = pdf.getPage(0).getSize();
  expect(pageSize.width).toBeGreaterThan(pageSize.height);

  await page.getByRole("button", { name: "Export" }).click();
  const creditsDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download credits" }).click();
  const creditsPath = await (await creditsDownloadPromise).path();
  expect(creditsPath).not.toBeNull();
  const credits = await readFile(creditsPath!, "utf8");
  expect(credits).toContain(assetRecord.source);
  expect(credits).toContain(assetRecord.author);
  expect(credits).toContain(assetRecord.license);

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
  await expectLayerCount(page, 3);
  expect(externalRequests).toEqual([]);
});

test("keeps the canvas preset label synchronized with its dimensions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("button", { name: "Canvas size", exact: true }).click();

  const canvasSettings = page.getByRole("dialog", { name: "Canvas settings" });
  const preset = canvasSettings.getByRole("combobox", { name: "Preset" });
  const width = canvasSettings.getByLabel("Width");
  const height = canvasSettings.getByLabel("Height");
  await expect(preset).toContainText("Presentation 16:9");

  await selectUiOption(page, "Preset", "A4 landscape");
  await expect(preset).toContainText("A4 landscape");
  await expect(width).toHaveValue("3508");
  await expect(height).toHaveValue("2480");

  await width.press("ArrowUp");
  await expect(width).toHaveValue("3509");
  await width.press("ArrowDown");
  await expect(width).toHaveValue("3508");
  await height.press("ArrowUp");
  await expect(height).toHaveValue("2481");
  await height.press("ArrowDown");
  await expect(height).toHaveValue("2480");

  await width.fill("3509");
  await expect(preset).toContainText("Custom dimensions");

  await width.fill("3508");
  await expect(preset).toContainText("A4 landscape");
});

test("builds and persists a styled object-attached connector", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Rectangle", 0.65, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Lines", exact: true }).click();
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

  await ensureEditorOpen(page);
  await expectLayerCount(page, 3);
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

test("changes line ends between blunt and curved in the edit menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Line", 0.35, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await ensureEditorOpen(page);

  const lineEnds = page.getByRole("combobox", { name: "Line ends" });
  await expect(lineEnds).toHaveAttribute("data-value", "round");
  await selectUiOption(page, "Line ends", "Blunt");
  await expect(lineEnds).toHaveAttribute("data-value", "butt");

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.keyboard.press("ControlOrMeta+A");
  await ensureEditorOpen(page);
  await expect(page.getByRole("combobox", { name: "Line ends" })).toHaveAttribute(
    "data-value",
    "butt"
  );
  await selectUiOption(page, "Line ends", "Curved");
  await expect(page.getByRole("combobox", { name: "Line ends" })).toHaveAttribute(
    "data-value",
    "round"
  );
});

test("extends a free line from one endpoint without scaling both dimensions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Line", 0.32, 0.5);

  const readLine = () =>
    page.evaluate(async () => {
      const projectId = (history.state as Record<string, unknown> | null)?.OpenSketchProjectId;
      if (typeof projectId !== "string") return null;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("OpenSketch");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const project = await new Promise<Record<string, any> | null>((resolve, reject) => {
        const request = database
          .transaction("projects", "readonly")
          .objectStore("projects")
          .get(projectId);
        request.onsuccess = () =>
          resolve((request.result as Record<string, any> | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
      database.close();
      const object = project?.objects?.objects?.find((candidate: Record<string, unknown>) =>
        ["line", "curved-line", "arrow", "double-arrow", "curved-arrow"].includes(
          String(candidate.OpenSketchType)
        )
      );
      if (!object?.freeConnectorGeometry) return null;
      const angle = (Number(object.angle ?? 0) * Math.PI) / 180;
      const scaleX = Number(object.scaleX ?? 1);
      const scaleY = Number(object.scaleY ?? 1);
      const map = (point: { x: number; y: number }) => ({
        x:
          Number(object.left ?? 0) +
          Math.cos(angle) * scaleX * point.x -
          Math.sin(angle) * scaleY * point.y,
        y:
          Number(object.top ?? 0) +
          Math.sin(angle) * scaleX * point.x +
          Math.cos(angle) * scaleY * point.y
      });
      return {
        canvas: project.canvas,
        start: map(object.freeConnectorGeometry.from),
        end: map(object.freeConnectorGeometry.to),
        scaleX,
        scaleY
      };
    });
  await expect.poll(readLine).not.toBeNull();
  const initial = await readLine();
  if (!initial) throw new Error("The created line was not persisted.");
  const stage = await page.locator(".artboard-stage").boundingBox();
  if (!stage) throw new Error("Artboard is not visible.");
  const end = {
    x: stage.x + (initial.end.x / initial.canvas.width) * stage.width,
    y: stage.y + (initial.end.y / initial.canvas.height) * stage.height
  };
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(end.x + 120, end.y + 40, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await readLine();
      return after && after.end.x - initial.end.x;
    })
    .toBeGreaterThan(150);
  const after = await readLine();
  if (!after) throw new Error("The resized line was not persisted.");
  expect(after.start.x).toBeCloseTo(initial.start.x, 0);
  expect(after.start.y).toBeCloseTo(initial.start.y, 0);
  expect(after.scaleX).toBe(1);
  expect(after.scaleY).toBe(1);
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
  await expect(shapeMenu.getByRole("menuitem", { name: "Star" })).toHaveCount(0);
  await page.getByRole("button", { name: "Defaults", exact: true }).click();
  await expect(page.locator(".creation-defaults-summary")).toHaveText([
    "New text defaults",
    "New shape defaults",
    "New line & arrow defaults"
  ]);
  await expect(page.locator(".shape-grid")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Polygon", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Membrane", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Callout", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bracket", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Default shape fill", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Default shape fill palette" })
    .getByRole("button", { name: "Transparent", exact: true })
    .click();
  await page.getByRole("button", { name: "Default shape outline", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Default shape outline palette" })
    .getByRole("button", { name: "Transparent", exact: true })
    .click();
  await selectUiOption(page, "Default text typeface", "Source Serif 4");
  await setPaletteColor(page, "Default text color", "#3157a4");
  const defaultTextSize = page.getByLabel("Default text size");
  await fillStable(defaultTextSize, "28");
  await defaultTextSize.press("Tab");
  await expect(defaultTextSize).toHaveValue("28");
  await selectUiOption(page, "Default text weight", "Semibold");

  await placeTool(page, "Pentagon", 0.5, 0.18);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("pentagon");
  await expect(page.getByLabel("Fill color value")).toHaveValue("transparent");
  await expect(page.getByLabel("Stroke color value")).toHaveValue("transparent");
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
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(page.getByRole("menuitem", { name: "Rectangle", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Defaults", exact: true }).click();
  await setPaletteColor(page, "Default line color", "#c026d3");
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
  await page.getByRole("button", { name: "Edit", exact: true }).click();
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
  await page.getByRole("button", { name: "Defaults", exact: true }).click();
  await expect(page.getByLabel("Default line color").locator(".palette-color-value")).toHaveCount(
    0
  );
  await expect(page.getByLabel("Default line thickness")).toHaveValue("9");
  await expect(page.getByRole("combobox", { name: "Line style" })).toHaveText(/Dashed/i);
  await expect(page.getByRole("combobox", { name: "Start head" })).toHaveText(/None/i);
  await expect(page.getByRole("combobox", { name: "End head" })).toHaveText(/Circle/i);
  await expect(page.getByRole("combobox", { name: "Default text typeface" })).toHaveText(
    /Source Serif 4/i
  );
  await expect(page.getByLabel("Default text color").locator(".palette-color-value")).toHaveCount(
    0
  );
  await expect(page.getByLabel("Default text size")).toHaveValue("28");
  await expect(page.getByRole("combobox", { name: "Default text weight" })).toHaveText(/Semibold/i);

  await placeTool(page, "Line", 0.3, 0.28);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
  expect(
    Number(await page.locator(".field-row.dimensions input").first().inputValue())
  ).toBeGreaterThan(150);

  await placeTool(page, "Arrow", 0.44, 0.42);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
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
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("5");

  const pointText = page
    .getByLabel("Editor tools")
    .getByRole("button", { name: "Text", exact: true });
  await pointText.click();
  await expect(pointText).toHaveAttribute("aria-pressed", "true");
  const textPoint = await artboardPoint(page, 0.52, 0.22);
  await page.mouse.click(textPoint.x, textPoint.y);
  await page.keyboard.type("Placed label");
  await page.keyboard.press("Escape");
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("6");
  await expect(page.locator(".layer-list button").filter({ hasText: "Text" })).toBeVisible();
  const textInspector = page.locator(".inspector-scroll");
  await expect(textInspector.getByRole("combobox", { name: "Font" })).toHaveText(/Source Serif 4/i);
  await expect(textInspector.getByLabel("Size", { exact: true })).toHaveValue("28");
  await expect(textInspector.getByRole("combobox", { name: "Weight" })).toHaveText(/Semibold/i);
  await expect(textInspector.getByRole("combobox", { name: "Line spacing" })).toHaveText(
    /No extra spacing/i
  );
  await selectUiOption(page, "Line spacing", "Double (2×)");
  await expect(textInspector.getByRole("combobox", { name: "Line spacing" })).toHaveText(/Double/i);
  await expect(textInspector.getByLabel("Custom line height", { exact: true })).toHaveValue("2.00");
  await expect(textInspector.getByLabel("Text color value")).toHaveValue("#3157a4");
});

test("places text from the first Shapes tool without blanking the editor", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.getByRole("tab", { name: "Text", exact: true })).toHaveCount(0);
  await expect(page.locator(".shape-grid")).toHaveCount(0);
  const pointText = page
    .getByLabel("Editor tools")
    .getByRole("button", { name: "Text", exact: true });
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
  await ensureEditorOpen(page);
  await expect(inspector.getByRole("button", { name: "Shape", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(inspector.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Variant", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Line", exact: true })).toHaveCount(0);
  await expect(
    inspector.getByRole("button", { name: "Align & distribute", exact: true })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Fill color", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Fill color palette" })
    .getByRole("button", { name: "Transparent", exact: true })
    .click();
  await page.getByRole("button", { name: "Stroke color", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Stroke color palette" })
    .getByRole("button", { name: "Transparent", exact: true })
    .click();
  await expect(page.getByLabel("Fill color value")).toHaveValue("transparent");
  await expect(page.getByLabel("Stroke color value")).toHaveValue("transparent");

  await placeTool(page, "Line", 0.55, 0.45);
  await ensureEditorOpen(page);
  await expect(inspector.getByRole("button", { name: "Line", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(inspector.getByRole("button", { name: "Shape", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Variant", exact: true })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+A");
  const alignmentSection = inspector.getByRole("button", {
    name: "Align & distribute",
    exact: true
  });
  await expect(alignmentSection).toBeVisible();
  await alignmentSection.click();
  await expect(inspector.getByRole("button", { name: "Align left" })).toBeEnabled();
  await expect(inspector.getByRole("button", { name: "Distribute horizontally" })).toBeDisabled();
  await expect(inspector.getByRole("button", { name: "Distribute vertically" })).toBeDisabled();

  await placeTool(page, "Rectangle", 0.68, 0.6);
  await ensureEditorOpen(page);
  await page.keyboard.press("ControlOrMeta+A");
  await expect(alignmentSection).toBeVisible();
  await alignmentSection.click();
  await expect(inspector.getByRole("button", { name: "Distribute horizontally" })).toBeEnabled();
  await expect(inspector.getByRole("button", { name: "Distribute vertically" })).toBeEnabled();

  await placeTool(page, "Text", 0.7, 0.35);
  await ensureEditorOpen(page);
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
  await expect(
    inspector.getByRole("button", { name: "Align & distribute", exact: true })
  ).toHaveCount(0);
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
  const fabricTextarea = page.locator('textarea[data-fabric="textarea"]');
  await expect(fabricTextarea).toBeFocused();
  await expect(fabricTextarea).toHaveValue("Text");
  await page.keyboard.press("Escape");
  await expectLayerCount(page, 1);
  await ensureLayersOpen(page);
  await expect(page.locator(".layer-list button").filter({ hasText: "Text" })).toBeVisible();

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await page.getByRole("button", { name: "Canvas size" }).click();
  await expect(page.getByLabel("Double-click to add text")).toBeChecked();
});

test("double-clicking an existing text item edits it instead of creating another", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const textTool = page
    .getByLabel("Editor tools")
    .getByRole("button", { name: "Text", exact: true });
  await textTool.click();
  const point = await artboardPoint(page, 0.52, 0.3);
  await page.mouse.click(point.x, point.y);
  const fabricTextarea = page.locator('textarea[data-fabric="textarea"]');
  await expect(fabricTextarea).toBeFocused();
  await page.keyboard.type("Existing label");
  await page.keyboard.press("Escape");

  await textTool.click();
  await page.mouse.dblclick(point.x, point.y);

  await expect(fabricTextarea).toBeFocused();
  await expect(fabricTextarea).toHaveValue("Existing label");
  await expectLayerCount(page, 1);
});

test("preserves clipboard object size across repeated pastes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.45, 0.45);
  await ensureEditorOpen(page);

  const width = page.locator(".field-row.dimensions input").first();
  const originalWidth = Number(await width.inputValue());
  await page.keyboard.press("ControlOrMeta+C");
  await page.waitForTimeout(50);
  await page.keyboard.press("ControlOrMeta+V");
  await expectLayerCount(page, 2);
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(originalWidth, 0);

  await page.keyboard.press("ControlOrMeta+V");
  await expectLayerCount(page, 3);
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
  await placeTool(page, "Rectangle", 0.5, 0.5);

  await page.keyboard.press("ControlOrMeta+C");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        try {
          const item = (await navigator.clipboard.read()).find((entry) =>
            entry.types.includes("image/png")
          );
          if (!item) return [];
          const bytes = new Uint8Array(await (await item.getType("image/png")).arrayBuffer());
          return [...bytes.slice(0, 8)];
        } catch {
          return [];
        }
      })
    )
    .toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  await page.keyboard.press("ControlOrMeta+V");
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await page.getByRole("button", { name: "Insert Cajal-Retzius Cell", exact: true }).click();
  const point = await renderedArtworkCenter(page);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Cajal-Retzius Cell actions" });
  await expect(menu.getByRole("menuitem", { name: "Copy as SVG" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Copy as PNG" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Copy as SVG" }).click();

  let clipboardSvg = "";
  await expect
    .poll(async () => {
      clipboardSvg = await page.evaluate(async () => {
        try {
          const item = (await navigator.clipboard.read()).find((entry) =>
            entry.types.includes("text/plain")
          );
          return item ? (await item.getType("text/plain")).text() : "";
        } catch {
          return "";
        }
      });
      return clipboardSvg.includes("<svg");
    })
    .toBe(true);
  expect(clipboardSvg).toContain("<svg");
  expect(clipboardSvg.match(/<path\b/g)?.length).toBeGreaterThanOrEqual(3);
});

test("inserts assets from the sidebar at the reduced default size", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("T Cell");
  await page.getByRole("button", { name: "Insert T Cell", exact: true }).first().click();
  await ensureEditorOpen(page);

  const dimensions = page.locator(".field-row.dimensions input");
  const width = Number(await dimensions.nth(0).inputValue());
  const height = Number(await dimensions.nth(1).inputValue());
  expect(Math.max(width, height)).toBeCloseTo(180, 0);
});

test("keeps family variant previews normalized and drags the selected variant", async ({
  page
}) => {
  const visibleArtworkBounds = async (image: Locator) => {
    await expect.poll(() => image.getAttribute("src")).toMatch(/\.webp$/);
    await expect
      .poll(
        () =>
          image.evaluate(
            (element: HTMLImageElement) =>
              element.complete && element.naturalWidth === 256 && element.naturalHeight === 256
          ),
        { timeout: 15_000 }
      )
      .toBe(true);
    return image.evaluate((element: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not inspect the normalized asset preview.");
      context.drawImage(element, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width;
      let top = canvas.height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      return {
        left,
        top,
        right,
        bottom,
        width: right - left + 1,
        height: bottom - top + 1,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2
      };
    });
  };

  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Activated Neutrophil");
  await expect(page.locator(".asset-card")).toHaveCount(1);
  const card = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^Activated Neutrophil$/ }) });
  const preview = card.locator(".asset-card-image img");
  const firstBounds = await visibleArtworkBounds(preview);
  const firstSource = await preview.getAttribute("src");

  await card.getByRole("combobox", { name: "Activated Neutrophil variant" }).click();
  await page
    .getByRole("listbox", { name: "Activated Neutrophil variants" })
    .getByRole("option", { name: "Select Activated Neutrophil variant 2" })
    .click({ force: true });
  await expect(card.getByRole("combobox", { name: "Activated Neutrophil variant" })).toHaveText(
    "Variant 2"
  );
  await expect.poll(() => preview.getAttribute("src")).not.toBe(firstSource);
  const secondBounds = await visibleArtworkBounds(preview);

  expect(Math.max(firstBounds.width, firstBounds.height)).toBeGreaterThanOrEqual(222);
  expect(Math.max(secondBounds.width, secondBounds.height)).toBeGreaterThanOrEqual(222);
  expect(Math.max(firstBounds.width, firstBounds.height)).toBeLessThanOrEqual(224);
  expect(Math.max(secondBounds.width, secondBounds.height)).toBeLessThanOrEqual(224);
  expect(Math.min(firstBounds.left, firstBounds.top)).toBeGreaterThanOrEqual(15);
  expect(Math.min(secondBounds.left, secondBounds.top)).toBeGreaterThanOrEqual(15);
  expect(Math.max(firstBounds.right, firstBounds.bottom)).toBeLessThanOrEqual(240);
  expect(Math.max(secondBounds.right, secondBounds.bottom)).toBeLessThanOrEqual(240);
  expect(
    Math.abs(
      Math.max(firstBounds.width, firstBounds.height) -
        Math.max(secondBounds.width, secondBounds.height)
    )
  ).toBeLessThanOrEqual(2);
  expect(Math.abs(firstBounds.centerX - secondBounds.centerX)).toBeLessThanOrEqual(2);
  expect(Math.abs(firstBounds.centerY - secondBounds.centerY)).toBeLessThanOrEqual(2);

  await card.dragTo(page.locator(".artboard-stage"));
  await expect(page.locator(".assets-panel")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Activated Neutrophil");
  await expect(
    page
      .locator(".inspector-embedded")
      .getByRole("option", { name: "Select Activated Neutrophil variant 2" })
  ).toHaveAttribute("aria-selected", "true");
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
  const variantCount = await variants.getByRole("option").count();
  expect(variantCount).toBeGreaterThanOrEqual(9);
  await expect(variants.locator("img")).toHaveCount(variantCount);
  await expect
    .poll(
      () =>
        variants.locator("img").evaluateAll((images) =>
          images.every((image) => {
            const element = image as HTMLImageElement;
            return (
              element.getAttribute("src")?.endsWith(".webp") &&
              element.complete &&
              element.naturalWidth === 256 &&
              element.naturalHeight === 256
            );
          })
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
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
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Immune Cell");
  await expect(page.getByRole("button", { name: "Style", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Variant", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(page.getByRole("button", { name: "Asset colors", exact: true })).toHaveCount(0);
  await expect(page.getByText("Color presets", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Shape", exact: true })).toHaveCount(0);
  const inspectorVariants = page
    .locator(".inspector-embedded")
    .getByRole("listbox", { name: "Immune Cell variants" });
  await expect(
    page.locator(".inspector-embedded").getByRole("combobox", { name: "Immune Cell variant" })
  ).toHaveCount(0);
  await expect(inspectorVariants.getByRole("option")).toHaveCount(variantCount);
  await expect(inspectorVariants.locator("img")).toHaveCount(variantCount);
  await expect(
    inspectorVariants.getByRole("option", { name: "Select Immune Cell variant 2" })
  ).toHaveAttribute("aria-selected", "true");
  await inspectorVariants.getByRole("option", { name: "Select Immune Cell variant 3" }).click();
  await expect(
    inspectorVariants.getByRole("option", { name: "Select Immune Cell variant 3" })
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  const restoredImmuneCell = await artboardPoint(page);
  await page.mouse.click(restoredImmuneCell.x, restoredImmuneCell.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await ensureLayersOpen(page);
  await page.locator(".layer-list button").filter({ hasText: "Immune Cell" }).click();
  await expect(
    page
      .locator(".inspector-embedded")
      .getByRole("option", { name: "Select Immune Cell variant 3" })
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Immune Cell");
  const newProjectImmuneCell = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^Immune Cell$/ }) });
  await expect(
    newProjectImmuneCell.getByRole("combobox", { name: "Immune Cell variant" })
  ).toHaveText("Variant 2");
});

test("promotes a canvas asset variant to the Assets default only when styling is saved", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Immune Cell");
  const assetCard = page
    .locator(".asset-card")
    .filter({ has: page.locator("strong").filter({ hasText: /^Immune Cell$/ }) });
  await expect(assetCard).toBeVisible();

  await assetCard.getByRole("combobox", { name: "Immune Cell variant" }).click();
  await page
    .getByRole("listbox", { name: "Immune Cell variants" })
    .getByRole("option", { name: "Select Immune Cell variant 2" })
    .click();
  await expect(assetCard.getByRole("combobox", { name: "Immune Cell variant" })).toHaveText(
    "Variant 2"
  );
  await assetCard.getByRole("button", { name: "Insert Immune Cell" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const inspectorVariants = page
    .locator(".inspector-embedded")
    .getByRole("listbox", { name: "Immune Cell variants" });
  await inspectorVariants.getByRole("option", { name: "Select Immune Cell variant 3" }).click();
  await expect(
    inspectorVariants.getByRole("option", { name: "Select Immune Cell variant 3" })
  ).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await expect(assetCard.getByRole("combobox", { name: "Immune Cell variant" })).toHaveText(
    "Variant 2"
  );

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const artworkCenter = await renderedArtworkCenter(page);
  await page.mouse.click(artworkCenter.x, artworkCenter.y, { button: "right" });
  await page
    .getByRole("menu", { name: "Immune Cell actions" })
    .getByRole("menuitem", { name: "Save styling" })
    .click();

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await expect(assetCard.getByRole("combobox", { name: "Immune Cell variant" })).toHaveText(
    "Variant 3"
  );
});

const bioArtManifest = JSON.parse(
  readFileSync(
    new URL("../../apps/web/src/generated/nih-bioart-manifest.json", import.meta.url),
    "utf8"
  )
) as {
  families: Array<{
    title: string;
    variants: Array<{ id: string; assetPath: string }>;
  }>;
};
const bundledBioArtVariants = bioArtManifest.families.flatMap((family) =>
  family.variants.map((variant) => ({ ...variant, family: family.title }))
);
const bioArtShardCount = 12;
const bundledBioArtShards = Array.from({ length: bioArtShardCount }, (_, shardIndex) =>
  bundledBioArtVariants.slice(
    Math.ceil((bundledBioArtVariants.length * shardIndex) / bioArtShardCount),
    Math.ceil((bundledBioArtVariants.length * (shardIndex + 1)) / bioArtShardCount)
  )
);

test.describe("bundled NIH BioArt SVG compatibility", () => {
  bundledBioArtShards.forEach((variants, shardIndex) => {
    test(`parses every bundled NIH BioArt variant into editable objects (${shardIndex + 1}/${bioArtShardCount})`, async ({
      page,
      browserName
    }) => {
      test.skip(
        browserName !== "chromium",
        "The browser-independent asset corpus only needs one pass."
      );
      test.setTimeout(60_000);
      await page.goto("/");
      const failures = await page.evaluate(async (items) => {
        const { loadEditableSvg } = await import("/OpenSketch/src/editor/svg.ts");
        const failed: Array<{ id: string; family: string; error: string }> = [];
        for (let offset = 0; offset < items.length; offset += 24) {
          const results = await Promise.all(
            items.slice(offset, offset + 24).map(async (item) => {
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
  });
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
  const pngOptions = page.locator(".export-format-options");
  await expect(pngOptions).toHaveAttribute("aria-hidden", "true");
  await expect(pngOptions).not.toHaveClass(/open/);
  expect(
    await pngOptions.evaluate((element) => getComputedStyle(element).transitionProperty)
  ).toContain("grid-template-rows");
  await page.getByRole("tab", { name: /PNG/ }).click();
  await expect(pngOptions).toHaveClass(/open/);
  await expect(pngOptions).toHaveAttribute("aria-hidden", "false");
  const outputDpi = page.getByRole("combobox", { name: "Output DPI" });
  await expect(page.getByRole("combobox", { name: "Pixel scaling" })).toHaveCount(0);
  await expect(page.getByLabel("Pixel width")).toHaveCount(0);
  await expect(page.getByLabel("Pixel height")).toHaveCount(0);
  await expect(page.locator(".export-summary")).toHaveCount(0);
  await expect(outputDpi).toHaveAttribute("data-value", "1200");
  await outputDpi.click();
  await expect(page.getByRole("option", { name: "150 DPI" })).toBeVisible();
  await expect(page.getByRole("option", { name: "1200 DPI" })).toBeVisible();
  await expect(page.getByRole("option", { name: "1500 DPI" })).toBeVisible();
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
  await expect(pngOptions).not.toHaveClass(/open/);
  await expect(pngOptions).toHaveAttribute("aria-hidden", "true");
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
  await expectLayerCount(page, 1);

  await page.mouse.click(firstRectangle.x, firstRectangle.y, { button: "right" });
  const groupMenu = page.getByRole("menu", { name: "Group actions" });
  await expect(groupMenu.getByRole("menuitem", { name: "Ungroup" })).toBeVisible();
  await groupMenu.getByRole("menuitem", { name: "Ungroup" }).click();
  await expectLayerCount(page, 2);

  await ensureLayersOpen(page);
  await page.locator(".layer-list > button").first().click();
  const fill = page.getByLabel("Fill color value");
  await setPaletteColor(page, "Fill color", "#ff0000");
  await expect(fill).toHaveValue("#ff0000");
  const secondRectangle = await artboardPoint(page, 0.65, 0.5);
  await page.mouse.click(secondRectangle.x, secondRectangle.y, { button: "right" });
  const shapeMenu = page.getByRole("menu", { name: "rectangle actions" });
  await expect(shapeMenu.getByRole("menuitem", { name: "Save styling" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: "Reset styling" })).toBeVisible();
  await expect(shapeMenu.getByRole("menuitem", { name: /favorites/i })).toHaveCount(0);
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
  await ensureEditorOpen(page);
  await expect(fill).toHaveValue("#d8efe9");

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const textPoint = await artboardPoint(page, 0.5, 0.25);
  await placeTool(page, "Text", 0.5, 0.25);
  await page.keyboard.type("Context label");
  await page.keyboard.press("Escape");
  await ensureLayersOpen(page);
  await page.locator(".layer-list > button").first().click();
  const textFill = page.getByLabel("Text color value");
  await expect(textFill).toBeVisible();
  await setPaletteColor(page, "Text color", "#00ff00");
  await page.mouse.click(textPoint.x, textPoint.y, { button: "right" });
  const textMenu = page.getByRole("menu", { name: "Text actions" });
  await expect(textMenu.getByRole("menuitem", { name: "Save styling" })).toBeVisible();
  await expect(textMenu.getByRole("menuitem", { name: "Reset styling" })).toBeVisible();
  await textMenu.getByRole("menuitem", { name: "Reset styling" }).click();
  await ensureEditorOpen(page);
  await expect(textFill).toHaveValue("#183133");
});

test("adds a selected asset to Favorites from its context menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await page.getByRole("button", { name: "Insert Cajal-Retzius Cell", exact: true }).click();
  await ensureEditorOpen(page);

  const center = await artboardPoint(page);
  await page.mouse.click(center.x, center.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Cajal-Retzius Cell actions" });
  const menuItems = await menu.getByRole("menuitem").allTextContents();
  expect(menuItems.indexOf("Add to favorites")).toBe(menuItems.indexOf("Reset styling") + 1);
  await menu.getByRole("menuitem", { name: "Add to favorites" }).click();

  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Insert Cajal-Retzius Cell", exact: true })
  ).toBeVisible();
});

test("saves and resets per-element styling for future sidebar shapes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();

  const firstPoint = await artboardPoint(page, 0.35, 0.5);
  await placeTool(page, "Rectangle", 0.35, 0.5);
  const fill = page.getByLabel("Fill color value");
  await setPaletteColor(page, "Fill color", "#ff0000");
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
  await ensureEditorOpen(page);
  await expect(fill).toHaveValue("#ff0000");

  await page.mouse.click(secondPoint.x, secondPoint.y, { button: "right" });
  await page
    .getByRole("menu", { name: "rectangle actions" })
    .getByRole("menuitem", { name: "Reset styling" })
    .click();
  await ensureEditorOpen(page);
  await expect(fill).toHaveValue("#d8efe9");

  await placeTool(page, "Rectangle", 0.82, 0.5);
  await ensureEditorOpen(page);
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

test("resizes text by changing font size instead of stretching its glyphs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  await placeTool(page, "Text", 0.5, 0.45);
  await page.keyboard.type("Fixed label");
  await page.keyboard.press("Escape");
  await ensureEditorOpen(page);

  const width = page.locator(".field-row.dimensions input").first();
  const height = page.locator(".field-row.dimensions input").last();
  const fontSize = page.getByLabel("Size", { exact: true });
  await expect(width).toBeVisible();
  const beforeWidth = Number(await width.inputValue());
  const beforeHeight = Number(await height.inputValue());
  const beforeFontSize = Number(await fontSize.inputValue());
  const stage = await page.locator(".artboard-stage").boundingBox();
  if (!stage) throw new Error("Artboard is not visible.");
  const zoom = stage.width / 1920;
  const beforeLeft = Number(await page.getByLabel("X", { exact: true }).inputValue());
  const beforeTop = Number(await page.getByLabel("Y", { exact: true }).inputValue());
  const topRight = {
    x: stage.x + (beforeLeft + beforeWidth / 2) * zoom,
    y: stage.y + (beforeTop - beforeHeight / 2) * zoom
  };

  await page.mouse.move(topRight.x - 3, topRight.y + 3);
  await page.mouse.down();
  await page.mouse.move(topRight.x + 90, topRight.y - 40, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => Number(await width.inputValue())).toBeGreaterThan(beforeWidth);
  await expect.poll(async () => Number(await height.inputValue())).toBeGreaterThan(beforeHeight);
  await expect
    .poll(async () => Number(await fontSize.inputValue()))
    .toBeGreaterThan(beforeFontSize);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const projectId = (history.state as Record<string, unknown> | null)?.OpenSketchProjectId;
        if (typeof projectId !== "string") return null;
        const request = indexedDB.open("OpenSketch");
        return await new Promise<{ scaleX?: number; scaleY?: number } | null>((resolve, reject) => {
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const get = request.result
              .transaction("projects")
              .objectStore("projects")
              .get(projectId);
            get.onerror = () => reject(get.error);
            get.onsuccess = () => {
              const object = get.result?.objects?.objects?.[0];
              resolve(object ? { scaleX: object.scaleX, scaleY: object.scaleY } : null);
            };
          };
        });
      })
    )
    .toMatchObject({ scaleX: 1, scaleY: 1 });
});

test("saved text styling overrides later new-text defaults", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const firstPoint = await artboardPoint(page, 0.32, 0.45);
  await placeTool(page, "Text", 0.32, 0.45);
  await page.keyboard.type("Saved label");
  await page.keyboard.press("Escape");
  await ensureEditorOpen(page);
  await setPaletteColor(page, "Text color", "#ff0000");
  await selectUiOption(page, "Font", "STIX Two Text");
  const textSize = page.getByLabel("Size", { exact: true });
  await fillStable(textSize, "42");
  await textSize.press("Enter");
  await selectUiOption(page, "Weight", "Semibold");

  await page.getByRole("button", { name: "Close properties" }).click();
  await page.mouse.click(firstPoint.x, firstPoint.y, { button: "right" });
  await page
    .getByRole("menu", { name: "Text actions" })
    .getByRole("menuitem", { name: "Save styling" })
    .click();

  await page.getByRole("button", { name: "Defaults", exact: true }).click();
  await setPaletteColor(page, "Default text color", "#0000ff");
  await selectUiOption(page, "Default text typeface", "Source Serif 4");
  const defaultTextSize = page.getByLabel("Default text size");
  await fillStable(defaultTextSize, "28");
  await defaultTextSize.press("Enter");
  await selectUiOption(page, "Default text weight", "Bold");
  await page.getByRole("button", { name: "Defaults", exact: true }).click();

  await placeTool(page, "Text", 0.7, 0.45);
  await page.keyboard.type("Future label");
  await page.keyboard.press("Escape");
  await ensureEditorOpen(page);
  const futureText = page.locator(".inspector-scroll");
  await expect(futureText.getByLabel("Text color value")).toHaveValue("#ff0000");
  await expect(futureText.getByRole("combobox", { name: "Font" })).toHaveText(/STIX Two Text/);
  await expect(futureText.getByLabel("Size", { exact: true })).toHaveValue("42");
  await expect(futureText.getByRole("combobox", { name: "Weight" })).toHaveText(/Semibold/);
});

test("ungroups exactly one level of a nested group hierarchy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Rectangle", 0.3, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);

  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await placeTool(page, "Triangle", 0.7, 0.5);
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");

  const nestedGroupPoint = await artboardPoint(page, 0.5, 0.5);
  await page.mouse.click(nestedGroupPoint.x, nestedGroupPoint.y, { button: "right" });
  const outerGroupMenu = page.getByRole("menu", { name: "Group actions" });
  await expect(outerGroupMenu.getByRole("menuitem", { name: "Ungroup" })).toBeVisible();
  await outerGroupMenu.getByRole("menuitem", { name: "Ungroup" }).click();

  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("2");
  const innerGroupLayer = page
    .locator(".layer-list > button")
    .filter({ has: page.getByText("Group", { exact: true }) });
  await expect(innerGroupLayer).toHaveCount(1);
  await innerGroupLayer.click();
  await expect(page.getByRole("button", { name: "Ungroup", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("3");
});

test("treats an imported SVG as one atomic canvas object", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await page
    .locator('input[type="file"][accept*="image/svg+xml"]')
    .setInputFiles("tests/fixtures/nested-groups.svg");
  await expect(page.locator(".layers-title small")).toHaveText("1");

  const center = await artboardPoint(page);
  await page.mouse.click(center.x, center.y, { button: "right" });
  const importMenu = page.getByRole("menu", { name: "nested-groups.svg actions" });
  await expect(importMenu.getByRole("menuitem", { name: "Ungroup" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByRole("status").filter({ hasText: "Editing a group" })).toHaveCount(0);
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("1");
});

test("enters imported SVG vector editing and selects a nested part", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await page
    .locator('input[type="file"][accept*="image/svg+xml"]')
    .setInputFiles("tests/fixtures/nested-groups.svg");
  await expect(page.locator(".layers-title small")).toHaveText("1");

  const center = await artboardPoint(page);
  await page.mouse.dblclick(center.x, center.y);
  const vectorBanner = page.getByRole("status").filter({ hasText: "Editing vector asset" });
  await expect(vectorBanner).toBeVisible();

  await page.mouse.click(center.x, center.y);
  await ensureEditorOpen(page);
  await expect(page.locator(".svg-part-context")).toContainText("Inside");

  await page.locator(".svg-part-context").getByRole("button", { name: "Done" }).click();
  await expect(vectorBanner).toHaveCount(0);
});

test("double-clicks through overlapping objects and into grouped children", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle", 0.5, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);

  const overlap = await artboardPoint(page, 0.5, 0.5);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");

  await page.mouse.dblclick(overlap.x, overlap.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");
  const ungroupedX = page.locator(".inspector-scroll").getByLabel("X", { exact: true });
  const ungroupedStartX = Number(await ungroupedX.inputValue());
  await page.mouse.move(overlap.x, overlap.y);
  await page.mouse.down();
  await page.mouse.move(overlap.x + 140, overlap.y, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");
  await expect
    .poll(async () => Number(await ungroupedX.inputValue()))
    .toBeGreaterThan(ungroupedStartX + 100);

  await page.mouse.move(overlap.x + 140, overlap.y);
  await page.mouse.down();
  await page.mouse.move(overlap.x, overlap.y, { steps: 5 });
  await page.mouse.up();
  await page.mouse.dblclick(overlap.x, overlap.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");

  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");

  await page.mouse.dblclick(overlap.x, overlap.y);
  const groupBanner = page.getByRole("status").filter({ hasText: "Editing a group" });
  await expect(groupBanner).toBeVisible();
  await page.mouse.click(overlap.x, overlap.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");
  const groupedX = page.locator(".inspector-scroll").getByLabel("X", { exact: true });
  const groupedStartX = Number(await groupedX.inputValue());
  await page.mouse.move(overlap.x, overlap.y);
  await page.mouse.down();
  await page.mouse.move(overlap.x + 140, overlap.y, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect
    .poll(async () => Number(await groupedX.inputValue()))
    .toBeGreaterThan(groupedStartX + 100);

  await page.mouse.click(overlap.x, overlap.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");
  await groupBanner.getByRole("button", { name: "Exit group" }).click();
  await expect(groupBanner).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");
});

test("double-clicks into nested groups one hierarchy level at a time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle", 0.4, 0.5);
  await placeTool(page, "Circle", 0.4, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const widthField = page.locator(".inspector-scroll").getByLabel("W", { exact: true });
  const innerGroupWidth = Number(await widthField.inputValue());
  await placeTool(page, "Triangle", 0.7, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");

  await placeTool(page, "Rectangle", 0.86, 0.2);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  const nestedGroupPoint = await artboardPoint(page, 0.4, 0.5);
  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  const groupBanner = page.getByRole("status").filter({ hasText: "Editing a group" });
  await expect(groupBanner).toBeVisible();
  await page.mouse.click(nestedGroupPoint.x, nestedGroupPoint.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");

  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  await expect(groupBanner).toBeVisible();
  await page.mouse.click(nestedGroupPoint.x, nestedGroupPoint.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");
  await expect
    .poll(async () => Number(await widthField.inputValue()))
    .toBeCloseTo(innerGroupWidth, 0);

  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  await expect(groupBanner).toBeVisible();
  await page.mouse.click(nestedGroupPoint.x, nestedGroupPoint.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).not.toHaveText("Group");

  const exitGroup = groupBanner.getByRole("button", { name: "Exit group" });
  await exitGroup.click();
  await expect(groupBanner).toBeVisible();
  await expect(page.locator(".selection-toolbar-shell")).toHaveCount(0);
  await exitGroup.click();
  await expect(groupBanner).toBeVisible();
  await expect(page.locator(".selection-toolbar-shell")).toHaveCount(0);
  await exitGroup.click();
  await expect(groupBanner).toHaveCount(0);
  await expect(page.locator(".selection-toolbar-shell")).toBeVisible();
});

test("double-clicking outside exits one group hierarchy level", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Circle", 0.35, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await placeTool(page, "Triangle", 0.68, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  const nestedGroupPoint = await artboardPoint(page, 0.35, 0.5);
  const parentSiblingPoint = await artboardPoint(page, 0.68, 0.5);
  const outsideGroupPoint = await artboardPoint(page, 0.92, 0.86);
  const groupBanner = page.getByRole("status").filter({ hasText: "Editing a group" });

  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  await expect(groupBanner).toBeVisible();
  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  await expect(groupBanner).toBeVisible();

  await page.mouse.dblclick(parentSiblingPoint.x, parentSiblingPoint.y);
  await expect(groupBanner).toBeVisible();
  await page.mouse.dblclick(outsideGroupPoint.x, outsideGroupPoint.y);
  await expect(groupBanner).toHaveCount(0);
});

test("edits a group with single-click and modifier multi-selection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle", 0.3, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);
  await placeTool(page, "Triangle", 0.7, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await placeTool(page, "Rectangle", 0.86, 0.2);

  const rectangle = await artboardPoint(page, 0.3, 0.5);
  const circle = await artboardPoint(page, 0.5, 0.5);
  const triangle = await artboardPoint(page, 0.7, 0.5);
  await page.mouse.dblclick(rectangle.x, rectangle.y);
  const groupBanner = page.getByRole("status").filter({ hasText: "Editing a group" });
  await expect(groupBanner).toBeVisible();
  await expect(page.locator(".canvas-workspace")).toHaveClass(/group-editing/);
  await page.mouse.click(rectangle.x, rectangle.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");

  await page.keyboard.down("Meta");
  await page.mouse.click(circle.x, circle.y);
  await page.keyboard.up("Meta");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header span")).toHaveText("2 selected");

  await page.keyboard.down("Alt");
  await page.mouse.click(triangle.x, triangle.y);
  await page.keyboard.up("Alt");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header span")).toHaveText("3 selected");
  await expect(page.getByRole("button", { name: "Group", exact: true })).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(groupBanner).toHaveCount(0);
  await expect(page.locator(".canvas-workspace")).not.toHaveClass(/group-editing/);
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");
});

test("keeps a group created inside group editing nested at one canvas layer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle", 0.3, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);
  await placeTool(page, "Triangle", 0.7, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  const rectangle = await artboardPoint(page, 0.3, 0.5);
  const circle = await artboardPoint(page, 0.5, 0.5);
  const groupBanner = page.getByRole("status").filter({ hasText: "Editing a group" });
  await page.mouse.dblclick(rectangle.x, rectangle.y);
  await expect(groupBanner).toBeVisible();
  await page.mouse.click(rectangle.x, rectangle.y);
  await page.keyboard.down("Control");
  await page.mouse.click(circle.x, circle.y);
  await page.keyboard.up("Control");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header span")).toHaveText("2 selected");

  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expectLayerCount(page, 1);
  await page.keyboard.press("Escape");
  await expect(groupBanner).toHaveCount(0);
});

test("adds independent canvas objects to the selection with Ctrl-click", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Circle", 0.65, 0.5);

  const rectangle = await artboardPoint(page, 0.35, 0.5);
  const circle = await artboardPoint(page, 0.65, 0.5);
  await page.mouse.click(rectangle.x, rectangle.y);
  await page.keyboard.down("Control");
  await page.mouse.click(circle.x, circle.y);
  await page.keyboard.up("Control");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header span")).toHaveText("2 selected");
});

test("keeps the edit panel open while changing the selected object", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle", 0.35, 0.5);
  await placeTool(page, "Circle", 0.65, 0.5);

  const firstObject = await artboardPoint(page, 0.35, 0.5);
  const secondObject = await artboardPoint(page, 0.65, 0.5);
  const emptyCanvas = await artboardPoint(page, 0.9, 0.85);
  const inspector = page.locator(".inspector-embedded");

  await page.mouse.click(firstObject.x, firstObject.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(inspector).toBeVisible();
  await expect(page.locator(".inspector-header h2")).toHaveText("rectangle");

  await page.mouse.click(secondObject.x, secondObject.y);
  await expect(inspector).toBeVisible();
  await expect(page.locator(".inspector-header h2")).toHaveText("circle");

  await page.mouse.click(emptyCanvas.x, emptyCanvas.y);
  await expect(inspector).toHaveCount(0);
});

test("preserves nested group dimensions when duplicating by modifier-drag", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await placeTool(page, "Rectangle", 0.4, 0.5);
  await placeTool(page, "Circle", 0.4, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const widthField = page.locator(".inspector-scroll").getByLabel("W", { exact: true });
  const innerGroupWidth = Number(await widthField.inputValue());
  await placeTool(page, "Triangle", 0.7, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();

  const nestedGroupPoint = await artboardPoint(page, 0.4, 0.5);
  await page.mouse.dblclick(nestedGroupPoint.x, nestedGroupPoint.y);
  await expect(page.getByRole("status")).toContainText("Editing a group");
  await page.mouse.click(nestedGroupPoint.x, nestedGroupPoint.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("Group");
  await page.mouse.move(nestedGroupPoint.x, nestedGroupPoint.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(nestedGroupPoint.x + 220, nestedGroupPoint.y - 100, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
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
    await page.getByRole("button", { name: "Edit", exact: true }).click();
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
  await ensureLayersOpen(page);
  await expect(layerNames).toHaveText(["triangle", "rectangle", "circle"]);

  const trianglePoint = await artboardPoint(page, 0.75, 0.5);
  await page.mouse.click(trianglePoint.x, trianglePoint.y, { button: "right" });
  await page
    .getByRole("menu", { name: "triangle actions" })
    .getByRole("menuitem", { name: "Send one down" })
    .click();
  await ensureLayersOpen(page);
  await expect(layerNames).toHaveText(["rectangle", "triangle", "circle"]);
});

test("keeps grouped layers nested and preserves their outer stack slot", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();

  await placeTool(page, "Rectangle", 0.25, 0.5);
  await placeTool(page, "Circle", 0.5, 0.5);

  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await placeTool(page, "Triangle", 0.75, 0.5);

  await ensureLayersOpen(page);
  const layerNames = page.locator(".layer-copy strong");
  await expect(layerNames).toHaveText(["triangle", "Group"]);

  await page
    .locator(".layer-list > button")
    .filter({ has: page.getByText("Group", { exact: true }) })
    .click();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(layerNames).toHaveText(["triangle", "circle", "rectangle"]);
});

test("keeps front and back actions at the outer canvas boundaries around groups", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();

  await placeTool(page, "Rectangle", 0.25, 0.5);
  await placeTool(page, "Circle", 0.35, 0.5);
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await placeTool(page, "Triangle", 0.55, 0.5);
  await placeTool(page, "Diamond", 0.8, 0.5);

  await ensureLayersOpen(page);
  const layerNames = page.locator(".layer-copy strong");
  await expect(layerNames).toHaveText(["diamond", "triangle", "Group"]);

  const triangleLayer = page.locator(".layer-list > button").filter({ hasText: "triangle" });
  await triangleLayer.click();
  const layerControls = page.locator(".layers-panel .layer-controls");
  await layerControls.getByRole("button", { name: "Send to back" }).click();
  await expect(layerNames).toHaveText(["diamond", "Group", "triangle"]);

  await triangleLayer.click();
  await layerControls.getByRole("button", { name: "Bring to front" }).click();
  await expect(layerNames).toHaveText(["triangle", "diamond", "Group"]);
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

test("@smoke supports visible and native navigation for new figures", async ({ page }) => {
  await page.goto("/");
  const landingBrand = page.locator(".home-header .brand");
  await expect(landingBrand.locator(".brand-mark")).toHaveAttribute("src", /favicon\.svg$/);
  await expect(landingBrand.locator("span")).toHaveText("OpenSketch");
  await expect(landingBrand.locator("span")).toHaveCSS("white-space", "nowrap");
  const brandMarkBox = await landingBrand.locator(".brand-mark").boundingBox();
  const brandTextBox = await landingBrand.locator("span").boundingBox();
  expect(brandMarkBox).not.toBeNull();
  expect(brandTextBox).not.toBeNull();
  expect(
    Math.abs(
      (brandMarkBox?.y ?? 0) +
        (brandMarkBox?.height ?? 0) / 2 -
        ((brandTextBox?.y ?? 0) + (brandTextBox?.height ?? 0) / 2)
    )
  ).toBeLessThan(2);
  await expect(page.getByRole("heading", { name: "New figure" })).toHaveCount(0);
  await expect(page.getByText(/Local only|Preparing offline copy/)).toHaveCount(0);
  await page.getByRole("button", { name: "About", exact: true }).click();
  const aboutDialog = page.getByRole("dialog", { name: "About OpenSketch" });
  await expect(aboutDialog).toBeVisible();
  await expect(aboutDialog.getByText("ABOUT THE STUDIO", { exact: true })).toHaveCount(0);
  await expect(aboutDialog.getByText("Biology, drawn openly.", { exact: true })).toHaveCount(0);
  await expect(aboutDialog.getByRole("button", { name: "Copy artwork credit" })).toHaveCount(0);
  await expect(aboutDialog.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await expect(
    aboutDialog.getByRole("link", { name: "NIH BioArt Source", exact: true })
  ).toHaveAttribute("href", "https://bioart.niaid.nih.gov/");
  await expect(aboutDialog.getByRole("link", { name: "SciDraw", exact: true })).toHaveAttribute(
    "href",
    "https://scidraw.io/"
  );
  await expect(
    aboutDialog.getByRole("link", {
      name: "Arcadia Science Free organism illustration library",
      exact: true
    })
  ).toHaveAttribute("href", "https://zenodo.org/records/17203578");
  await expect(aboutDialog.getByRole("link", { name: "BioIcons", exact: true })).toHaveAttribute(
    "href",
    "https://bioicons.com/"
  );
  await expect(
    aboutDialog.getByRole("link", { name: "Servier Medical Art", exact: true })
  ).toHaveAttribute("href", "https://smart.servier.com/");
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
  await expect
    .poll(async () => Number.parseInt((await zoomReadout.innerText()).match(/\d+/)?.[0] ?? "", 10))
    .toBeGreaterThan(initialZoom);

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

test("@smoke exits the editor with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByLabel("OpenSketch figure artboard")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Insert T Cell", exact: true }).first().click();
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
  await expect
    .poll(() => workspace.evaluate((element) => element.matches(":focus-visible")))
    .toBe(true);
  expect(await workspace.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
    "none"
  );

  await expect(page.getByRole("button", { name: "Mirror horizontally" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mirror vertically" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show grid" })).toBeVisible();
  await page.getByRole("button", { name: "Show grid" }).click();
  await expect(page.locator(".canvas-workspace")).toHaveClass(/grid-visible/);

  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Triangle", 0.5, 0.5);
  await ensureEditorOpen(page);
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
  await setPaletteColor(page, "Fill color", "#000000");
  await expectLayerCount(page, 2);

  const secondRectangle = await artboardPoint(page, 0.65, 0.5);
  const movedRectangle = {
    x: secondRectangle.x + 110,
    y: secondRectangle.y - 70
  };
  await page.mouse.move(secondRectangle.x, secondRectangle.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(movedRectangle.x, movedRectangle.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expectLayerCount(page, 3);
  const transparency = page
    .locator("label.inspector-value-range")
    .filter({ hasText: "Transparency" })
    .locator('input[type="range"]');
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
  await expectLayerCount(page, 3);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expectLayerCount(page, 3);
});

test("preserves an asset's rendered size when duplicating by modifier-drag", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await page.getByRole("button", { name: "Insert Cajal-Retzius Cell", exact: true }).click();
  await ensureEditorOpen(page);

  const dimensions = page.locator(".field-row.dimensions input");
  if ((await dimensions.count()) < 2) {
    await page
      .getByLabel("Editor tools")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
  }
  await expect(dimensions).toHaveCount(2);
  const originalWidth = Number(await dimensions.nth(0).inputValue());
  const originalHeight = Number(await dimensions.nth(1).inputValue());
  const center = await artboardPoint(page, 0.5, 0.5);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(center.x + 130, center.y - 80, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expectLayerCount(page, 2);
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
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await page.keyboard.press("Control+Z");
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.keyboard.press("Control+Shift+Z");
  await ensureLayersOpen(page);
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

test("fills the asset sidebar with the merged scientific catalog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const insertTabs = page.getByRole("tab");
  await expect(insertTabs).toHaveCount(3);
  for (const label of ["Assets", "Shapes", "Imports"]) {
    const tab = page.getByRole("tab", { name: label, exact: true });
    await expect(tab).toHaveAttribute("title", label);
    await expect(tab).toHaveText("");
  }

  await expect(page.getByRole("button", { name: "Favorites", exact: true })).toHaveClass(/active/);
  await page.getByRole("button", { name: "All", exact: true }).click();
  const visibleAssetTitles = page.locator(".asset-card-copy strong");
  await expect(visibleAssetTitles.nth(7)).toBeVisible();
  expect((await visibleAssetTitles.allTextContents()).slice(0, 8)).toEqual([
    "1cell Pn4 Zygote",
    "2c Embryo",
    "4c Embryo Style1",
    "4c Embryo Style2",
    "8c Embryo",
    "Activated Neutrophil",
    "Adipocyte 1",
    "Adipocyte 2"
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
  const sourceTrigger = firstAsset.getByRole("button", { name: /^Show source for / });
  await expect(sourceTrigger).toHaveCSS("opacity", "0");
  await firstAsset.hover();
  await expect(sourceTrigger).toHaveCSS("opacity", "1");
  await sourceTrigger.hover();
  const sourcePopover = page.locator(".asset-source-popover");
  await expect(sourcePopover).toBeVisible();
  await expect(sourcePopover.locator(".asset-source-kicker")).toHaveText("Source");
  await expect(sourcePopover.locator("strong")).toHaveText(/.+/);
  await expect(sourcePopover.locator(".asset-source-license")).toHaveText(/.+/);
  await expect(sourcePopover.getByRole("link", { name: /View source/ })).toHaveAttribute(
    "href",
    /^https?:\/\//
  );
  await expect(sourcePopover).toHaveCSS("position", "fixed");
  await expect(sourcePopover).toHaveCSS("z-index", "360");
  const sourcePopoverBounds = await sourcePopover.boundingBox();
  const viewport = page.viewportSize();
  expect(sourcePopoverBounds).not.toBeNull();
  expect(sourcePopoverBounds!.x).toBeGreaterThanOrEqual(0);
  expect(sourcePopoverBounds!.y).toBeGreaterThanOrEqual(0);
  expect(sourcePopoverBounds!.x + sourcePopoverBounds!.width).toBeLessThanOrEqual(viewport!.width);
  expect(sourcePopoverBounds!.y + sourcePopoverBounds!.height).toBeLessThanOrEqual(
    viewport!.height
  );
  await expect(firstAsset.locator(".asset-card-image")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );
  await expect(firstAsset.locator(".asset-card-image")).toHaveCSS("background-image", "none");
  const firstAssetPreview = firstAsset.locator(".asset-card-image img");
  await expect(firstAssetPreview).toHaveAttribute("data-preview-ready", "true");
  await expect(firstAssetPreview).toBeVisible();
  const previewInset = await firstAsset.locator(".asset-card-image").evaluate((button) => {
    const image = button.querySelector("img")!;
    const buttonBounds = button.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    return {
      widthRatio: imageBounds.width / buttonBounds.width,
      heightRatio: imageBounds.height / buttonBounds.height
    };
  });
  expect(previewInset.widthRatio).toBeLessThanOrEqual(0.9);
  expect(previewInset.heightRatio).toBeLessThanOrEqual(0.9);
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

test("reveals asset filters and filters catalog metadata", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const filterToggle = page.getByRole("button", { name: "Toggle asset filters" });
  await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
  await filterToggle.click();

  const filterPanel = page.getByRole("region", { name: "Asset filters" });
  await expect(filterPanel).toBeVisible();
  const filterTransitionProperties = await page
    .locator(".asset-filter-collapse")
    .evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(filterTransitionProperties).toContain("grid-template-rows");
  expect(filterTransitionProperties).toContain("opacity");
  expect(filterTransitionProperties).toContain("transform");
  expect(filterTransitionProperties).toContain("margin-top");
  for (const label of ["Filter by source", "Filter by variants"]) {
    await expect(filterPanel.getByRole("combobox", { name: label })).toBeVisible();
  }
  await filterPanel.getByRole("combobox", { name: "Filter by source" }).click();
  await expect(page.getByRole("option", { name: "BioIcons", exact: true })).toBeVisible();
  await expect(
    page.getByRole("option", { name: "BioIcons / Servier Medical Art", exact: true })
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  const search = page.getByPlaceholder("Search cells, proteins, equipment…");
  await search.fill("Neuron with dendritic spines");
  await selectUiOption(page, "Filter by source", "SciDraw");
  const neuron = page.locator(".asset-card").filter({ hasText: "Neuron with dendritic spines" });
  await expect(neuron).toBeVisible();
  await neuron.hover();
  await neuron
    .getByRole("button", { name: "Show source for Neuron with dendritic spines" })
    .hover();
  await expect(page.locator(".asset-source-popover")).toContainText("SciDraw");

  await selectUiOption(page, "Filter by source", "BioIcons");
  await expect(page.getByRole("heading", { name: "No match", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear asset filters" }).click();
  await expect(neuron).toBeVisible();

  await search.fill("Eosinophil");
  await selectUiOption(page, "Filter by variants", "Multiple variants");
  await expect(page.locator(".asset-card").filter({ hasText: "Eosinophil" }).first()).toBeVisible();
});

test("rapidly scrolls the complete symbols catalog without leaving blank thumbnails", async ({
  page
}) => {
  const fullBioIconRequests: string[] = [];
  const bioIconThumbnailRequests: string[] = [];
  let collectAssetRequests = false;
  page.on("request", (request) => {
    if (!collectAssetRequests) return;
    const url = request.url();
    if (/\/assets\/bioicons\/.*\.svg(?:\?|$)/.test(url)) fullBioIconRequests.push(url);
    if (/\/assets\/bioicons-thumbnails\/.*\.webp(?:\?|$)/.test(url)) {
      bioIconThumbnailRequests.push(url);
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  collectAssetRequests = true;
  await page.getByRole("button", { name: "Symbols & diagrams", exact: true }).click();

  const list = page.locator(".asset-list");
  await expect(list).toBeVisible();
  const scrollHeight = await list.evaluate((element) => element.scrollHeight);
  const clientHeight = await list.evaluate((element) => element.clientHeight);
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  // Reproduce a trackpad-style fling first: virtual rows are recycled several
  // times before any individual thumbnail has time to decode.
  await list.evaluate((element) => {
    for (let step = 0; step <= 24; step += 1) {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * (step / 24);
      element.dispatchEvent(new Event("scroll"));
    }
  });
  await expect
    .poll(() =>
      page.locator(".asset-card:visible").evaluateAll((cards) =>
        cards
          .filter((card) => {
            const list = card.closest(".asset-list");
            const image = card.querySelector<HTMLImageElement>("img");
            if (!list || !image) return true;
            const cardBounds = card.getBoundingClientRect();
            const listBounds = list.getBoundingClientRect();
            return (
              cardBounds.bottom > listBounds.top &&
              cardBounds.top < listBounds.bottom &&
              (!image.complete || image.naturalWidth === 0)
            );
          })
          .map((card) => card.querySelector("strong")?.textContent ?? "Unknown asset")
      )
    )
    .toEqual([]);

  for (let step = 0; step <= 16; step += 1) {
    await list.evaluate((element, ratio) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * ratio;
      element.dispatchEvent(new Event("scroll"));
    }, step / 16);
    await expect(page.locator(".asset-card").first()).toBeVisible();
    await expect
      .poll(() =>
        page.locator(".asset-card:visible").evaluateAll((cards) =>
          cards
            .filter((card) => {
              const list = card.closest(".asset-list");
              if (!list) return false;
              const cardBounds = card.getBoundingClientRect();
              const listBounds = list.getBoundingClientRect();
              const intersectsViewport =
                cardBounds.bottom > listBounds.top && cardBounds.top < listBounds.bottom;
              return (
                intersectsViewport &&
                card.querySelector("img")?.getAttribute("data-preview-ready") !== "true"
              );
            })
            .map((card) => card.querySelector("strong")?.textContent ?? "Unknown asset")
        )
      )
      .toEqual([]);
  }

  await expect(page.locator(".asset-card").last()).toBeVisible();
  expect(bioIconThumbnailRequests.length).toBeGreaterThan(0);
  expect(fullBioIconRequests).toEqual([]);
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
  await ensureEditorOpen(page);
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

test("embeds every selectable editor font in PDF output", async ({ page }) => {
  test.setTimeout(120_000);
  const fonts = [
    "Source Sans 3",
    "Inter",
    "Atkinson Hyperlegible",
    "IBM Plex Sans",
    "Lato",
    "Noto Sans",
    "Source Serif 4",
    "IBM Plex Serif",
    "Merriweather",
    "Noto Serif",
    "STIX Two Text",
    "Roboto Mono",
    "Georgia"
  ];

  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();

  const missingBrowserFaces = await page.evaluate(async (families) => {
    const coverageSamples: Record<string, string> = {
      "Atkinson Hyperlegible": "Zażółć gęślą",
      "IBM Plex Sans": "Γειά σου кириллица",
      "IBM Plex Serif": "Жизнь науки",
      Lato: "Zażółć gęślą",
      Merriweather: "Жизнь науки",
      "Noto Sans": "Γειά σου кириллица नमस्ते",
      "Noto Serif": "Γειά σου кириллица",
      "Roboto Mono": "Γειά σου кириллица"
    };
    const faces = families
      .filter((family) => family !== "Georgia")
      .flatMap((family) =>
        (["normal", "italic"] as const).flatMap((style) =>
          ([400, 600, 700] as const).map((weight) => ({ family, style, weight }))
        )
      );
    return (
      await Promise.all(
        faces.map(async ({ family, style, weight }) => {
          const descriptor = `${style} ${weight} 16px "${family}"`;
          await document.fonts.load(descriptor, coverageSamples[family] ?? "OpenSketch");
          return document.fonts.check(descriptor) ? null : descriptor;
        })
      )
    ).filter((descriptor): descriptor is string => descriptor !== null);
  }, fonts);
  expect(missingBrowserFaces).toEqual([]);

  for (const [index, font] of fonts.entries()) {
    await placeTool(page, "Text", index % 2 === 0 ? 0.25 : 0.75, 0.1 + index * 0.06);
    await page.keyboard.type(`PDF ${font}`);
    await page.keyboard.press("Escape");
    await ensureEditorOpen(page);
    await selectUiOption(page, "Font", font);
    await selectUiOption(page, "Weight", index % 2 === 0 ? "Regular" : "Bold");
    if (index === 2) {
      const italic = page.locator(".inspector-embedded .segmented-icons.text-style button").first();
      await italic.click();
      await expect(italic).toHaveClass(/active/);
    }
  }

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("tab", { name: /PDF/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const path = await (await downloadPromise).path();
  expect(path).not.toBeNull();
  const pdfBytes = await readFile(path!);
  const rawPdf = pdfBytes.toString("latin1");
  const expectedFamilies = new Set(fonts.map((font) => (font === "Georgia" ? "Noto Serif" : font)));
  for (const family of expectedFamilies) {
    const pdfName = family.replace(/ /g, "#20");
    expect(rawPdf).toContain(`/BaseFont /${pdfName}`);
  }
  expect(rawPdf).not.toContain("/BaseFont /Times");
});

test("embeds every selectable editor font face in PDF resources", async ({ page }) => {
  test.setTimeout(180_000);
  const fonts = [
    "Source Sans 3",
    "Inter",
    "Atkinson Hyperlegible",
    "IBM Plex Sans",
    "Lato",
    "Noto Sans",
    "Source Serif 4",
    "IBM Plex Serif",
    "Merriweather",
    "Noto Serif",
    "STIX Two Text",
    "Roboto Mono",
    "Georgia"
  ];

  await page.goto("/");
  const rawPdf = await page.evaluate(async (families) => {
    const combinations = [
      { weight: 400, style: "normal" },
      { weight: 600, style: "normal" },
      { weight: 700, style: "normal" },
      { weight: 400, style: "italic" },
      { weight: 600, style: "italic" },
      { weight: 700, style: "italic" }
    ];
    const textNodes = families
      .flatMap((family, familyIndex) =>
        combinations.map(({ weight, style }, combinationIndex) => {
          const y = 24 + (familyIndex * combinations.length + combinationIndex) * 18;
          return `<text x="12" y="${y}" font-family="${family}" font-size="12" font-style="${style}" font-weight="${weight}">${family} ${weight} ${style}</text>`;
        })
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1450">${textNodes}</svg>`;
    const moduleUrl = new URL("src/export/pdf.ts", document.baseURI).href;
    const { svgToPdfBlob } = await import(moduleUrl);
    const blob = await svgToPdfBlob(svg, 900, 1450, {
      title: "PDF font face matrix",
      description: "Every selectable OpenSketch text font face",
      credit: "OpenSketch",
      provenance: { version: 1, assets: [] }
    });
    return new TextDecoder("latin1").decode(await blob.arrayBuffer());
  }, fonts);

  const expectedFamilies = new Set(fonts.map((font) => (font === "Georgia" ? "Noto Serif" : font)));
  for (const family of expectedFamilies) {
    const pdfName = family.replace(/ /g, "#20");
    const resourceCount = rawPdf.split(`/BaseFont /${pdfName}`).length - 1;
    expect(resourceCount, `${family} face resources`).toBeGreaterThanOrEqual(6);
  }
  expect(rawPdf).not.toContain("/BaseFont /Times");
});

test("materializes imported PDF text styles and rejects unsafe glyph coverage", async ({
  page
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const moduleUrl = new URL("src/export/pdf.ts", document.baseURI).href;
    const { svgToPdfBlob } = await import(moduleUrl);
    const metadata = {
      title: "PDF text safety",
      description: "Imported text style and glyph safety",
      credit: "OpenSketch",
      provenance: { version: 1 as const, assets: [] }
    };
    const render = async (svg: string) => {
      try {
        const blob = await svgToPdfBlob(svg, 600, 240, metadata);
        return { error: null, pdf: new TextDecoder("latin1").decode(await blob.arrayBuffer()) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), pdf: "" };
      }
    };

    return {
      shorthand: await render(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240">
        <style>
          .parent { font-family: "Inter"; font-weight: 400; }
          .label { font: italic 600 18px "Inter" !important; }
          .relative { font-family: "Source Serif 4"; font-weight: bolder; font-style: oblique; }
        </style>
        <text class="label" x="12" y="40">Shorthand</text>
        <text class="parent" x="12" y="80"><tspan class="relative">Relative</tspan></text>
      </svg>`),
      stylesheetWins:
        await render(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240">
        <style>.label { font-family: "Lato"; }</style>
        <text class="label" font-family="Inter" x="12" y="40">Stylesheet wins</text>
      </svg>`),
      missingGlyph: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible">AΓB</text></svg>`
      ),
      missingInheritedGlyph: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><g font-family="Atkinson Hyperlegible"><text x="12" y="40">AΓB</text></g></svg>`
      ),
      missingMixedGlyph: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible">AΓ<tspan>B</tspan></text></svg>`
      ),
      hiddenGlyph: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><g style="visibility: hidden"><text x="12" y="40" font-family="Atkinson Hyperlegible">AΓB</text></g></svg>`
      ),
      collapsedText: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible" visibility="collapse"><tspan>AΓB</tspan></text></svg>`
      ),
      stylesheetPaintOverride: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><style>.visible { fill: black; }</style><text class="visible" x="12" y="40" font-family="Atkinson Hyperlegible" fill="none">CSS visible</text></svg>`
      ),
      stylesheetOpacityOverride: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible" opacity="0" style="opacity: 1">CSS visible</text></svg>`
      ),
      visibleDescendant: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible" visibility="hidden"><tspan visibility="visible">Γ</tspan></text></svg>`
      ),
      cdata: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Inter"><![CDATA[CDATA text]]></text></svg>`
      ),
      transparentGlyph: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><g opacity="0"><text x="12" y="40" font-family="Atkinson Hyperlegible">AΓB</text></g></svg>`
      ),
      missingTypographicSpace: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible">A\u2009B</text></svg>`
      ),
      standaloneTypographicSpace: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible">\u2009</text></svg>`
      ),
      complexScript: await render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Noto Sans">नमस्ते</text></svg>`
      )
    };
  });

  expect(result.shorthand.error).toBeNull();
  expect(result.shorthand.pdf).toContain("/BaseFont /Inter");
  expect(result.shorthand.pdf).toContain("/BaseFont /Source#20Serif#204");
  expect(result.shorthand.pdf).not.toContain("/BaseFont /Times");
  expect(result.stylesheetWins.error).toBeNull();
  expect(result.stylesheetWins.pdf).toContain("/BaseFont /Lato");
  expect(result.missingGlyph.error).toContain("U+0393");
  expect(result.missingGlyph.error).toContain("cannot render");
  expect(result.missingInheritedGlyph.error).toContain("U+0393");
  expect(result.missingInheritedGlyph.error).toContain("cannot render");
  expect(result.missingMixedGlyph.error).toContain("U+0393");
  expect(result.missingMixedGlyph.error).toContain("cannot render");
  expect(result.hiddenGlyph.error).toBeNull();
  expect(result.collapsedText.error).toBeNull();
  expect(result.collapsedText.pdf).not.toContain("/BaseFont /Times");
  expect(result.stylesheetPaintOverride.error).toBeNull();
  expect(result.stylesheetPaintOverride.pdf).toContain("/BaseFont /Atkinson#20Hyperlegible");
  expect(result.stylesheetPaintOverride.pdf).not.toContain("/BaseFont /Times");
  expect(result.stylesheetOpacityOverride.error).toBeNull();
  expect(result.stylesheetOpacityOverride.pdf).toContain("/BaseFont /Atkinson#20Hyperlegible");
  expect(result.stylesheetOpacityOverride.pdf).not.toContain("/BaseFont /Times");
  expect(result.visibleDescendant.error).toContain("U+0393");
  expect(result.cdata.error).toBeNull();
  expect(result.cdata.pdf).toContain("/BaseFont /Inter");
  expect(result.cdata.pdf).not.toContain("/BaseFont /Times");
  expect(result.transparentGlyph.error).toBeNull();
  expect(result.missingTypographicSpace.error).toContain("U+2009");
  expect(result.missingTypographicSpace.error).toContain("cannot render");
  expect(result.standaloneTypographicSpace.error).toContain("U+2009");
  expect(result.standaloneTypographicSpace.error).toContain("cannot render");
  expect(result.complexScript.error).toContain("cannot shape");
});

test("skips invisible PDF paint during glyph coverage", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const moduleUrl = new URL("src/export/pdf.ts", document.baseURI).href;
    const { svgToPdfBlob } = await import(moduleUrl);
    const metadata = {
      title: "Invisible PDF paint",
      description: "Invisible text should not require glyph coverage",
      credit: "OpenSketch",
      provenance: { version: 1 as const, assets: [] }
    };
    const render = async (svg: string) => {
      try {
        await svgToPdfBlob(svg, 600, 240, metadata);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    return {
      transparent: await render(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible" fill="transparent">AΓB</text></svg>'
      ),
      zeroFillOpacity: await render(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible" fill-opacity="0">AΓB</text></svg>'
      ),
      zeroStrokeWidth: await render(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible" fill="none" stroke="black" stroke-width="0">AΓB</text></svg>'
      ),
      visibleFillZeroStroke: await render(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Atkinson Hyperlegible" fill="black" stroke="black" stroke-width="0">AΓB</text></svg>'
      )
    };
  });

  expect(result.transparent).toBeNull();
  expect(result.zeroFillOpacity).toBeNull();
  expect(result.zeroStrokeWidth).toBeNull();
  expect(result.visibleFillZeroStroke).toContain("U+0393");
});

test("fetches only the PDF font face used by an SVG text run", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "fetch" && request.url().includes(".ttf")) {
      requests.push(request.url());
    }
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const moduleUrl = new URL("src/export/pdf.ts", document.baseURI).href;
    const { svgToPdfBlob } = await import(moduleUrl);
    await svgToPdfBlob(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><text x="12" y="40" font-family="Inter" font-weight="600" font-style="italic">Only one face</text></svg>`,
      600,
      240,
      {
        title: "PDF face loading",
        description: "Only the used PDF face",
        credit: "OpenSketch",
        provenance: { version: 1 as const, assets: [] }
      }
    );
  });

  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatch(/inter-600-italic\.ttf/);
});

test("waits for the selected browser font before exporting PDF", async ({ page }) => {
  test.setTimeout(120_000);
  const releaseDelayMs = 2_000;
  let fontRequestStartedAt = 0;
  let fontRequestReleasedAt = 0;

  await page.route(/noto-serif-latin-400-normal\.woff2(?:\?.*)?$/, async (route) => {
    fontRequestStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, releaseDelayMs));
    fontRequestReleasedAt = Date.now();
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await placeTool(page, "Text", 0.5, 0.5);
  await page.keyboard.type("Noto Serif race");
  await page.keyboard.press("Escape");
  await ensureEditorOpen(page);
  await selectUiOption(page, "Font", "Noto Serif");
  await expect.poll(() => fontRequestStartedAt).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("tab", { name: /PDF/ }).click();
  const exportStartedAt = Date.now();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const download = await downloadPromise;
  const downloadedAt = Date.now();

  expect(await download.path()).not.toBeNull();
  expect(fontRequestReleasedAt).toBeGreaterThanOrEqual(fontRequestStartedAt + releaseDelayMs);
  expect(downloadedAt).toBeGreaterThanOrEqual(fontRequestReleasedAt);
  expect(downloadedAt - exportStartedAt).toBeGreaterThanOrEqual(releaseDelayMs - 250);
});

test("waits for imported Fabric text fonts before exporting PDF", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Imports", exact: true }).click();

  await page.evaluate(() => {
    const calls: Array<{ descriptor: string; text: string }> = [];
    const fontSet = document.fonts as FontFaceSet & {
      __originalLoad?: FontFaceSet["load"];
    };
    const originalLoad = fontSet.load.bind(fontSet);
    fontSet.__originalLoad = originalLoad;
    fontSet.load = (descriptor: string, text?: string) => {
      calls.push({ descriptor, text: text ?? "" });
      return originalLoad(descriptor, text);
    };
    (window as typeof window & { __pdfFontLoadCalls?: typeof calls }).__pdfFontLoadCalls = calls;
  });

  await page.locator('input[type="file"][accept*="image/svg+xml"]').setInputFiles({
    name: "imported-text.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240"><text x="12" y="40" font-family="Noto Serif">Imported Γ text</text></svg>'
    )
  });
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("tab", { name: /PDF/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  expect(await (await downloadPromise).path()).not.toBeNull();

  const fontLoadCalls = await page.evaluate(() => {
    const calls = (
      window as typeof window & {
        __pdfFontLoadCalls?: Array<{ descriptor: string; text: string }>;
      }
    ).__pdfFontLoadCalls;
    return calls ?? [];
  });
  expect(fontLoadCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ descriptor: expect.stringContaining('"Noto Serif"') })
    ])
  );
  expect(fontLoadCalls.some(({ text }) => text === "Imported Γ text")).toBe(true);
});

test("preloads every text payload used by a PDF font face", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();

  await placeTool(page, "Text", 0.3, 0.35);
  await page.keyboard.type("Latin glyphs");
  await page.keyboard.press("Escape");
  await placeTool(page, "Text", 0.7, 0.65);
  await page.keyboard.type("Γειά σου");
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    const calls: Array<{ descriptor: string; text: string }> = [];
    const fontSet = document.fonts as FontFaceSet & {
      __originalLoad?: FontFaceSet["load"];
    };
    const originalLoad = fontSet.load.bind(fontSet);
    fontSet.__originalLoad = originalLoad;
    fontSet.load = (descriptor: string, text?: string) => {
      calls.push({ descriptor, text: text ?? "" });
      return originalLoad(descriptor, text);
    };
    (window as typeof window & { __pdfFontLoadCalls?: typeof calls }).__pdfFontLoadCalls = calls;
  });

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("tab", { name: /PDF/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  expect(await (await downloadPromise).path()).not.toBeNull();

  const fontLoadTexts = await page.evaluate(() => {
    const calls = (
      window as typeof window & {
        __pdfFontLoadCalls?: Array<{ descriptor: string; text: string }>;
      }
    ).__pdfFontLoadCalls;
    return (
      calls
        ?.filter(({ descriptor }) => descriptor.includes('"Source Sans 3"'))
        .map(({ text }) => text) ?? []
    );
  });
  expect(fontLoadTexts).toEqual(expect.arrayContaining(["Latin glyphs", "Γειά σου"]));
});

test("shows favorites only in a dedicated asset category", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const favoritesCategory = page.getByRole("button", { name: "Favorites", exact: true });
  await expect(favoritesCategory).toHaveClass(/active/);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveClass(/active/);
  const assetsTab = page.getByRole("tab", { name: "Assets", exact: true });
  await assetsTab.click();
  await assetsTab.click();
  await expect(page.getByRole("button", { name: "Favorites", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("heading", { name: "No match" })).toBeVisible();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("CD8 TCell");
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveClass(/active/);

  const assetTitles = page.locator(".asset-card-copy strong");
  const cd8 = page.locator(".asset-card").filter({ hasText: "CD8 TCell" }).first();
  await cd8.hover();
  await cd8.getByRole("button", { name: "Toggle favorite" }).click();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(assetTitles.first()).not.toHaveText("CD8 TCell");
  await expect(page.locator(".asset-results-meta")).toHaveCount(0);

  await page.getByRole("button", { name: "Cells", exact: true }).click();
  await expect(assetTitles.first()).not.toHaveText("CD8 TCell");

  await favoritesCategory.click();
  await expect(assetTitles.first()).toHaveText("CD8 TCell");
  const pinnedCd8 = page.locator(".asset-card").filter({ hasText: "CD8 TCell" }).first();
  await pinnedCd8.hover();
  await pinnedCd8.getByRole("button", { name: "Toggle favorite" }).click();
  await expect(page.getByRole("heading", { name: "No match" })).toBeVisible();
});

test("preserves an asset search after inserting artwork and reopening Assets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const search = page.getByPlaceholder("Search cells, proteins, equipment…");
  await search.fill("Cajal-Retzius Cell");
  const matchingAsset = page
    .locator(".asset-card")
    .filter({ hasText: "Cajal-Retzius Cell" })
    .first();
  await expect(matchingAsset).toBeVisible();
  await matchingAsset.locator(".asset-card-image").click();
  await expect(page.locator(".layers-title small")).toHaveText("1");

  const assetsTab = page.getByRole("tab", { name: "Assets", exact: true });
  await assetsTab.click();
  await expect(search).toHaveCount(0);
  await assetsTab.click();

  const reopenedSearch = page.getByPlaceholder("Search cells, proteins, equipment…");
  await expect(reopenedSearch).toBeFocused();
  await expect(reopenedSearch).toHaveValue("Cajal-Retzius Cell");
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveClass(/active/);
  await expect(
    page.locator(".asset-card").filter({ hasText: "Cajal-Retzius Cell" }).first()
  ).toBeVisible();
});

test("preserves asset filters after closing and reopening Assets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const filterToggle = page.getByRole("button", { name: "Toggle asset filters" });
  await filterToggle.click();
  await selectUiOption(page, "Filter by source", "SciDraw");
  await selectUiOption(page, "Filter by variants", "Multiple variants");

  const assetsTab = page.getByRole("tab", { name: "Assets", exact: true });
  await assetsTab.click();
  await expect(page.getByPlaceholder("Search cells, proteins, equipment…")).toHaveCount(0);
  await assetsTab.click();

  const activePanel = page.locator(".sidebar-expanded:not(.motion-presence-closing)");
  await expect(activePanel.getByRole("button", { name: "Toggle asset filters" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(activePanel.getByRole("combobox", { name: "Filter by source" })).toContainText(
    "SciDraw"
  );
  await expect(activePanel.getByRole("combobox", { name: "Filter by variants" })).toContainText(
    "Multiple variants"
  );
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
    "Cancer & pathology",
    "Immunology & blood",
    "Cell components",
    "Proteins",
    "Molecules",
    "Nucleic acids & genetics",
    "Cellular processes",
    "Tissues & histology",
    "Equipment",
    "Techniques & assays",
    "Bacteria",
    "Viruses",
    "Parasites",
    "Fungi & protists",
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

  await page.getByRole("button", { name: "Tissues & histology", exact: true }).click();
  await search.fill("Chicken retina");
  await expect(page.locator(".asset-card").filter({ hasText: "Chicken retina" })).toBeVisible();

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
  await page.getByRole("button", { name: "Toggle asset filters" }).click();
  await selectUiOption(page, "Filter by source", "NIH BioArt");
  const dendriticCell = page.locator(".asset-card").filter({ hasText: "Dendritic Cell" }).first();
  await expect(dendriticCell).toBeVisible();
  await dendriticCell.hover();
  await dendriticCell.getByRole("button", { name: "Show source for Dendritic Cell" }).hover();
  await expect(page.locator(".asset-source-popover strong")).toHaveText("NIH BioArt");
  const insert = dendriticCell.locator(".asset-card-image");
  await insert.click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  const dendriticCenter = await artboardPoint(page);
  await page.mouse.click(dendriticCenter.x, dendriticCenter.y, { button: "right" });
  const dendriticMenu = page.getByRole("menu", { name: "Dendritic Cell actions" });
  await expect(dendriticMenu.getByRole("menuitem", { name: "Ungroup" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.dblclick(dendriticCenter.x, dendriticCenter.y);
  await expect(page.getByRole("status").filter({ hasText: "Editing a group" })).toHaveCount(0);

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

  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("ControlOrMeta+D");
  }
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("5", { timeout: 30_000 });
  const projectId = await page.evaluate(
    () => (history.state as Record<string, string> | null)?.OpenSketchProjectId
  );
  expect(projectId).toBeTruthy();

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) =>
            new Promise<number>((resolve, reject) => {
              const request = indexedDB.open("OpenSketch");
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const transaction = request.result.transaction("projects", "readonly");
                const project = transaction.objectStore("projects").get(id);
                project.onerror = () => reject(project.error);
                project.onsuccess = () => resolve(project.result?.objects?.objects?.length ?? 0);
                transaction.oncomplete = () => request.result.close();
              };
            }),
          projectId
        ),
      { timeout: 10_000 }
    )
    .toBe(5);
  const persistedArtwork = await page.evaluate(
    (id) =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("OpenSketch");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction("projects", "readonly");
          const project = transaction.objectStore("projects").get(id);
          project.onerror = () => reject(project.error);
          project.onsuccess = () => resolve(JSON.stringify(project.result?.objects ?? {}));
          transaction.oncomplete = () => request.result.close();
        };
      }),
    projectId
  );
  expect(persistedArtwork).toContain("#f9bfc3");
  expect(persistedArtwork).toContain("#84503b");
});

test("treats a bundled biological SVG as one atomic canvas object", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("T Cell");
  await page.getByRole("button", { name: "Insert T Cell", exact: true }).first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("T Cell");
  await expect(page.getByRole("button", { name: "Ungroup", exact: true })).toHaveCount(0);
  const center = await artboardPoint(page);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByRole("status").filter({ hasText: "Editing a group" })).toHaveCount(0);
  await expect(page.getByText("Edit individual parts", { exact: true })).toHaveCount(0);
  await ensureLayersOpen(page);
  await expect(page.locator(".layer-list > button").filter({ hasText: "T Cell" })).toHaveCount(1);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  const restoredCenter = await artboardPoint(page);
  await page.mouse.click(restoredCenter.x, restoredCenter.y);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".inspector-header h2")).toHaveText("T Cell");
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
  await page.getByRole("button", { name: "Edit", exact: true }).click();

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
  await expect(page.locator(".asset-card")).toHaveCount(1);
  const insertAsset = page.getByRole("button", {
    name: "Insert Cajal-Retzius Cell",
    exact: true
  });
  const assetCard = page.locator(".asset-card").filter({ hasText: "Cajal-Retzius Cell" }).first();
  const assetPreview = assetCard.locator(".asset-card-image");
  const assetPreviewImage = assetPreview.locator("img");
  await expect(assetPreview).toBeVisible();
  await expect(assetPreviewImage).toHaveAttribute("src", /\.webp$/);
  await expect
    .poll(
      () =>
        assetPreviewImage.evaluate(
          (image: HTMLImageElement) =>
            image.complete && image.naturalWidth === 256 && image.naturalHeight === 256
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  const originalPreviewSource = await assetPreviewImage.getAttribute("src");
  const originalPreviewBounds = await assetPreview.boundingBox();
  expect(originalPreviewBounds).not.toBeNull();
  await insertAsset.click();
  await ensureEditorOpen(page);

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
  await expect
    .poll(async () => {
      const savedPreviewBounds = await assetPreview.boundingBox();
      if (!savedPreviewBounds || !originalPreviewBounds) return false;
      return (
        Math.abs(savedPreviewBounds.width - originalPreviewBounds.width) < 1.1 &&
        Math.abs(savedPreviewBounds.height - originalPreviewBounds.height) < 1.1
      );
    })
    .toBe(true);

  await insertAsset.click();
  await ensureEditorOpen(page);
  await expect(transparency).toHaveValue("40");
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(savedWidth, 0);

  await page.mouse.click(center.x, center.y, { button: "right" });
  await page
    .getByRole("menu", { name: "Cajal-Retzius Cell actions" })
    .getByRole("menuitem", { name: "Reset styling" })
    .click();
  await ensureEditorOpen(page);
  await expect(transparency).toHaveValue("0");
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(originalWidth, 0);
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Cajal-Retzius Cell");
  await expect(assetPreviewImage).toHaveAttribute("src", originalPreviewSource ?? "");

  await insertAsset.click();
  await ensureEditorOpen(page);
  await expect(transparency).toHaveValue("0");
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(originalWidth, 0);
});

test("renders every styled eosinophil part in a stable sidebar preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Eosinophil");
  const eosinophilCard = page
    .locator(".asset-card")
    .filter({ has: page.getByRole("combobox", { name: "Eosinophil variant" }) })
    .first();
  const previewImage = eosinophilCard.locator("img");
  await eosinophilCard.locator(".asset-card-image").click();
  await ensureEditorOpen(page);
  const variantGrid = page
    .locator(".inspector-embedded")
    .getByRole("listbox", { name: "Eosinophil variants" });
  await expect(variantGrid).toBeVisible();
  await expect(page.getByText("Color presets", { exact: true })).toHaveCount(0);
  await variantGrid.getByRole("option", { name: "Select Eosinophil variant 2" }).click();

  const center = await artboardPoint(page);
  await page.mouse.click(center.x, center.y, { button: "right" });
  await page
    .getByRole("menu", { name: "Eosinophil actions" })
    .getByRole("menuitem", { name: "Save styling" })
    .click();
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Eosinophil");
  await expect
    .poll(() => previewImage.getAttribute("src"), { timeout: 15_000 })
    .toMatch(/^data:image\/png/);
  await expect
    .poll(
      () =>
        previewImage.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth === 448
        ),
      { timeout: 15_000 }
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
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 100, center.y + 45, { steps: 25 });
  await page.mouse.up();
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("Eosinophil");
  await expect(previewImage).toHaveAttribute("src", styledSource ?? "");
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

  const restoredCenter = await artboardPoint(page);
  await page.mouse.click(restoredCenter.x, restoredCenter.y);
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(
    page.locator(".layer-list button").filter({ hasText: "Dendritic Cell" })
  ).toHaveCount(1);
});

test("keeps the latest project edits recoverable when autosave fails", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    Object.defineProperty(window, "__opensketchOriginalProjectPut", {
      configurable: true,
      value: originalPut
    });
    IDBObjectStore.prototype.put = new Proxy(originalPut, {
      apply(target, thisArg, args) {
        if ((thisArg as IDBObjectStore).name === "projects") {
          throw new DOMException("The project store is full", "QuotaExceededError");
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
  });

  await placeTool(page, "Rectangle");
  const errorStatus = page.locator('[data-save-state="error"]');
  await expect(errorStatus).toBeVisible();
  await expect(errorStatus).toContainText("browser storage is full");
  await expect(errorStatus.getByRole("button", { name: "Retry save" })).toBeVisible();

  const title = page.getByLabel("Document title");
  await title.fill("Draft figure");
  await expect(title).toHaveValue("Draft figure");
  await expect(errorStatus).toBeVisible();

  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await page.evaluate(() => {
    const originalRead = FileReader.prototype.readAsDataURL;
    const target = window as typeof window & {
      __opensketchOriginalReadAsDataURL?: typeof originalRead;
    };
    Object.defineProperty(target, "__opensketchOriginalReadAsDataURL", {
      configurable: true,
      value: originalRead
    });
    FileReader.prototype.readAsDataURL = function (this: FileReader, blob: Blob) {
      window.setTimeout(() => originalRead.call(this, blob), 1200);
    };
  });
  await page
    .locator('input[type="file"][accept*="image/svg+xml"]')
    .setInputFiles("tests/fixtures/nested-groups.svg");
  await expect(errorStatus).toBeVisible();

  const guarded = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(guarded).toBe(true);

  await page.goBack();
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projects" })).toHaveCount(0);

  const recoveryDownload = page.waitForEvent("download");
  await errorStatus.getByRole("button", { name: "Export recovery copy" }).click();
  const recovery = await recoveryDownload;
  expect(recovery.suggestedFilename()).toMatch(/draft-figure\.OpenSketch$/i);
  const recoveryPath = await recovery.path();
  expect(recoveryPath).not.toBeNull();
  const recoveryProject = JSON.parse(await readFile(recoveryPath!, "utf8")) as {
    name?: string;
    objects?: { objects?: unknown[] };
  };
  expect(recoveryProject.name).toBe("Draft figure");
  expect(recoveryProject.objects?.objects).toHaveLength(2);

  await page.evaluate(() => {
    const target = window as typeof window & {
      __opensketchOriginalReadAsDataURL?: typeof FileReader.prototype.readAsDataURL;
    };
    const originalRead = target.__opensketchOriginalReadAsDataURL;
    if (!originalRead) throw new Error("The original FileReader method was not captured.");
    FileReader.prototype.readAsDataURL = originalRead;
  });

  await page.getByRole("button", { name: "Back to projects" }).click();
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projects" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to projects" })).toBeEnabled();

  await page.evaluate(() => {
    const target = window as typeof window & {
      __opensketchOriginalProjectPut?: typeof IDBObjectStore.prototype.put;
    };
    const originalPut = target.__opensketchOriginalProjectPut;
    if (!originalPut) throw new Error("The original project save method was not captured.");
    IDBObjectStore.prototype.put = originalPut;
  });
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();

  const unguarded = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(unguarded).toBe(false);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("restores the current history entry when legacy unsaved Forward traversal is blocked", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30_000 });

  const currentProjectId = await page.evaluate(
    () => (history.state as Record<string, string> | null)?.OpenSketchProjectId
  );
  const currentHistoryIndex = await page.evaluate(
    () => (history.state as Record<string, number> | null)?.OpenSketchHistoryIndex
  );
  if (!currentProjectId || typeof currentHistoryIndex !== "number") {
    throw new Error("The active project history entry was not initialized.");
  }

  await page.evaluate(() => {
    const state = history.state as Record<string, unknown> | null;
    const legacyState = { ...(state ?? {}) };
    delete legacyState.OpenSketchHistoryIndex;
    history.pushState(
      {
        ...legacyState,
        OpenSketchProjectId: "forward-target"
      },
      "",
      window.location.href
    );
  });
  await page.goBack();
  await expect(page.locator(".editor-shell")).toBeVisible();

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    const target = window as typeof window & {
      __opensketchOriginalProjectPut?: typeof originalPut;
    };
    Object.defineProperty(target, "__opensketchOriginalProjectPut", {
      configurable: true,
      value: originalPut
    });
    IDBObjectStore.prototype.put = new Proxy(originalPut, {
      apply(target, thisArg, args) {
        if ((thisArg as IDBObjectStore).name === "projects") {
          throw new DOMException("The project store is full", "QuotaExceededError");
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
  });

  await placeTool(page, "Rectangle");
  await expect(page.locator('[data-save-state="error"]')).toBeVisible();
  await page.goForward();
  await expect
    .poll(() =>
      page.evaluate(() => (history.state as Record<string, string> | null)?.OpenSketchProjectId)
    )
    .toBe(currentProjectId);
  await expect(page.locator(".editor-shell")).toBeVisible();
});

test("guards browser exit while an image import is still processing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Imports", exact: true }).click();

  await page.evaluate(() => {
    const originalRead = FileReader.prototype.readAsDataURL;
    const target = window as typeof window & {
      __opensketchOriginalReadAsDataURL?: typeof originalRead;
    };
    Object.defineProperty(target, "__opensketchOriginalReadAsDataURL", {
      configurable: true,
      value: originalRead
    });
    FileReader.prototype.readAsDataURL = function (this: FileReader, blob: Blob) {
      window.setTimeout(() => originalRead.call(this, blob), 1200);
    };
  });

  const importInput = page.locator('input[type="file"][accept*="image/svg+xml"]');
  await importInput.setInputFiles("tests/fixtures/nested-groups.svg");
  await importInput.setInputFiles("tests/fixtures/nested-groups.svg");
  await expect(page.locator('[data-save-state="saving"]')).toBeVisible();

  const guarded = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(guarded).toBe(true);

  await expect(page.locator(".layers-title small")).toHaveText("1");
  await expect(page.locator('[data-save-state="saving"]')).toBeVisible();

  await page.evaluate(() => {
    const target = window as typeof window & {
      __opensketchOriginalReadAsDataURL?: typeof FileReader.prototype.readAsDataURL;
    };
    const originalRead = target.__opensketchOriginalReadAsDataURL;
    if (!originalRead) throw new Error("The original FileReader method was not captured.");
    FileReader.prototype.readAsDataURL = originalRead;
  });
  await expect(page.locator(".layers-title small")).toHaveText("2");
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();

  const unguarded = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(unguarded).toBe(false);
});

test("exports an atomic SVG asset with its vector parts intact", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByPlaceholder("Search cells, proteins, equipment…").fill("dendritic");
  const dendriticCell = page.locator(".asset-card").filter({ hasText: "Dendritic Cell" }).first();
  await expect(dendriticCell.locator("img")).toHaveAttribute("data-preview-ready", "true");
  await dendriticCell.locator(".asset-card-image").click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText("Edit individual parts", { exact: true })).toHaveCount(0);
  await expect(page.locator(".inspector-header h2")).toHaveText("Dendritic Cell");
  await expect(page.locator(".inspector-header .eyebrow")).toHaveCount(0);

  const center = await artboardPoint(page);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByText("Inside Dendritic Cell", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Editing a group" })).toHaveCount(0);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByLabel("Project actions for Untitled figure").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project" }).click();
  const projectPath = await (await downloadPromise).path();
  expect(projectPath).not.toBeNull();
  type SerializedObject = {
    OpenSketchType?: string;
    assetId?: string;
    fill?: unknown;
    path?: unknown;
    objects?: SerializedObject[];
  };
  const portable = JSON.parse(await readFile(projectPath!, "utf8")) as {
    objects: {
      objects: SerializedObject[];
    };
  };
  const exportedAsset = portable.objects.objects[0];
  expect(exportedAsset.OpenSketchType).toBe("nih-asset");
  expect(exportedAsset.assetId).toBeTruthy();
  const descendants = (object: SerializedObject): SerializedObject[] => [
    object,
    ...(object.objects?.flatMap(descendants) ?? [])
  ];
  const vectorObjects = descendants(exportedAsset);
  expect(vectorObjects.length).toBeGreaterThan(2);
  expect(
    vectorObjects.some(
      (part) => (typeof part.fill === "string" && part.fill !== "") || Array.isArray(part.path)
    )
  ).toBe(true);
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
  await placeTool(page, "Rectangle", 0.25, 0.25);
  for (let index = 1; index < 100; index += 1) {
    await page.keyboard.press("ControlOrMeta+D");
  }
  await ensureLayersOpen(page);
  await expect(page.locator(".layers-title small")).toHaveText("100");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expectLayerCount(page, 100);
});
