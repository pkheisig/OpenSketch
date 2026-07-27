import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateProject, type ProjectRecord } from "../packages/editor-core/src";
import {
  readProjectFile,
  saveProjectToDirectory,
  serializeProject
} from "../apps/web/src/persistence/portable";

const fixturePath = resolve("examples/comparative-panels.OpenSketch");
const fixtureText = readFileSync(fixturePath, "utf8");
const fixture = migrateProject(JSON.parse(fixtureText));

describe("portable OpenSketch projects", () => {
  it("round-trips the established project schema without scene loss", () => {
    const serialized = serializeProject({
      ...fixture,
      thumbnail: "data:image/png;base64,preview-only"
    });
    const restored = migrateProject(JSON.parse(serialized));

    expect(restored).toEqual(fixture);
    expect(serialized).not.toContain("preview-only");
    expect((restored.objects.objects as unknown[]).length).toBe(27);
  });

  it("imports existing files with a fresh local identity while preserving content", async () => {
    const imported = await readProjectFile(
      new File([fixtureText], "comparative-panels.OpenSketch", {
        type: "application/vnd.OpenSketch+json"
      })
    );

    expect(imported.id).not.toBe(fixture.id);
    expect(imported.name).toBe(fixture.name);
    expect(imported.canvas).toEqual(fixture.canvas);
    expect(imported.objects).toEqual(fixture.objects);
    expect(imported.uploads).toEqual(fixture.uploads);
    expect(imported.usedAssetIds).toEqual(fixture.usedAssetIds);
  });

  it("preserves embedded uploads during export and import", () => {
    const withUpload: ProjectRecord = {
      ...fixture,
      uploads: [
        {
          id: "upload-1",
          name: "pixel.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
        }
      ]
    };

    const restored = migrateProject(JSON.parse(serializeProject(withUpload)));
    expect(restored.uploads).toEqual(withUpload.uploads);
  });

  it("writes a compatible project through direct directory access", async () => {
    let filename = "";
    let written: Blob | undefined;
    let closed = false;
    Object.assign(window, {
      showDirectoryPicker: async () => ({
        getFileHandle: async (name: string) => {
          filename = name;
          return {
            createWritable: async () => ({
              write: async (data: Blob) => {
                written = data;
              },
              close: async () => {
                closed = true;
              }
            })
          };
        }
      })
    });

    try {
      expect(await saveProjectToDirectory(fixture)).toBe(true);
      expect(filename).toBe("Comparative-panels.OpenSketch");
      expect(written?.type).toBe("application/vnd.opensketch+json");
      expect(written?.size).toBeGreaterThan(1_000);
      expect(closed).toBe(true);
    } finally {
      Reflect.deleteProperty(window, "showDirectoryPicker");
    }
  });
});
