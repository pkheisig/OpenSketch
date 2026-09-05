import { expect, test } from "@playwright/test";

test("keeps the complete asset library behind explicit offline preparation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();

  const offlineLibrary = page.getByRole("region", { name: "Offline asset library" });
  await expect(offlineLibrary).toContainText("Not prepared for offline use");
  await expect(
    offlineLibrary.getByRole("button", { name: "Prepare offline library" })
  ).toBeVisible();

  const cachedLibraryNames = await page.evaluate(() => caches.keys());
  expect(cachedLibraryNames).not.toContain("opensketch-asset-sources");
  expect(cachedLibraryNames).not.toContain("opensketch-asset-previews");
});

test("reopens the production app and a saved project while offline", async ({ context, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const shapeMenu = page.getByRole("menu", { name: "Shape tools" });
  await shapeMenu.getByRole("menuitem", { name: /Shapes/ }).hover();
  await shapeMenu.getByRole("menuitem", { name: "Rectangle", exact: true }).click();
  const artboard = await page.locator(".artboard-stage").boundingBox();
  if (!artboard) throw new Error("Artboard is not visible.");
  await page.mouse.click(artboard.x + artboard.width / 2, artboard.y + artboard.height / 2);
  await page.getByRole("button", { name: "Back to projects" }).click();

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true
        });
      });
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "Untitled figure" }).click();
  await expect(page.getByLabel("OpenSketch figure artboard")).toBeVisible();
  const reopenedArtboard = await page.locator(".artboard-stage").boundingBox();
  if (!reopenedArtboard) throw new Error("Reopened artboard is not visible.");
  await page.mouse.click(
    reopenedArtboard.x + reopenedArtboard.width / 2,
    reopenedArtboard.y + reopenedArtboard.height / 2
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".layers-title small")).toHaveText("1");
});

test("keeps an active production editing session open across an offline reload", async ({
  context,
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true
        });
      });
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await expect(page.locator(".home-shell")).toHaveCount(0);
});

test("exports text-bearing PDFs offline from a runtime-cached font face", async ({
  context,
  page
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true
        });
      });
    }
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.offlineReady ?? null))
    .toBe("true");

  // The editor proactively warms the PDF face used by the current project while
  // online so a later offline export does not depend on a prior export.
  const fontResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("source-sans-3-400-normal") && response.url().endsWith(".ttf")
  );
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByLabel("Editor tools").getByRole("button", { name: "Text", exact: true }).click();
  const onlineArtboard = await page.locator(".artboard-stage").boundingBox();
  if (!onlineArtboard) throw new Error("Artboard is not visible.");
  await page.mouse.click(
    onlineArtboard.x + onlineArtboard.width / 2,
    onlineArtboard.y + onlineArtboard.height / 2
  );
  await page.keyboard.type("Offline PDF text");
  await page.keyboard.press("Escape");
  await page.getByLabel("Editor tools").getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("combobox", { name: "Font" }).click();
  await page.getByRole("option", { name: "Source Sans 3", exact: true }).click();
  expect((await fontResponsePromise).fromServiceWorker()).toBe(true);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".editor-shell")).toBeVisible();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("tab", { name: /PDF/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  expect(await (await downloadPromise).path()).not.toBeNull();
});
