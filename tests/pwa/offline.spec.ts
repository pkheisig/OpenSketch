import { expect, test } from "@playwright/test";

test("reopens the production app and a saved project while offline", async ({ context, page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "New figure" })).toBeVisible();

  await page.getByRole("button", { name: "Create blank figure" }).click();
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(page.getByText("Saved locally")).toBeVisible({ timeout: 5_000 });
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
