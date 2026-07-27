import { expect, test } from "@playwright/test";

test("reopens the production app and a saved project while offline", async ({ context, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
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
  await expect(page.locator(".layers-title small")).toHaveText("1");
});
