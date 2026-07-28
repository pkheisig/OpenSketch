import { DEFAULT_CANVAS } from "./presets";
import { OpenSketch_FORMAT_VERSION, type PortableProject } from "./types";

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
  if (project.format !== "OpenSketch") {
    throw new Error("The project marker is missing or invalid.");
  }
  if (project.formatVersion !== OpenSketch_FORMAT_VERSION) {
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
  // `uploads` is the historical on-disk key. It remains supported so existing
  // .OpenSketch projects round-trip without a format-version break.
  const importedMedia = project.uploads ?? [];
  if (
    !Array.isArray(importedMedia) ||
    importedMedia.some(
      (media) =>
        !media ||
        typeof media.id !== "string" ||
        typeof media.name !== "string" ||
        typeof media.mimeType !== "string" ||
        typeof media.dataUrl !== "string" ||
        !/^data:image\/(?:svg\+xml|png|jpeg|webp);/i.test(media.dataUrl)
    )
  ) {
    throw new Error("The project imported media is invalid.");
  }
  const usedAssetIds = project.usedAssetIds ?? [];
  if (!Array.isArray(usedAssetIds) || usedAssetIds.some((assetId) => typeof assetId !== "string")) {
    throw new Error("The project asset references are invalid.");
  }
  return {
    ...project,
    version: 1,
    canvas: {
      ...DEFAULT_CANVAS,
      ...project.canvas,
      doubleClickCreatesText: project.canvas.doubleClickCreatesText !== false
    },
    uploads: importedMedia,
    usedAssetIds
  } as PortableProject;
}
