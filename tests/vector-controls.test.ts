import { describe, expect, it } from "vitest";
import { Line, Point, util, type FabricObject, type Group } from "../apps/web/node_modules/fabric";
import { createFreeConnectorObject } from "../apps/web/src/editor/connectors";
import { configureVectorControls } from "../apps/web/src/editor/vectorControls";
import type { ConnectorBinding } from "../packages/editor-core/src/types";

const binding: ConnectorBinding = {
  fromObjectId: "",
  fromAnchor: "center",
  toObjectId: "",
  toAnchor: "center",
  startArrowhead: "none",
  endArrowhead: "triangle",
  lineStyle: "solid",
  routing: "direct",
  pathShape: "straight",
  curvature: 0
};

function worldPoint(object: FabricObject, point: { x: number; y: number }) {
  return util.transformPoint(new Point(point.x, point.y), object.calcOwnMatrix());
}

function lineEndpoints(line: Line) {
  const points = line.calcLinePoints();
  return {
    start: worldPoint(line, { x: points.x1, y: points.y1 }),
    end: worldPoint(line, { x: points.x2, y: points.y2 })
  };
}

function connectorEndpoints(group: Group) {
  const geometry = group.freeConnectorGeometry!;
  return {
    start: worldPoint(group, geometry.from),
    end: worldPoint(group, geometry.to)
  };
}

describe("directional vector controls", () => {
  it("moves one Line endpoint while keeping the opposite endpoint fixed", () => {
    const line = new Line([0, 0, 220, 0], {
      left: 110,
      top: 100,
      strokeWidth: 8,
      angle: 28,
      scaleX: 1.4
    });
    configureVectorControls(line);
    const before = lineEndpoints(line);
    const action = line.controls.vectorEnd.actionHandler!;

    expect(action({}, { target: line, corner: "vectorEnd" } as never, 420, 260)).toBe(true);

    const after = lineEndpoints(line);
    expect(after.start.x).toBeCloseTo(before.start.x, 5);
    expect(after.start.y).toBeCloseTo(before.start.y, 5);
    expect(after.end.x).toBeCloseTo(420, 5);
    expect(after.end.y).toBeCloseTo(260, 5);
    expect(line.scaleX).toBe(1);
    expect(line.scaleY).toBe(1);
    expect(line.strokeWidth).toBe(8);
  });

  it("rebuilds a free arrow between its endpoints instead of scaling its bounds", () => {
    const arrow = createFreeConnectorObject({ x: 100, y: 200 }, { x: 400, y: 350 }, binding, {
      color: "#25494b",
      width: 6,
      opacity: 1
    });
    arrow.connector = undefined;
    configureVectorControls(arrow);
    const before = connectorEndpoints(arrow);
    const action = arrow.controls.vectorEnd.actionHandler!;

    expect(action({}, { target: arrow, corner: "vectorEnd" } as never, 560, 430)).toBe(true);

    const after = connectorEndpoints(arrow);
    expect(after.start.x).toBeCloseTo(before.start.x, 5);
    expect(after.start.y).toBeCloseTo(before.start.y, 5);
    expect(after.end.x).toBeCloseTo(560, 5);
    expect(after.end.y).toBeCloseTo(430, 5);
    expect(arrow.scaleX).toBe(1);
    expect(arrow.scaleY).toBe(1);
  });
});
