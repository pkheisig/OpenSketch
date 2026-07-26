import { Circle, FabricObject, Group, Path, Triangle, type TOptions } from "fabric";
import type {
  ConnectorArrowhead,
  ConnectorBinding,
  ConnectorLineStyle
} from "@opensketch/editor-core";
import type { Point } from "./geometry";

export interface ConnectorAppearance {
  color: string;
  width: number;
  opacity: number;
}

const dashFor = (style: ConnectorLineStyle, width: number) => {
  if (style === "dashed") return [width * 3, width * 2];
  if (style === "dotted") return [width * 0.4, width * 1.8];
  return undefined;
};

function connectorPath(
  from: Point,
  to: Point,
  binding: ConnectorBinding,
  appearance: ConnectorAppearance
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const bend = binding.curvature * Math.min(length, 280);
  const control = {
    x: (from.x + to.x) / 2 + normalX * bend,
    y: (from.y + to.y) / 2 + normalY * bend
  };
  const data =
    Math.abs(binding.curvature) < 0.001
      ? `M ${from.x} ${from.y} L ${to.x} ${to.y}`
      : `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
  const path = new Path(data, {
    fill: "",
    stroke: appearance.color,
    strokeWidth: appearance.width,
    strokeLineCap: "round",
    strokeLineJoin: "round",
    strokeDashArray: dashFor(binding.lineStyle, appearance.width),
    selectable: false,
    evented: false
  });
  const startAngle =
    Math.abs(binding.curvature) < 0.001
      ? Math.atan2(from.y - to.y, from.x - to.x)
      : Math.atan2(from.y - control.y, from.x - control.x);
  const endAngle =
    Math.abs(binding.curvature) < 0.001
      ? Math.atan2(to.y - from.y, to.x - from.x)
      : Math.atan2(to.y - control.y, to.x - control.x);
  return { path, startAngle, endAngle };
}

function arrowhead(
  kind: ConnectorArrowhead,
  point: Point,
  angle: number,
  color: string,
  width: number
): FabricObject | null {
  if (kind === "none") return null;
  const size = Math.max(12, width * 4);
  const common: TOptions<FabricObject> = {
    left: point.x,
    top: point.y,
    originX: "center",
    originY: "center",
    selectable: false,
    evented: false
  };
  if (kind === "circle") {
    return new Circle({
      ...common,
      radius: size * 0.32,
      fill: color,
      stroke: color,
      strokeWidth: Math.max(1, width * 0.4)
    });
  }
  if (kind === "triangle") {
    return new Triangle({
      ...common,
      width: size,
      height: size,
      fill: color,
      stroke: color,
      strokeWidth: Math.max(1, width * 0.25),
      angle: (angle * 180) / Math.PI + 90
    });
  }
  const wing = size * 0.85;
  const spread = 0.55;
  const first = {
    x: point.x - Math.cos(angle - spread) * wing,
    y: point.y - Math.sin(angle - spread) * wing
  };
  const second = {
    x: point.x - Math.cos(angle + spread) * wing,
    y: point.y - Math.sin(angle + spread) * wing
  };
  return new Path(`M ${first.x} ${first.y} L ${point.x} ${point.y} L ${second.x} ${second.y}`, {
    ...common,
    fill: "",
    stroke: color,
    strokeWidth: width,
    strokeLineCap: "round",
    strokeLineJoin: "round"
  });
}

export function createConnectorObject(
  from: Point,
  to: Point,
  binding: ConnectorBinding,
  appearance: ConnectorAppearance
): Group {
  const { path, startAngle, endAngle } = connectorPath(from, to, binding, appearance);
  const objects: FabricObject[] = [path];
  const start = arrowhead(
    binding.startArrowhead,
    from,
    startAngle,
    appearance.color,
    appearance.width
  );
  const end = arrowhead(binding.endArrowhead, to, endAngle, appearance.color, appearance.width);
  if (start) objects.push(start);
  if (end) objects.push(end);
  const group = new Group(objects, {
    objectCaching: false,
    subTargetCheck: false,
    opacity: appearance.opacity,
    stroke: appearance.color,
    strokeWidth: appearance.width,
    lockScalingX: true,
    lockScalingY: true
  });
  group.connector = { ...binding };
  group.opensketchType = "connector";
  group.name = "Connector";
  return group;
}

export function connectorAppearance(object: FabricObject): ConnectorAppearance {
  return {
    color: typeof object.stroke === "string" ? object.stroke : "#25494b",
    width: object.strokeWidth || 4,
    opacity: object.opacity ?? 1
  };
}
