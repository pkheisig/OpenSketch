import { describe, expect, it } from "vitest";
import { DEFAULT_CANVAS, migrateProject } from "../packages/editor-core/src";

describe("project migrations", () => {
  it("accepts the current format", () => {
    const project = {
      format: "opensketch",
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
    };
    expect(migrateProject(project).name).toBe("Figure");
  });

  it("rejects unknown future formats", () => {
    expect(() => migrateProject({ format: "opensketch", formatVersion: 99 })).toThrow(
      "not supported"
    );
  });
});
