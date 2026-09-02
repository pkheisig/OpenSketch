import { Circle, FabricObject, Group, Line, Path, Polygon, Rect, Triangle } from "fabric";
import type { CreationDefaults, ShapeKind } from "./creation";

function createArrowPath(doubleHeaded = false, curved = false): FabricObject {
  const data = curved
    ? "M 0 60 Q 90 -20 180 60 M 165 45 L 180 60 L 160 66"
    : doubleHeaded
      ? "M 0 40 L 180 40 M 15 25 L 0 40 L 15 55 M 165 25 L 180 40 L 165 55"
      : "M 0 40 L 180 40 M 165 25 L 180 40 L 165 55";
  return new Path(data, {
    fill: "",
    stroke: "#25494b",
    strokeWidth: 5,
    strokeLineCap: "round",
    strokeLineJoin: "round"
  });
}

/** Create an existing editor shape without adding it to a canvas or selection. */
export function createShapeObject(kind: ShapeKind, defaults: CreationDefaults): FabricObject {
  const common = { ...defaults.shape };
  if (kind === "rectangle" || kind === "rounded-rectangle") {
    return new Rect({
      ...common,
      width: 280,
      height: 170,
      rx: kind === "rounded-rectangle" ? 28 : 0,
      ry: kind === "rounded-rectangle" ? 28 : 0
    });
  }
  if (kind === "circle") return new Circle({ ...common, radius: 95 });
  if (kind === "ellipse") return new Circle({ ...common, radius: 100, scaleX: 1.5, scaleY: 0.85 });
  if (kind === "pill") return new Rect({ ...common, width: 280, height: 120, rx: 60, ry: 60 });
  if (kind === "donut") {
    return new Path("M 100 0 A 100 100 0 1 1 99.9 0 M 100 42 A 58 58 0 1 0 100.1 42 Z", {
      ...common,
      fillRule: "evenodd"
    });
  }
  if (kind === "triangle") return new Triangle({ ...common, width: 210, height: 190 });
  if (kind === "right-triangle") {
    return new Polygon(
      [
        { x: 0, y: 0 },
        { x: 0, y: 190 },
        { x: 220, y: 190 }
      ],
      common
    );
  }
  if (kind === "pentagon") {
    return new Polygon(
      [
        { x: 100, y: 0 },
        { x: 195, y: 69 },
        { x: 159, y: 181 },
        { x: 41, y: 181 },
        { x: 5, y: 69 }
      ],
      common
    );
  }
  if (kind === "polygon") {
    return new Polygon(
      [
        { x: 50, y: 0 },
        { x: 150, y: 0 },
        { x: 200, y: 86 },
        { x: 150, y: 172 },
        { x: 50, y: 172 },
        { x: 0, y: 86 }
      ],
      common
    );
  }
  if (kind === "octagon") {
    return new Polygon(
      [
        { x: 60, y: 0 },
        { x: 160, y: 0 },
        { x: 220, y: 60 },
        { x: 220, y: 160 },
        { x: 160, y: 220 },
        { x: 60, y: 220 },
        { x: 0, y: 160 },
        { x: 0, y: 60 }
      ],
      common
    );
  }
  if (kind === "diamond") {
    return new Polygon(
      [
        { x: 110, y: 0 },
        { x: 220, y: 90 },
        { x: 110, y: 180 },
        { x: 0, y: 90 }
      ],
      common
    );
  }
  if (kind === "trapezoid") {
    return new Polygon(
      [
        { x: 50, y: 0 },
        { x: 190, y: 0 },
        { x: 240, y: 170 },
        { x: 0, y: 170 }
      ],
      common
    );
  }
  if (kind === "parallelogram") {
    return new Polygon(
      [
        { x: 50, y: 0 },
        { x: 250, y: 0 },
        { x: 200, y: 170 },
        { x: 0, y: 170 }
      ],
      common
    );
  }
  if (kind === "line") {
    return new Line([0, 0, 220, 0], {
      stroke: defaults.line.color,
      strokeWidth: defaults.line.width,
      strokeLineCap: "round"
    });
  }
  if (kind === "bracket") {
    return new Path("M 32 0 H 0 V 180 H 32 M 168 0 H 200 V 180 H 168", {
      fill: "",
      stroke: defaults.shape.stroke,
      strokeWidth: defaults.shape.strokeWidth,
      strokeLineCap: "round",
      strokeLineJoin: "round"
    });
  }
  if (kind === "callout") {
    return new Polygon(
      [
        { x: 0, y: 0 },
        { x: 260, y: 0 },
        { x: 260, y: 150 },
        { x: 90, y: 150 },
        { x: 48, y: 200 },
        { x: 58, y: 150 },
        { x: 0, y: 150 }
      ],
      { ...common, strokeLineJoin: "round" }
    );
  }
  if (kind === "membrane") {
    const lipids: FabricObject[] = [];
    for (let index = 0; index < 9; index += 1) {
      const x = index * 30;
      lipids.push(
        new Circle({ left: x, top: 0, radius: 8, fill: "#69bdb4", stroke: "#25494b" }),
        new Line([x + 8, 16, x + 8, 42], { stroke: "#25494b", strokeWidth: 3 }),
        new Circle({ left: x, top: 58, radius: 8, fill: "#69bdb4", stroke: "#25494b" }),
        new Line([x + 8, 32, x + 8, 58], { stroke: "#25494b", strokeWidth: 3 })
      );
    }
    return new Group(lipids);
  }
  return createArrowPath(kind === "double-arrow", kind === "curved-arrow");
}
