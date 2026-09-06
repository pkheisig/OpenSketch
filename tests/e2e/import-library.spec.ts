import { expect, test } from "@playwright/test";

async function pasteImage(
  page: import("@playwright/test").Page,
  mimeType: string,
  targetSelector?: string
) {
  await page.evaluate(
    async ({ type, targetSelector }) => {
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
        file = new File(
          [blob],
          type === "image/png" ? "external-image.png" : "external-photo.jpg",
          {
            type
          }
        );
      }
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEvent, "clipboardData", { value: transfer });
      (targetSelector ? document.querySelector(targetSelector) : window)?.dispatchEvent(pasteEvent);
    },
    { type: mimeType, targetSelector }
  );
}

async function dropSvgFile(page: import("@playwright/test").Page) {
  await page.locator(".canvas-workspace").evaluate((element) => {
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="5" y="5" width="110" height="70" rx="12" fill="#d6b6ff"/><path d="M22 40h76" stroke="#44296e" stroke-width="8"/></svg>'
      ],
      "dragged-diagram.svg",
      { type: "" }
    );
    const transfer = new DataTransfer();
    transfer.items.add(file);
    for (const type of ["dragover", "drop"]) {
      element.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientX: 420,
          clientY: 320
        })
      );
    }
  });
}

async function pasteEmbeddedPng(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 10;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f5a742";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const transfer = new DataTransfer();
    transfer.setData("text/html", `<img alt="copied experiment" src="${dataUrl}">`);
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", { value: transfer });
    document.querySelector('input[aria-label="Document title"]')?.dispatchEvent(pasteEvent);
  });
}

test("@smoke stores imported media permanently and pastes SVG, PNG, and JPEG from the clipboard", async ({
  page
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("menuitem", { name: "Figure", exact: true }).click();
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
  await expect(
    page.getByLabel("Imported media library").locator(".import-library-card")
  ).toHaveCount(3);

  await page.getByRole("button", { name: "Back to projects" }).click();
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
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

  const savedProject = page.getByRole("button", { name: /^Untitled figure / });
  await expect(savedProject).toBeVisible();
  await savedProject.dispatchEvent("click");
  await expect(page.locator(".upper-canvas")).toBeVisible();
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await expect(
    page.getByLabel("Imported media library").locator(".import-library-card")
  ).toHaveCount(3);
});

test("accepts image paste while a text input is focused and SVG files dropped from the desktop", async ({
  page
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("menuitem", { name: "Figure", exact: true }).click();
  await expect(page.locator(".upper-canvas")).toBeVisible();

  const title = page.getByRole("textbox", { name: "Document title" });
  await title.focus();
  await pasteImage(page, "image/png", 'input[aria-label="Document title"]');
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await pasteEmbeddedPng(page);
  await expect(page.locator(".layers-title small")).toHaveText("2");

  await dropSvgFile(page);
  await expect(page.locator(".layers-title small")).toHaveText("3");

  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  const library = page.getByLabel("Imported media library");
  await expect(library.locator(".import-library-card")).toHaveCount(3);
  await expect(library).toContainText("Clipboard image.png");
  await expect(library).toContainText("dragged-diagram.svg");
});
