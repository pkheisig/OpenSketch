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
});
