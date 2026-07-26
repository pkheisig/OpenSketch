import { OPENSKETCH_FORMAT_VERSION, type PortableProject } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertFinitePositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`The project ${label} is invalid.`);
  }
}

function assertNoExternalSceneSources(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoExternalSceneSources);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (
      ["src", "href", "xlink:href"].includes(key.toLowerCase()) &&
      typeof child === "string" &&
      /^(?:https?:|\/\/|javascript:)/i.test(child.trim())
    ) {
      throw new Error("The project contains an external or executable scene reference.");
    }
    assertNoExternalSceneSources(child);
  }
}

export function migrateProject(input: unknown): PortableProject {
  if (!isRecord(input)) {
    throw new Error("This file is not an OpenSketch project.");
  }
  const project = input as Partial<PortableProject>;
  if (project.format !== "opensketch") {
    throw new Error("The project marker is missing or invalid.");
  }
  if (project.formatVersion !== OPENSKETCH_FORMAT_VERSION) {
    throw new Error(
      `Project version ${String(project.formatVersion)} is not supported by this release.`
    );
  }
  if (!project.id || !project.name || !project.canvas || !project.objects) {
    throw new Error("The project is incomplete.");
  }
  assertFinitePositive(project.canvas.width, "canvas width");
  assertFinitePositive(project.canvas.height, "canvas height");
  assertFinitePositive(project.canvas.dpi, "export DPI");
  if (!["px", "mm", "in"].includes(project.canvas.unit)) {
    throw new Error("The project canvas unit is invalid.");
  }
  if (!isRecord(project.objects)) {
    throw new Error("The project scene is invalid.");
  }
  assertNoExternalSceneSources(project.objects);
  const uploads = project.uploads ?? [];
  if (
    !Array.isArray(uploads) ||
    uploads.some(
      (upload) =>
        !upload ||
        typeof upload.id !== "string" ||
        typeof upload.name !== "string" ||
        typeof upload.mimeType !== "string" ||
        typeof upload.dataUrl !== "string" ||
        !/^data:image\/(?:svg\+xml|png|jpeg|webp);/i.test(upload.dataUrl)
    )
  ) {
    throw new Error("The project uploads are invalid.");
  }
  const usedAssetIds = project.usedAssetIds ?? [];
  if (!Array.isArray(usedAssetIds) || usedAssetIds.some((assetId) => typeof assetId !== "string")) {
    throw new Error("The project asset references are invalid.");
  }
  return {
    ...project,
    version: 1,
    uploads,
    usedAssetIds
  } as PortableProject;
}
