import {
  Group,
  IText,
  Rect,
  type Canvas,
  type FabricObject
} from "../apps/web/node_modules/fabric";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CREATION_DEFAULTS } from "../apps/web/src/editor/creation";
import { createSemanticEditorAdapter } from "../apps/web/src/semantic/semanticEditorAdapter";

function makeCanvas(objects: FabricObject[] = [], activeObjects: FabricObject[] = []): Canvas {
  return {
    getObjects: () => objects,
    add: (...added: FabricObject[]) => {
      objects.push(...added);
      return added.at(-1);
    },
    requestRenderAll: vi.fn(),
    getActiveObjects: () => activeObjects,
    discardActiveObject: vi.fn(),
    sendObjectToBack: (object: FabricObject) => {
      const index = objects.indexOf(object);
      if (index >= 0) objects.splice(index, 1);
      objects.unshift(object);
    }
  } as unknown as Canvas;
}

function makeAdapter(
  canvas: Canvas,
  setSelection = vi.fn(),
  replaceAssetVariant = vi.fn(async () => true)
) {
  const commit = vi.fn();
  const restore = vi.fn(async () => undefined);
  const setCanvasSettings = vi.fn();
  const setProjectName = vi.fn();
  const setProjectDescription = vi.fn();
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
    setCanvasSettings,
    setProjectName,
    setProjectDescription,
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
    redo: vi.fn(async () => false),
    insertAsset: vi.fn(async () => "asset-object"),
    replaceAssetVariant,
    exportSvg: vi.fn(),
    exportCredits: vi.fn(),
    exportPdf: vi.fn(async () => undefined),
    exportPng: vi.fn(async () => undefined)
  });
  return Object.assign(adapter, {
    commit,
    restore,
    setCanvasSettings,
    setProjectName,
    setProjectDescription
  });
}

describe("semantic editor adapter", () => {
  it("updates project metadata through the editor persistence pathways", async () => {
    const adapter = makeAdapter(makeCanvas());

    await expect(
      adapter.execute("set_project_metadata", {
        name: "  Antitumor immunity  ",
        description: "  Cross-presentation to cytotoxic clearance.  "
      })
    ).resolves.toEqual({
      data: {
        name: "Antitumor immunity",
        description: "Cross-presentation to cytotoxic clearance."
      },
      changedObjectIds: []
    });
    expect(adapter.setProjectName).toHaveBeenCalledWith("Antitumor immunity");
    expect(adapter.setProjectDescription).toHaveBeenCalledWith(
      "Cross-presentation to cytotoxic clearance."
    );
  });

  it("resizes the canvas through the editor canvas-settings pathway", async () => {
    const adapter = makeAdapter(makeCanvas());

    await expect(adapter.execute("resize_canvas", { width: 2600, height: 900 })).resolves.toEqual({
      data: { width: 2600, height: 900 },
      changedObjectIds: []
    });
    expect(adapter.setCanvasSettings).toHaveBeenCalledWith({ width: 2600, height: 900 });
  });

  it("rejects a canvas resize whose area exceeds the portable project limit", async () => {
    const adapter = makeAdapter(makeCanvas());

    await expect(
      adapter.execute("resize_canvas", { width: 20_000, height: 20_000 })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(adapter.setCanvasSettings).not.toHaveBeenCalled();
  });

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

  it("reports bounded text content for precise semantic revision", async () => {
    const adapter = makeAdapter(makeCanvas());
    const result = await adapter.execute("create_text", {
      kind: "point",
      text: "Tumor antigen uptake",
      x: 200,
      y: 120
    });
    const objectId = (result.data as { objectId: string }).objectId;

    expect(adapter.inspectObject(objectId)?.text).toBe("Tumor antigen uptake");
  });

  it("replaces exact text content while preserving the text object identity", async () => {
    const text = new IText("Old label");
    text.objectId = "label";
    const adapter = makeAdapter(makeCanvas([text]));

    await adapter.execute("set_text_content", {
      objectId: "label",
      text: "Release of cancer-cell antigens"
    });

    expect(adapter.inspectObject("label")?.text).toBe("Release of cancer-cell antigens");
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

  it("attaches an object anchor to an exact target anchor with rotation and offset", async () => {
    const label = new Rect({ left: 0, top: 0, width: 40, height: 20 });
    const cell = new Rect({ left: 200, top: 100, width: 120, height: 80 });
    label.objectId = "label";
    cell.objectId = "cell";
    const adapter = makeAdapter(makeCanvas([label, cell]));

    await adapter.execute("attach_object", {
      objectId: "label",
      targetObjectId: "cell",
      objectAnchor: "top",
      targetAnchor: "bottom",
      offset: { x: 0, y: 16 },
      angle: 90
    });

    const labelBounds = label.getBoundingRect();
    const cellBounds = cell.getBoundingRect();
    expect(label.angle).toBe(90);
    expect(labelBounds.left + labelBounds.width / 2).toBeCloseTo(
      cellBounds.left + cellBounds.width / 2,
      5
    );
    expect(labelBounds.top).toBeCloseTo(cellBounds.top + cellBounds.height + 16, 5);
  });

  it("places a rotated object between named anchors on two exact objects", async () => {
    const bridge = new Rect({ left: 0, top: 0, width: 20, height: 60 });
    const leftCell = new Rect({ left: 100, top: 100, width: 80, height: 80 });
    const rightCell = new Rect({ left: 300, top: 100, width: 80, height: 80 });
    bridge.objectId = "bridge";
    leftCell.objectId = "left-cell";
    rightCell.objectId = "right-cell";
    const adapter = makeAdapter(makeCanvas([bridge, leftCell, rightCell]));

    await adapter.execute("place_object_between", {
      objectId: "bridge",
      fromObjectId: "left-cell",
      toObjectId: "right-cell",
      objectAnchor: "center",
      fromAnchor: "right",
      toAnchor: "left",
      offset: { x: 0, y: -12 },
      angle: 90
    });

    const bridgeBounds = bridge.getBoundingRect();
    expect(bridge.angle).toBe(90);
    expect(bridgeBounds.left + bridgeBounds.width / 2).toBeCloseTo(200, 5);
    expect(bridgeBounds.top + bridgeBounds.height / 2).toBeCloseTo(88, 5);
  });

  it("snaps an object outside a target side with an exact gap", async () => {
    const label = new Rect({ left: 0, top: 0, width: 40, height: 20 });
    const target = new Rect({ left: 200, top: 100, width: 100, height: 80 });
    label.objectId = "label";
    target.objectId = "target";
    const adapter = makeAdapter(makeCanvas([label, target]));

    await adapter.execute("snap_object", {
      objectId: "label",
      targetObjectId: "target",
      side: "bottom",
      gap: 24,
      offset: 12
    });

    const labelBounds = label.getBoundingRect();
    const targetBounds = target.getBoundingRect();
    expect(labelBounds.top).toBeCloseTo(targetBounds.top + targetBounds.height + 24, 5);
    expect(labelBounds.left + labelBounds.width / 2).toBeCloseTo(
      targetBounds.left + targetBounds.width / 2 + 12,
      5
    );
  });

  it("distributes ordered objects evenly around one circle", async () => {
    const objects = ["a", "b", "c", "d"].map((objectId) => {
      const object = new Rect({ width: 20, height: 20 });
      object.objectId = objectId;
      return object;
    });
    const adapter = makeAdapter(makeCanvas(objects));

    await adapter.execute("layout_objects_radially", {
      objectIds: objects.map((object) => object.objectId),
      center: { x: 300, y: 300 },
      radius: 100,
      startAngle: -90,
      direction: "clockwise"
    });

    const centers = objects.map((object) => {
      const bounds = object.getBoundingRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    });
    expect(centers[0]).toMatchObject({ x: 300, y: 200 });
    expect(centers[1]).toMatchObject({ x: 400, y: 300 });
    expect(centers[2]).toMatchObject({ x: 300, y: 400 });
    expect(centers[3]).toMatchObject({ x: 200, y: 300 });
  });

  it("lays out ordered objects with exact linear gaps", async () => {
    const objects = [20, 30, 40].map((width, index) => {
      const object = new Rect({ width, height: 20 + index * 10 });
      object.objectId = `object-${index}`;
      return object;
    });
    const adapter = makeAdapter(makeCanvas(objects));

    await adapter.execute("layout_objects_linear", {
      objectIds: objects.map((object) => object.objectId),
      center: { x: 300, y: 200 },
      axis: "horizontal",
      gap: 16,
      alignment: "center"
    });

    const bounds = objects.map((object) => object.getBoundingRect());
    expect(bounds[1].left - (bounds[0].left + bounds[0].width)).toBeCloseTo(16, 5);
    expect(bounds[2].left - (bounds[1].left + bounds[1].width)).toBeCloseTo(16, 5);
    expect(bounds.map((item) => item.top + item.height / 2)).toEqual([
      expect.closeTo(200, 5),
      expect.closeTo(200, 5),
      expect.closeTo(200, 5)
    ]);
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

  it("creates a true circular arc object from center, radius, and angles", async () => {
    const canvas = makeCanvas();
    const adapter = makeAdapter(canvas);

    const result = await adapter.execute("create_circular_arc", {
      center: { x: 300, y: 300 },
      radius: 120,
      startAngle: -80,
      endAngle: -20,
      direction: "clockwise",
      endArrowhead: "triangle",
      widthScale: 1.5
    });
    const objectId = (result.data as { objectId: string }).objectId;
    const descriptor = adapter.inspectObject(objectId);

    expect(descriptor).toMatchObject({ type: "curved-arrow", name: "Circular arc" });
    expect(descriptor?.bounds.width).toBeGreaterThan(0);
    expect(descriptor?.bounds.height).toBeGreaterThan(0);
    expect(descriptor?.freeConnector).toMatchObject({
      from: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      to: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    });
    expect(
      canvas.getObjects().find((object) => object.objectId === objectId)?.freeConnectorBinding
    ).toMatchObject({
      fromObjectId: "",
      toObjectId: "",
      pathShape: "circular",
      startArrowhead: "none",
      endArrowhead: "triangle"
    });
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

  it("bounds the selection in scene snapshots", () => {
    const activeObjects = Array.from({ length: 201 }, (_, index) => {
      const object = new Rect({ width: 10, height: 10 });
      object.objectId = `selected-${index}`;
      return object;
    });
    const adapter = makeAdapter(makeCanvas([], activeObjects));

    const snapshot = adapter.inspectScene({ maxObjects: 500, maxDepth: 12 });

    expect(snapshot.selectionObjectIds).toHaveLength(200);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.warnings).toContain("Selection output capped at 200 objects.");
  });

  it("discovers and inspects bounded scientific assets", async () => {
    const adapter = makeAdapter(makeCanvas());
    const search = (await adapter.searchAssets({ query: "", limit: 1 })) as {
      results: Array<{ familyId: string; variants: Array<{ id: string }> }>;
      total: number;
    };

    expect(search.results).toHaveLength(1);
    expect(search.total).toBeGreaterThanOrEqual(1);
    const family = search.results[0];
    const inspected = (await adapter.inspectAsset({
      familyId: family.familyId,
      variantId: family.variants[0].id
    })) as { family: { familyId: string; selectedVariantId: string } };

    expect(inspected.family).toMatchObject({
      familyId: family.familyId,
      selectedVariantId: family.variants[0].id
    });
    expect(adapter.inspectProvenance()).toEqual({ version: 1, assets: [] });
  });

  it("inserts assets and reports a same-variant replacement as a no-op", async () => {
    const canvas = makeCanvas();
    const adapter = makeAdapter(
      canvas,
      vi.fn(),
      vi.fn(async () => false)
    );
    const search = (await adapter.searchAssets({ query: "", limit: 1 })) as {
      results: Array<{ familyId: string; variants: Array<{ id: string }> }>;
    };
    const family = search.results[0];
    const variantId = family.variants[0].id;

    const inserted = await adapter.execute("insert_asset", {
      familyId: family.familyId,
      variantId
    });
    expect(inserted).toMatchObject({
      data: { objectId: "asset-object", familyId: family.familyId, variantId },
      changedObjectIds: ["asset-object"]
    });

    const asset = new Group([]);
    asset.objectId = "existing-asset";
    asset.familyId = family.familyId;
    asset.assetId = variantId;
    canvas.add(asset);
    await expect(
      adapter.execute("replace_asset_variant", {
        objectId: "existing-asset",
        variantId
      })
    ).resolves.toMatchObject({ data: { objectId: "existing-asset" }, changedObjectIds: [] });
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

  it("rebinds an existing connector to edge-center anchors without replacing its identity", async () => {
    const from = new Rect({ left: 100, top: 100, width: 40, height: 20 });
    const to = new Rect({ left: 320, top: 100, width: 40, height: 20 });
    const replacementTarget = new Rect({ left: 520, top: 100, width: 40, height: 20 });
    from.objectId = "from";
    to.objectId = "to";
    replacementTarget.objectId = "replacement";
    const canvas = makeCanvas([from, to, replacementTarget]);
    const adapter = makeAdapter(canvas);
    const created = await adapter.execute("create_connector", {
      kind: "arrow",
      fromObjectId: "from",
      toObjectId: "to"
    });
    const connectorId = (created.data as { objectId: string }).objectId;

    await adapter.execute("rebind_connector", {
      connectorId,
      fromAnchor: "right",
      toObjectId: "replacement",
      toAnchor: "left"
    });

    const connector = canvas.getObjects().find((object) => object.objectId === connectorId);
    expect(connector?.connector).toMatchObject({
      fromObjectId: "from",
      fromAnchor: "right",
      toObjectId: "replacement",
      toAnchor: "left"
    });
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

  it("preserves outer transaction dirtiness after a nested failure", async () => {
    const adapter = makeAdapter(makeCanvas());

    await adapter.runTransaction(async () => {
      await adapter.execute("create_shape", { kind: "rectangle" });
      await expect(
        adapter.runTransaction(async () => {
          await adapter.execute("create_shape", { kind: "ellipse" });
          throw new Error("nested failure");
        })
      ).rejects.toThrow("nested failure");
    });

    expect(adapter.commit).toHaveBeenCalledWith("Semantic batch");
  });
});
