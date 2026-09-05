import { assertAssetCapacity } from "../apps/web/src/editor/assetCapacity";
import { migrateProject, DEFAULT_CANVAS } from "../packages/editor-core/src";
import { describe, expect, it } from "vitest";
import { FabricObject, Group, Point, util } from "../apps/web/node_modules/fabric";
import { DEFAULT_CREATION_DEFAULTS } from "../apps/web/src/editor/creation";
import { createShapeObject } from "../apps/web/src/editor/creationObjects";
import { SCIENTIFIC_PRESETS } from "../apps/web/src/editor/scientific/catalog";
import {
  brushAnchorInScene,
  createScientificObject,
  detachBrush,
  isScientificBrush,
  updateBrushObject
} from "../apps/web/src/editor/scientific/objects";
import {
  moveBrushAnchor,
  configureScientificControls
} from "../apps/web/src/editor/scientific/controls";
import { sampleBrush } from "../apps/web/src/editor/scientific/geometry";

FabricObject.customProperties = [
  ...new Set([
    ...FabricObject.customProperties,
    "scientificBrush",
    "objectId",
    "name",
    "OpenSketchType"
  ])
];
function membrane() {
  const object = createScientificObject("editable-membrane", DEFAULT_CREATION_DEFAULTS)!;
  if (!isScientificBrush(object)) throw new Error("Missing brush");
  object.objectId = "root-id";
  return object;
}
function near(a: Point, b: Point) {
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
}

describe("new flat scientific structures", () => {
  it("preserves the legacy membrane and creates every new preset as vector parts", () => {
    expect(
      createShapeObject("membrane", DEFAULT_CREATION_DEFAULTS).scientificBrush
    ).toBeUndefined();
    for (const preset of SCIENTIFIC_PRESETS) {
      const object = createShapeObject(preset.id, DEFAULT_CREATION_DEFAULTS);
      expect(object).toBeInstanceOf(Group);
      expect(object.toSVG()).not.toMatch(/<image|NaN|Infinity|linearGradient|radialGradient/);
      expect(object.toSVG()).toMatch(/<path|<ellipse|<circle|<rect/);
    }
  });
  it("extends a rotated membrane without moving its opposite anchor or stretching lipids", () => {
    const object = membrane();
    object.set({ left: 210, top: 170, angle: 37, scaleX: 1.2, scaleY: 1.2 });
    const fixed = brushAnchorInScene(object, 0);
    const oldUnits = object.getObjects().length;
    const oldHead = (object.getObjects()[0] as Group).getObjects()[2].width;
    const end = util.transformPoint(
      new Point(object.scientificBrush.points[1].x + 180, object.scientificBrush.points[1].y),
      object.calcOwnMatrix()
    );
    expect(moveBrushAnchor(object, 1, end)).toBe(true);
    near(brushAnchorInScene(object, 0), fixed);
    near(brushAnchorInScene(object, 1), end);
    expect(object.getObjects().length).toBeGreaterThan(oldUnits);
    expect((object.getObjects()[0] as Group).getObjects()[2].width).toBe(oldHead);
    expect(object.objectId).toBe("root-id");
    expect(object.angle).toBe(37);
  });
  it("preserves the opposite endpoint within a transformed composite", () => {
    const object = membrane();
    const parent = new Group([object], {
      left: 500,
      top: 250,
      angle: 25,
      scaleX: 0.75,
      scaleY: 0.75
    });
    const fixed = brushAnchorInScene(object, 0);
    const target = util.transformPoint(
      new Point(object.scientificBrush.points[1].x + 100, 20),
      object.calcOwnMatrix()
    );
    const sceneTarget = util.transformPoint(target, parent.calcTransformMatrix());
    expect(moveBrushAnchor(object, 1, target)).toBe(true);
    near(brushAnchorInScene(object, 0), fixed);
    near(brushAnchorInScene(object, 1), sceneTarget);
  });
  it("round-trips path editability through project JSON and clone", async () => {
    const original = membrane();
    configureScientificControls(original);
    const [restored] = await util.enlivenObjects([JSON.parse(JSON.stringify(original.toObject()))]);
    expect(restored).toBeInstanceOf(Group);
    if (!(restored instanceof Group) || !isScientificBrush(restored))
      throw new Error("Lost metadata");
    configureScientificControls(restored);
    expect(restored.controls.brushPoint0).toBeDefined();
    expect(restored.scientificBrush).toEqual(original.scientificBrush);
    const clone = await restored.clone();
    expect(clone.scientificBrush).toEqual(restored.scientificBrush);
    const originalSpec = JSON.stringify(restored.scientificBrush);
    expect(moveBrushAnchor(clone, 1, new Point(450, 80))).toBe(true);
    expect(JSON.stringify(restored.scientificBrush)).toBe(originalSpec);
    expect(moveBrushAnchor(restored, 1, new Point(400, 50))).toBe(true);
  });
  it("rejects excessive geometry and invalid settings without changing the original", () => {
    const object = membrane();
    const before = JSON.stringify(object.toObject());
    expect(() =>
      updateBrushObject(object, {
        ...object.scientificBrush,
        points: [
          { x: -10000, y: 0 },
          { x: 10000, y: 0 }
        ],
        unitSize: 8
      })
    ).toThrow(/maximum/);
    expect(() => updateBrushObject(object, { ...object.scientificBrush, unitSize: NaN })).toThrow(
      /Invalid/
    );
    expect(JSON.stringify(object.toObject())).toBe(before);
  });
  it("retains palette changes after extension and releases ordinary editable parts", () => {
    const object = membrane();
    updateBrushObject(object, { ...object.scientificBrush, fill: "#d48e8e" });
    moveBrushAnchor(object, 1, new Point(370, 0));
    expect(object.toSVG()).toContain("212,142,142");
    detachBrush(object);
    expect(object.scientificBrush).toBeUndefined();
    expect(object.OpenSketchType).toBe("group");
    expect(object.getObjects().every((child) => child.selectable)).toBe(true);
    expect(object.controls.brushPoint0).toBeUndefined();
  });
  it("places closed-loop repeats without a duplicated seam", () => {
    const object = createScientificObject("membrane-ring", DEFAULT_CREATION_DEFAULTS)!;
    if (!isScientificBrush(object)) throw new Error("Missing brush");
    const { samples } = sampleBrush(object.scientificBrush);
    expect(samples[0]).not.toEqual(samples.at(-1));
    expect(object.scientificBrush.closed).toBe(true);
  });
});

// Use the actual portable-project validator, not only Fabric's JSON loader.
it("persists scientific metadata through strict project validation and rejects malformed settings", () => {
  const object = membrane().toObject();
  const project = {
    format: "OpenSketch",
    formatVersion: 1,
    version: 1,
    id: "test",
    name: "Test",
    createdAt: "2026-09-05T00:00:00Z",
    updatedAt: "2026-09-05T00:00:00Z",
    canvas: DEFAULT_CANVAS,
    objects: { objects: [object] },
    uploads: [],
    usedAssetIds: []
  };
  expect(() => migrateProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
  for (const malformed of [
    { spacing: 0 },
    { unitSize: Infinity },
    { unexpected: true },
    { kind: "not-a-kind" },
    { points: [{ x: 0, y: 0 }] }
  ]) {
    const changed = structuredClone(project);
    changed.objects.objects[0].scientificBrush = { ...object.scientificBrush!, ...malformed };
    expect(() => migrateProject(changed)).toThrow(/scientificBrush/);
  }
});
it("keeps the nucleus inside the cell and nucleolus inside the nucleus", () => {
  const cell = createScientificObject("editable-cell", DEFAULT_CREATION_DEFAULTS)!;
  const [outline, nucleus, nucleolus] = cell.getObjects();
  for (const [outer, inner] of [
    [outline, nucleus],
    [nucleus, nucleolus]
  ]) {
    const a = outer.getBoundingRect(),
      b = inner.getBoundingRect();
    expect(b.left).toBeGreaterThan(a.left);
    expect(b.top).toBeGreaterThan(a.top);
    expect(b.left + b.width).toBeLessThan(a.left + a.width);
    expect(b.top + b.height).toBeLessThan(a.top + a.height);
  }
});

it("rejects a bundled insertion before exceeding the portable scene budget", () => {
  const incoming = membrane();
  expect(() => assertAssetCapacity([], incoming)).not.toThrow();
  const existing = Array.from({ length: 10000 }, () => new FabricObject());
  expect(() => assertAssetCapacity(existing, incoming)).toThrow(/editable-object limit/);
  expect(existing).toHaveLength(10000);
});
