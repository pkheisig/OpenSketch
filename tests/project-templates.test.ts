import Dexie from "../apps/web/node_modules/dexie";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CANVAS,
  remintProjectIdentity,
  type ProjectTemplateRecord
} from "../packages/editor-core/src";
import {
  OpenSketchDatabase,
  createProject,
  deleteProjectTemplate,
  db,
  listProjectTemplates,
  saveProjectTemplate
} from "../apps/web/src/persistence/database";

const template = (kind: ProjectTemplateRecord["kind"] = "diagram"): ProjectTemplateRecord => ({
  id: `template-${kind}`,
  name: `${kind} starter`,
  kind,
  project: {
    format: "OpenSketch",
    formatVersion: 2,
    version: 1,
    kind,
    id: `snapshot-${kind}`,
    name: `${kind} source`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    canvas: DEFAULT_CANVAS,
    objects: {
      version: "7.0.0",
      objects: [{ type: "Group", objectId: `group-${kind}`, objects: [] }]
    },
    uploads: [],
    usedAssetIds: []
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  schemaVersion: 1
});

beforeEach(async () => {
  await db.transaction("rw", db.projectTemplates, db.projectTemplateMigrations, async () => {
    await db.projectTemplates.clear();
    await db.projectTemplateMigrations.clear();
  });
});

describe("project template storage", () => {
  it("persists validated snapshots through the dedicated registry", async () => {
    const saved = await saveProjectTemplate(template("figure"));

    expect(await listProjectTemplates()).toEqual([saved]);
    expect(await db.projectTemplateMigrations.get(saved.id)).toMatchObject({
      id: saved.id,
      schemaVersion: 1
    });
  });

  it("ignores one invalid template without hiding valid templates", async () => {
    await saveProjectTemplate(template("figure"));
    await db.projectTemplates.put({ ...template("diagram"), schemaVersion: 2 } as never);

    expect(await listProjectTemplates()).toEqual([expect.objectContaining({ kind: "figure" })]);
  });

  it("rejects external and malformed template thumbnails before persistence", async () => {
    await expect(
      saveProjectTemplate({ ...template(), thumbnail: "https://example.com/template.svg" })
    ).rejects.toThrow(/thumbnail/i);
    await expect(
      saveProjectTemplate({ ...template(), thumbnail: "data:image/png;base64,not-an-image" })
    ).rejects.toThrow(/thumbnail/i);
    expect(await db.projectTemplates.get("template-diagram")).toBeUndefined();
  });

  it("remints connector, semantic, and recognition references together", () => {
    const binding = (fromObjectId: string, toObjectId: string) => ({
      fromObjectId,
      fromAnchor: "center",
      toObjectId,
      toAnchor: "center",
      startArrowhead: "none",
      endArrowhead: "triangle",
      lineStyle: "solid",
      curvature: 0
    });
    const source = {
      ...template().project,
      objects: {
        version: "7.0.0",
        objects: [
          {
            type: "Rect",
            objectId: "source",
            clipPath: { type: "Rect" },
            connector: binding("source", "target"),
            recognizedGroups: [
              {
                objectId: "recognition",
                memberObjectIds: ["source", "target"],
                properties: {}
              }
            ],
            semanticMetadata: {
              allowedOverlapObjectIds: ["target"],
              layoutConstraint: { contentObjectId: "source", labelObjectId: "target" }
            },
            semanticRelations: [
              {
                id: "relation",
                sourceObjectId: "source",
                targetObjectId: "target",
                mediatorObjectIds: ["target"]
              }
            ]
          },
          { type: "Rect", objectId: "target" }
        ]
      }
    };
    const reminted = remintProjectIdentity(source) as typeof source;
    const [remintedSource, remintedTarget] = reminted.objects.objects;
    const recognition = remintedSource.recognizedGroups?.[0];

    expect(remintedSource.objectId).not.toBe("source");
    expect(remintedTarget.objectId).not.toBe("target");
    expect(remintedSource.clipPath).not.toHaveProperty("objectId");
    expect(remintedSource.connector).toEqual(
      binding(remintedSource.objectId, remintedTarget.objectId)
    );
    expect(remintedSource.semanticMetadata?.allowedOverlapObjectIds).toEqual([
      remintedTarget.objectId
    ]);
    expect(remintedSource.semanticMetadata?.layoutConstraint).toEqual({
      contentObjectId: remintedSource.objectId,
      labelObjectId: remintedTarget.objectId
    });
    expect(remintedSource.semanticRelations?.[0]).toMatchObject({
      sourceObjectId: remintedSource.objectId,
      targetObjectId: remintedTarget.objectId,
      mediatorObjectIds: [remintedTarget.objectId]
    });
    expect(recognition?.objectId).not.toBe("recognition");
    expect(recognition?.memberObjectIds).toEqual([
      remintedSource.objectId,
      remintedTarget.objectId
    ]);
  });

  it("instantiates fresh project and scene identities from a template", async () => {
    const saved = await saveProjectTemplate(template());
    const first = createProject(undefined, { kind: "diagram", template: saved });
    const second = createProject(undefined, { kind: "diagram", template: saved });

    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toBe(saved.project.id);
    expect(first.createdAt).not.toBe(saved.project.createdAt);
    expect(first.objects.objects[0]).toMatchObject({ type: "Group" });
    expect(first.objects.objects[0].objectId).not.toBe(second.objects.objects[0].objectId);
    expect(first.objects.objects[0].objectId).not.toBe("group-diagram");
  });

  it("rejects a template whose record and snapshot modes disagree", async () => {
    await expect(
      saveProjectTemplate({ ...template("figure"), project: template("poster").project })
    ).rejects.toThrow(/does not match/i);
  });

  it("rejects a template passed to the wrong project mode", async () => {
    const saved = await saveProjectTemplate(template("figure"));
    expect(() => createProject(undefined, { kind: "poster", template: saved })).toThrow(
      /does not match/i
    );
  });

  it("rolls back the template when registry migration bookkeeping fails", async () => {
    const put = vi
      .spyOn(db.projectTemplateMigrations, "put")
      .mockRejectedValue(new DOMException("Storage is full", "QuotaExceededError"));

    await expect(saveProjectTemplate(template())).rejects.toThrow(/storage is full/i);
    expect(await db.projectTemplates.get("template-diagram")).toBeUndefined();
    put.mockRestore();
  });

  it("verifies durable template saves and deletes", async () => {
    const savedGet = vi.spyOn(db.projectTemplates, "get").mockResolvedValue(undefined);
    await expect(saveProjectTemplate(template())).rejects.toThrow(/verify/i);
    savedGet.mockRestore();

    const saved = await saveProjectTemplate(template());
    const deleteGet = vi.spyOn(db.projectTemplates, "get").mockResolvedValue(saved);
    await expect(deleteProjectTemplate(saved.id)).rejects.toThrow(/verify/i);
    deleteGet.mockRestore();
    expect(await db.projectTemplates.get(saved.id)).toEqual(saved);
  });

  it("migrates legacy v1 projects when opening the v6 database", async () => {
    const databaseName = `OpenSketch-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(databaseName);
    legacy.version(5).stores({
      projects: "id, updatedAt, name, archivedAt, folderId",
      folders: "id, updatedAt, name",
      imports: "id, updatedAt, name, mimeType, contentHash",
      templates: "id, updatedAt, name",
      templateMigrations: "id"
    });
    await legacy.open();
    await legacy.table("projects").put({
      format: "OpenSketch",
      formatVersion: 1,
      version: 1,
      id: "legacy-project",
      name: "Legacy",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      revision: 0,
      canvas: DEFAULT_CANVAS,
      objects: { version: "7.0.0", objects: [] },
      uploads: [],
      usedAssetIds: []
    });
    await legacy.close();

    const upgraded = new OpenSketchDatabase(databaseName);
    await upgraded.open();
    await expect(upgraded.projects.get("legacy-project")).resolves.toMatchObject({
      formatVersion: 3,
      kind: "diagram",
      revision: 0
    });
    await upgraded.delete();
  });
});
