import { expect, test } from "@playwright/test";

async function pasteImage(page: import("@playwright/test").Page, mimeType: string) {
  await page.evaluate(async (type) => {
    let file: File;
    if (type === "image/svg+xml") {
      file = new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><rect x="4" y="4" width="72" height="52" rx="8" fill="#62c7b7"/><circle cx="40" cy="30" r="14" fill="#173e3b"/></svg>'
        ],
        "external-diagram.svg",
        { type }
      );
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = 12;
      canvas.height = 8;
      const context = canvas.getContext("2d")!;
      context.fillStyle = type === "image/png" ? "#ef5f79" : "#2d74ad";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((value) => resolve(value!), type, 0.92)
      );
      file = new File([blob], type === "image/png" ? "external-image.png" : "external-photo.jpg", {
        type
      });
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", { value: transfer });
    window.dispatchEvent(pasteEvent);
  }, mimeType);
}

test("stores imported media permanently and pastes SVG, PNG, and JPEG from the clipboard", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator(".upper-canvas")).toBeVisible();

  for (const [index, mimeType] of ["image/svg+xml", "image/png", "image/jpeg"].entries()) {
    await pasteImage(page, mimeType);
    await expect(page.locator(".layers-title small")).toHaveText(String(index + 1));
  }

  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  const library = page.getByLabel("Imported media library");
  await expect(library.locator(".import-library-card")).toHaveCount(3);
  await expect(library).toContainText("Clipboard SVG.svg");
  await expect(library).toContainText("Clipboard image.png");
  await expect(library).toContainText("Clipboard image.jpg");
  await library.getByRole("button", { name: "Insert Clipboard SVG.svg" }).click();
  await expect(page.locator(".layers-title small")).toHaveText("4");

  await pasteImage(page, "image/svg+xml");
  await expect(page.locator(".layers-title small")).toHaveText("5");
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await expect(
    page.getByLabel("Imported media library").locator(".import-library-card")
  ).toHaveCount(3);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("OpenSketch");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("imports", "readonly");
        const request = transaction.objectStore("imports").count();
        const count = await new Promise<number>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return count;
      })
    )
    .toBe(3);

  await page.getByRole("button", { name: "New figure" }).click();
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await expect(
    page.getByLabel("Imported media library").locator(".import-library-card")
  ).toHaveCount(3);
});
