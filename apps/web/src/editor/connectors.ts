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
import {
  buildConnectorGeometry,
  connectorArrowheadPoint,
  connectorStrokeLineCap
} from "./connectorGeometry";

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
      strokeLineCap: connectorStrokeLineCap(
        binding.startArrowhead,
        binding.endArrowhead,
        binding.lineCap
      ),
      strokeLineJoin: "round",
      strokeDashArray: dashFor(binding.lineStyle, appearance.width),
      selectable: false,
      evented: false
    });
    const startTarget = points[1] ?? to;
    const endSource = points.at(-2) ?? from;
    return {
      path,
      startPoint: from,
      endPoint: to,
      startAngle: Math.atan2(from.y - startTarget.y, from.x - startTarget.x),
      endAngle: Math.atan2(to.y - endSource.y, to.x - endSource.x)
    };
  }
  const geometry = buildConnectorGeometry(from, to, pathShape, binding.curvature);
  const path = new Path(geometry.pathData, {
    fill: "",
    stroke: appearance.color,
    strokeWidth: appearance.width,
    strokeLineCap: connectorStrokeLineCap(
      binding.startArrowhead,
      binding.endArrowhead,
      binding.lineCap
    ),
    strokeLineJoin: "round",
    strokeDashArray: dashFor(binding.lineStyle, appearance.width),
    selectable: false,
    evented: false
  });
  return {
    path,
    startPoint: geometry.startPoint,
    endPoint: geometry.endPoint,
    startAngle: geometry.startAngle,
    endAngle: geometry.endAngle
  };
}

function arrowhead(
  kind: ConnectorArrowhead,
  point: Point,
  angle: number,
  color: string,
  width: number
): FabricObject | null {
  if (kind === "none") return null;
  const size = Math.max(10, width * 3.2);
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const headPoint = connectorArrowheadPoint(kind, point, angle, width);
  const common: TOptions<FabricObject> = {
    left: headPoint.x,
    top: headPoint.y,
    originX: "center",
    originY: "center",
    selectable: false,
    evented: false
  };
  if (kind === "circle") {
    return new Circle({
      ...common,
      radius: size * 0.28,
      fill: color,
      stroke: color,
      strokeWidth: Math.max(1, width * 0.4)
    });
  }
  if (kind === "open-circle") {
    return new Circle({
      ...common,
      radius: size * 0.3,
      fill: "transparent",
      stroke: color,
      strokeWidth: Math.max(1.5, width * 0.6)
    });
  }
  if (kind === "bar") {
    const half = size * 0.55;
    return new Path(`M 0 ${-half} L 0 ${half}`, {
      ...common,
      fill: "",
      stroke: color,
      strokeWidth: width,
      strokeLineCap: "round",
      angle: (angle * 180) / Math.PI
    });
  }
  if (kind === "neuron") {
    return new Triangle({
      ...common,
      left: headPoint.x - direction.x * size * 0.36,
      top: headPoint.y - direction.y * size * 0.36,
      width: size * 0.78,
      height: size * 0.78,
      fill: color,
      stroke: color,
      strokeWidth: Math.max(1, width * 0.25),
      angle: (angle * 180) / Math.PI + 90
    });
  }
  if (kind === "triangle") {
    return new Triangle({
      ...common,
      left: headPoint.x - direction.x * size * 0.5,
      top: headPoint.y - direction.y * size * 0.5,
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
    x: -Math.cos(-spread) * wing,
    y: -Math.sin(-spread) * wing
  };
  const second = {
    x: -Math.cos(spread) * wing,
    y: -Math.sin(spread) * wing
  };
  return new Path(`M ${first.x} ${first.y} L 0 0 L ${second.x} ${second.y}`, {
    ...common,
    fill: "",
    stroke: color,
    strokeWidth: width,
    strokeLineCap: "round",
    strokeLineJoin: "round",
    angle: (angle * 180) / Math.PI
  });
}

const CONNECTOR_HEAD_OFFSET_VERSION = 1;

export function normalizeConnectorHeadOffsets(group: Group): boolean {
  if (!group.connector || group.connectorHeadOffsetVersion === CONNECTOR_HEAD_OFFSET_VERSION) {
    return false;
  }
  const width = typeof group.strokeWidth === "number" ? group.strokeWidth : 2;
  const children = group.getObjects();
  let childIndex = 1;
  let changed = false;
  for (const kind of [group.connector.startArrowhead, group.connector.endArrowhead]) {
    if (kind === "none") continue;
    const child = children[childIndex];
    childIndex += 1;
    if (!child || (kind !== "triangle" && kind !== "neuron")) continue;
    const angle = (((child.angle ?? 90) - 90) * Math.PI) / 180;
    child.set({
      left: (child.left ?? 0) + Math.cos(angle) * width,
      top: (child.top ?? 0) + Math.sin(angle) * width
    });
    changed = true;
  }
  group.connectorHeadOffsetVersion = CONNECTOR_HEAD_OFFSET_VERSION;
  if (changed) group.triggerLayout();
  group.dirty = true;
  return changed;
}

export function createConnectorObject(
  from: Point,
  to: Point,
  binding: ConnectorBinding,
  appearance: ConnectorAppearance,
  obstacles: Bounds[] = []
): Group {
  const { path, startPoint, endPoint, startAngle, endAngle } = connectorPath(
    from,
    to,
    binding,
    appearance,
    obstacles
  );
  const objects: FabricObject[] = [path];
  const start = arrowhead(
    binding.startArrowhead,
    startPoint,
    startAngle,
    appearance.color,
    appearance.width
  );
  const end = arrowhead(
    binding.endArrowhead,
    endPoint,
    endAngle,
    appearance.color,
    appearance.width
  );
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
  group.connectorHeadOffsetVersion = CONNECTOR_HEAD_OFFSET_VERSION;
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
  const pathShape = binding.pathShape ?? "straight";
  const screenAligned =
    pathShape === "elbow" ||
    pathShape === "rounded-elbow" ||
    pathShape === "step" ||
    pathShape === "rounded-step" ||
    pathShape.startsWith("bracket-");
  if (screenAligned) {
    const group = createConnectorObject(from, to, binding, appearance);
    group.setCoords();
    group.freeConnectorBinding = { ...binding };
    group.freeConnectorGeometry = localConnectorGeometry(group, from, to);
    return group;
  }
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
  group.freeConnectorBinding = { ...binding };
  group.freeConnectorGeometry = localConnectorGeometry(group, from, to);
  return group;
}

function localConnectorGeometry(
  group: Group,
  from: Point,
  to: Point
): { from: Point; to: Point } {
  const inverse = util.invertTransform(group.calcOwnMatrix());
  const localFrom = util.transformPoint(new FabricPoint(from.x, from.y), inverse);
  const localTo = util.transformPoint(new FabricPoint(to.x, to.y), inverse);
  return {
    from: { x: localFrom.x, y: localFrom.y },
    to: { x: localTo.x, y: localTo.y }
  };
}

function pathEndpoint(path: Path, first: boolean): Point | null {
  const commands = path.path as unknown as Array<Array<string | number>>;
  const meaningful = commands.filter((command) => command[0] !== "Z" && command.length >= 3);
  const command = first ? meaningful[0] : meaningful.at(-1);
  if (!command) return null;
  const offset = path.pathOffset ?? new FabricPoint(0, 0);
  const coordinateStart = first ? 1 : command.length - 2;
  const x = Number(command[coordinateStart]);
  const y = Number(command[coordinateStart + 1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: x - offset.x, y: y - offset.y };
}

export function freeConnectorEndpoints(group: Group): { from: Point; to: Point } | null {
  const stored = group.freeConnectorGeometry;
  if (
    stored &&
    Number.isFinite(stored.from.x) &&
    Number.isFinite(stored.from.y) &&
    Number.isFinite(stored.to.x) &&
    Number.isFinite(stored.to.y)
  ) {
    return {
      from: { ...stored.from },
      to: { ...stored.to }
    };
  }
  const centerline = group.getObjects().find((object): object is Path => object instanceof Path);
  if (!centerline) return null;
  const from = pathEndpoint(centerline, true);
  const to = pathEndpoint(centerline, false);
  if (!from || !to) return null;
  const endpoints = { from, to };
  group.freeConnectorGeometry = endpoints;
  return endpoints;
}

/** Rebuild a free connector around one dragged endpoint while preserving the other. */
export function updateFreeConnectorEndpoint(
  group: Group,
  endpoint: "from" | "to",
  parentPoint: Point
): boolean {
  const binding = group.freeConnectorBinding;
  const endpoints = freeConnectorEndpoints(group);
  if (!binding || !endpoints) return false;

  const matrix = group.calcOwnMatrix();
  const fixedLocal = endpoint === "from" ? endpoints.to : endpoints.from;
  const fixedParent = util.transformPoint(
    new FabricPoint(fixedLocal.x, fixedLocal.y),
    matrix
  );
  const nextFrom = endpoint === "from" ? parentPoint : { x: fixedParent.x, y: fixedParent.y };
  const nextTo = endpoint === "to" ? parentPoint : { x: fixedParent.x, y: fixedParent.y };
  if (Math.hypot(nextTo.x - nextFrom.x, nextTo.y - nextFrom.y) < EPSILON) return false;

  const replacement = createConnectorObject(
    nextFrom,
    nextTo,
    { ...binding },
    connectorAppearance(group)
  );
  const replacementChildren = replacement.removeAll();
  group.removeAll();
  group.set({
    left: replacement.left,
    top: replacement.top,
    width: replacement.width,
    height: replacement.height,
    angle: replacement.angle,
    scaleX: replacement.scaleX,
    scaleY: replacement.scaleY,
    skewX: replacement.skewX,
    skewY: replacement.skewY,
    flipX: replacement.flipX,
    flipY: replacement.flipY
  });
  group.add(...replacementChildren);
  group.freeConnectorGeometry = localConnectorGeometry(group, nextFrom, nextTo);
  group.dirty = true;
  group.setCoords();
  return true;
}

export function connectorAppearance(object: FabricObject): ConnectorAppearance {
  return {
    color: typeof object.stroke === "string" ? object.stroke : "#25494b",
    width: object.strokeWidth || 4,
    opacity: object.opacity ?? 1
  };
}
