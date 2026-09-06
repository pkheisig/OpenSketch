import { assertAssetCapacity } from "../apps/web/src/editor/assetCapacity";
import { migrateProject, DEFAULT_CANVAS } from "../packages/editor-core/src";
import { describe, expect, it } from "vitest";
import {
  FabricObject,
  Group,
  Point,
  StaticCanvas,
  Rect,
  util
} from "../apps/web/node_modules/fabric";
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
  configureScientificControls,
  moveArcEnd
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
  it("keeps original semantic colors through manual recoloring and extension", () => {
    const object = membrane();
    const original = { ...object.originalPalette };
    expect(original["scientific:fill"]).toBe(object.scientificBrush.fill);
    updateBrushObject(object, { ...object.scientificBrush, fill: "#d48e8e" });
    moveBrushAnchor(object, 1, new Point(370, 0));
    expect(object.originalPalette).toEqual(original);
    const legacy = membrane();
    legacy.originalPalette = undefined;
    updateBrushObject(legacy, { ...legacy.scientificBrush, fill: "#d48e8e" });
    expect(legacy.originalPalette).toEqual(original);
  });
  it("rejects regeneration above the complete scene budget without mutation", () => {
    const canvas = new StaticCanvas(undefined);
    const object = membrane();
    canvas.add(object);
    const filler = new Group(Array.from({ length: 8000 }, () => new Rect({ width: 1, height: 1 })));
    canvas.add(filler);
    const before = JSON.stringify(object.toObject());
    expect(() =>
      updateBrushObject(object, {
        ...object.scientificBrush,
        points: [
          { x: 0, y: 0 },
          { x: 4590, y: 0 }
        ]
      })
    ).toThrow(/editable-object limit/);
    expect(JSON.stringify(object.toObject())).toBe(before);
    canvas.dispose();
  });
  it("preserves original and current paints when converting a recolored brush", () => {
    const object = membrane();
    const original = object.scientificBrush.fill;
    object.assetBrightness = 25;
    object.assetSaturation = 30;
    updateBrushObject(object, { ...object.scientificBrush, fill: "#d48e8e" });
    detachBrush(object);
    expect(object.assetBrightness).toBe(0);
    expect(object.assetSaturation).toBe(0);
    const leaves: FabricObject[] = [];
    const walk = (part: FabricObject) =>
      part instanceof Group ? part.getObjects().forEach(walk) : leaves.push(part);
    walk(object);
    const changed = leaves.filter((part) => part.fill === "#d48e8e");
    expect(changed.length).toBeGreaterThan(0);
    expect(
      changed.every((part) => part.originalFill === original && part.effectBaseFill === "#d48e8e")
    ).toBe(true);
  });
  it("initializes the same palette metadata through the shape menu", () => {
    for (const kind of [
      "editable-cell",
      "editable-protein",
      "editable-receptor",
      "editable-antibody"
    ] as const) {
      const object = createShapeObject(kind, DEFAULT_CREATION_DEFAULTS);
      expect(object.familyId).toBe(kind);
      expect(object).toBeInstanceOf(Group);
      const leaves: FabricObject[] = [];
      const walk = (part: FabricObject) =>
        part instanceof Group ? part.getObjects().forEach(walk) : leaves.push(part);
      walk(object);
      expect(
        leaves
          .filter((part) => typeof part.fill === "string" && part.fill)
          .every((part) => part.originalFill === part.fill)
      ).toBe(true);
    }
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
    kind: "diagram",
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

it("samples round membranes on an exact circle and closes without a duplicate seam", () => {
  const object = createScientificObject("curved-membrane", DEFAULT_CREATION_DEFAULTS)!;
  const spec = object.scientificBrush!;
  expect(spec.arcSweep).toBe(180);
  for (const sweep of [30, 180, 270, 359, 360]) {
    const circle = { ...spec, arcSweep: sweep, closed: sweep === 360 };
    const result = sampleBrush(circle),
      center = circle.points[0];
    for (const p of result.samples) {
      expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(160, 8);
      const radialAngle = Math.atan2(p.y - center.y, p.x - center.x);
      expect(Math.cos(p.angle - radialAngle)).toBeCloseTo(0, 8);
    }
    const first = result.samples[0],
      last = result.samples.at(-1)!;
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(0);
  }
});
it("edits arc extent in a rotated group and preserves its circle center", () => {
  const object = createScientificObject("curved-membrane", DEFAULT_CREATION_DEFAULTS)!;
  object.set({ left: 300, top: 200, angle: 27, scaleX: 1.2, scaleY: 1.2 });
  const center = brushAnchorInScene(
    object as Group & { scientificBrush: NonNullable<Group["scientificBrush"]> },
    0
  );
  const spec = object.scientificBrush!,
    p = spec.points[0];
  const target = util.transformPoint(new Point(p.x, p.y + 160), object.calcOwnMatrix());
  expect(moveArcEnd(object, target)).toBe(true);
  expect(object.scientificBrush!.arcSweep).toBe(270);
  near(
    brushAnchorInScene(
      object as Group & { scientificBrush: NonNullable<Group["scientificBrush"]> },
      0
    ),
    center
  );
  configureScientificControls(object);
  expect(object.controls.arcEnd).toBeDefined();
  expect(object.controls.brushPoint0).toBeUndefined();
});

it("changes curvature both ways without moving endpoints across compatible structures", async () => {
  const { CURVATURE_BRUSH_KINDS, withBrushCurvature, validBrushSpec } =
    await import("../packages/editor-core/src");
  for (const kind of CURVATURE_BRUSH_KINDS) {
    const base = { ...membrane().scientificBrush, kind };
    const before = sampleBrush(base).samples;
    for (const angle of [-270, -90, 90, 270]) {
      const curved = withBrushCurvature(base, angle);
      expect(validBrushSpec(curved)).toBe(true);
      const samples = sampleBrush(curved).samples;
      near(new Point(samples[0]), new Point(before[0]));
      near(new Point(samples.at(-1)!), new Point(before.at(-1)!));
      expect(curved.unitSize).toBe(base.unitSize);
      const straight = withBrushCurvature(curved, 0);
      expect(straight.arcSweep).toBeUndefined();
      const ends = sampleBrush(straight).samples;
      near(new Point(ends[0]), new Point(before[0]));
      near(new Point(ends.at(-1)!), new Point(before.at(-1)!));
    }
  }
});
it("preserves endpoint positions in the scene when a rotated structure bends", async () => {
  const { withBrushCurvature } = await import("../packages/editor-core/src");
  const object = membrane();
  object.set({ left: 350, top: 200, angle: 37, scaleX: 1.3, scaleY: 1.3 });
  const a = brushAnchorInScene(object, 0),
    b = brushAnchorInScene(object, 1);
  updateBrushObject(object, withBrushCurvature(object.scientificBrush, -90));
  const samples = sampleBrush(object.scientificBrush).samples;
  near(util.transformPoint(new Point(samples[0]), object.calcTransformMatrix()), a);
  near(util.transformPoint(new Point(samples.at(-1)!), object.calcTransformMatrix()), b);
});
