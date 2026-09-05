import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateProject } from "../packages/editor-core/src";
import {
  readProjectFile,
  saveProjectToDirectory,
  serializeProject
} from "../apps/web/src/persistence/portable";

const fixturePath = resolve("examples/antibody-mediated-immune-response.OpenSketch");
const fixtureText = readFileSync(fixturePath, "utf8");
const fixture = migrateProject(JSON.parse(fixtureText));

describe("portable OpenSketch projects", () => {
  it("round-trips the established project schema without scene loss", () => {
    const serialized = serializeProject({
      ...fixture,
      revision: 12,
      thumbnail: "data:image/png;base64,preview-only",
      folderId: "folder-1",
      archivedAt: "2026-07-27T12:00:00.000Z"
    });
    const restored = migrateProject(JSON.parse(serialized));

    expect(restored).toEqual(fixture);
    expect(serialized).not.toContain("preview-only");
    expect(serialized).not.toContain("folder-1");
    expect(serialized).not.toContain("archivedAt");
    expect(serialized).not.toContain('"revision"');
    expect((restored.objects.objects as unknown[]).length).toBe(6);
  });

  it("imports existing files with a fresh local identity while preserving content", async () => {
    const imported = await readProjectFile(
      new File([fixtureText], "antibody-mediated-immune-response.OpenSketch", {
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

  it("rejects invalid JSON before an import can be persisted", async () => {
    await expect(
      readProjectFile(
        new File(["{ definitely not json"], "broken.OpenSketch", {
          type: "application/vnd.OpenSketch+json"
        })
      )
    ).rejects.toThrow("invalid JSON");
  });

  it("preserves embedded imported media during export and import", () => {
    const withImportedMedia = {
      ...fixture,
      objects: {
        ...fixture.objects,
        objects: [
          ...(fixture.objects.objects as unknown[]),
          {
            type: "Image",
            assetId: "import-1",
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
          }
        ]
      },
      uploads: [
        {
          id: "import-1",
          name: "pixel.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
        }
      ]
    };

    const restored = migrateProject(JSON.parse(serializeProject(withImportedMedia)));
    expect(restored.uploads).toEqual(withImportedMedia.uploads);
    expect(restored.objects.objects).toContainEqual({
      type: "Image",
      assetId: "import-1",
      src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
    });
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
      expect(filename).toBe("Antibody-mediated-immune-response.OpenSketch");
      expect(written?.type).toBe("application/vnd.opensketch+json");
      expect(written?.size).toBeGreaterThan(1_000);
      expect(closed).toBe(true);
    } finally {
      Reflect.deleteProperty(window, "showDirectoryPicker");
    }
  });

  it("rejects a file larger than the portable-project limit before parsing", async () => {
    const oversized = new File(["not JSON"], "oversized.OpenSketch", {
      type: "application/vnd.OpenSketch+json"
    });
    Object.defineProperty(oversized, "size", {
      value: 100 * 1024 * 1024 + 1
    });

    await expect(readProjectFile(oversized)).rejects.toThrow("100 MiB portable-project limit");
  });
});
