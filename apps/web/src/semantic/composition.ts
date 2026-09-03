import { ActiveSelection, Group, type Canvas, type FabricObject } from "fabric";
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
    "semanticName"
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
  relations.forEach((relation) => {
    const normalized = normalizeRelation(relation);
    if (ids.has(normalized.id)) throw new Error(`Relation "${normalized.id}" is duplicated.`);
    ids.add(normalized.id);
    if (!objectIds.has(normalized.sourceObjectId) || !objectIds.has(normalized.targetObjectId)) {
      throw new Error(`Relation "${normalized.id}" references a missing object.`);
    }
    if (normalized.mediatorObjectIds?.some((id) => !objectIds.has(id))) {
      throw new Error(`Relation "${normalized.id}" references a missing mediator.`);
    }
  });
}

function boundsFromPoints(points: Point[]): Bounds {
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

function visibleInkPoints(object: FabricObject): Point[] {
  if (object.visible === false || (typeof object.opacity === "number" && object.opacity <= 0))
    return [];
  if (isGroup(object)) {
    const childPoints = object.getObjects().flatMap(visibleInkPoints);
    return childPoints.length > 0 ? childPoints : objectPoints(object);
  }
  return objectPoints(object);
}

function portsFor(bounds: Bounds, objectId: string): SemanticPort[] {
  const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  const values: Array<[string, Point, Point, SemanticPortKind]> = [
    ["top", { x: center.x, y: bounds.top }, { x: 0, y: -1 }, "incoming"],
    ["right", { x: bounds.left + bounds.width, y: center.y }, { x: 1, y: 0 }, "outgoing"],
    ["bottom", { x: center.x, y: bounds.top + bounds.height }, { x: 0, y: 1 }, "outgoing"],
    ["left", { x: bounds.left, y: center.y }, { x: -1, y: 0 }, "incoming"],
    ["radial-in", center, { x: 0, y: -1 }, "radial-in"],
    ["radial-out", center, { x: 0, y: 1 }, "radial-out"],
    ["clockwise", { x: bounds.left + bounds.width, y: center.y }, { x: 0, y: 1 }, "clockwise"],
    ["counterclockwise", { x: bounds.left, y: center.y }, { x: 0, y: -1 }, "counterclockwise"]
  ];
  return values.map(([id, position, normal, kind]) => ({
    id: `${objectId}:port:${id}`,
    position,
    normal,
    kind,
    scopeObjectId: objectId
  }));
}

export function inspectSemanticGeometry(object: FabricObject, clearance = 12): SemanticGeometry {
  const points = visibleInkPoints(object);
  const visualBounds = boundsFromPoints(points.length > 0 ? points : objectPoints(object));
  const selection = object.getBoundingRect();
  const selectionBounds = {
    left: selection.left,
    top: selection.top,
    width: selection.width,
    height: selection.height
  };
  const layoutBounds = expand(visualBounds, clearance);
  const hull = points.length > 0 ? points : objectPoints(object);
  return {
    visualBounds,
    layoutBounds,
    selectionBounds,
    hull,
    center: {
      x: visualBounds.left + visualBounds.width / 2,
      y: visualBounds.top + visualBounds.height / 2
    },
    area: visualBounds.width * visualBounds.height,
    ports: portsFor(visualBounds, object.objectId ?? "unknown")
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

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
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

function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
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
  startAngle?: number;
  direction?: "clockwise" | "counterclockwise";
  gap?: number;
  canvas: { width: number; height: number };
  padding?: number;
  hubKeepOut?: Bounds;
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
  const padding = options.padding ?? 24;
  if (ordered.length !== options.objectIds.length) {
    options.objectIds
      .filter((id) => !byId.has(id))
      .forEach((id) => violations.push(`Object "${id}" is unavailable.`));
  }
  if (options.mode === "cycle") {
    let radius = Math.max(options.radius ?? 240, 1);
    const axes = options.axes ?? { x: radius, y: radius };
    const start = ((options.startAngle ?? -90) * Math.PI) / 180;
    let feasible = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      positions.length = 0;
      ordered.forEach((item, index) => {
        const angle = start + (direction * (index * (Math.PI * 2))) / Math.max(1, ordered.length);
        positions.push({
          objectId: item.object.objectId!,
          x: center.x + Math.cos(angle) * (options.axes ? axes.x : radius),
          y: center.y + Math.sin(angle) * (options.axes ? axes.y : radius)
        });
      });
      const plannedBounds = positions.map((position, index) => {
        const item = ordered[index];
        return {
          left: position.x - item.geometry.layoutBounds.width / 2,
          top: position.y - item.geometry.layoutBounds.height / 2,
          width: item.geometry.layoutBounds.width,
          height: item.geometry.layoutBounds.height
        };
      });
      const overlap = plannedBounds.some((bounds, index) =>
        plannedBounds.some((other, otherIndex) => index < otherIndex && intersects(bounds, other))
      );
      const boundary = plannedBounds.some(
        (bounds) =>
          bounds.left < padding ||
          bounds.top < padding ||
          bounds.left + bounds.width > options.canvas.width - padding ||
          bounds.top + bounds.height > options.canvas.height - padding
      );
      const hub = options.hubKeepOut
        ? plannedBounds.some((bounds) => intersects(bounds, options.hubKeepOut!))
        : false;
      if (!overlap && !boundary && !hub) {
        feasible = true;
        break;
      }
      radius *= 1.2;
    }
    if (!feasible)
      violations.push(
        "No feasible cycle layout satisfies object, canvas, and keep-out constraints within the bounded search."
      );
    return {
      id: crypto.randomUUID(),
      version: SEMANTIC_COMPOSITION_VERSION,
      mode: options.mode,
      sourceRevision: revision,
      status: violations.length > 0 ? "infeasible" : "feasible",
      positions: [...positions],
      routeContext: {
        center,
        ...(options.axes ? { axes } : { radius }),
        direction: direction === 1 ? "clockwise" : "counterclockwise"
      },
      score: violations.length * 1_000,
      penalties: { overlap: violations.length ? 1 : 0, boundary: 0, hub: 0, movement: 0 },
      warnings,
      violations,
      unchanged: []
    };
  }
  const horizontal = options.mode === "flow" || options.mode === "path" || options.mode === "grid";
  ordered.forEach((item, index) => {
    const columns =
      options.mode === "grid" ? Math.ceil(Math.sqrt(Math.max(1, ordered.length))) : ordered.length;
    const row = options.mode === "grid" ? Math.floor(index / columns) : 0;
    const column = options.mode === "grid" ? index % columns : index;
    const x = horizontal
      ? center.x + (column - (columns - 1) / 2) * (item.geometry.layoutBounds.width + gap)
      : center.x;
    const y = horizontal
      ? center.y + row * (item.geometry.layoutBounds.height + gap)
      : center.y + (column - (columns - 1) / 2) * (item.geometry.layoutBounds.height + gap);
    positions.push({ objectId: item.object.objectId!, x, y });
  });
  const unchanged =
    options.mode === "free"
      ? ordered.map((item) => ({
          objectId: item.object.objectId!,
          reason: "Free layout preserves the current position."
        }))
      : [];
  if (options.mode === "free") positions.length = 0;
  return {
    id: crypto.randomUUID(),
    version: SEMANTIC_COMPOSITION_VERSION,
    mode: options.mode,
    sourceRevision: revision,
    status: violations.length ? "infeasible" : "feasible",
    positions,
    score: 0,
    penalties: { overlap: 0, boundary: 0, hub: 0, movement: 0 },
    warnings,
    violations,
    unchanged
  };
}
