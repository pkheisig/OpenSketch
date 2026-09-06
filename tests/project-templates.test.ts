import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CANVAS, type ProjectTemplateRecord } from "../packages/editor-core/src";
import {
  createProject,
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
});
