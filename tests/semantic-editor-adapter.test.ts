import { Group, Rect, type Canvas, type FabricObject } from "../apps/web/node_modules/fabric";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CREATION_DEFAULTS } from "../apps/web/src/editor/creation";
import { createSemanticEditorAdapter } from "../apps/web/src/semantic/semanticEditorAdapter";

function makeCanvas(objects: FabricObject[] = []): Canvas {
  return {
    getObjects: () => objects,
    add: (...added: FabricObject[]) => {
      objects.push(...added);
      return added.at(-1);
    },
    requestRenderAll: vi.fn(),
    getActiveObjects: () => [],
    discardActiveObject: vi.fn(),
    sendObjectToBack: (object: FabricObject) => {
      const index = objects.indexOf(object);
      if (index >= 0) objects.splice(index, 1);
      objects.unshift(object);
    }
  } as unknown as Canvas;
}

function makeAdapter(canvas: Canvas, setSelection = vi.fn()) {
  const commit = vi.fn();
  const restore = vi.fn(async () => undefined);
  const adapter = createSemanticEditorAdapter({
    getCanvas: () => canvas,
    getProjectId: () => "project-1",
    isCanvasReady: () => true,
    getCanvasSettings: () => ({
      width: 1000,
      height: 800,
      unit: "px",
      dpi: 96,
      background: "#ffffff",
      transparent: false
    }),
    setSelection,
    commit,
    serialize: () => "{}",
    restore,
    creationDefaults: () => DEFAULT_CREATION_DEFAULTS,
    prepareElementStyle: vi.fn(),
    configureCanvasAssets: vi.fn(),
    refreshConnectors: vi.fn(),
    applyColorPreset: vi.fn(async () => undefined),
    undo: vi.fn(async () => false),
    redo: vi.fn(async () => false)
  });
  return Object.assign(adapter, { commit, restore });
}

describe("semantic editor adapter", () => {
  it("resolves nested identities and keeps targeted execution separate from selection", async () => {
    const child = new Rect({ width: 40, height: 20 });
    child.objectId = "child";
    child.name = "Nested rectangle";
    const group = new Group([child]);
    group.objectId = "group";
    const canvas = makeCanvas([group]);
    const setSelection = vi.fn();
    const adapter = makeAdapter(canvas, setSelection);

    expect(adapter.inspectObject("child")?.parentObjectId).toBe("group");
    const before = child.getBoundingRect().left;
    const result = await adapter.execute("move_objects", {
      objectIds: ["child"],
      dx: 25,
      dy: 12
    });

    expect(result.changedObjectIds).toEqual(["child"]);
    expect(child.getBoundingRect().left).toBe(before + 25);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("creates stable targetable objects without changing the human selection", async () => {
    const canvas = makeCanvas();
    const setSelection = vi.fn();
    const adapter = makeAdapter(canvas, setSelection);
    const result = await adapter.execute("create_shape", { kind: "rectangle", x: 120, y: 80 });
    const objectId = (result.data as { objectId: string }).objectId;

    expect(objectId).toEqual(expect.any(String));
    expect(canvas.getObjects()).toHaveLength(1);
    expect(adapter.inspectObject(objectId)?.position).toEqual({ x: 120, y: 80 });
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("converts canvas-space movement for transformed nested targets", async () => {
    const child = new Rect({ width: 40, height: 20 });
    child.objectId = "child";
    const group = new Group([child], { scaleX: 2, scaleY: 2, angle: 20 });
    group.objectId = "group";
    const canvas = makeCanvas([group]);
    const adapter = makeAdapter(canvas);
    const before = child.getBoundingRect();

    await adapter.execute("move_objects", { objectIds: ["child"], dx: 25, dy: 12 });

    const after = child.getBoundingRect();
    expect(after.left - before.left).toBeCloseTo(25, 5);
    expect(after.top - before.top).toBeCloseTo(12, 5);
  });

  it("preserves world movement through multiple transformed parent groups", async () => {
    const child = new Rect({ width: 40, height: 20 });
    child.objectId = "child";
    const inner = new Group([child], { scaleX: 1.4, angle: -15 });
    inner.objectId = "inner";
    const outer = new Group([inner], { scaleX: 1.8, scaleY: 1.2, angle: 25 });
    outer.objectId = "outer";
    const canvas = makeCanvas([outer]);
    const adapter = makeAdapter(canvas);
    const before = child.getBoundingRect();

    await adapter.execute("move_objects", { objectIds: ["child"], dx: 25, dy: 12 });

    const after = child.getBoundingRect();
    expect(after.left - before.left).toBeCloseTo(25, 5);
    expect(after.top - before.top).toBeCloseTo(12, 5);
  });

  it("rejects ancestor and descendant targets in one transform command", async () => {
    const child = new Rect({ width: 40, height: 20 });
    child.objectId = "child";
    const group = new Group([child]);
    group.objectId = "group";
    const canvas = makeCanvas([group]);
    const adapter = makeAdapter(canvas);

    await expect(
      adapter.execute("move_objects", { objectIds: ["group", "child"], dx: 1, dy: 1 })
    ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
  });

  it("uses the supplied axis when creation coordinates are partial", async () => {
    const canvas = makeCanvas();
    const adapter = makeAdapter(canvas);

    const result = await adapter.execute("create_shape", { kind: "rectangle", x: 120 });
    const objectId = (result.data as { objectId: string }).objectId;

    expect(adapter.inspectObject(objectId)?.position).toEqual({ x: 120, y: 400 });
  });

  it("defaults semantic curved connectors to an arc path", async () => {
    const from = new Rect({ left: 100, top: 100, width: 40, height: 20 });
    const to = new Rect({ left: 320, top: 100, width: 40, height: 20 });
    from.objectId = "from";
    to.objectId = "to";
    const canvas = makeCanvas([from, to]);
    const adapter = makeAdapter(canvas);

    const result = await adapter.execute("create_connector", {
      kind: "curved-arrow",
      fromObjectId: "from",
      toObjectId: "to"
    });
    const objectId = (result.data as { objectId: string }).objectId;

    expect(adapter.inspectObject(objectId)?.connector?.pathShape).toBe("arc");
  });

  it("reports free connector endpoints in canvas coordinates", async () => {
    const canvas = makeCanvas();
    const adapter = makeAdapter(canvas);
    const result = await adapter.execute("create_connector", {
      kind: "line",
      from: { x: 100, y: 120 },
      to: { x: 300, y: 220 }
    });
    const objectId = (result.data as { objectId: string }).objectId;

    const geometry = adapter.inspectObject(objectId)?.freeConnector;
    expect(geometry?.from).toEqual({ x: 100, y: 120 });
    expect(geometry?.to.x).toBeCloseTo(300, 10);
    expect(geometry?.to.y).toBeCloseTo(220, 10);
  });

  it("creates bound connectors from stable endpoint identities without recentering geometry", async () => {
    const from = new Rect({ left: 100, top: 100, width: 40, height: 20 });
    const to = new Rect({ left: 320, top: 100, width: 40, height: 20 });
    from.objectId = "from";
    to.objectId = "to";
    const canvas = makeCanvas([from, to]);
    const adapter = makeAdapter(canvas);

    const result = await adapter.execute("create_connector", {
      kind: "arrow",
      fromObjectId: "from",
      toObjectId: "to",
      fromAnchor: "right",
      toAnchor: "left"
    });
    const connectorId = (result.data as { objectId: string }).objectId;
    const connector = canvas.getObjects().find((object) => object.objectId === connectorId);

    expect(connector?.connector).toMatchObject({
      fromObjectId: "from",
      toObjectId: "to",
      fromAnchor: "right",
      toAnchor: "left"
    });
    expect(connector?.left).not.toBe(500);
  });

  it("rejects stale targets before mutating the canvas", async () => {
    const canvas = makeCanvas();
    const adapter = makeAdapter(canvas);

    await expect(
      adapter.execute("delete_objects", { objectIds: ["missing"], confirmed: true })
    ).rejects.toMatchObject({ code: "STALE_OBJECT_ID" });
    expect(canvas.getObjects()).toHaveLength(0);
  });

  it("restores the pre-transaction snapshot after a failed mutation sequence", async () => {
    const objects: FabricObject[] = [];
    const canvas = makeCanvas(objects);
    const adapter = makeAdapter(canvas);
    adapter.restore.mockImplementation(async () => {
      objects.splice(0);
    });

    await expect(
      adapter.runTransaction(async () => {
        await adapter.execute("create_shape", { kind: "rectangle" });
        throw new Error("cancelled");
      })
    ).rejects.toThrow("cancelled");
    expect(adapter.restore).toHaveBeenCalledWith("{}");
    expect(adapter.commit).not.toHaveBeenCalled();
    expect(canvas.getObjects()).toHaveLength(0);
  });

  it("surfaces a rollback failure instead of claiming the batch was restored", async () => {
    const canvas = makeCanvas();
    const adapter = makeAdapter(canvas);
    adapter.restore.mockRejectedValue(new Error("restore failed"));

    await expect(
      adapter.runTransaction(async () => {
        throw new Error("operation failed");
      })
    ).rejects.toMatchObject({
      code: "ROLLBACK_FAILED",
      message: expect.stringContaining("restore failed")
    });
  });
});
