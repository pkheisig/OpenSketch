import { describe, expect, it } from "vitest";
import {
  createFreeConnectorObject,
  normalizeConnectorHeadOffsets,
  routeOrthogonal
} from "../apps/web/src/editor/connectors";
import {
  buildConnectorGeometry,
  connectorArrowheadPoint,
  connectorStrokeLineCap
} from "../apps/web/src/editor/connectorGeometry";
import {
  CONNECTOR_PRESETS,
  connectorPreviewEndpoints
} from "../apps/web/src/editor/connectorPresets";
import type { ConnectorBinding, ConnectorPathShape } from "../packages/editor-core/src/types";

const PATH_SHAPES: ConnectorPathShape[] = [
  "straight",
  "elbow",
  "rounded-elbow",
  "step",
  "rounded-step",
  "arc",
  "arch",
  "wave",
  "pulse",
  "circular",
  "bracket-square",
  "bracket-square-center",
  "bracket-round",
  "bracket-curly"
];

const normalizedDegrees = (value: number) => ((value % 360) + 360) % 360;

describe("orthogonal connector routing", () => {
  it("allows headless connectors to override their endpoint cap", () => {
    expect(connectorStrokeLineCap("none", "none", "butt")).toBe("butt");
    expect(connectorStrokeLineCap("none", "none", "round")).toBe("round");
    expect(connectorStrokeLineCap("none", "triangle", "round")).toBe("butt");
  });

  it("keeps a direct route compact when the path is clear", () => {
    expect(routeOrthogonal({ x: 0, y: 40 }, { x: 300, y: 40 }, "right", "left", [])).toEqual([
      { x: 0, y: 40 },
      { x: 300, y: 40 }
    ]);
  });

  it("routes around expanded intervening object bounds", () => {
    const obstacle = { left: 120, top: 0, width: 60, height: 80 };
    const route = routeOrthogonal({ x: 0, y: 40 }, { x: 300, y: 40 }, "right", "left", [obstacle]);

    expect(route.length).toBeGreaterThanOrEqual(4);
    expect(route.some((point) => point.y <= -18 || point.y >= 98)).toBe(true);
    for (let index = 1; index < route.length; index += 1) {
      const from = route[index - 1];
      const to = route[index];
      expect(from.x === to.x || from.y === to.y).toBe(true);
      if (from.y === to.y && from.y > -18 && from.y < 98) {
        expect(Math.max(from.x, to.x) <= 102 || Math.min(from.x, to.x) >= 198).toBe(true);
      }
    }
  });

  it("honors the exit direction of attached edge anchors", () => {
    const route = routeOrthogonal({ x: 80, y: 100 }, { x: 260, y: 300 }, "top", "right", [
      { left: 120, top: 100, width: 90, height: 130 }
    ]);

    expect(route[1].x).toBe(80);
    expect(route[1].y).toBeLessThan(100);
    expect(route.at(-2)?.x).toBeGreaterThan(260);
    expect(route.at(-2)?.y).toBe(300);
  });

  it("stays interactive in a dense one-hundred-object scene", () => {
    const obstacles = Array.from({ length: 100 }, (_, index) => ({
      left: 90 + (index % 10) * 105,
      top: -45 + Math.floor(index / 10) * 95,
      width: 58,
      height: 58
    }));
    const started = performance.now();
    const route = routeOrthogonal({ x: 0, y: 0 }, { x: 1200, y: 0 }, "right", "left", obstacles);

    expect(performance.now() - started).toBeLessThan(1000);
    expect(route.length).toBeGreaterThanOrEqual(4);
    route.slice(1).forEach((point, index) => {
      const previous = route[index];
      expect(point.x === previous.x || point.y === previous.y).toBe(true);
    });
  });
});

describe("free connector geometry", () => {
  it.each(PATH_SHAPES)("builds finite %s preview and canvas geometry", (pathShape) => {
    const geometry = buildConnectorGeometry(
      { x: 0, y: 0 },
      { x: 240, y: 0 },
      pathShape,
      pathShape === "circular" ? 0.8 : 0
    );

    expect(geometry.pathData).toMatch(/^M /);
    expect(geometry.pathData).not.toMatch(/NaN|Infinity/);
    expect(
      [
        geometry.startPoint.x,
        geometry.startPoint.y,
        geometry.endPoint.x,
        geometry.endPoint.y,
        geometry.startAngle,
        geometry.endAngle
      ].every(Number.isFinite)
    ).toBe(true);
  });

  it("keeps rounded steps distinct and gives circular connectors a true arc", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 240, y: 0 };
    const diagonalTo = { x: 240, y: -120 };
    const roundedStep = buildConnectorGeometry(from, diagonalTo, "rounded-step");
    const roundedElbow = buildConnectorGeometry(from, diagonalTo, "rounded-elbow");
    const circular = buildConnectorGeometry(from, to, "circular", 0.8);

    expect(roundedStep.pathData).toContain(" Q ");
    expect(roundedStep.pathData).not.toBe(roundedElbow.pathData);
    expect(circular.pathData).toContain(" A ");
    expect(Math.abs(circular.startAngle - circular.endAngle)).toBeGreaterThan(0.5);
  });

  it("matches the reference family sizes and builds every visible preset", () => {
    expect(
      Object.fromEntries(
        Object.entries(CONNECTOR_PRESETS).map(([family, values]) => [family, values.length])
      )
    ).toEqual({
      lines: 21,
      arrows: 28,
      inhibitor: 12,
      dots: 4,
      neurons: 10,
      circular: 16,
      brackets: 5
    });

    Object.values(CONNECTOR_PRESETS)
      .flat()
      .forEach((preset) => {
        const { from, to } = connectorPreviewEndpoints(preset);
        const geometry = buildConnectorGeometry(from, to, preset.pathShape, preset.curvature);
        const binding: ConnectorBinding = {
          fromObjectId: "",
          fromAnchor: "center",
          toObjectId: "",
          toAnchor: "center",
          startArrowhead: preset.startArrowhead,
          endArrowhead: preset.endArrowhead,
          lineStyle: preset.lineStyle,
          pathShape: preset.pathShape,
          routing: "direct",
          curvature: preset.curvature ?? 0
        };
        const offset = preset.defaultOffset ?? { x: 220, y: 0 };
        const object = createFreeConnectorObject(
          { x: 0, y: 0 },
          offset,
          binding,
          {
            color: "#244947",
            width: 5 * (preset.widthScale ?? 1),
            opacity: preset.opacity ?? 1
          }
        );

        expect(geometry.pathData, preset.label).not.toMatch(/NaN|Infinity/);
        expect(object.toSVG(), preset.label).not.toMatch(/NaN|Infinity/);
        expect(object.getObjects()[0].strokeLineCap, preset.label).toBe(
          connectorStrokeLineCap(preset.startArrowhead, preset.endArrowhead)
        );
        expect(object.getObjects().length, preset.label).toBe(
          1 +
            Number(preset.startArrowhead !== "none") +
            Number(preset.endArrowhead !== "none")
        );
      });
  });

  it("projects filled arrowheads beyond the centerline without moving other endpoints", () => {
    expect(connectorArrowheadPoint("triangle", { x: 220, y: 40 }, 0, 10)).toEqual({
      x: 230,
      y: 40
    });
    expect(
      connectorArrowheadPoint("neuron", { x: 220, y: 40 }, Math.PI / 2, 10)
    ).toEqual({
      x: 220,
      y: 50
    });
    expect(connectorArrowheadPoint("open", { x: 220, y: 40 }, 0, 10)).toEqual({
      x: 220,
      y: 40
    });
  });

  it("repairs old filled-head offsets once when loading saved connectors", () => {
    const binding: ConnectorBinding = {
      fromObjectId: "",
      fromAnchor: "center",
      toObjectId: "",
      toAnchor: "center",
      startArrowhead: "none",
      endArrowhead: "triangle",
      lineStyle: "solid",
      pathShape: "straight",
      routing: "direct",
      curvature: 0
    };
    const object = createFreeConnectorObject({ x: 0, y: 0 }, { x: 220, y: 0 }, binding, {
      color: "#244947",
      width: 10,
      opacity: 1
    });
    const head = object.getObjects()[1];
    const correctedCenter = head.getCenterPoint();
    head.set({ left: (head.left ?? 0) - 10 });
    object.connectorHeadOffsetVersion = undefined;

    expect(normalizeConnectorHeadOffsets(object)).toBe(true);
    expect(head.getCenterPoint().x).toBeCloseTo(correctedCenter.x, 6);
    expect(head.getCenterPoint().y).toBeCloseTo(correctedCenter.y, 6);
    expect(normalizeConnectorHeadOffsets(object)).toBe(false);
    expect(head.getCenterPoint().x).toBeCloseTo(correctedCenter.x, 6);
  });

  it("uses true one-bend and two-bend topology for elbow and step families", () => {
    const from = { x: 0, y: 120 };
    const to = { x: 240, y: 0 };
    const elbow = buildConnectorGeometry(from, to, "elbow");
    const step = buildConnectorGeometry(from, to, "step");
    const roundedElbow = buildConnectorGeometry(from, to, "rounded-elbow");
    const roundedStep = buildConnectorGeometry(from, to, "rounded-step");

    expect(elbow.pathData.match(/ L /g)).toHaveLength(2);
    expect(step.pathData.match(/ L /g)).toHaveLength(3);
    expect(roundedElbow.pathData.match(/ Q /g)).toHaveLength(1);
    expect(roundedStep.pathData.match(/ Q /g)).toHaveLength(2);
  });

  it("rotates triangle and neuron heads along their actual endpoint tangents", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 240, y: 0 };
    const geometry = buildConnectorGeometry(from, to, "rounded-elbow");
    const binding: ConnectorBinding = {
      fromObjectId: "",
      fromAnchor: "center",
      toObjectId: "",
      toAnchor: "center",
      startArrowhead: "neuron",
      endArrowhead: "triangle",
      lineStyle: "solid",
      pathShape: "rounded-elbow",
      routing: "direct",
      curvature: 0
    };
    const object = createFreeConnectorObject(from, to, binding, {
      color: "#244947",
      width: 5,
      opacity: 1
    });
    const [, startHead, endHead] = object.getObjects();

    expect(normalizedDegrees(startHead.angle)).toBeCloseTo(
      normalizedDegrees((geometry.startAngle * 180) / Math.PI + 90),
      6
    );
    expect(normalizedDegrees(endHead.angle)).toBeCloseTo(
      normalizedDegrees((geometry.endAngle * 180) / Math.PI + 90),
      6
    );
  });

  it("builds vertical click-created bracket geometry with distinct bracket styles", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 0, y: 220 };
    const square = buildConnectorGeometry(from, to, "bracket-square");
    const squareBrace = buildConnectorGeometry(from, to, "bracket-square-center");
    const round = buildConnectorGeometry(from, to, "bracket-round");
    const curly = buildConnectorGeometry(from, to, "bracket-curly");

    expect(square.startPoint.x).toBeGreaterThan(from.x);
    expect(squareBrace.pathData.split(" M ")).toHaveLength(2);
    expect(
      new Set([square.pathData, squareBrace.pathData, round.pathData, curly.pathData]).size
    ).toBe(4);
  });

  it("rotates the selection bounds to match drag-created arrows", () => {
    const binding: ConnectorBinding = {
      fromObjectId: "",
      fromAnchor: "center",
      toObjectId: "",
      toAnchor: "center",
      startArrowhead: "none",
      endArrowhead: "triangle",
      lineStyle: "solid",
      routing: "direct",
      curvature: 0
    };
    const from = { x: 120, y: 180 };
    const to = { x: 420, y: 330 };
    const object = createFreeConnectorObject(from, to, binding, {
      color: "#000000",
      width: 6,
      opacity: 1
    });
    const expectedAngle = Math.atan2(to.y - from.y, to.x - from.x);
    const [topLeft, topRight] = object.getCoords();
    const selectionAngle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x);

    expect(object.angle).toBeCloseTo((expectedAngle * 180) / Math.PI, 6);
    expect(selectionAngle).toBeCloseTo(expectedAngle, 6);
  });

  it.each([
    ["elbow", "bar"],
    ["wave", "circle"],
    ["pulse", "open-circle"],
    ["circular", "triangle"],
    ["bracket-curly", "none"]
  ] as const)("renders editable %s paths with %s endpoints", (pathShape, endArrowhead) => {
    const binding: ConnectorBinding = {
      fromObjectId: "",
      fromAnchor: "center",
      toObjectId: "",
      toAnchor: "center",
      startArrowhead: pathShape === "wave" ? "neuron" : "none",
      endArrowhead,
      lineStyle: pathShape === "pulse" ? "dashed" : "solid",
      pathShape,
      routing: "direct",
      curvature: pathShape === "circular" ? 0.8 : 0
    };
    const object = createFreeConnectorObject({ x: 10, y: 20 }, { x: 310, y: 20 }, binding, {
      color: "#244947",
      width: 5,
      opacity: 1
    });

    expect(object.getObjects().length).toBeGreaterThanOrEqual(endArrowhead === "none" ? 1 : 2);
    expect(object.toSVG()).toContain("rgb(36,73,71)");
    expect(object.connector?.pathShape).toBe(pathShape);
  });
});
