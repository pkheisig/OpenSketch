import {
  Circle,
  FabricObject,
  Group,
  Path,
  Point as FabricPoint,
  Triangle,
  util,
  type TOptions
} from "fabric";
import type {
  ConnectorAnchor,
  ConnectorArrowhead,
  ConnectorBinding,
  ConnectorLineStyle,
  ConnectorPathShape
} from "@workspace/editor-core";
import type { Bounds, Point } from "./geometry";

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

const ROUTE_MARGIN = 18;
const LEAD_LENGTH = 26;
const BEND_PENALTY = 34;
const EPSILON = 0.001;

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

function anchorVector(anchor: ConnectorAnchor): Point {
  if (anchor === "top") return { x: 0, y: -1 };
  if (anchor === "right") return { x: 1, y: 0 };
  if (anchor === "bottom") return { x: 0, y: 1 };
  if (anchor === "left") return { x: -1, y: 0 };
  return { x: 0, y: 0 };
}

function inflate(bounds: Bounds, margin = ROUTE_MARGIN): Bounds {
  return {
    left: bounds.left - margin,
    top: bounds.top - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2
  };
}

function inside(point: Point, bounds: Bounds): boolean {
  return (
    point.x > bounds.left + EPSILON &&
    point.x < bounds.left + bounds.width - EPSILON &&
    point.y > bounds.top + EPSILON &&
    point.y < bounds.top + bounds.height - EPSILON
  );
}

function segmentIsClear(from: Point, to: Point, obstacles: Bounds[]): boolean {
  if (Math.abs(from.x - to.x) < EPSILON) {
    const top = Math.min(from.y, to.y);
    const bottom = Math.max(from.y, to.y);
    return obstacles.every(
      (bounds) =>
        from.x <= bounds.left + EPSILON ||
        from.x >= bounds.left + bounds.width - EPSILON ||
        bottom <= bounds.top + EPSILON ||
        top >= bounds.top + bounds.height - EPSILON
    );
  }
  if (Math.abs(from.y - to.y) < EPSILON) {
    const left = Math.min(from.x, to.x);
    const right = Math.max(from.x, to.x);
    return obstacles.every(
      (bounds) =>
        from.y <= bounds.top + EPSILON ||
        from.y >= bounds.top + bounds.height - EPSILON ||
        right <= bounds.left + EPSILON ||
        left >= bounds.left + bounds.width - EPSILON
    );
  }
  return false;
}

function simplify(points: Point[]): Point[] {
  const unique = points.filter(
    (point, index) => index === 0 || !samePoint(point, points[index - 1])
  );
  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true;
    const previous = unique[index - 1];
    const next = unique[index + 1];
    const vertical =
      Math.abs(previous.x - point.x) < EPSILON && Math.abs(point.x - next.x) < EPSILON;
    const horizontal =
      Math.abs(previous.y - point.y) < EPSILON && Math.abs(point.y - next.y) < EPSILON;
    return !vertical && !horizontal;
  });
}

interface RouteState {
  node: number;
  direction: "horizontal" | "vertical" | "start";
}

/**
 * Finds a compact Manhattan route around expanded object bounds. The graph is
 * built from obstacle edges, so the result stays stable as unrelated objects
 * move and adds a penalty for visually noisy bends.
 */
export function routeOrthogonal(
  from: Point,
  to: Point,
  fromAnchor: ConnectorAnchor,
  toAnchor: ConnectorAnchor,
  obstacleBounds: Bounds[]
): Point[] {
  const fromVector = anchorVector(fromAnchor);
  const toVector = anchorVector(toAnchor);
  const start = {
    x: from.x + fromVector.x * LEAD_LENGTH,
    y: from.y + fromVector.y * LEAD_LENGTH
  };
  const end = {
    x: to.x + toVector.x * LEAD_LENGTH,
    y: to.y + toVector.y * LEAD_LENGTH
  };
  const corridorPadding = Math.max(120, Math.hypot(to.x - from.x, to.y - from.y) * 0.18);
  const corridor = {
    left: Math.min(from.x, to.x) - corridorPadding,
    top: Math.min(from.y, to.y) - corridorPadding,
    width: Math.abs(to.x - from.x) + corridorPadding * 2,
    height: Math.abs(to.y - from.y) + corridorPadding * 2
  };
  const overlaps = (a: Bounds, b: Bounds) =>
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top;
  const routeCenter = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const obstacles = obstacleBounds
    .map((bounds) => inflate(bounds))
    .filter((bounds) => overlaps(bounds, corridor))
    .sort((a, b) => {
      const distance = (bounds: Bounds) =>
        Math.hypot(
          bounds.left + bounds.width / 2 - routeCenter.x,
          bounds.top + bounds.height / 2 - routeCenter.y
        );
      return distance(a) - distance(b);
    })
    .slice(0, 32);
  const xs = new Set([
    start.x,
    end.x,
    ...obstacles.flatMap((item) => [item.left, item.left + item.width])
  ]);
  const ys = new Set([
    start.y,
    end.y,
    ...obstacles.flatMap((item) => [item.top, item.top + item.height])
  ]);
  const nodes: Point[] = [];
  for (const x of xs) {
    for (const y of ys) {
      const point = { x, y };
      if (!obstacles.some((bounds) => inside(point, bounds))) nodes.push(point);
    }
  }
  const ensureNode = (point: Point) => {
    const existing = nodes.findIndex((candidate) => samePoint(candidate, point));
    if (existing >= 0) return existing;
    nodes.push(point);
    return nodes.length - 1;
  };
  const startIndex = ensureNode(start);
  const endIndex = ensureNode(end);
  const neighbours = new Map<
    number,
    Array<{ node: number; distance: number; direction: "horizontal" | "vertical" }>
  >();
  const connect = (a: number, b: number, direction: "horizontal" | "vertical") => {
    const distance = Math.abs(nodes[a].x - nodes[b].x) + Math.abs(nodes[a].y - nodes[b].y);
    neighbours.set(a, [...(neighbours.get(a) ?? []), { node: b, distance, direction }]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), { node: a, distance, direction }]);
  };
  const connectAdjacent = (groups: Map<number, number[]>, direction: "horizontal" | "vertical") => {
    for (const group of groups.values()) {
      group.sort((a, b) =>
        direction === "horizontal" ? nodes[a].x - nodes[b].x : nodes[a].y - nodes[b].y
      );
      for (let index = 1; index < group.length; index += 1) {
        const a = group[index - 1];
        const b = group[index];
        if (segmentIsClear(nodes[a], nodes[b], obstacles)) {
          connect(a, b, direction);
        }
      }
    }
  };
  const horizontalGroups = new Map<number, number[]>();
  const verticalGroups = new Map<number, number[]>();
  nodes.forEach((node, index) => {
    horizontalGroups.set(node.y, [...(horizontalGroups.get(node.y) ?? []), index]);
    verticalGroups.set(node.x, [...(verticalGroups.get(node.x) ?? []), index]);
  });
  connectAdjacent(horizontalGroups, "horizontal");
  connectAdjacent(verticalGroups, "vertical");

  const key = (state: RouteState) => `${state.node}:${state.direction}`;
  type PendingRoute = RouteState & { cost: number };
  const pending: PendingRoute[] = [{ node: startIndex, direction: "start", cost: 0 }];
  const pushPending = (item: PendingRoute) => {
    pending.push(item);
    let index = pending.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (pending[parent].cost <= pending[index].cost) break;
      [pending[parent], pending[index]] = [pending[index], pending[parent]];
      index = parent;
    }
  };
  const popPending = () => {
    const first = pending[0];
    const last = pending.pop();
    if (!pending.length || !last) return first;
    pending[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < pending.length && pending[left].cost < pending[smallest].cost) smallest = left;
      if (right < pending.length && pending[right].cost < pending[smallest].cost) smallest = right;
      if (smallest === index) break;
      [pending[smallest], pending[index]] = [pending[index], pending[smallest]];
      index = smallest;
    }
    return first;
  };
  const distances = new Map([[key(pending[0]), 0]]);
  const previous = new Map<string, string>();
  let winner: string | undefined;
  while (pending.length) {
    const current = popPending()!;
    const currentKey = key(current);
    if (current.cost !== distances.get(currentKey)) continue;
    if (current.node === endIndex) {
      winner = currentKey;
      break;
    }
    for (const edge of neighbours.get(current.node) ?? []) {
      const bend =
        current.direction === "start" || current.direction === edge.direction ? 0 : BEND_PENALTY;
      const next: RouteState = { node: edge.node, direction: edge.direction };
      const nextKey = key(next);
      const cost = current.cost + edge.distance + bend;
      if (cost < (distances.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        distances.set(nextKey, cost);
        previous.set(nextKey, currentKey);
        pushPending({ ...next, cost });
      }
    }
  }

  let routed: Point[];
  if (winner) {
    const route: Point[] = [];
    let cursor: string | undefined = winner;
    while (cursor) {
      const node = Number(cursor.split(":")[0]);
      route.unshift(nodes[node]);
      cursor = previous.get(cursor);
    }
    routed = route;
  } else {
    const horizontalFirst = { x: end.x, y: start.y };
    const verticalFirst = { x: start.x, y: end.y };
    routed =
      segmentIsClear(start, horizontalFirst, obstacles) &&
      segmentIsClear(horizontalFirst, end, obstacles)
        ? [start, horizontalFirst, end]
        : [start, verticalFirst, end];
  }
  return simplify([from, ...routed, to]);
}

function connectorPath(
  from: Point,
  to: Point,
  binding: ConnectorBinding,
  appearance: ConnectorAppearance,
  obstacles: Bounds[]
) {
  const pathShape: ConnectorPathShape =
    binding.pathShape ?? (binding.routing === "orthogonal" ? "elbow" : "straight");
  if (binding.routing === "orthogonal" && !binding.pathShape) {
    const points = routeOrthogonal(from, to, binding.fromAnchor, binding.toAnchor, obstacles);
    const data = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
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
    const startTarget = points[1] ?? to;
    const endSource = points.at(-2) ?? from;
    return {
      path,
      startAngle: Math.atan2(from.y - startTarget.y, from.x - startTarget.x),
      endAngle: Math.atan2(to.y - endSource.y, to.x - endSource.x)
    };
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const point = (progress: number, normal = 0) => ({
    x: from.x + dx * progress + normalX * normal,
    y: from.y + dy * progress + normalY * normal
  });
  const bend =
    (binding.curvature || (["arc", "circular"].includes(pathShape) ? 0.3 : 0)) *
    Math.min(length, 280);
  const control = {
    x: (from.x + to.x) / 2 + normalX * bend,
    y: (from.y + to.y) / 2 + normalY * bend
  };
  const amplitude = Math.min(46, length * 0.18);
  const p = (value: Point) => `${value.x} ${value.y}`;
  let data = `M ${p(from)} L ${p(to)}`;
  if (pathShape === "elbow") {
    const first = point(0.46);
    const second = point(0.46, amplitude);
    const third = point(0.72, amplitude);
    data = `M ${p(from)} L ${p(first)} L ${p(second)} L ${p(third)} L ${p(to)}`;
  } else if (pathShape === "rounded-elbow") {
    const first = point(0.4);
    const corner = point(0.5, amplitude);
    const last = point(0.72, amplitude);
    data = `M ${p(from)} L ${p(first)} Q ${p(point(0.5))} ${p(corner)} L ${p(last)} Q ${p(
      point(0.82, amplitude)
    )} ${p(to)}`;
  } else if (pathShape === "step") {
    data = `M ${p(from)} L ${p(point(0.28))} L ${p(point(0.28, amplitude))} L ${p(
      point(0.72, amplitude)
    )} L ${p(point(0.72))} L ${p(to)}`;
  } else if (pathShape === "arc" || pathShape === "circular") {
    data = `M ${p(from)} Q ${p(control)} ${p(to)}`;
  } else if (pathShape === "wave") {
    data = `M ${p(from)} C ${p(point(0.12, -amplitude))} ${p(
      point(0.22, -amplitude)
    )} ${p(point(0.33))} S ${p(point(0.55, amplitude))} ${p(point(0.66))} S ${p(
      point(0.9, -amplitude)
    )} ${p(to)}`;
  } else if (pathShape === "pulse") {
    data = `M ${p(from)} L ${p(point(0.26))} C ${p(point(0.34))} ${p(
      point(0.38, -amplitude * 1.45)
    )} ${p(point(0.5, -amplitude * 1.45))} S ${p(point(0.66))} ${p(point(0.74))} L ${p(to)}`;
  } else if (pathShape === "bracket-square") {
    data = `M ${p(point(0, amplitude * 0.5))} L ${p(from)} L ${p(to)} L ${p(
      point(1, amplitude * 0.5)
    )}`;
  } else if (pathShape === "bracket-round") {
    data = `M ${p(point(0, amplitude * 0.55))} Q ${p(point(0))} ${p(
      point(0.16)
    )} L ${p(point(0.84))} Q ${p(to)} ${p(point(1, amplitude * 0.55))}`;
  } else if (pathShape === "bracket-curly") {
    data = `M ${p(point(0, amplitude * 0.7))} C ${p(point(0.12, amplitude * 0.7))} ${p(
      point(0.08)
    )} ${p(point(0.25))} C ${p(point(0.42))} ${p(point(0.38, -amplitude * 0.35))} ${p(
      point(0.5, -amplitude * 0.35)
    )} C ${p(point(0.62, -amplitude * 0.35))} ${p(point(0.58))} ${p(
      point(0.75)
    )} C ${p(point(0.92))} ${p(point(0.88, amplitude * 0.7))} ${p(point(1, amplitude * 0.7))}`;
  } else if (Math.abs(binding.curvature) >= 0.001) {
    data = `M ${p(from)} Q ${p(control)} ${p(to)}`;
  }
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
  const curved = ["arc", "circular"].includes(pathShape) || Math.abs(binding.curvature) >= 0.001;
  const startAngle = !curved
    ? Math.atan2(from.y - to.y, from.x - to.x)
    : Math.atan2(from.y - control.y, from.x - control.x);
  const endAngle = !curved
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
  if (kind === "open-circle") {
    return new Circle({
      ...common,
      radius: size * 0.34,
      fill: "transparent",
      stroke: color,
      strokeWidth: Math.max(1.5, width * 0.6)
    });
  }
  if (kind === "bar") {
    const half = size * 0.55;
    const tangent = angle + Math.PI / 2;
    return new Path(
      `M ${point.x - Math.cos(tangent) * half} ${point.y - Math.sin(tangent) * half} L ${
        point.x + Math.cos(tangent) * half
      } ${point.y + Math.sin(tangent) * half}`,
      {
        ...common,
        fill: "",
        stroke: color,
        strokeWidth: width,
        strokeLineCap: "round"
      }
    );
  }
  if (kind === "neuron") {
    return new Triangle({
      ...common,
      width: size * 0.78,
      height: size * 0.78,
      fill: color,
      stroke: color,
      strokeWidth: Math.max(1, width * 0.25),
      angle: (angle * 180) / Math.PI - 90
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
  appearance: ConnectorAppearance,
  obstacles: Bounds[] = []
): Group {
  const { path, startAngle, endAngle } = connectorPath(from, to, binding, appearance, obstacles);
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
  group.OpenSketchType = "connector";
  group.name = "Connector";
  return group;
}

export function createFreeConnectorObject(
  from: Point,
  to: Point,
  binding: ConnectorBinding,
  appearance: ConnectorAppearance
): Group {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const group = createConnectorObject({ x: 0, y: 0 }, { x: length, y: 0 }, binding, appearance);
  const localStart = util.transformPoint(
    new FabricPoint(0, 0),
    util.invertTransform(group.calcTransformMatrix())
  );
  group.set("angle", (angle * 180) / Math.PI);
  const transformedStart = util.transformPoint(localStart, group.calcTransformMatrix());
  group.set({
    left: group.left + from.x - transformedStart.x,
    top: group.top + from.y - transformedStart.y
  });
  group.setCoords();
  return group;
}

export function connectorAppearance(object: FabricObject): ConnectorAppearance {
  return {
    color: typeof object.stroke === "string" ? object.stroke : "#25494b",
    width: object.strokeWidth || 4,
    opacity: object.opacity ?? 1
  };
}
