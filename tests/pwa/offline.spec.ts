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
