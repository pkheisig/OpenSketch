import type { ConnectorPathShape } from "@workspace/editor-core";
import type { Point } from "./geometry";

export interface ConnectorGeometry {
  pathData: string;
  startPoint: Point;
  endPoint: Point;
  startAngle: number;
  endAngle: number;
}

const angleFrom = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);
const pointText = (point: Point) => `${point.x} ${point.y}`;

/**
 * Produces the single source of truth for connector paths and endpoint
 * tangents. Both the sidebar previews and Fabric canvas objects use this
 * geometry so an arrowhead cannot disagree with the line shown beneath it.
 */
export function buildConnectorGeometry(
  from: Point,
  to: Point,
  pathShape: ConnectorPathShape,
  curvature = 0
): ConnectorGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const point = (progress: number, normal = 0): Point => ({
    x: from.x + dx * progress + normalX * normal,
    y: from.y + dy * progress + normalY * normal
  });
  const bracket = pathShape.startsWith("bracket-");
  const direction = bracket ? (curvature > 0 ? 1 : -1) : curvature < 0 ? -1 : 1;
  const amplitude = Math.min(46, length * 0.18) * direction;
  const bend =
    (curvature || (["arc", "circular"].includes(pathShape) ? 0.3 : 0)) * Math.min(length, 280);
  const control = {
    x: (from.x + to.x) / 2 + normalX * bend,
    y: (from.y + to.y) / 2 + normalY * bend
  };

  let pathData = `M ${pointText(from)} L ${pointText(to)}`;
  let startPoint = from;
  let endPoint = to;
  let startTangent = to;
  let endTangent = from;

  if (pathShape === "elbow") {
    const first = point(0.46);
    const second = point(0.46, amplitude);
    const third = point(0.72, amplitude);
    pathData = `M ${pointText(from)} L ${pointText(first)} L ${pointText(second)} L ${pointText(
      third
    )} L ${pointText(to)}`;
    startTangent = first;
    endTangent = third;
  } else if (pathShape === "rounded-elbow") {
    const first = point(0.4);
    const corner = point(0.5, amplitude);
    const last = point(0.72, amplitude);
    const endControl = point(0.82, amplitude);
    pathData = `M ${pointText(from)} L ${pointText(first)} Q ${pointText(
      point(0.5)
    )} ${pointText(corner)} L ${pointText(last)} Q ${pointText(endControl)} ${pointText(to)}`;
    startTangent = first;
    endTangent = endControl;
  } else if (pathShape === "step") {
    const first = point(0.28);
    const second = point(0.28, amplitude);
    const third = point(0.72, amplitude);
    const fourth = point(0.72);
    pathData = `M ${pointText(from)} L ${pointText(first)} L ${pointText(second)} L ${pointText(
      third
    )} L ${pointText(fourth)} L ${pointText(to)}`;
    startTangent = first;
    endTangent = fourth;
  } else if (pathShape === "rounded-step") {
    const first = point(0.24);
    const firstCorner = point(0.28);
    const firstRise = point(0.28, amplitude * 0.18);
    const firstTop = point(0.28, amplitude * 0.82);
    const secondCorner = point(0.28, amplitude);
    const secondTop = point(0.32, amplitude);
    const thirdTop = point(0.68, amplitude);
    const thirdCorner = point(0.72, amplitude);
    const secondRise = point(0.72, amplitude * 0.82);
    const secondBottom = point(0.72, amplitude * 0.18);
    const fourthCorner = point(0.72);
    const last = point(0.76);
    pathData = `M ${pointText(from)} L ${pointText(first)} Q ${pointText(
      firstCorner
    )} ${pointText(firstRise)} L ${pointText(firstTop)} Q ${pointText(
      secondCorner
    )} ${pointText(secondTop)} L ${pointText(thirdTop)} Q ${pointText(
      thirdCorner
    )} ${pointText(secondRise)} L ${pointText(secondBottom)} Q ${pointText(
      fourthCorner
    )} ${pointText(last)} L ${pointText(to)}`;
    startTangent = first;
    endTangent = last;
  } else if (pathShape === "arc") {
    pathData = `M ${pointText(from)} Q ${pointText(control)} ${pointText(to)}`;
    startTangent = control;
    endTangent = control;
  } else if (pathShape === "circular") {
    const radius = length * 0.58;
    const sweep = curvature < 0 ? 0 : 1;
    const halfChord = length / 2;
    const centerOffset = Math.sqrt(Math.max(0, radius * radius - halfChord * halfChord));
    const center = {
      x: (from.x + to.x) / 2 + normalX * centerOffset * (sweep ? -1 : 1),
      y: (from.y + to.y) / 2 + normalY * centerOffset * (sweep ? -1 : 1)
    };
    const tangentAt = (pointValue: Point): Point => {
      const radiusVector = { x: pointValue.x - center.x, y: pointValue.y - center.y };
      const tangent = sweep
        ? { x: -radiusVector.y, y: radiusVector.x }
        : { x: radiusVector.y, y: -radiusVector.x };
      return { x: pointValue.x + tangent.x, y: pointValue.y + tangent.y };
    };
    pathData = `M ${pointText(from)} A ${radius} ${radius} 0 1 ${sweep} ${pointText(to)}`;
    startTangent = tangentAt(from);
    const endForward = tangentAt(to);
    endTangent = { x: to.x - (endForward.x - to.x), y: to.y - (endForward.y - to.y) };
  } else if (pathShape === "wave") {
    const firstControl = point(0.12, -amplitude);
    const endControl = point(0.9, -amplitude);
    pathData = `M ${pointText(from)} C ${pointText(firstControl)} ${pointText(
      point(0.22, -amplitude)
    )} ${pointText(point(0.33))} S ${pointText(point(0.55, amplitude))} ${pointText(
      point(0.66)
    )} S ${pointText(endControl)} ${pointText(to)}`;
    startTangent = firstControl;
    endTangent = endControl;
  } else if (pathShape === "pulse") {
    const first = point(0.26);
    const last = point(0.74);
    pathData = `M ${pointText(from)} L ${pointText(first)} C ${pointText(
      point(0.34)
    )} ${pointText(point(0.38, -amplitude * 1.45))} ${pointText(
      point(0.5, -amplitude * 1.45)
    )} S ${pointText(point(0.66))} ${pointText(last)} L ${pointText(to)}`;
    startTangent = first;
    endTangent = last;
  } else if (pathShape === "bracket-square") {
    startPoint = point(0, amplitude * 0.5);
    endPoint = point(1, amplitude * 0.5);
    pathData = `M ${pointText(startPoint)} L ${pointText(from)} L ${pointText(to)} L ${pointText(
      endPoint
    )}`;
    startTangent = from;
    endTangent = to;
  } else if (pathShape === "bracket-square-center") {
    startPoint = point(0, amplitude * 0.5);
    endPoint = point(1, amplitude * 0.5);
    const middle = point(0.5);
    const middleEnd = point(0.5, amplitude * 0.5);
    pathData = `M ${pointText(startPoint)} L ${pointText(from)} L ${pointText(to)} L ${pointText(
      endPoint
    )} M ${pointText(middle)} L ${pointText(middleEnd)}`;
    startTangent = from;
    endTangent = to;
  } else if (pathShape === "bracket-round") {
    startPoint = point(0, amplitude * 0.55);
    endPoint = point(1, amplitude * 0.55);
    pathData = `M ${pointText(startPoint)} Q ${pointText(from)} ${pointText(
      point(0.16)
    )} L ${pointText(point(0.84))} Q ${pointText(to)} ${pointText(endPoint)}`;
    startTangent = from;
    endTangent = to;
  } else if (pathShape === "bracket-curly") {
    startPoint = point(0, amplitude * 0.7);
    endPoint = point(1, amplitude * 0.7);
    const firstControl = point(0.12, amplitude * 0.7);
    const endControl = point(0.88, amplitude * 0.7);
    pathData = `M ${pointText(startPoint)} C ${pointText(firstControl)} ${pointText(
      point(0.08)
    )} ${pointText(point(0.25))} C ${pointText(point(0.42))} ${pointText(
      point(0.38, -amplitude * 0.35)
    )} ${pointText(point(0.5, -amplitude * 0.35))} C ${pointText(
      point(0.62, -amplitude * 0.35)
    )} ${pointText(point(0.58))} ${pointText(point(0.75))} C ${pointText(
      point(0.92)
    )} ${pointText(endControl)} ${pointText(endPoint)}`;
    startTangent = firstControl;
    endTangent = endControl;
  } else if (Math.abs(curvature) >= 0.001) {
    pathData = `M ${pointText(from)} Q ${pointText(control)} ${pointText(to)}`;
    startTangent = control;
    endTangent = control;
  }

  return {
    pathData,
    startPoint,
    endPoint,
    startAngle: angleFrom(startTangent, startPoint),
    endAngle: angleFrom(endTangent, endPoint)
  };
}
