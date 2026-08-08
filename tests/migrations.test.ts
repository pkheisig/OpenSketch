import { describe, expect, it } from "vitest";
import { DEFAULT_CANVAS, migrateProject } from "../packages/editor-core/src";

describe("project migrations", () => {
  const project = {
    format: "OpenSketch",
    formatVersion: 1,
    version: 1,
    id: "project-1",
    name: "Figure",
    createdAt: "2026-07-26T00:00:00Z",
    updatedAt: "2026-07-26T00:00:00Z",
    canvas: DEFAULT_CANVAS,
    objects: { objects: [] },
    uploads: [],
    usedAssetIds: []
  } as const;

  it("accepts the current format", () => {
    expect(migrateProject(project).name).toBe("Figure");
  });

  it("adds the enabled double-click text preference to older projects", () => {
    const legacyCanvas = { ...project.canvas } as Partial<typeof project.canvas>;
    delete legacyCanvas.doubleClickCreatesText;
    expect(
      migrateProject({
        ...project,
        canvas: legacyCanvas
      }).canvas.doubleClickCreatesText
    ).toBe(true);
  });

  it("preserves an explicitly disabled double-click text preference", () => {
    expect(
      migrateProject({
        ...project,
        canvas: { ...project.canvas, doubleClickCreatesText: false }
      }).canvas.doubleClickCreatesText
    ).toBe(false);
  });

  it("rejects unknown future formats", () => {
    expect(() => migrateProject({ format: "OpenSketch", formatVersion: 99 })).toThrow(
      "not supported"
    );
  });

  it("rejects external scene sources in portable projects", () => {
    expect(() =>
      migrateProject({
        ...project,
        objects: {
          objects: [{ type: "Image", src: "https://example.org/tracker.png" }]
        }
      })
    ).toThrow("external or executable");
  });

  it("rejects malformed canvas and imported-media records", () => {
    expect(() =>
      migrateProject({
        ...project,
        canvas: { ...project.canvas, width: -1 }
      })
    ).toThrow("canvas width");
    expect(() =>
      migrateProject({
        ...project,
        uploads: [{ id: "x", name: "x", mimeType: "text/html", dataUrl: "javascript:evil()" }]
      })
    ).toThrow("imported media");
  });

  it("rejects invalid project structure and asset references", () => {
    expect(() => migrateProject(null)).toThrow("not an OpenSketch project");
    expect(() => migrateProject({ ...project, format: "Other" })).toThrow("marker");
    expect(() => migrateProject({ ...project, name: "" })).toThrow("incomplete");
    expect(() => migrateProject({ ...project, canvas: { ...project.canvas, unit: "cm" } })).toThrow(
      "canvas unit"
    );
    expect(() => migrateProject({ ...project, objects: [] })).toThrow("scene is invalid");
    expect(() => migrateProject({ ...project, usedAssetIds: [42] })).toThrow("asset references");
  });

  it("defaults omitted optional media and asset lists", () => {
    const legacy = { ...project, uploads: undefined, usedAssetIds: undefined };
    const migrated = migrateProject(legacy);
    expect(migrated.uploads).toEqual([]);
    expect(migrated.usedAssetIds).toEqual([]);
  });
});
