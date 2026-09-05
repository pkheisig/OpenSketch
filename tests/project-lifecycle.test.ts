import { describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "@workspace/editor-core";
import {
  createProjectLifecycleRuntime,
  PROJECT_LIFECYCLE_COMMANDS
} from "../apps/web/src/semantic/projectLifecycle";

function project(id: string, archivedAt?: string): ProjectRecord {
  return {
    format: "OpenSketch",
    formatVersion: 7,
    id,
    name: `${id} name`,
    description: "bounded description",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...(archivedAt ? { archivedAt } : {}),
    canvas: {
      width: 1000,
      height: 800,
      unit: "px",
      dpi: 96,
      background: "#ffffff",
      transparent: false
    },
    objects: { version: "7.0.0", objects: [] },
    uploads: [],
    usedAssetIds: []
  };
}

describe("project lifecycle runtime", () => {
  it("exposes bounded library metadata and rejects stale project IDs", async () => {
    const active = project("project-1");
    const archived = project("project-2", "2026-01-03T00:00:00.000Z");
    const runtime = createProjectLifecycleRuntime({
      getProjects: () => [active, archived],
      getFolders: () => [{ id: "folder-1", name: "Folder", createdAt: "x", updatedAt: "x" }],
      createProject: vi.fn(),
      openProject: vi.fn(() => true)
    });

    expect(runtime.listCommands()).toEqual(PROJECT_LIFECYCLE_COMMANDS);
    const listed = await runtime.execute("list_projects", {});
    expect(listed).toMatchObject({
      ok: true,
      data: { context: "project-library", total: 1, truncated: false }
    });
    expect(listed.ok && listed.data.projects[0]).toEqual(
      expect.objectContaining({ projectId: "project-1", name: "project-1 name", archived: false })
    );
    expect(listed.ok && listed.data.projects[0]).not.toHaveProperty("objects");
    expect(await runtime.execute("inspect_project", { projectId: "missing" })).toMatchObject({
      ok: false,
      error: { code: "STALE_PROJECT_ID" }
    });
  });

  it("creates and opens only through supplied application authorities", async () => {
    const created = project("created");
    const createProject = vi.fn(async () => created);
    const openProject = vi.fn(() => true);
    const runtime = createProjectLifecycleRuntime({
      getProjects: () => [],
      getFolders: () => [],
      createProject,
      openProject
    });

    await expect(
      runtime.execute("create_project", { name: "Created figure" })
    ).resolves.toMatchObject({
      ok: true,
      data: { created: true, projectId: "created" }
    });
    expect(createProject).toHaveBeenCalledWith("Created figure", {});

    const openRuntime = createProjectLifecycleRuntime({
      getProjects: () => [created],
      getFolders: () => [],
      createProject: vi.fn(),
      openProject
    });
    await expect(
      openRuntime.execute("open_project", { projectId: "created" })
    ).resolves.toMatchObject({
      ok: true,
      data: { opened: true, projectId: "created" }
    });
    expect(openProject).toHaveBeenCalledWith(created);
  });

  it("does not call lifecycle authorities for a pre-canceled call", async () => {
    const createProject = vi.fn(async () => project("created"));
    const runtime = createProjectLifecycleRuntime({
      getProjects: () => [],
      getFolders: () => [],
      createProject,
      openProject: vi.fn(() => true)
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      runtime.execute("create_project", {}, { signal: controller.signal })
    ).resolves.toMatchObject({ ok: false, error: { code: "EXECUTION_ABORTED" } });
    expect(createProject).not.toHaveBeenCalled();
  });
});
