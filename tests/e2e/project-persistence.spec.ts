import { expect, test, type Page } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lm9ZAAAAAElFTkSuQmCC",
  "base64"
);

type StoredProject = {
  id: string;
  kind: string;
  name: string;
  revision: number;
  objectCount: number;
  objects: { objects?: Array<Record<string, unknown>> };
  uploads: Array<{ id: string; dataUrl: string }>;
};

async function readProject(page: Page, projectId: string): Promise<StoredProject | null> {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("OpenSketch");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const project = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
      const request = database.transaction("projects", "readonly").objectStore("projects").get(id);
      request.onsuccess = () =>
        resolve((request.result as Record<string, unknown> | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (!project) return null;
    const objects = (project.objects as { objects?: Array<Record<string, unknown>> }) ?? {};
    const uploads = (project.uploads as Array<{ id: string; dataUrl: string }> | undefined) ?? [];
    return {
      id: String(project.id),
      kind: String(project.kind ?? "diagram"),
      name: String(project.name),
      revision: Number(project.revision ?? 0),
      objectCount: objects.objects?.length ?? 0,
      objects,
      uploads
    };
  }, projectId);
}

async function readProjects(page: Page): Promise<StoredProject[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("OpenSketch");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const projects = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = database.transaction("projects", "readonly").objectStore("projects").getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return projects.map((project) => {
      const objects = (project.objects as { objects?: Array<Record<string, unknown>> }) ?? {};
      return {
        id: String(project.id),
        kind: String(project.kind ?? "diagram"),
        name: String(project.name),
        revision: Number(project.revision ?? 0),
        objectCount: objects.objects?.length ?? 0,
        objects,
        uploads: (project.uploads as Array<{ id: string; dataUrl: string }> | undefined) ?? []
      };
    });
  });
}

async function publishRemoteRevision(page: Page, projectId: string) {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("OpenSketch");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("projects", "readwrite");
    const store = transaction.objectStore("projects");
    const current = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) reject(new Error("Project was not found."));
        else resolve(request.result as Record<string, unknown>);
      };
      request.onerror = () => reject(request.error);
    });
    const revision = Number(current.revision ?? 0) + 1;
    current.name = "Remote revision";
    current.revision = revision;
    current.updatedAt = new Date().toISOString();
    store.put(current);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();

    const notice = { projectId: id, revision, sourceId: "playwright-peer" };
    localStorage.setItem("OpenSketch:project-change", JSON.stringify(notice));
    const channel = new BroadcastChannel("OpenSketch:project-changed");
    channel.postMessage(notice);
    channel.close();
    return revision;
  }, projectId);
}

async function publishRemoteDeletion(page: Page, projectId: string) {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("OpenSketch");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("projects", "readwrite");
    const store = transaction.objectStore("projects");
    const current = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) reject(new Error("Project was not found."));
        else resolve(request.result as Record<string, unknown>);
      };
      request.onerror = () => reject(request.error);
    });
    const revision = Number(current.revision ?? 0) + 1;
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();

    const notice = { projectId: id, revision, sourceId: "playwright-peer", deleted: true };
    localStorage.setItem("OpenSketch:project-change", JSON.stringify(notice));
    const channel = new BroadcastChannel("OpenSketch:project-changed");
    channel.postMessage(notice);
    channel.close();
    return revision;
  }, projectId);
}

async function addRectangle(page: Page) {
  await page.getByRole("tab", { name: "Shapes", exact: true }).click();
  const shapeMenu = page.getByRole("menu", { name: "Shape tools" });
  await shapeMenu.getByRole("menuitem", { name: "Shapes", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Rectangle", exact: true }).click();
  const bounds = await page.locator(".artboard-stage").boundingBox();
  if (!bounds) throw new Error("Artboard is not visible.");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.getByRole("button", { name: "Arrange" })).toBeVisible();
}

async function startProject(page: Page, kind = "Figure") {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("menuitem", { name: kind, exact: true }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  const projectId = await page.evaluate(
    () => (history.state as Record<string, unknown> | null)?.OpenSketchProjectId
  );
  if (typeof projectId !== "string") throw new Error("The project id was not recorded.");
  return projectId;
}

async function readProjectTemplates(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("OpenSketch");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const templates = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = database
        .transaction("projectTemplates", "readonly")
        .objectStore("projectTemplates")
        .getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return templates;
  });
}

test("@smoke creates all document modes with portable kinds", async ({ page }) => {
  for (const [label, expectedKind] of [
    ["Diagram", "diagram"],
    ["Figure", "figure"],
    ["Poster", "poster"]
  ] as const) {
    const projectId = await startProject(page, label);
    await expect.poll(async () => (await readProject(page, projectId))?.kind).toBe(expectedKind);
    await page.getByRole("button", { name: "Back to projects" }).click();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  }
});

test("@smoke saves a live project as a validated project template", async ({ page }) => {
  const projectId = await startProject(page, "Figure");
  await page.getByRole("button", { name: /^Export/ }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export figure" });
  await exportDialog.locator("summary").click();
  const prompt = page.waitForEvent("dialog");
  await exportDialog.getByRole("button", { name: "Save as template" }).click();
  const nativeDialog = await prompt;
  expect(nativeDialog.type()).toBe("prompt");
  await nativeDialog.accept("Smoke figure template");

  await expect
    .poll(async () => {
      const templates = await readProjectTemplates(page);
      return templates.some(
        (template) =>
          template.name === "Smoke figure template" &&
          template.kind === "figure" &&
          template.project &&
          (template.project as { id?: string }).id === projectId
      );
    })
    .toBe(true);
});

test("stores imported raster media once in the project record", async ({ page }) => {
  const projectId = await startProject(page);
  await page.getByRole("tab", { name: "Imports", exact: true }).click();
  await page.locator('input[type="file"]').last().setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG
  });
  await expect(page.locator(".layers-title small")).toHaveText("1");

  await expect.poll(async () => (await readProject(page, projectId))?.objectCount ?? 0).toBe(1);
  const project = await readProject(page, projectId);
  expect(project).not.toBeNull();
  const image = project?.objects.objects?.find((object) => object.type === "Image");
  expect(image?.assetId).toBe(project?.uploads[0]?.id);
  expect(image).not.toHaveProperty("src");
  const serialized = JSON.stringify(project);
  const dataUrl = project?.uploads[0]?.dataUrl;
  expect(dataUrl).toBeTruthy();
  expect(serialized.split(dataUrl!).length - 1).toBe(1);
});

test("surfaces a cross-tab revision conflict and preserves local work as a copy", async ({
  page
}) => {
  const peer = await page.context().newPage();
  try {
    const projectId = await startProject(page);
    await peer.goto("/");
    await expect(peer.getByRole("button", { name: /^Untitled figure/ })).toBeVisible();

    const remoteRevision = await publishRemoteRevision(peer, projectId);
    await expect(page.getByRole("button", { name: "Reload newer version" })).toBeVisible();
    await addRectangle(page);
    await expect(page.getByRole("button", { name: "Save this tab as a copy" })).toBeVisible();

    await page.getByRole("button", { name: "Save this tab as a copy" }).click();
    await expect(page.getByRole("button", { name: "Save this tab as a copy" })).toHaveCount(0);

    const projects = await readProjects(page);
    expect(projects).toHaveLength(2);
    const original = projects.find((project) => project.id === projectId);
    const copy = projects.find((project) => project.id !== projectId);
    expect(original?.revision).toBe(remoteRevision);
    expect(original?.name).toBe("Remote revision");
    expect(copy?.name).toBe("Untitled figure copy");
    expect(copy?.objectCount).toBe(1);
  } finally {
    await peer.close();
  }
});

test("reloads the newer revision without merging scenes", async ({ page }) => {
  const peer = await page.context().newPage();
  try {
    const projectId = await startProject(page);
    await peer.goto("/");
    await expect(peer.getByRole("button", { name: /^Untitled figure/ })).toBeVisible();

    await publishRemoteRevision(peer, projectId);
    await page.getByRole("button", { name: "Reload newer version" }).click();
    await expect(page.getByLabel("Document title")).toHaveValue("Remote revision");
    await expect(page.getByRole("button", { name: "Reload newer version" })).toHaveCount(0);
    await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  } finally {
    await peer.close();
  }
});

test("surfaces a deletion conflict and preserves local work as a copy", async ({ page }) => {
  const peer = await page.context().newPage();
  try {
    const projectId = await startProject(page);
    await peer.goto("/");
    await expect(peer.getByRole("button", { name: /^Untitled figure/ })).toBeVisible();

    await publishRemoteDeletion(peer, projectId);
    await expect(page.getByRole("button", { name: "Save this tab as a copy" })).toBeVisible();
    await addRectangle(page);
    await page.getByRole("button", { name: "Save this tab as a copy" }).click();
    await expect(page.getByRole("button", { name: "Save this tab as a copy" })).toHaveCount(0);

    const projects = await readProjects(page);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).not.toBe(projectId);
    expect(projects[0]?.name).toBe("Untitled figure copy");
    expect(projects[0]?.objectCount).toBe(1);
  } finally {
    await peer.close();
  }
});
