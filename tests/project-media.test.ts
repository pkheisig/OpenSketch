import { describe, expect, it } from "vitest";
import {
  DEFAULT_CANVAS,
  normalizeProjectMedia,
  PROJECT_STORAGE_LIMITS,
  rehydrateProjectScene,
  type PortableProject
} from "../packages/editor-core/src";
import { serializedProjectBytes, serializeProject } from "../apps/web/src/persistence/portable";

const upload = {
  id: "upload-1",
  name: "pixel.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
};

const baseProject: PortableProject = {
  format: "OpenSketch",
  formatVersion: 1,
  version: 1,
  id: "project-1",
  name: "Figure",
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
  canvas: DEFAULT_CANVAS,
  objects: { version: "7.0.0", objects: [] },
  uploads: [],
  usedAssetIds: []
};

describe("project-owned media storage", () => {
  it("deduplicates image sources and prunes unreferenced uploads without mutation", () => {
    const objects = {
      version: "7.0.0",
      objects: [
        { type: "Image", src: upload.dataUrl },
        { type: "Image", assetId: upload.id, src: upload.dataUrl }
      ]
    };
    const uploads = [
      upload,
      {
        ...upload,
        id: "orphan",
        name: "orphan.png",
        dataUrl: "data:image/png;base64,orphan"
      }
    ];
    const normalized = normalizeProjectMedia(objects, uploads);

    expect(normalized.uploads).toEqual([upload]);
    expect(normalized.objects.objects).toEqual([
      { type: "Image", assetId: upload.id },
      { type: "Image", assetId: upload.id }
    ]);
    expect(JSON.stringify(normalized)).toContain(upload.dataUrl);
    expect(JSON.stringify(normalized).split(upload.dataUrl).length - 1).toBe(1);
    expect(objects.objects).toEqual([
      { type: "Image", src: upload.dataUrl },
      { type: "Image", assetId: upload.id, src: upload.dataUrl }
    ]);

    expect(rehydrateProjectScene(normalized.objects, normalized.uploads).objects).toEqual([
      { type: "Image", assetId: upload.id, src: upload.dataUrl },
      { type: "Image", assetId: upload.id, src: upload.dataUrl }
    ]);
  });

  it("counts the UTF-8 serialized representation used by export and local saves", () => {
    const project = {
      ...baseProject,
      objects: { ...baseProject.objects, title: "αβ" }
    };
    const serialized = serializeProject(project);

    expect(serializedProjectBytes(project)).toBe(new TextEncoder().encode(serialized).byteLength);
    expect(serializedProjectBytes(project)).toBeGreaterThan(serialized.length);
  });

  it("enforces the shared portable-project byte budget", () => {
    const payload = "x".repeat(PROJECT_STORAGE_LIMITS.maxPortableProjectBytes + 1);
    expect(() =>
      serializeProject({
        ...baseProject,
        objects: { ...baseProject.objects, payload }
      })
    ).toThrow("100 MiB portable-project limit");
  });
});
