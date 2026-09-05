import {
  Circle,
  Ellipse,
  FabricObject,
  FixedLayout,
  FitContentLayout,
  Group,
  LayoutManager,
  Line,
  Path,
  Point,
  Rect,
  util
} from "fabric";
import type { CreationDefaults } from "../creation";
import { scientificPreset, validBrushSpec, type ScientificBrushSpec } from "./catalog";
import { sampleBrush } from "./geometry";

function mark(parts: FabricObject[], prefix = "") {
  parts.forEach((part, i) => {
    part.objectId ??= crypto.randomUUID();
    part.name ??= `${prefix}part ${i + 1}`;
    part.selectable = false;
    part.evented = false;
    if (part instanceof Group) mark(part.getObjects(), `${prefix}${i + 1}.`);
  });
}
function strokeLine(points: number[], color: string, width = 2) {
  return new Line(points as [number, number, number, number], {
    stroke: color,
    strokeWidth: width,
    strokeLineCap: "round",
    originX: "center",
    originY: "center"
  });
}
function dot(x: number, y: number, r: number, fill: string, stroke: string) {
  return new Circle({
    left: x,
    top: y,
    radius: r,
    originX: "center",
    originY: "center",
    fill,
    stroke,
    strokeWidth: 1.4
  });
}
function unit(spec: ScientificBrushSpec, index: number): FabricObject[] {
  const s = spec.unitSize,
    f = spec.fill,
    a = spec.accent,
    c = spec.stroke;
  if (spec.kind === "membrane" || spec.kind === "monolayer") {
    const row = (sign: number) => {
      const tail = (x: number, kink: number) =>
        new Path(
          `M ${x * s} ${sign * s * 0.5} L ${x * s} ${sign * s * 0.32} L ${(x + kink) * s} ${sign * s * 0.22} L ${(x + kink) * s} ${sign * s * 0.05}`,
          { fill: "", stroke: c, strokeWidth: 1.5, strokeLineCap: "round", strokeLineJoin: "round" }
        );
      return [
        strokeLine([-s * 0.13, sign * s * 0.5, s * 0.13, sign * s * 0.5], c, 1.5),
        tail(-0.13, -0.05),
        tail(0.13, 0.05),
        dot(0, sign * s * 0.78, s * 0.3, f, c),
        dot(0, sign * s * 0.78, s * 0.1, a, c)
      ];
    };
    return spec.kind === "membrane" ? [...row(-1), ...row(1)] : row(spec.flipped ? 1 : -1);
  }
  if (spec.kind === "surface") return [-0.72, 0, 0.72].map((y) => dot(0, y * s, s * 0.31, f, c));
  if (spec.kind === "protein-chain")
    return [
      new Rect({
        left: 0,
        top: 0,
        originX: "center",
        originY: "center",
        width: s * 0.7,
        height: s * 0.9,
        rx: s * 0.3,
        ry: s * 0.3,
        fill: index % 2 ? a : f,
        stroke: c,
        strokeWidth: 1.5
      })
    ];
  if (spec.kind === "epithelium")
    return [
      new Rect({
        left: 0,
        top: 0,
        originX: "center",
        originY: "center",
        width: s * 0.85,
        height: s * 1.65,
        rx: s * 0.16,
        ry: s * 0.16,
        fill: f,
        stroke: c,
        strokeWidth: 1.5
      }),
      new Ellipse({
        left: 0,
        top: (spec.flipped ? -1 : 1) * s * 0.35,
        originX: "center",
        originY: "center",
        rx: s * 0.19,
        ry: s * 0.25,
        fill: a,
        stroke: c,
        strokeWidth: 1
      })
    ];
  if (spec.kind === "microtubule")
    return [-0.5, 0, 0.5].map(
      (y, row) =>
        new Rect({
          left: 0,
          top: y * s,
          width: s * 0.72,
          height: s * 0.45,
          originX: "center",
          originY: "center",
          rx: s * 0.12,
          ry: s * 0.12,
          fill: (index + row) % 2 ? a : f,
          stroke: c,
          strokeWidth: 1
        })
    );
  if (spec.kind === "chromatin")
    return [
      new Ellipse({
        left: 0,
        top: 0,
        originX: "center",
        originY: "center",
        rx: s * 0.36,
        ry: s * 0.26,
        fill: f,
        stroke: c,
        strokeWidth: 2
      }),
      strokeLine([-s * 0.2, -s * 0.32, s * 0.2, s * 0.32], a, 3)
    ];
  if (spec.kind === "actin")
    return [dot(-s * 0.12, -s * 0.17, s * 0.23, f, c), dot(s * 0.2, s * 0.17, s * 0.23, a, c)];
  return [dot(0, 0, s * 0.2, f, c)];
}
export function createBrushObject(spec: ScientificBrushSpec): Group {
  if (!validBrushSpec(spec))
    throw new Error(
      "Invalid scientific brush settings: use a nonzero path, 2–24 anchors and a maximum of 300 repeat positions."
    );
  const { samples, points } = sampleBrush(spec);
  const objects: FabricObject[] = [];
  const pathData = (positions: { x: number; y: number }[]) =>
    positions.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const path = (positions: { x: number; y: number }[], color: string, width: number) =>
    new Path(pathData(positions), {
      fill: "",
      stroke: color,
      strokeWidth: width,
      strokeLineCap: "round",
      strokeLineJoin: "round"
    });
  if (spec.kind === "vessel") {
    objects.push(
      path(points, spec.stroke, spec.unitSize * 1.8),
      path(points, spec.fill, spec.unitSize * 1.6),
      path(points, spec.accent, spec.unitSize * 0.85)
    );
  } else if (spec.kind === "dna") {
    const strands: { x: number; y: number }[][] = [[], []];
    // Two opposed schematic backbones, with repeated rungs. No sequence or handedness claim.
    samples.forEach((p, i) => {
      const offset = Math.sin((i * Math.PI) / 3) * spec.unitSize * 0.65;
      const a = { x: p.x - Math.sin(p.angle) * offset, y: p.y + Math.cos(p.angle) * offset };
      const b = { x: p.x + Math.sin(p.angle) * offset, y: p.y - Math.cos(p.angle) * offset };
      strands[0].push(a);
      strands[1].push(b);
      objects.push(strokeLine([a.x, a.y, b.x, b.y], spec.stroke, 1.5));
    });
    for (let i = 0; i < 2; i++)
      objects.push(path(strands[i], i ? spec.accent : spec.fill, spec.unitSize * 0.18));
  } else {
    if (spec.kind === "rna" || spec.kind === "chromatin" || spec.kind === "protein-chain")
      objects.push(path(points, spec.stroke, 2));
    samples.forEach((p, i) => {
      const parts = unit(spec, i);
      const object = new Group(parts, {
        left: p.x,
        top: p.y,
        originX: "center",
        originY: "center",
        angle: (p.angle * 180) / Math.PI
      });
      object.name = `${spec.kind} unit ${i + 1}`;
      objects.push(object);
    });
  }
  mark(objects);
  const group = new Group(objects, {
    layoutManager: new LayoutManager(new FixedLayout()),
    subTargetCheck: false,
    interactive: false
  });
  const center = group.getRelativeCenterPoint();
  group.scientificBrush = {
    ...spec,
    points: spec.points.map((p) => ({ x: p.x - center.x, y: p.y - center.y }))
  };
  group.OpenSketchType = "scientific-brush";
  group.name = spec.kind;
  return group;
}
/** Replace generated geometry in place. The root identity and parent-plane transform survive. */
export function updateBrushObject(group: Group, spec: ScientificBrushSpec): void {
  // Validate and render before touching the original; an excessive path must leave it intact.
  const replacement = createBrushObject(spec);
  const matrix = group.calcTransformMatrix();
  const center = util.transformPoint(replacement.getRelativeCenterPoint(), group.calcOwnMatrix());
  const children = replacement.removeAll();
  children.forEach((child) =>
    util.applyTransformToObject(
      child,
      util.multiplyTransformMatrices(matrix, child.calcOwnMatrix())
    )
  );
  group.removeAll();
  group.set({ width: replacement.width, height: replacement.height });
  group.setPositionByOrigin(center, "center", "center");
  group.add(...children);
  group.scientificBrush = replacement.scientificBrush;
  group.dirty = true;
  group.setCoords();
}
export function isScientificBrush(
  object: FabricObject
): object is Group & { scientificBrush: ScientificBrushSpec } {
  return object instanceof Group && validBrushSpec(object.scientificBrush);
}
export function detachBrush(group: Group) {
  group.scientificBrush = undefined;
  group.layoutManager.strategy = new FitContentLayout();
  group.OpenSketchType = "group";
  group.controls = { ...new Group().controls };
  group.setControlsVisibility({
    tl: true,
    tr: true,
    bl: true,
    br: true,
    ml: true,
    mr: true,
    mt: true,
    mb: true,
    mtr: true
  });
  group.set({ lockScalingX: false, lockScalingY: false, subTargetCheck: true, interactive: false });
  const enable = (object: FabricObject) => {
    object.set({ selectable: true, evented: true });
    object.OpenSketchType = object instanceof Group ? "group" : "shape";
    if (object instanceof Group) {
      object.subTargetCheck = true;
      object.getObjects().forEach(enable);
    }
  };
  group.getObjects().forEach(enable);
  group.dirty = true;
  group.setCoords();
}
export function createScientificObject(id: string, defaults: CreationDefaults): Group | null {
  const preset = scientificPreset(id);
  if (!preset) return null;
  const fill = /^#[0-9a-f]{6}$/i.test(defaults.shape.fill) ? defaults.shape.fill : "#d8efe9";
  const stroke = /^#[0-9a-f]{6}$/i.test(defaults.shape.stroke) ? defaults.shape.stroke : "#25494b";
  const accent = "#9b81b5";
  if (preset.form === "parts") {
    let parts: FabricObject[];
    if (preset.kind === "protein") {
      parts = [
        new Path(
          "M 5 42 Q -8 12 28 5 Q 55 -12 72 17 Q 109 12 110 46 Q 132 76 95 93 Q 78 125 49 99 Q 8 105 5 72 Q -12 60 5 42 Z",
          { fill, stroke, strokeWidth: 2.5 }
        ),
        dot(39, 47, 17, accent, stroke),
        dot(83, 67, 13, "#c6ded9", stroke)
      ];
      parts[0].name = "Protein outline";
      parts[1].name = "Domain A";
      parts[2].name = "Domain B";
    } else if (preset.kind === "receptor") {
      parts = [0, 1, 2].map(
        (i) =>
          new Rect({
            left: 0,
            top: i * 32,
            width: 24,
            height: 28,
            rx: 10,
            ry: 10,
            fill,
            stroke,
            strokeWidth: 2,
            name: `Extracellular domain ${i + 1}`
          })
      );
      parts.push(
        new Rect({
          left: 0,
          top: 94,
          width: 18,
          height: 30,
          rx: 5,
          ry: 5,
          fill: accent,
          stroke,
          strokeWidth: 2,
          name: "Membrane-spanning domain"
        }),
        new Path("M 0 109 Q 25 130 0 148 Q -16 163 6 177", {
          fill: "",
          stroke,
          strokeWidth: 5,
          name: "Cytoplasmic tail"
        })
      );
    } else if (preset.kind === "cell") {
      parts = [
        new Ellipse({
          rx: 100,
          ry: 76,
          left: 0,
          top: 0,
          originX: "left",
          originY: "top",
          fill,
          stroke,
          strokeWidth: 3
        }),
        new Ellipse({
          rx: 34,
          ry: 29,
          left: 63,
          top: 51,
          originX: "left",
          originY: "top",
          fill: accent,
          stroke,
          strokeWidth: 2
        }),
        dot(115, 86, 8, "#ddd1e8", stroke)
      ];
      parts[0].name = "Cell outline";
      parts[1].name = "Nucleus";
      parts[2].name = "Nucleolus";
    } else {
      const arm = (side: number, angle: number, name: string) => {
        const g = new Group(
          [
            new Rect({ width: 15, height: 64, rx: 7, ry: 7, fill, stroke, strokeWidth: 2 }),
            new Rect({
              left: side * 19,
              width: 11,
              height: 44,
              rx: 5,
              ry: 5,
              fill: accent,
              stroke,
              strokeWidth: 2
            })
          ],
          { left: 0, top: 0, angle }
        );
        const heavy = g.getObjects()[0];
        const end = util.transformPoint(
          new Point(heavy.left, heavy.top + heavy.height / 2),
          g.calcOwnMatrix()
        );
        g.set({ left: g.left + side * 7 - end.x, top: g.top + 16 - end.y });
        g.name = name;
        return g;
      };
      parts = [
        arm(-1, -38, "Left antigen-binding arm"),
        arm(1, 38, "Right antigen-binding arm"),
        new Rect({
          left: 0,
          top: 50,
          width: 27,
          height: 68,
          rx: 10,
          ry: 10,
          fill,
          stroke,
          strokeWidth: 2
        })
      ];
      parts[2].name = "Fc stem";
    }
    const g = new Group(parts);
    mark(parts);
    detachBrush(g);
    g.name = preset.label;
    return g;
  }
  let points = [
    { x: 0, y: 0 },
    { x: 320, y: 0 }
  ];
  if (preset.form === "curve")
    points = [
      { x: 0, y: 20 },
      { x: 160, y: -45 },
      { x: 320, y: 20 }
    ];
  const circular =
    preset.kind === "membrane" && (preset.form === "curve" || preset.form === "ring");
  if (circular)
    points = [
      { x: 0, y: 0 },
      { x: preset.form === "ring" ? 115 : -160, y: 0 }
    ];
  const brush = createBrushObject({
    version: 1,
    kind: preset.kind,
    points,
    ...(circular ? { arcSweep: preset.form === "ring" ? 360 : 180 } : {}),
    closed: preset.form === "ring",
    smooth: preset.form !== "line",
    unitSize: preset.kind === "dna" ? 14 : 22,
    spacing: ["membrane", "monolayer"].includes(preset.kind)
      ? 0.7
      : ["actin", "microtubule", "surface", "epithelium"].includes(preset.kind)
        ? 0.85
        : 1.15,
    flipped: false,
    fill,
    accent,
    stroke
  });
  brush.name = preset.label;
  return brush;
}
export function brushAnchorInScene(
  group: Group & { scientificBrush: ScientificBrushSpec },
  index: number
) {
  return util.transformPoint(
    new Point(group.scientificBrush.points[index]),
    group.calcTransformMatrix()
  );
}
