import {
  ActiveSelection,
  Group,
  Point as FabricPoint,
  util,
  type Canvas,
  type FabricObject
} from "fabric";
import type { Bounds, Point } from "@/editor/geometry";

export const SEMANTIC_COMPOSITION_VERSION = 1 as const;

export const SEMANTIC_ROLES = [
  "hub",
  "stage",
  "stage-content",
  "stage-label",
  "stage-title",
  "stage-subtitle",
  "scientific-asset",
  "interaction-participant",
  "mediator",
  "particle-field",
  "annotation",
  "intervention",
  "main-flow-connector",
  "annotation-leader",
  "decorative"
] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];

export const SEMANTIC_RELATION_KINDS = [
  "flow_to",
  "labels",
  "contacts",
  "binds",
  "crosses",
  "emits",
  "follows_gradient",
  "inhibited_by",
  "intervention_targets"
] as const;
export type SemanticRelationKind = (typeof SEMANTIC_RELATION_KINDS)[number];

export const SEMANTIC_PORT_KINDS = [
  "incoming",
  "outgoing",
  "radial-in",
  "radial-out",
  "clockwise",
  "counterclockwise",
  "annotation",
  "custom"
] as const;
export type SemanticPortKind = (typeof SEMANTIC_PORT_KINDS)[number];

export interface SemanticLayoutConstraint {
  version: typeof SEMANTIC_COMPOSITION_VERSION;
  kind: "label-placement";
  placement: "outward" | "top" | "right" | "bottom" | "left";
  contentObjectId: string;
  labelObjectId: string;
  referenceCenter: Point;
  gap: number;
}

const MAX_TAGS = 16;
const MAX_RELATION_IDS = 32;
const MAX_RELATIONS = 256;
const MAX_NAME = 160;

export interface SemanticMetadata {
  version: typeof SEMANTIC_COMPOSITION_VERSION;
  semanticRole?: SemanticRole;
  semanticType?: string;
  stageId?: string;
  stageIndex?: number;
  tags?: string[];
  relationIds?: string[];
  preferredPortHint?: SemanticPortKind;
  pinned?: boolean;
  allowedOverlapObjectIds?: string[];
  semanticName?: string;
  layoutConstraint?: SemanticLayoutConstraint;
}

export interface SemanticRelation {
  id: string;
  kind: SemanticRelationKind;
  sourceObjectId: string;
  targetObjectId: string;
  mediatorObjectIds?: string[];
  direction?: "forward" | "reverse" | "bidirectional";
  allowedOverlap?: boolean;
}

export interface SemanticPort {
  id: string;
  position: Point;
  normal: Point;
  kind: SemanticPortKind;
  scopeObjectId: string;
}

export interface SemanticGeometry {
  visualBounds: Bounds;
  layoutBounds: Bounds;
  selectionBounds: Bounds;
  hull: Point[];
  center: Point;
  area: number;
  ports: SemanticPort[];
  geometrySource: "vector" | "sampled-path" | "selection-fallback" | "empty";
  evaluable: boolean;
  descendantObjectIds: string[];
  textMetrics?: {
    width: number;
    height: number;
    lineCount: number;
    fontSize?: number;
    fontReady: boolean;
  };
}

export interface SemanticLayoutPlan {
  id: string;
  version: typeof SEMANTIC_COMPOSITION_VERSION;
  mode: "cycle" | "flow" | "path" | "grid" | "cluster" | "free";
  sourceRevision: string;
  status: "feasible" | "infeasible" | "budget_exhausted";
  positions: Array<{ objectId: string; x: number; y: number }>;
  routeContext?: {
    center: Point;
    radius?: number;
    axes?: { x: number; y: number };
    direction: "clockwise" | "counterclockwise";
  };
  score: number;
  penalties: { overlap: number; boundary: number; hub: number; movement: number };
  warnings: string[];
  violations: string[];
  unchanged: Array<{ objectId: string; reason: string }>;
  metrics: {
    occupiedAreaRatio: number;
    cycleArea: number;
    minInterObjectGap: number;
    maxInterObjectGap: number;
    minHubClearance: number | null;
    movementDistance: number;
    expectedMainFlowPathLength: number;
  };
}

export function isGroup(object: FabricObject): object is Group {
  return object instanceof Group && !(object instanceof ActiveSelection);
}

function boundedString(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : undefined;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertArray(value: unknown, field: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${field} must be an array of at most ${maximum} items.`);
  }
  return value;
}

export function normalizeSemanticMetadata(input: unknown): SemanticMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("semanticMetadata must be an object.");
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set([
    "version",
    "semanticRole",
    "semanticType",
    "stageId",
    "stageIndex",
    "tags",
    "relationIds",
    "preferredPortHint",
    "pinned",
    "allowedOverlapObjectIds",
    "semanticName",
    "layoutConstraint"
  ]);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`semanticMetadata.${unknown} is not supported.`);
  if (record.version !== SEMANTIC_COMPOSITION_VERSION) {
    throw new Error(`semanticMetadata.version must be ${SEMANTIC_COMPOSITION_VERSION}.`);
  }
  const metadata: SemanticMetadata = { version: SEMANTIC_COMPOSITION_VERSION };
  if (record.semanticRole !== undefined) {
    if (!SEMANTIC_ROLES.includes(record.semanticRole as SemanticRole)) {
      throw new Error("semanticMetadata.semanticRole is unsupported.");
    }
    metadata.semanticRole = record.semanticRole as SemanticRole;
  }
  for (const field of ["semanticType", "stageId"] as const) {
    if (record[field] !== undefined) {
      const value = boundedString(record[field], 120);
      if (!value) throw new Error(`semanticMetadata.${field} is invalid.`);
      metadata[field] = value;
    }
  }
  if (record.stageIndex !== undefined) {
    if (
      !finite(record.stageIndex) ||
      !Number.isInteger(record.stageIndex) ||
      record.stageIndex < 0 ||
      record.stageIndex > 999
    ) {
      throw new Error("semanticMetadata.stageIndex is invalid.");
    }
    metadata.stageIndex = record.stageIndex;
  }
  for (const [field, maximum] of [
    ["tags", MAX_TAGS],
    ["relationIds", MAX_RELATION_IDS],
    ["allowedOverlapObjectIds", MAX_RELATION_IDS]
  ] as const) {
    if (record[field] === undefined) continue;
    const values = assertArray(record[field], `semanticMetadata.${field}`, maximum);
    if (values.some((value) => !boundedString(value, 200))) {
      throw new Error(`semanticMetadata.${field} contains an invalid value.`);
    }
    metadata[field] = [...new Set(values as string[])];
  }
  if (record.preferredPortHint !== undefined) {
    if (!SEMANTIC_PORT_KINDS.includes(record.preferredPortHint as SemanticPortKind)) {
      throw new Error("semanticMetadata.preferredPortHint is unsupported.");
    }
    metadata.preferredPortHint = record.preferredPortHint as SemanticPortKind;
  }
  if (record.pinned !== undefined) {
    if (typeof record.pinned !== "boolean") throw new Error("semanticMetadata.pinned is invalid.");
    metadata.pinned = record.pinned;
  }
  if (record.semanticName !== undefined) {
    const value = boundedString(record.semanticName, MAX_NAME);
    if (!value) throw new Error("semanticMetadata.semanticName is invalid.");
    metadata.semanticName = value;
  }
  if (record.layoutConstraint !== undefined) {
    if (
      !record.layoutConstraint ||
      typeof record.layoutConstraint !== "object" ||
      Array.isArray(record.layoutConstraint)
    )
      throw new Error("semanticMetadata.layoutConstraint is invalid.");
    const constraint = record.layoutConstraint as Record<string, unknown>;
    const allowedConstraintKeys = new Set([
      "version",
      "kind",
      "placement",
      "contentObjectId",
      "labelObjectId",
      "referenceCenter",
      "gap"
    ]);
    const unknownConstraint = Object.keys(constraint).find(
      (key) => !allowedConstraintKeys.has(key)
    );
    if (unknownConstraint)
      throw new Error(`semanticMetadata.layoutConstraint.${unknownConstraint} is not supported.`);
    if (
      constraint.version !== SEMANTIC_COMPOSITION_VERSION ||
      constraint.kind !== "label-placement" ||
      !["outward", "top", "right", "bottom", "left"].includes(constraint.placement as string)
    )
      throw new Error("semanticMetadata.layoutConstraint is invalid.");
    const contentObjectId = boundedString(constraint.contentObjectId, 200);
    const labelObjectId = boundedString(constraint.labelObjectId, 200);
    const referenceCenter = constraint.referenceCenter;
    if (
      !contentObjectId ||
      !labelObjectId ||
      !referenceCenter ||
      typeof referenceCenter !== "object" ||
      Array.isArray(referenceCenter) ||
      !finite((referenceCenter as Record<string, unknown>).x) ||
      !finite((referenceCenter as Record<string, unknown>).y) ||
      !finite(constraint.gap) ||
      (constraint.gap as number) < 0 ||
      (constraint.gap as number) > 10_000
    )
      throw new Error("semanticMetadata.layoutConstraint is invalid.");
    metadata.layoutConstraint = {
      version: SEMANTIC_COMPOSITION_VERSION,
      kind: "label-placement",
      placement: constraint.placement as SemanticLayoutConstraint["placement"],
      contentObjectId,
      labelObjectId,
      referenceCenter: {
        x: (referenceCenter as Record<string, number>).x,
        y: (referenceCenter as Record<string, number>).y
      },
      gap: constraint.gap as number
    };
  }
  return metadata;
}

export function metadataOf(object: FabricObject): SemanticMetadata | undefined {
  if (!object.semanticMetadata) return undefined;
  try {
    return normalizeSemanticMetadata(object.semanticMetadata);
  } catch {
    return undefined;
  }
}

export function setMetadata(object: FabricObject, metadata: unknown): SemanticMetadata {
  const normalized = normalizeSemanticMetadata(metadata);
  object.semanticMetadata = normalized;
  return normalized;
}

export function normalizeRelation(input: unknown): SemanticRelation {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Relation is invalid.");
  const record = input as Record<string, unknown>;
  const allowed = new Set([
    "id",
    "kind",
    "sourceObjectId",
    "targetObjectId",
    "mediatorObjectIds",
    "direction",
    "allowedOverlap"
  ]);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`relation.${unknown} is not supported.`);
  const id = boundedString(record.id, 200);
  const sourceObjectId = boundedString(record.sourceObjectId, 200);
  const targetObjectId = boundedString(record.targetObjectId, 200);
  if (!id || !sourceObjectId || !targetObjectId) throw new Error("Relation identity is invalid.");
  if (!SEMANTIC_RELATION_KINDS.includes(record.kind as SemanticRelationKind)) {
    throw new Error("Relation kind is unsupported.");
  }
  if (
    sourceObjectId === targetObjectId &&
    !["labels", "follows_gradient"].includes(record.kind as string)
  ) {
    throw new Error("A relation cannot target its source object.");
  }
  const relation: SemanticRelation = {
    id,
    kind: record.kind as SemanticRelationKind,
    sourceObjectId,
    targetObjectId
  };
  if (record.mediatorObjectIds !== undefined) {
    const values = assertArray(record.mediatorObjectIds, "relation.mediatorObjectIds", 8);
    if (values.some((value) => !boundedString(value, 200)))
      throw new Error("Relation mediators are invalid.");
    relation.mediatorObjectIds = [...new Set(values as string[])];
  }
  if (record.direction !== undefined) {
    if (!["forward", "reverse", "bidirectional"].includes(record.direction as string))
      throw new Error("Relation direction is unsupported.");
    relation.direction = record.direction as SemanticRelation["direction"];
  }
  if (record.allowedOverlap !== undefined) {
    if (typeof record.allowedOverlap !== "boolean")
      throw new Error("Relation allowedOverlap is invalid.");
    relation.allowedOverlap = record.allowedOverlap;
  }
  return relation;
}

export function relationsForCanvas(canvas: Canvas): SemanticRelation[] {
  const byId = new Map<string, SemanticRelation>();
  const visit = (objects: FabricObject[]) => {
    objects.forEach((object) => {
      (object.semanticRelations ?? []).forEach((relation) => {
        try {
          const normalized = normalizeRelation(relation);
          if (!byId.has(normalized.id)) byId.set(normalized.id, normalized);
        } catch {
          // Malformed imported relations are ignored by inspection and rejected on mutation.
        }
      });
      if (isGroup(object)) visit(object.getObjects());
    });
  };
  visit(canvas.getObjects());
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function validateRelations(
  relations: SemanticRelation[],
  objectIds: ReadonlySet<string>
): void {
  if (relations.length > MAX_RELATIONS)
    throw new Error(`At most ${MAX_RELATIONS} relations are supported.`);
  const ids = new Set<string>();
  const exactRelations = new Set<string>();
  relations.forEach((relation) => {
    const normalized = normalizeRelation(relation);
    if (ids.has(normalized.id)) throw new Error(`Relation "${normalized.id}" is duplicated.`);
    ids.add(normalized.id);
    const exact = stable({
      kind: normalized.kind,
      sourceObjectId: normalized.sourceObjectId,
      targetObjectId: normalized.targetObjectId,
      mediatorObjectIds: normalized.mediatorObjectIds ?? [],
      direction: normalized.direction ?? "forward",
      allowedOverlap: normalized.allowedOverlap ?? false
    });
    if (exactRelations.has(exact))
      throw new Error(`Relation "${normalized.id}" duplicates an existing relation.`);
    exactRelations.add(exact);
    if (!objectIds.has(normalized.sourceObjectId) || !objectIds.has(normalized.targetObjectId)) {
      throw new Error(`Relation "${normalized.id}" references a missing object.`);
    }
    if (normalized.mediatorObjectIds?.some((id) => !objectIds.has(id))) {
      throw new Error(`Relation "${normalized.id}" references a missing mediator.`);
    }
  });
}

function boundsFromPoints(points: Point[]): Bounds {
  if (points.length === 0) return { left: 0, top: 0, width: 0, height: 0 };
  const left = Math.min(...points.map((item) => item.x));
  const top = Math.min(...points.map((item) => item.y));
  const right = Math.max(...points.map((item) => item.x));
  const bottom = Math.max(...points.map((item) => item.y));
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function expand(bounds: Bounds, amount: number): Bounds {
  return {
    left: bounds.left - amount,
    top: bounds.top - amount,
    width: bounds.width + amount * 2,
    height: bounds.height + amount * 2
  };
}

function objectPoints(object: FabricObject): Point[] {
  try {
    const coords = object.getCoords();
    return coords.map((item) => ({ x: item.x, y: item.y }));
  } catch {
    const rect = object.getBoundingRect();
    return [
      { x: rect.left, y: rect.top },
      { x: rect.left + rect.width, y: rect.top },
      { x: rect.left + rect.width, y: rect.top + rect.height },
      { x: rect.left, y: rect.top + rect.height }
    ];
  }
}

function lerp(a: Point, b: Point, progress: number): Point {
  return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
}

function sampleQuadratic(start: Point, control: Point, end: Point, steps = 12): Point[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return lerp(lerp(start, control, t), lerp(control, end, t), t);
  });
}

function sampleCubic(
  start: Point,
  firstControl: Point,
  secondControl: Point,
  end: Point,
  steps = 16
): Point[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const oneMinusT = 1 - t;
    return {
      x:
        oneMinusT ** 3 * start.x +
        3 * oneMinusT ** 2 * t * firstControl.x +
        3 * oneMinusT * t ** 2 * secondControl.x +
        t ** 3 * end.x,
      y:
        oneMinusT ** 3 * start.y +
        3 * oneMinusT ** 2 * t * firstControl.y +
        3 * oneMinusT * t ** 2 * secondControl.y +
        t ** 3 * end.y
    };
  });
}

function sampleSvgArc(
  start: Point,
  radiusX: number,
  radiusY: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  end: Point
): Point[] {
  const rx = Math.abs(radiusX);
  const ry = Math.abs(radiusY);
  if (rx === 0 || ry === 0 || (start.x === end.x && start.y === end.y)) return [start, end];
  const phi = (rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const xPrime = cosPhi * dx + sinPhi * dy;
  const yPrime = -sinPhi * dx + cosPhi * dy;
  const radiusScale = (xPrime * xPrime) / (rx * rx) + (yPrime * yPrime) / (ry * ry);
  const scaledRx = radiusScale > 1 ? rx * Math.sqrt(radiusScale) : rx;
  const scaledRy = radiusScale > 1 ? ry * Math.sqrt(radiusScale) : ry;
  const numerator = Math.max(
    0,
    (scaledRx * scaledRx * scaledRy * scaledRy -
      scaledRx * scaledRx * yPrime * yPrime -
      scaledRy * scaledRy * xPrime * xPrime) /
      (scaledRx * scaledRx * yPrime * yPrime + scaledRy * scaledRy * xPrime * xPrime)
  );
  const sign = largeArc === sweep ? -1 : 1;
  const coefficient = sign * Math.sqrt(numerator);
  const centerPrime = {
    x: (coefficient * scaledRx * yPrime) / scaledRy,
    y: (-coefficient * scaledRy * xPrime) / scaledRx
  };
  const center = {
    x: cosPhi * centerPrime.x - sinPhi * centerPrime.y + (start.x + end.x) / 2,
    y: sinPhi * centerPrime.x + cosPhi * centerPrime.y + (start.y + end.y) / 2
  };
  const vectorAngle = (from: Point, to: Point) =>
    Math.atan2(from.x * to.y - from.y * to.x, from.x * to.x + from.y * to.y);
  const startVector = {
    x: (xPrime - centerPrime.x) / scaledRx,
    y: (yPrime - centerPrime.y) / scaledRy
  };
  const endVector = {
    x: (-xPrime - centerPrime.x) / scaledRx,
    y: (-yPrime - centerPrime.y) / scaledRy
  };
  let delta = vectorAngle(startVector, endVector);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 12)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = Math.atan2(startVector.y, startVector.x) + (delta * index) / steps;
    return {
      x: center.x + cosPhi * scaledRx * Math.cos(angle) - sinPhi * scaledRy * Math.sin(angle),
      y: center.y + sinPhi * scaledRx * Math.cos(angle) + cosPhi * scaledRy * Math.sin(angle)
    };
  });
}

function sampledPathPoints(object: FabricObject): Point[] {
  const path = (object as FabricObject & { path?: unknown }).path;
  if (!Array.isArray(path)) return [];
  const offset = (object as FabricObject & { pathOffset?: { x: number; y: number } })
    .pathOffset ?? {
    x: 0,
    y: 0
  };
  const transform = object.calcTransformMatrix();
  const toCanvas = (point: Point): Point =>
    util.transformPoint(new FabricPoint(point.x - offset.x, point.y - offset.y), transform);
  const points: Point[] = [];
  let current = { x: 0, y: 0 };
  let start = current;
  let previousControl: Point | undefined;
  for (const rawCommand of path as Array<Array<string | number>>) {
    const command = String(rawCommand[0] ?? "").toUpperCase();
    const values = rawCommand.slice(1).map(Number);
    if (values.some((value) => !Number.isFinite(value))) continue;
    const absolute = (x: number, y: number): Point => ({ x, y });
    const relative = (x: number, y: number): Point => ({ x: current.x + x, y: current.y + y });
    const isRelative = String(rawCommand[0] ?? "").toLowerCase() === String(rawCommand[0] ?? "");
    const endpoint = (x: number, y: number) => (isRelative ? relative(x, y) : absolute(x, y));
    if (command === "M" && values.length >= 2) {
      current = endpoint(values[0], values[1]);
      start = current;
      points.push(toCanvas(current));
      previousControl = undefined;
    } else if (command === "L" && values.length >= 2) {
      const next = endpoint(values[0], values[1]);
      points.push(toCanvas(next));
      current = next;
      previousControl = undefined;
    } else if (command === "T" && values.length >= 2) {
      const control = previousControl
        ? { x: current.x * 2 - previousControl.x, y: current.y * 2 - previousControl.y }
        : current;
      const next = endpoint(values[0], values[1]);
      points.push(...sampleQuadratic(current, control, next).slice(1).map(toCanvas));
      current = next;
      previousControl = control;
    } else if (command === "H" && values.length >= 1) {
      const next = isRelative
        ? { x: current.x + values[0], y: current.y }
        : { x: values[0], y: current.y };
      points.push(toCanvas(next));
      current = next;
      previousControl = undefined;
    } else if (command === "V" && values.length >= 1) {
      const next = isRelative
        ? { x: current.x, y: current.y + values[0] }
        : { x: current.x, y: values[0] };
      points.push(toCanvas(next));
      current = next;
      previousControl = undefined;
    } else if (command === "Q" && values.length >= 4) {
      const control = endpoint(values[0], values[1]);
      const next = endpoint(values[2], values[3]);
      points.push(...sampleQuadratic(current, control, next).slice(1).map(toCanvas));
      current = next;
      previousControl = control;
    } else if (command === "C" && values.length >= 6) {
      const firstControl = endpoint(values[0], values[1]);
      const secondControl = endpoint(values[2], values[3]);
      const next = endpoint(values[4], values[5]);
      points.push(
        ...sampleCubic(current, firstControl, secondControl, next).slice(1).map(toCanvas)
      );
      current = next;
      previousControl = secondControl;
    } else if (command === "S" && values.length >= 4) {
      const firstControl = previousControl
        ? { x: current.x * 2 - previousControl.x, y: current.y * 2 - previousControl.y }
        : current;
      const secondControl = endpoint(values[0], values[1]);
      const next = endpoint(values[2], values[3]);
      points.push(
        ...sampleCubic(current, firstControl, secondControl, next).slice(1).map(toCanvas)
      );
      current = next;
      previousControl = secondControl;
    } else if (command === "A" && values.length >= 7) {
      const next = endpoint(values[5], values[6]);
      points.push(
        ...sampleSvgArc(
          current,
          values[0],
          values[1],
          values[2],
          values[3] !== 0,
          values[4] !== 0,
          next
        )
          .slice(1)
          .map(toCanvas)
      );
      current = next;
      previousControl = undefined;
    } else if (command === "Z") {
      points.push(toCanvas(start));
      current = start;
      previousControl = undefined;
    }
  }
  return points;
}

function sampledEllipsePoints(object: FabricObject): Point[] {
  const corners = objectPoints(object);
  if (corners.length !== 4) return [];
  const center = {
    x: (corners[0].x + corners[2].x) / 2,
    y: (corners[0].y + corners[2].y) / 2
  };
  const axisX = { x: (corners[1].x - corners[0].x) / 2, y: (corners[1].y - corners[0].y) / 2 };
  const axisY = { x: (corners[3].x - corners[0].x) / 2, y: (corners[3].y - corners[0].y) / 2 };
  return Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    return {
      x: center.x + axisX.x * Math.cos(angle) + axisY.x * Math.sin(angle),
      y: center.y + axisX.y * Math.cos(angle) + axisY.y * Math.sin(angle)
    };
  });
}

function visibleInkPoints(object: FabricObject): {
  points: Point[];
  source: SemanticGeometry["geometrySource"];
  descendantObjectIds: string[];
} {
  if (object.visible === false || (typeof object.opacity === "number" && object.opacity <= 0))
    return { points: [], source: "empty", descendantObjectIds: [] };
  if (isGroup(object)) {
    const children = object.getObjects().map(visibleInkPoints);
    const childPoints = children.flatMap((child) => child.points);
    return {
      points: childPoints,
      source:
        childPoints.length === 0
          ? "empty"
          : children.some((child) => child.source === "sampled-path")
            ? "sampled-path"
            : "vector",
      descendantObjectIds: children.flatMap((child) => child.descendantObjectIds)
    };
  }
  const pathPoints = sampledPathPoints(object);
  if (pathPoints.length > 0)
    return {
      points: pathPoints,
      source: "sampled-path",
      descendantObjectIds: object.objectId ? [object.objectId] : []
    };
  const type = String(object.type ?? object.OpenSketchType ?? "").toLowerCase();
  const shapePoints =
    type === "circle" || type === "ellipse" ? sampledEllipsePoints(object) : objectPoints(object);
  const strokeExpansion =
    typeof object.strokeWidth === "number"
      ? (object.strokeWidth *
          Math.max(Math.abs(object.scaleX ?? 1), Math.abs(object.scaleY ?? 1))) /
        2
      : 0;
  const pointsWithStroke =
    strokeExpansion > 0
      ? shapePoints.flatMap((point) => [
          point,
          { x: point.x - strokeExpansion, y: point.y },
          { x: point.x + strokeExpansion, y: point.y },
          { x: point.x, y: point.y - strokeExpansion },
          { x: point.x, y: point.y + strokeExpansion }
        ])
      : shapePoints;
  return {
    points: pointsWithStroke,
    source: "vector",
    descendantObjectIds: object.objectId ? [object.objectId] : []
  };
}

function convexHull(points: Point[]): Point[] {
  const unique = [
    ...new Map(points.map((point) => [`${point.x}:${point.y}`, point])).values()
  ].sort((a, b) => a.x - b.x || a.y - b.y);
  if (unique.length <= 2) return unique;
  const cross = (origin: Point, left: Point, right: Point) =>
    (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  return length > 0 ? { x: point.x / length, y: point.y / length } : { x: 0, y: 0 };
}

export function rayToPerimeter(
  hull: readonly Point[],
  origin: Point,
  direction: Point
): Point | null {
  const unit = normalize(direction);
  let closest: { point: Point; distance: number } | undefined;
  for (let index = 0; index < hull.length; index += 1) {
    const start = hull[index];
    const end = hull[(index + 1) % hull.length];
    const edge = { x: end.x - start.x, y: end.y - start.y };
    const denominator = unit.x * edge.y - unit.y * edge.x;
    if (Math.abs(denominator) < 1e-8) continue;
    const delta = { x: start.x - origin.x, y: start.y - origin.y };
    const distance = (delta.x * edge.y - delta.y * edge.x) / denominator;
    const progress = (delta.x * unit.y - delta.y * unit.x) / denominator;
    if (distance < -1e-6 || progress < -1e-6 || progress > 1 + 1e-6) continue;
    if (!closest || distance < closest.distance)
      closest = {
        point: { x: origin.x + unit.x * distance, y: origin.y + unit.y * distance },
        distance
      };
  }
  return closest?.point ?? null;
}

export function perimeterPointForAnchor(
  geometry: Pick<SemanticGeometry, "hull" | "center">,
  anchor: "top" | "right" | "bottom" | "left" | "center"
): Point | null {
  if (anchor === "center") return geometry.center;
  const direction =
    anchor === "top"
      ? { x: 0, y: -1 }
      : anchor === "right"
        ? { x: 1, y: 0 }
        : anchor === "bottom"
          ? { x: 0, y: 1 }
          : { x: -1, y: 0 };
  return rayToPerimeter(geometry.hull, geometry.center, direction);
}

export function segmentIntersectsHull(from: Point, to: Point, hull: readonly Point[]): boolean {
  if (hull.length < 2) return false;
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (a: Point, b: Point, point: Point) =>
    Math.min(a.x, b.x) - 1e-6 <= point.x &&
    point.x <= Math.max(a.x, b.x) + 1e-6 &&
    Math.min(a.y, b.y) - 1e-6 <= point.y &&
    point.y <= Math.max(a.y, b.y) + 1e-6;
  for (let index = 0; index < hull.length; index += 1) {
    const edgeStart = hull[index];
    const edgeEnd = hull[(index + 1) % hull.length];
    const orientations = [
      cross(from, to, edgeStart),
      cross(from, to, edgeEnd),
      cross(edgeStart, edgeEnd, from),
      cross(edgeStart, edgeEnd, to)
    ];
    if (
      ((orientations[0] >= -1e-6 && orientations[1] <= 1e-6) ||
        (orientations[0] <= 1e-6 && orientations[1] >= -1e-6)) &&
      ((orientations[2] >= -1e-6 && orientations[3] <= 1e-6) ||
        (orientations[2] <= 1e-6 && orientations[3] >= -1e-6)) &&
      (Math.abs(orientations[0]) > 1e-6 || onSegment(from, to, edgeStart))
    )
      return true;
  }
  return false;
}

function portAt(
  hull: Point[],
  center: Point,
  direction: Point,
  id: string,
  kind: SemanticPortKind,
  objectId: string
): SemanticPort | null {
  const position = rayToPerimeter(hull, center, direction);
  if (!position) return null;
  let normal = normalize(direction);
  for (let index = 0; index < hull.length; index += 1) {
    const start = hull[index];
    const end = hull[(index + 1) % hull.length];
    const edge = { x: end.x - start.x, y: end.y - start.y };
    const length = Math.hypot(edge.x, edge.y);
    if (length === 0) continue;
    const progress = Math.max(
      0,
      Math.min(
        1,
        ((position.x - start.x) * edge.x + (position.y - start.y) * edge.y) / (length * length)
      )
    );
    const candidate = { x: start.x + edge.x * progress, y: start.y + edge.y * progress };
    if (Math.hypot(candidate.x - position.x, candidate.y - position.y) < 0.01) {
      normal = normalize({ x: edge.y, y: -edge.x });
      if (normal.x * direction.x + normal.y * direction.y < 0)
        normal = { x: -normal.x, y: -normal.y };
      break;
    }
  }
  return { id: `${objectId}:port:${id}`, position, normal, kind, scopeObjectId: objectId };
}

function portsFor(hull: Point[], center: Point, objectId: string): SemanticPort[] {
  const definitions: Array<[string, Point, SemanticPortKind]> = [
    ["top", { x: 0, y: -1 }, "incoming"],
    ["right", { x: 1, y: 0 }, "outgoing"],
    ["bottom", { x: 0, y: 1 }, "outgoing"],
    ["left", { x: -1, y: 0 }, "incoming"],
    ["radial-in", { x: 0, y: -1 }, "radial-in"],
    ["radial-out", { x: 0, y: 1 }, "radial-out"],
    ["clockwise", { x: 1, y: 0 }, "clockwise"],
    ["counterclockwise", { x: -1, y: 0 }, "counterclockwise"]
  ];
  return definitions
    .map(([id, direction, kind]) => portAt(hull, center, direction, id, kind, objectId))
    .filter((port): port is SemanticPort => Boolean(port));
}

export function inspectSemanticGeometry(object: FabricObject, clearance = 12): SemanticGeometry {
  const visible = visibleInkPoints(object);
  const points = visible.points;
  const selection = object.getBoundingRect();
  const selectionBounds = {
    left: selection.left,
    top: selection.top,
    width: selection.width,
    height: selection.height
  };
  const visualBounds =
    points.length > 0
      ? boundsFromPoints(points)
      : { left: selection.left, top: selection.top, width: 0, height: 0 };
  const layoutBounds = expand(visualBounds, clearance);
  const hull = convexHull(points);
  const center =
    points.length > 0
      ? {
          x: visualBounds.left + visualBounds.width / 2,
          y: visualBounds.top + visualBounds.height / 2
        }
      : { x: selection.left + selection.width / 2, y: selection.top + selection.height / 2 };
  const textObject = object as FabricObject & {
    text?: string;
    fontSize?: number;
    textLines?: string[];
  };
  const textMetrics =
    typeof textObject.text === "string"
      ? {
          width: visualBounds.width,
          height: visualBounds.height,
          lineCount: Array.isArray(textObject.textLines)
            ? textObject.textLines.length
            : textObject.text.split("\n").length,
          ...(typeof textObject.fontSize === "number" ? { fontSize: textObject.fontSize } : {}),
          fontReady: (() => {
            if (
              typeof document === "undefined" ||
              !document.fonts ||
              typeof document.fonts.check !== "function"
            )
              return true;
            try {
              return document.fonts.check(
                `${textObject.fontSize ?? 16}px "${String((textObject as { fontFamily?: string }).fontFamily ?? "sans-serif")}"`
              );
            } catch {
              return false;
            }
          })()
        }
      : undefined;
  return {
    visualBounds,
    layoutBounds,
    selectionBounds,
    hull,
    center,
    area: visualBounds.width * visualBounds.height,
    ports: portsFor(hull, center, object.objectId ?? "unknown"),
    geometrySource: visible.source,
    evaluable: points.length > 0,
    descendantObjectIds: visible.descendantObjectIds,
    ...(textMetrics ? { textMetrics } : {})
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function hash(value: string, seed = 2166136261): string {
  let result = seed;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function hash128(value: string): string {
  return [2166136261, 2246822519, 3266489917, 668265263].map((seed) => hash(value, seed)).join("");
}

export function sceneRevision(canvas: Canvas): string {
  const describe = (objects: FabricObject[]): unknown[] =>
    objects.map((object) => ({
      id: object.objectId,
      type: object.OpenSketchType ?? object.type,
      familyId: object.familyId,
      left: object.left,
      top: object.top,
      width: object.width,
      height: object.height,
      scaleX: object.scaleX,
      scaleY: object.scaleY,
      angle: object.angle,
      flipX: object.flipX,
      flipY: object.flipY,
      opacity: object.opacity,
      visible: object.visible,
      fill: object.fill,
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      fontFamily: "fontFamily" in object ? object.fontFamily : undefined,
      fontStyle: "fontStyle" in object ? object.fontStyle : undefined,
      fontSize: "fontSize" in object ? object.fontSize : undefined,
      fontWeight: "fontWeight" in object ? object.fontWeight : undefined,
      lineHeight: "lineHeight" in object ? object.lineHeight : undefined,
      charSpacing: "charSpacing" in object ? object.charSpacing : undefined,
      text: "text" in object ? (object as unknown as { text?: string }).text : undefined,
      semanticMetadata: object.semanticMetadata,
      semanticRelations: object.semanticRelations,
      connector: object.connector,
      freeConnectorGeometry: object.freeConnectorGeometry,
      children: isGroup(object) ? describe(object.getObjects()) : undefined
    }));
  return `scene-${hash(stable({ width: canvas.getWidth?.() ?? canvas.width ?? 0, height: canvas.getHeight?.() ?? canvas.height ?? 0, objects: describe(canvas.getObjects()), relations: relationsForCanvas(canvas) }))}`;
}

export interface LayoutInputObject {
  object: FabricObject;
  geometry: SemanticGeometry;
  metadata?: SemanticMetadata;
}

export interface LayoutOptions {
  mode: SemanticLayoutPlan["mode"];
  objectIds: string[];
  center?: Point;
  radius?: number;
  axes?: { x: number; y: number };
  preferredAxes?: { x: number; y: number };
  fixedAxes?: boolean;
  startAngle?: number;
  direction?: "clockwise" | "counterclockwise";
  gap?: number;
  canvas: { width: number; height: number };
  padding?: number;
  hubKeepOut?: Bounds;
  maxIterations?: number;
  pinnedObjectIds?: string[];
  maxMovement?: number;
}

function boundsAtCenter(center: Point, geometry: SemanticGeometry): Bounds {
  return {
    left: center.x - geometry.layoutBounds.width / 2,
    top: center.y - geometry.layoutBounds.height / 2,
    width: geometry.layoutBounds.width,
    height: geometry.layoutBounds.height
  };
}

function overlapsBounds(left: Bounds, right: Bounds, gap = 0): boolean {
  return (
    left.left < right.left + right.width + gap &&
    left.left + left.width + gap > right.left &&
    left.top < right.top + right.height + gap &&
    left.top + left.height + gap > right.top
  );
}

function projectionExtent(geometry: SemanticGeometry, direction: Point): number {
  const unit = normalize(direction);
  const points =
    geometry.hull.length > 0
      ? geometry.hull
      : [
          { x: geometry.visualBounds.left, y: geometry.visualBounds.top },
          {
            x: geometry.visualBounds.left + geometry.visualBounds.width,
            y: geometry.visualBounds.top
          },
          {
            x: geometry.visualBounds.left + geometry.visualBounds.width,
            y: geometry.visualBounds.top + geometry.visualBounds.height
          },
          {
            x: geometry.visualBounds.left,
            y: geometry.visualBounds.top + geometry.visualBounds.height
          }
        ];
  return Math.max(
    0,
    ...points.map((point) =>
      Math.abs((point.x - geometry.center.x) * unit.x + (point.y - geometry.center.y) * unit.y)
    )
  );
}

function cyclePositions(
  ordered: LayoutInputObject[],
  center: Point,
  axes: { x: number; y: number },
  start: number,
  direction: number,
  gap: number
): Array<{ objectId: string; x: number; y: number }> {
  const count = Math.max(1, ordered.length);
  const halfWidths = ordered.map((item, index) => {
    const angle = start + (direction * (index * Math.PI * 2)) / count;
    const tangent = { x: -axes.x * Math.sin(angle), y: axes.y * Math.cos(angle) };
    const arcScale = Math.max(1, Math.hypot(tangent.x, tangent.y));
    return projectionExtent(item.geometry, tangent) / arcScale;
  });
  const minRadius = Math.max(1, Math.min(axes.x, axes.y));
  const gapAngle = gap / minRadius;
  const required = halfWidths.reduce((sum, width) => sum + width * 2, 0) + gapAngle * count;
  const extra = Math.max(0, Math.PI * 2 - required) / count;
  let angle = start;
  return ordered.map((item, index) => {
    const position = {
      objectId: item.object.objectId!,
      x: center.x + Math.cos(angle) * axes.x,
      y: center.y + Math.sin(angle) * axes.y
    };
    angle += direction * (halfWidths[index] + extra + gapAngle + halfWidths[(index + 1) % count]);
    return position;
  });
}

function assessPositions(
  ordered: LayoutInputObject[],
  positions: Array<{ objectId: string; x: number; y: number }>,
  options: LayoutOptions,
  center: Point
): {
  overlap: number;
  boundary: number;
  hub: number;
  movement: number;
  violations: string[];
} {
  const plannedBounds = positions.map((position, index) =>
    boundsAtCenter(position, ordered[index].geometry)
  );
  let overlap = 0;
  const violations: string[] = [];
  for (let left = 0; left < plannedBounds.length; left += 1) {
    for (let right = left + 1; right < plannedBounds.length; right += 1) {
      const leftAllows = ordered[left].metadata?.allowedOverlapObjectIds?.includes(
        ordered[right].object.objectId!
      );
      const rightAllows = ordered[right].metadata?.allowedOverlapObjectIds?.includes(
        ordered[left].object.objectId!
      );
      if (
        !leftAllows &&
        !rightAllows &&
        overlapsBounds(plannedBounds[left], plannedBounds[right])
      ) {
        overlap += 1;
        violations.push(
          `Objects "${ordered[left].object.objectId}" and "${ordered[right].object.objectId}" overlap.`
        );
      }
    }
  }
  const padding = options.padding ?? 24;
  let boundary = 0;
  plannedBounds.forEach((bounds, index) => {
    if (
      bounds.left < padding ||
      bounds.top < padding ||
      bounds.left + bounds.width > options.canvas.width - padding ||
      bounds.top + bounds.height > options.canvas.height - padding
    ) {
      boundary += 1;
      violations.push(`Object "${ordered[index].object.objectId}" exceeds canvas padding.`);
    }
  });
  let hub = 0;
  if (options.hubKeepOut) {
    plannedBounds.forEach((bounds, index) => {
      if (overlapsBounds(bounds, options.hubKeepOut!)) {
        hub += 1;
        violations.push(`Object "${ordered[index].object.objectId}" enters the hub keep-out.`);
      }
    });
  }
  const movement = positions.reduce((sum, position, index) => {
    const current = ordered[index].geometry.center;
    return sum + Math.hypot(position.x - current.x, position.y - current.y);
  }, 0);
  if (options.maxMovement !== undefined) {
    positions.forEach((position, index) => {
      const current = ordered[index].geometry.center;
      if (Math.hypot(position.x - current.x, position.y - current.y) > options.maxMovement!)
        violations.push(`Object "${ordered[index].object.objectId}" exceeds the movement bound.`);
    });
  }
  if (options.mode === "cycle" && positions.length > 0 && options.hubKeepOut === undefined) {
    const distanceFromCenter = Math.hypot(positions[0].x - center.x, positions[0].y - center.y);
    if (!Number.isFinite(distanceFromCenter)) violations.push("Cycle radius is non-finite.");
  }
  return { overlap, boundary, hub, movement, violations: [...new Set(violations)] };
}

function layoutMetrics(
  ordered: LayoutInputObject[],
  positions: Array<{ objectId: string; x: number; y: number }>,
  options: LayoutOptions,
  assessment: { movement: number },
  cycleAxes?: { x: number; y: number }
) {
  const bounds = positions.map((position, index) =>
    boundsAtCenter(position, ordered[index].geometry)
  );
  const gaps: number[] = [];
  for (let left = 0; left < bounds.length; left += 1) {
    for (let right = left + 1; right < bounds.length; right += 1) {
      const horizontal = Math.max(
        0,
        Math.max(
          bounds[left].left - (bounds[right].left + bounds[right].width),
          bounds[right].left - (bounds[left].left + bounds[left].width)
        )
      );
      const vertical = Math.max(
        0,
        Math.max(
          bounds[left].top - (bounds[right].top + bounds[right].height),
          bounds[right].top - (bounds[left].top + bounds[left].height)
        )
      );
      gaps.push(horizontal > 0 ? horizontal : vertical);
    }
  }
  const pathLength = positions.reduce((sum, position, index) => {
    const next = positions[(index + 1) % Math.max(1, positions.length)];
    if (!next || (options.mode !== "cycle" && index === positions.length - 1)) return sum;
    return sum + Math.hypot(next.x - position.x, next.y - position.y);
  }, 0);
  const occupiedArea = ordered.reduce(
    (sum, item) => sum + item.geometry.layoutBounds.width * item.geometry.layoutBounds.height,
    0
  );
  const minHubClearance = options.hubKeepOut
    ? bounds.length > 0
      ? Math.min(
          ...bounds.map((item) =>
            Math.max(
              0,
              Math.min(
                Math.abs(item.left - (options.hubKeepOut!.left + options.hubKeepOut!.width)),
                Math.abs(options.hubKeepOut!.left - (item.left + item.width)),
                Math.abs(item.top - (options.hubKeepOut!.top + options.hubKeepOut!.height)),
                Math.abs(options.hubKeepOut!.top - (item.top + item.height))
              )
            )
          )
        )
      : 0
    : null;
  return {
    occupiedAreaRatio: occupiedArea / Math.max(1, options.canvas.width * options.canvas.height),
    cycleArea:
      options.mode === "cycle"
        ? Math.PI *
          (cycleAxes?.x ?? options.axes?.x ?? options.radius ?? 240) *
          (cycleAxes?.y ?? options.axes?.y ?? options.radius ?? 240)
        : 0,
    minInterObjectGap: gaps.length > 0 ? Math.min(...gaps) : 0,
    maxInterObjectGap: gaps.length > 0 ? Math.max(...gaps) : 0,
    minHubClearance,
    movementDistance: assessment.movement,
    expectedMainFlowPathLength: pathLength
  };
}

function planIdentifier(revision: string, options: LayoutOptions): string {
  return `layout-${hash128(stable({ revision, options }))}`;
}

export function planSemanticLayout(
  objects: LayoutInputObject[],
  options: LayoutOptions,
  revision: string
): SemanticLayoutPlan {
  const byId = new Map(objects.map((item) => [item.object.objectId, item]));
  const ordered = options.objectIds
    .map((id) => byId.get(id))
    .filter((item): item is LayoutInputObject => Boolean(item));
  const warnings: string[] = [];
  const violations: string[] = [];
  const positions: Array<{ objectId: string; x: number; y: number }> = [];
  const center = options.center ?? { x: options.canvas.width / 2, y: options.canvas.height / 2 };
  const direction = options.direction === "counterclockwise" ? -1 : 1;
  const gap = options.gap ?? 24;
  if (ordered.length !== options.objectIds.length) {
    options.objectIds
      .filter((id) => !byId.has(id))
      .forEach((id) => violations.push(`Object "${id}" is unavailable.`));
  }
  const unevaluable = ordered.filter((item) => item.geometry.evaluable === false);
  if (unevaluable.length > 0) {
    violations.push(
      ...unevaluable.map(
        (item) => `Object "${item.object.objectId}" has unevaluable visual geometry.`
      )
    );
    return {
      id: planIdentifier(revision, options),
      version: SEMANTIC_COMPOSITION_VERSION,
      mode: options.mode,
      sourceRevision: revision,
      status: "infeasible",
      positions: [],
      routeContext: undefined,
      score: violations.length * 1_000,
      penalties: { overlap: 0, boundary: 0, hub: 0, movement: 0 },
      warnings,
      violations,
      unchanged: ordered.map((item) => ({
        objectId: item.object.objectId!,
        reason: "Unevaluable visual geometry"
      })),
      metrics: layoutMetrics([], [], options, { movement: 0 })
    };
  }
  let routeContext: SemanticLayoutPlan["routeContext"];
  let cycleAxes: { x: number; y: number } | undefined;
  let assessment = { overlap: 0, boundary: 0, hub: 0, movement: 0, violations: [] as string[] };
  if (options.mode === "cycle") {
    const requestedAxes = options.fixedAxes
      ? options.axes
      : (options.preferredAxes ?? options.axes);
    let axes = requestedAxes
      ? { x: Math.max(1, requestedAxes.x), y: Math.max(1, requestedAxes.y) }
      : { x: Math.max(240, options.radius ?? 240), y: Math.max(240, options.radius ?? 240) };
    const start = ((options.startAngle ?? -90) * Math.PI) / 180;
    const iterations = Math.max(1, Math.min(64, Math.floor(options.maxIterations ?? 24)));
    let feasible = false;
    for (let attempt = 0; attempt < iterations; attempt += 1) {
      positions.splice(
        0,
        positions.length,
        ...cyclePositions(ordered, center, axes, start, direction, gap)
      );
      positions.forEach((position, index) => {
        if (
          options.pinnedObjectIds?.includes(position.objectId) ||
          ordered[index].metadata?.pinned
        ) {
          position.x = ordered[index].geometry.center.x;
          position.y = ordered[index].geometry.center.y;
        }
      });
      assessment = assessPositions(ordered, positions, options, center);
      if (assessment.overlap === 0 && assessment.boundary === 0 && assessment.hub === 0) {
        feasible = true;
        break;
      }
      if (options.fixedAxes) break;
      axes = { x: axes.x * 1.14, y: axes.y * 1.14 };
    }
    routeContext = {
      center,
      axes,
      direction: direction === 1 ? "clockwise" : "counterclockwise"
    };
    cycleAxes = axes;
    if (!feasible)
      violations.push(
        "No feasible cycle layout satisfies visual extents, canvas, and keep-out constraints within the bounded search."
      );
    if (
      requestedAxes &&
      !options.fixedAxes &&
      (axes.x !== requestedAxes.x || axes.y !== requestedAxes.y)
    )
      warnings.push("Preferred cycle axes were expanded to satisfy hard visual constraints.");
  } else if (options.mode !== "free") {
    const horizontal =
      options.mode === "flow" || options.mode === "path" || options.mode === "grid";
    const columns =
      options.mode === "grid" ? Math.ceil(Math.sqrt(Math.max(1, ordered.length))) : ordered.length;
    ordered.forEach((item, index) => {
      const row = options.mode === "grid" ? Math.floor(index / columns) : 0;
      const column = options.mode === "grid" ? index % columns : index;
      const previous = item.geometry.center;
      const x = horizontal
        ? center.x + (column - (columns - 1) / 2) * (item.geometry.layoutBounds.width + gap)
        : center.x;
      const y = horizontal
        ? center.y + row * (item.geometry.layoutBounds.height + gap)
        : center.y + (column - (columns - 1) / 2) * (item.geometry.layoutBounds.height + gap);
      positions.push({ objectId: item.object.objectId!, x, y });
      if (options.pinnedObjectIds?.includes(item.object.objectId!) || item.metadata?.pinned) {
        positions.at(-1)!.x = previous.x;
        positions.at(-1)!.y = previous.y;
      }
      if (!Number.isFinite(previous.x + previous.y))
        violations.push(`Object "${item.object.objectId}" has non-finite current geometry.`);
    });
    assessment = assessPositions(ordered, positions, options, center);
    routeContext = undefined;
  } else {
    routeContext = undefined;
  }
  if (options.mode === "free") {
    ordered.forEach((item) =>
      assessment.violations.push(`Object "${item.object.objectId}" is unchanged by free layout.`)
    );
  }
  violations.push(...assessment.violations.filter((message) => !message.includes("is unchanged")));
  const unchanged =
    options.mode === "free"
      ? ordered.map((item) => ({
          objectId: item.object.objectId!,
          reason: "Free layout preserves the current position."
        }))
      : [];
  if (options.mode === "free") positions.length = 0;
  const metrics = layoutMetrics(ordered, positions, options, assessment, cycleAxes);
  return {
    id: planIdentifier(revision, options),
    version: SEMANTIC_COMPOSITION_VERSION,
    mode: options.mode,
    sourceRevision: revision,
    status: violations.length ? "infeasible" : "feasible",
    positions,
    routeContext,
    score:
      assessment.overlap * 1_000 +
      assessment.boundary * 1_000 +
      assessment.hub * 1_000 +
      assessment.movement,
    penalties: {
      overlap: assessment.overlap,
      boundary: assessment.boundary,
      hub: assessment.hub,
      movement: assessment.movement
    },
    warnings,
    violations,
    unchanged,
    metrics
  };
}
