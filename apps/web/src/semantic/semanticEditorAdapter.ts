import {
  ActiveSelection,
  Canvas,
  Circle,
  FabricObject,
  Group,
  IText,
  Point,
  Textbox,
  util
} from "fabric";
import {
  filterAssetFamilies,
  type AssetFamily,
  type AssetVariant,
  type CanvasSettings,
  type ConnectorBinding,
  PORTABLE_PROJECT_LIMITS
} from "@workspace/editor-core";
import {
  CONNECTOR_KINDS,
  SHAPE_KINDS,
  TEXT_KINDS,
  ALIGN_AXES,
  ARRANGE_ACTIONS,
  OBJECT_ANCHORS
} from "./semanticCommands";
import {
  type SemanticAdapterResult,
  type SemanticBounds,
  type SemanticEditorAdapter,
  type SemanticObjectDescriptor,
  type SemanticSceneSnapshot,
  type SemanticStyleSummary
} from "./semanticTypes";
import { createShapeObject } from "@/editor/creationObjects";
import { type CreationDefaults, type ShapeKind } from "@/editor/creation";
import {
  connectorsForRemovedIds,
  createCircularArcObject,
  createConnectorObject,
  createFreeConnectorObject
} from "@/editor/connectors";
import { configureTextObject } from "@/editor/selection";
import { assignFreshCloneIds } from "@/editor/cloneIdentity";
import { anchorPoint, type Bounds } from "@/editor/geometry";
import { arrangeObjects, layerCollectionForObject, isManualGroup } from "@/editor/grouping";
import {
  assertUniqueSceneObjectIds,
  isSceneDescendant,
  removeSceneObject,
  sceneObjectEntries,
  sceneObjectIndex,
  visitSceneObjects
} from "@/editor/sceneTree";
import {
  consumeRecognizedGroup,
  findRecognizedGroup,
  rememberRecognizedGroup
} from "@/editor/groupRecognition";
import { assetManifest } from "@/assets/manifest";
import { collectProvenanceManifest } from "@/export/provenance";
import {
  inspectSemanticGeometry,
  metadataOf,
  normalizeSemanticMetadata,
  normalizeRelation,
  planSemanticLayout,
  relationsForCanvas,
  sceneRevision,
  setMetadata,
  validateRelations,
  type SemanticLayoutPlan,
  type SemanticPort
} from "./composition";
import {
  annotationCandidates,
  planInteraction,
  planParticleField,
  SEMANTIC_TEXT_COLOR,
  stylePreset,
  type InteractionMode,
  type LabelPlacement,
  type ParticleDistribution
} from "./compound";
import { analyzeComposition, validateFigure } from "./analysis";
import { refreshTextMetrics } from "@/editor/textMetrics";

export class SemanticAdapterError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SemanticAdapterError";
    this.code = code;
  }
}

export interface SemanticEditorAdapterDependencies {
  getCanvas: () => Canvas | null;
  getProjectId: () => string;
  isCanvasReady: () => boolean;
  getCanvasSettings: () => CanvasSettings;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  setProjectName: (name: string) => void;
  setProjectDescription: (description: string) => void;
  setSelection: (objects: FabricObject[]) => void;
  commit: (label?: string) => void;
  serialize: () => string;
  restore: (snapshot: string) => Promise<void>;
  creationDefaults: () => CreationDefaults;
  prepareElementStyle: (object: FabricObject) => void;
  configureCanvasAssets: (objects: FabricObject[]) => void;
  refreshConnectors: (changedObjectId?: string) => void;
  applyColorPreset: (objectId: string, presetId: string) => Promise<void>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  insertAsset: (
    family: AssetFamily,
    variant: AssetVariant,
    point?: SemanticPointInput
  ) => Promise<string | undefined>;
  replaceAssetVariant: (objectId: string, variantId: string) => Promise<boolean>;
  exportSvg: (title?: string, description?: string) => void;
  exportCredits: (title?: string, description?: string) => void;
  exportPdf: (title?: string, description?: string) => Promise<void>;
  exportPng: (transparent: boolean, dpi: number, background?: string) => Promise<void>;
}

type SemanticPointInput = { x: number; y: number };

function isGroup(object: FabricObject | undefined): object is Group {
  return object instanceof Group && !(object instanceof ActiveSelection);
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SemanticAdapterError("INVALID_INPUT", `${field} must be finite.`);
  }
  return value;
}

function point(value: unknown, field: string): SemanticPointInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SemanticAdapterError("INVALID_INPUT", `${field} must be a point.`);
  }
  const candidate = value as Record<string, unknown>;
  return { x: finiteNumber(candidate.x, `${field}.x`), y: finiteNumber(candidate.y, `${field}.y`) };
}

function objectIds(input: Record<string, unknown>): string[] {
  if (!Array.isArray(input.objectIds) || input.objectIds.some((id) => typeof id !== "string")) {
    throw new SemanticAdapterError("INVALID_INPUT", "objectIds must be an array of strings.");
  }
  const ids = input.objectIds as string[];
  if (new Set(ids).size !== ids.length) {
    throw new SemanticAdapterError("INVALID_INPUT", "objectIds must not contain duplicates.");
  }
  return ids;
}

function assertNonOverlappingTargets(objects: FabricObject[]): void {
  for (const object of objects) {
    if (objects.some((candidate) => candidate !== object && isSceneDescendant(object, candidate))) {
      throw new SemanticAdapterError(
        "INVALID_SELECTION",
        "Targets cannot include both an ancestor and its descendant."
      );
    }
  }
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeStyleString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function assertSemanticSceneIdentity(canvas: Canvas): void {
  try {
    assertUniqueSceneObjectIds(canvas);
  } catch (error) {
    throw new SemanticAdapterError(
      "DUPLICATE_OBJECT_ID",
      error instanceof Error ? error.message : String(error)
    );
  }
}

function boundsOf(object: FabricObject): SemanticBounds {
  const bounds = object.getBoundingRect();
  return {
    left: safeNumber(bounds.left) ?? 0,
    top: safeNumber(bounds.top) ?? 0,
    width: Math.max(0, safeNumber(bounds.width) ?? 0),
    height: Math.max(0, safeNumber(bounds.height) ?? 0)
  };
}

function styleOf(object: FabricObject): SemanticStyleSummary {
  const style: SemanticStyleSummary = {};
  const record = object as unknown as Record<string, unknown>;
  const fill = safeStyleString(record.fill);
  const stroke = safeStyleString(record.stroke);
  if (fill !== undefined) style.fill = fill;
  if (stroke !== undefined) style.stroke = stroke;
  for (const [key, value] of [
    ["opacity", record.opacity],
    ["strokeWidth", record.strokeWidth],
    ["fontSize", record.fontSize],
    ["fontWeight", record.fontWeight]
  ] as const) {
    if (typeof value === "number" || typeof value === "string") {
      (style as Record<string, unknown>)[key] = value;
    }
  }
  const strokeLineCap = safeString(record.strokeLineCap);
  const fontFamily = safeString(record.fontFamily);
  const fontStyle = safeString(record.fontStyle);
  const textAlign = safeString(record.textAlign);
  if (strokeLineCap) style.strokeLineCap = strokeLineCap;
  if (fontFamily) style.fontFamily = fontFamily;
  if (fontStyle) style.fontStyle = fontStyle;
  if (textAlign) style.textAlign = textAlign;
  if (Array.isArray(record.strokeDashArray))
    style.strokeDashArray = [...record.strokeDashArray] as number[];
  else if (record.strokeDashArray === null) style.strokeDashArray = null;
  return style;
}

function describeObject(
  object: FabricObject,
  parentObjectId: string | undefined,
  path: FabricObject[],
  children?: string[]
): SemanticObjectDescriptor {
  const descriptor: SemanticObjectDescriptor = {
    objectId: object.objectId!,
    type: object.OpenSketchType ?? object.type,
    ...(safeString(object.name) ? { name: object.name } : {}),
    ...(parentObjectId ? { parentObjectId } : {}),
    depth: Math.max(0, path.length - 1),
    pathObjectIds: path.map((item) => item.objectId!).filter(Boolean),
    bounds: boundsOf(object),
    position: { x: safeNumber(object.left) ?? 0, y: safeNumber(object.top) ?? 0 },
    rotation: safeNumber(object.angle) ?? 0,
    scale: { x: safeNumber(object.scaleX) ?? 1, y: safeNumber(object.scaleY) ?? 1 },
    visible: object.visible !== false,
    selectable: object.selectable !== false,
    style: styleOf(object)
  };
  const metadata = metadataOf(object);
  if (metadata) descriptor.semanticMetadata = { ...metadata };
  if (object instanceof IText || object instanceof Textbox) {
    descriptor.text = boundedText(object.text, 4_000) ?? "";
  }
  if (object.familyId || object.assetId || object.provenance) {
    descriptor.asset = {
      ...(object.familyId ? { familyId: object.familyId } : {}),
      ...(object.assetId ? { variantId: object.assetId } : {}),
      ...(object.provenance ? { provenance: { ...object.provenance } } : {})
    };
  }
  if (object.connector) {
    descriptor.connector = {
      fromObjectId: object.connector.fromObjectId,
      fromAnchor: object.connector.fromAnchor,
      toObjectId: object.connector.toObjectId,
      toAnchor: object.connector.toAnchor,
      startArrowhead: object.connector.startArrowhead,
      endArrowhead: object.connector.endArrowhead,
      lineStyle: object.connector.lineStyle,
      ...(object.connector.routing ? { routing: object.connector.routing } : {}),
      ...(object.connector.pathShape ? { pathShape: object.connector.pathShape } : {})
    };
  }
  if (object.freeConnectorGeometry) {
    const transform = object.calcTransformMatrix();
    const from = util.transformPoint(
      new Point(object.freeConnectorGeometry.from.x, object.freeConnectorGeometry.from.y),
      transform
    );
    const to = util.transformPoint(
      new Point(object.freeConnectorGeometry.to.x, object.freeConnectorGeometry.to.y),
      transform
    );
    descriptor.freeConnector = {
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y }
    };
  }
  if (children) descriptor.children = children;
  return descriptor;
}

function unionBounds(objects: FabricObject[]): SemanticBounds {
  const bounds = objects.map(boundsOf);
  const left = Math.min(...bounds.map((item) => item.left));
  const top = Math.min(...bounds.map((item) => item.top));
  const right = Math.max(...bounds.map((item) => item.left + item.width));
  const bottom = Math.max(...bounds.map((item) => item.top + item.height));
  return { left, top, width: right - left, height: bottom - top };
}

function refreshParentGroups(object: FabricObject): void {
  let child = object;
  let parent = child.group;
  while (isGroup(parent)) {
    const desiredTransform = child.calcTransformMatrix();
    parent.triggerLayout();
    util.applyTransformToObject(
      child,
      util.multiplyTransformMatrices(
        util.invertTransform(parent.calcTransformMatrix()),
        desiredTransform
      )
    );
    child.setCoords();
    parent.dirty = true;
    parent.setCoords();
    child = parent;
    parent = child.group;
  }
}

function deltaInParentPlane(object: FabricObject, dx: number, dy: number): SemanticPointInput {
  const parent = object.group;
  if (!isGroup(parent)) return { x: dx, y: dy };
  const local = util.sendVectorToPlane(new Point(dx, dy), undefined, parent.calcTransformMatrix());
  return { x: local.x, y: local.y };
}

function setAbsoluteRotation(object: FabricObject, angle: unknown): void {
  if (angle === undefined) return;
  object.set("angle", finiteNumber(angle, "angle"));
  object.setCoords();
  refreshParentGroups(object);
}

function moveAnchorTo(
  object: FabricObject,
  objectAnchor: ConnectorBinding["fromAnchor"],
  destination: SemanticPointInput
): void {
  const current = anchorPoint(object.getBoundingRect(), objectAnchor);
  const delta = deltaInParentPlane(object, destination.x - current.x, destination.y - current.y);
  object.set({ left: (object.left ?? 0) + delta.x, top: (object.top ?? 0) + delta.y });
  object.setCoords();
  refreshParentGroups(object);
}

function semanticAnchor(value: unknown, field: string): ConnectorBinding["fromAnchor"] {
  if (!OBJECT_ANCHORS.includes(value as (typeof OBJECT_ANCHORS)[number])) {
    throw new SemanticAdapterError("INVALID_INPUT", `${field} must be a supported object anchor.`);
  }
  return value as ConnectorBinding["fromAnchor"];
}

function optionalOffset(value: unknown): SemanticPointInput {
  return value === undefined ? { x: 0, y: 0 } : point(value, "offset");
}

function assertIndependentPlacementObjects(objects: FabricObject[]): void {
  if (new Set(objects).size !== objects.length) {
    throw new SemanticAdapterError("INVALID_INPUT", "Placement objects must be distinct.");
  }
  for (const object of objects) {
    if (
      objects.some(
        (candidate) =>
          candidate !== object &&
          (isSceneDescendant(object, candidate) || isSceneDescendant(candidate, object))
      )
    ) {
      throw new SemanticAdapterError(
        "INVALID_SELECTION",
        "Placement objects cannot contain one another."
      );
    }
  }
}

function editableAssetParent(object: FabricObject | undefined): Group | null {
  for (let parent = object?.group; parent; parent = parent.group) {
    if (
      parent instanceof Group &&
      (parent.OpenSketchType === "nih-asset" ||
        parent.OpenSketchType === "import" ||
        parent.OpenSketchType === "upload")
    ) {
      return parent;
    }
  }
  return null;
}

const RESTORABLE_GROUP_PROPERTIES = [
  "name",
  "OpenSketchType",
  "assetId",
  "familyId",
  "provenance",
  "originalPalette",
  "originalFill",
  "originalStroke",
  "effectBaseFill",
  "effectBaseStroke",
  "originalGradientFill",
  "originalGradientStroke",
  "effectBaseGradientFill",
  "effectBaseGradientStroke",
  "connector",
  "freeConnectorBinding",
  "freeConnectorGeometry",
  "assetTint",
  "assetTintAmount",
  "assetSaturation",
  "assetBrightness",
  "assetColorPreset",
  "recognizedGroups",
  "semanticMetadata",
  "semanticRelations",
  "particleFieldSpec",
  "semanticConnector",
  "defaultElementStyle"
] as const;

function recognizedGroupRecord(group: Group, objects: FabricObject[]) {
  const properties = Object.fromEntries(
    RESTORABLE_GROUP_PROPERTIES.flatMap((property) => {
      const value = group[property];
      return value === undefined ? [] : [[property, value]];
    })
  );
  return {
    objectId: group.objectId!,
    memberObjectIds: objects.map((object) => object.objectId!).filter(Boolean),
    properties
  };
}

function restoreSelection(
  canvas: Canvas,
  objectIds: string[],
  setSelection: (objects: FabricObject[]) => void
) {
  const objects = objectIds
    .map((objectId) => sceneObjectIndex(canvas).get(objectId))
    .filter((object): object is FabricObject => Boolean(object));
  canvas.discardActiveObject();
  if (objects.length > 0) {
    canvas.setActiveObject(
      objects.length === 1 ? objects[0] : new ActiveSelection(objects, { canvas })
    );
  }
  setSelection(objects);
  canvas.requestRenderAll();
}

function startArrowheadFor(
  kind: (typeof CONNECTOR_KINDS)[number],
  explicit: unknown,
  fallback: ConnectorBinding["startArrowhead"]
): ConnectorBinding["startArrowhead"] {
  if (explicit !== undefined) return explicit as ConnectorBinding["startArrowhead"];
  if (kind === "line" || kind === "curved-line") return "none";
  if (kind === "double-arrow") return fallback === "none" ? "triangle" : fallback || "triangle";
  return fallback;
}

function restoreRecognizedGroup(
  group: Group,
  objects: FabricObject[],
  recognition: { objectId: string; memberObjectIds: string[]; properties: Record<string, unknown> }
): void {
  group.objectId = recognition.objectId;
  Object.entries(recognition.properties).forEach(([property, value]) => {
    (group as unknown as Record<string, unknown>)[property] = value;
  });
  consumeRecognizedGroup(objects, recognition);
}

function pointFromInput(input: Record<string, unknown>, key: string): SemanticPointInput {
  return point(input[key], key);
}

function locationFromInput(
  canvas: Canvas,
  settings: CanvasSettings,
  input: Record<string, unknown>
): SemanticPointInput | undefined {
  if (input.x === undefined && input.y === undefined) return undefined;
  const viewport = canvas.vptCoords;
  const centerX = viewport ? (viewport.tl.x + viewport.br.x) / 2 : settings.width / 2;
  const centerY = viewport ? (viewport.tl.y + viewport.br.y) / 2 : settings.height / 2;
  return {
    x: input.x === undefined ? centerX : finiteNumber(input.x, "x"),
    y: input.y === undefined ? centerY : finiteNumber(input.y, "y")
  };
}

function defaultConnectorPathShape(
  kind: (typeof CONNECTOR_KINDS)[number]
): ConnectorBinding["pathShape"] | undefined {
  return kind === "curved-arrow" || kind === "curved-line" ? "arc" : undefined;
}

function boundedText(value: unknown, maximum = 320): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function hashText(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function boundedRelationId(prefix: string, ...ids: string[]): string {
  const raw = `${prefix}-${ids.join("-")}`;
  if (raw.length <= 200) return raw;
  const digest = hashText(raw);
  const prefixBudget = 200 - digest.length - 1;
  const suffix = ids.map((id) => id.slice(0, 32)).join("-");
  return `${`${prefix}-${suffix}`.slice(0, prefixBudget)}-${digest}`;
}

function isEffectivelyVisible(path: readonly { visible?: boolean; opacity?: number }[]): boolean {
  return path.every((object) => object.visible !== false && (object.opacity ?? 1) > 0);
}

function assetSummary(family: AssetFamily) {
  return {
    familyId: family.familyId,
    title: boundedText(family.title, 200) ?? family.familyId,
    description: boundedText(family.description),
    category: boundedText(family.category, 100),
    keywords: family.keywords.filter((keyword) => typeof keyword === "string").slice(0, 32),
    author: boundedText(family.author, 200),
    credit: boundedText(family.credit),
    license: family.license,
    licenseUrl: boundedText(family.licenseUrl, 500),
    sourceName: boundedText(family.sourceName, 200),
    sourcePage: boundedText(family.sourcePage ?? family.commonsPage ?? family.nihSourcePage, 500),
    defaultVariantId: family.defaultVariantId,
    variants: family.variants.slice(0, 64).map((variant) => ({
      id: variant.id,
      label: boundedText(variant.label, 200) ?? variant.id,
      width: variant.width,
      height: variant.height
    }))
  };
}

export function createSemanticEditorAdapter(
  dependencies: SemanticEditorAdapterDependencies
): SemanticEditorAdapter {
  const transactionDirtyStack: boolean[] = [];
  const layoutPlans = new Map<string, SemanticLayoutPlan>();

  const commitSemantic = (label: string): void => {
    if (transactionDirtyStack.length > 0) {
      transactionDirtyStack[transactionDirtyStack.length - 1] = true;
      return;
    }
    dependencies.commit(label);
  };

  const canvasOrThrow = (): Canvas => {
    const canvas = dependencies.getCanvas();
    if (!canvas || !dependencies.isCanvasReady()) {
      throw new SemanticAdapterError("EDITOR_NOT_READY", "The OpenSketch canvas is not ready.");
    }
    return canvas;
  };

  const resolveObjects = (canvas: Canvas, ids: string[]): FabricObject[] => {
    const index = sceneObjectIndex(canvas);
    const objects = ids.map((id) => {
      const object = index.get(id);
      if (!object)
        throw new SemanticAdapterError("STALE_OBJECT_ID", `Scene object "${id}" does not exist.`);
      return object;
    });
    return objects;
  };

  const searchAssets = async ({
    query,
    category,
    limit
  }: {
    query: string;
    category?: string;
    limit: number;
  }) => {
    const matches = filterAssetFamilies(assetManifest.families, query, category ?? "All");
    return {
      results: matches.slice(0, limit).map(assetSummary),
      total: matches.length
    };
  };

  const inspectAsset = async ({
    familyId,
    variantId
  }: {
    familyId: string;
    variantId?: string;
  }) => {
    const family = assetManifest.families.find((candidate) => candidate.familyId === familyId);
    if (!family)
      throw new SemanticAdapterError(
        "STALE_ASSET_ID",
        `Asset family "${familyId}" does not exist.`
      );
    if (variantId && !family.variants.some((variant) => variant.id === variantId)) {
      throw new SemanticAdapterError(
        "INVALID_ASSET_VARIANT",
        `Asset variant "${variantId}" is not available in family "${familyId}".`
      );
    }
    return {
      family: {
        ...assetSummary(family),
        ...(variantId
          ? { selectedVariantId: variantId }
          : { selectedVariantId: family.defaultVariantId })
      }
    };
  };

  const inspectProvenance = () => {
    const canvas = dependencies.getCanvas();
    const manifest = canvas
      ? collectProvenanceManifest(canvas.getObjects())
      : { version: 1 as const, assets: [] };
    return {
      version: manifest.version,
      assets: manifest.assets.slice(0, 200).map((record) =>
        Object.fromEntries(
          Object.entries(record)
            .map(([key, value]) => [key, boundedText(value, 320)])
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
        )
      ),
      ...(manifest.assets.length > 200 ? { truncated: true } : {})
    };
  };

  const addObject = (
    canvas: Canvas,
    object: FabricObject,
    name: string,
    type: string,
    location?: SemanticPointInput,
    commitAfter = true,
    centerObject = true
  ): string => {
    object.objectId ??= crypto.randomUUID();
    object.name ??= name;
    object.OpenSketchType ??= type;
    visitSceneObjects(object, (current) => {
      current.objectId ??= crypto.randomUUID();
    });
    dependencies.prepareElementStyle(object);
    if (centerObject || location) {
      const settings = dependencies.getCanvasSettings();
      const viewport = canvas.vptCoords;
      const centerX = viewport ? (viewport.tl.x + viewport.br.x) / 2 : settings.width / 2;
      const centerY = viewport ? (viewport.tl.y + viewport.br.y) / 2 : settings.height / 2;
      object.set({
        left: location?.x ?? centerX,
        top: location?.y ?? centerY,
        originX: "center",
        originY: "center"
      });
    }
    object.setCoords();
    canvas.add(object);
    canvas.requestRenderAll();
    if (commitAfter) commitSemantic(`Semantic add ${name}`);
    return object.objectId!;
  };

  const portFor = (object: FabricObject, requested: unknown, outgoing: boolean): SemanticPort => {
    const geometry = inspectSemanticGeometry(object);
    const preferred = geometry.ports.find((port) => port.id === requested);
    if (requested !== undefined && !preferred) {
      throw new SemanticAdapterError(
        "INVALID_PORT",
        `Port "${String(requested)}" is not available on "${object.objectId}".`
      );
    }
    return (
      preferred ??
      geometry.ports.find((port) => port.kind === (outgoing ? "outgoing" : "incoming")) ??
      geometry.ports[0]!
    );
  };

  const anchorForPort = (port: SemanticPort): ConnectorBinding["fromAnchor"] => {
    if (Math.abs(port.normal.x) >= Math.abs(port.normal.y))
      return port.normal.x >= 0 ? "right" : "left";
    return port.normal.y >= 0 ? "bottom" : "top";
  };

  const createBoundConnector = async (
    input: Record<string, unknown>,
    commitAfter: boolean,
    allowLabelEndpoints = false
  ): Promise<{
    objectId: string;
    fromPortId: string;
    toPortId: string;
    routeType: string;
    fromObjectId: string;
    toObjectId: string;
  }> => {
    const canvas = canvasOrThrow();
    const fromObjectId = input.fromObjectId;
    const toObjectId = input.toObjectId;
    if (typeof fromObjectId !== "string" || typeof toObjectId !== "string") {
      throw new SemanticAdapterError(
        "INVALID_INPUT",
        "Both connector endpoint object IDs are required."
      );
    }
    const [fromObject, toObject] = resolveObjects(canvas, [fromObjectId, toObjectId]);
    if (fromObject === toObject)
      throw new SemanticAdapterError("INVALID_INPUT", "Connector endpoints must differ.");
    if (
      !allowLabelEndpoints &&
      (metadataOf(fromObject)?.semanticRole === "stage-label" ||
        metadataOf(toObject)?.semanticRole === "stage-label")
    ) {
      throw new SemanticAdapterError(
        "INVALID_ENDPOINT_SCOPE",
        "Logical connectors must target stage-content or scientific objects, not labels."
      );
    }
    const fromPort = portFor(fromObject, input.fromPortId, true);
    const toPort = portFor(toObject, input.toPortId, false);
    const routeType = (input.routeType ?? "straight") as
      "straight" | "orthogonal" | "bezier" | "outside" | "circular-arc" | "cycle-arc";
    const pathShape: ConnectorBinding["pathShape"] =
      routeType === "orthogonal" || routeType === "outside"
        ? "elbow"
        : routeType === "bezier"
          ? "arc"
          : routeType === "circular-arc" || routeType === "cycle-arc"
            ? "circular"
            : "straight";
    const defaults = dependencies.creationDefaults().line;
    const binding: ConnectorBinding = {
      fromObjectId,
      fromAnchor: anchorForPort(fromPort),
      toObjectId,
      toAnchor: anchorForPort(toPort),
      startArrowhead: "none",
      endArrowhead: (input.arrowhead ?? "triangle") as ConnectorBinding["endArrowhead"],
      lineStyle: "solid",
      routing: pathShape === "straight" ? "direct" : "orthogonal",
      pathShape,
      curvature: 0
    };
    const obstacles = canvas
      .getObjects()
      .filter(
        (object) =>
          object !== fromObject &&
          object !== toObject &&
          !object.connector &&
          object.visible !== false
      )
      .map((object) => object.getBoundingRect());
    const connector = createConnectorObject(
      fromPort.position,
      toPort.position,
      binding,
      { color: defaults.color, width: defaults.width, opacity: 1 },
      obstacles
    );
    const objectId = addObject(
      canvas,
      connector,
      "Bound connector",
      "connector",
      undefined,
      false,
      false
    );
    connector.semanticMetadata = {
      version: 1,
      semanticRole: allowLabelEndpoints ? "annotation-leader" : "main-flow-connector",
      semanticType: allowLabelEndpoints ? "annotation-leader" : "bound-connector"
    };
    connector.semanticConnector = {
      version: 1,
      fromPortId: fromPort.id,
      toPortId: toPort.id,
      routeType,
      clearance: typeof input.clearance === "number" ? input.clearance : 12,
      routeContext: {
        ...(input.center ? { center: point(input.center, "center") } : {}),
        ...(input.radius ? { radius: finiteNumber(input.radius, "radius") } : {}),
        ...(input.axes ? { axes: input.axes as { x: number; y: number } } : {}),
        ...(input.direction
          ? { direction: input.direction as "clockwise" | "counterclockwise" }
          : {})
      }
    };
    canvas.sendObjectToBack(connector);
    dependencies.refreshConnectors(objectId);
    canvas.requestRenderAll();
    if (commitAfter) commitSemantic("Semantic bound connector");
    return {
      objectId,
      fromPortId: fromPort.id,
      toPortId: toPort.id,
      routeType,
      fromObjectId,
      toObjectId
    };
  };

  const execute = async (
    command: string,
    input: Record<string, unknown>
  ): Promise<SemanticAdapterResult> => {
    const canvas = canvasOrThrow();
    if (command === "set_project_metadata") {
      const name = typeof input.name === "string" ? input.name.trim() : undefined;
      const description =
        typeof input.description === "string" ? input.description.trim() : undefined;
      if (name === undefined && description === undefined) {
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "set_project_metadata requires a name or description."
        );
      }
      if (name !== undefined) dependencies.setProjectName(name);
      if (description !== undefined) dependencies.setProjectDescription(description);
      return {
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {})
        },
        changedObjectIds: []
      };
    }
    if (command === "resize_canvas") {
      const width = finiteNumber(input.width, "width");
      const height = finiteNumber(input.height, "height");
      if (
        width <= 0 ||
        height <= 0 ||
        width > PORTABLE_PROJECT_LIMITS.maxCanvasDimension ||
        height > PORTABLE_PROJECT_LIMITS.maxCanvasDimension
      ) {
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          `Canvas dimensions must be between 1 and ${PORTABLE_PROJECT_LIMITS.maxCanvasDimension}.`
        );
      }
      if (width * height > PORTABLE_PROJECT_LIMITS.maxCanvasArea) {
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          `Canvas area must not exceed ${PORTABLE_PROJECT_LIMITS.maxCanvasArea}.`
        );
      }
      dependencies.setCanvasSettings({ width, height });
      return { data: { width, height }, changedObjectIds: [] };
    }
    if (command === "find_objects") {
      const entries = sceneObjectEntries(canvas);
      const query = typeof input.text === "string" ? input.text : undefined;
      const caseSensitive = input.caseSensitive === true;
      const matches = entries.filter(({ object, path }) => {
        const metadata = metadataOf(object);
        const text = object instanceof IText || object instanceof Textbox ? object.text : "";
        const haystack = caseSensitive ? text : text.toLocaleLowerCase();
        const needle = query ? (caseSensitive ? query : query.toLocaleLowerCase()) : undefined;
        return (
          (input.semanticRole === undefined || metadata?.semanticRole === input.semanticRole) &&
          (input.semanticType === undefined || metadata?.semanticType === input.semanticType) &&
          (input.stageId === undefined || metadata?.stageId === input.stageId) &&
          (input.stageIndex === undefined || metadata?.stageIndex === input.stageIndex) &&
          (input.tag === undefined || metadata?.tags?.includes(input.tag as string)) &&
          (input.objectType === undefined ||
            (object.OpenSketchType ?? object.type) === input.objectType) &&
          (input.assetFamilyId === undefined || object.familyId === input.assetFamilyId) &&
          (input.assetVariantId === undefined || object.assetId === input.assetVariantId) &&
          (!needle || haystack.includes(needle)) &&
          (input.ancestorObjectId === undefined ||
            path.some((item) => item.objectId === input.ancestorObjectId)) &&
          (input.relationId === undefined ||
            relationsForCanvas(canvas).some(
              (relation) =>
                relation.id === input.relationId &&
                (relation.sourceObjectId === object.objectId ||
                  relation.targetObjectId === object.objectId)
            ))
        );
      });
      const limit = typeof input.limit === "number" ? input.limit : 100;
      return {
        data: {
          objects: matches
            .slice(0, limit)
            .map(({ object, parent, path }) =>
              describeObject(object, parent instanceof Group ? parent.objectId : undefined, path)
            ),
          total: matches.length
        },
        changedObjectIds: []
      };
    }
    if (command === "inspect_geometry") {
      const ids = objectIds(input);
      const clearance =
        input.clearance === undefined ? 12 : finiteNumber(input.clearance, "clearance");
      const objects = resolveObjects(canvas, ids).map((object) => ({
        objectId: object.objectId!,
        geometry: inspectSemanticGeometry(object, clearance)
      }));
      return { data: { objects }, changedObjectIds: [] };
    }
    if (command === "list_object_ports") {
      const ids = objectIds(input);
      const kind = input.kind as string | undefined;
      const objects = resolveObjects(canvas, ids).map((object) => ({
        objectId: object.objectId!,
        ports: inspectSemanticGeometry(object).ports.filter((port) => !kind || port.kind === kind)
      }));
      return { data: { objects }, changedObjectIds: [] };
    }
    if (command === "inspect_relations") {
      const ids = input.objectIds === undefined ? [] : objectIds(input);
      const idSet = new Set(ids);
      const stageId = typeof input.stageId === "string" ? input.stageId : undefined;
      const relations = relationsForCanvas(canvas).filter((relation) => {
        if (
          idSet.size > 0 &&
          !idSet.has(relation.sourceObjectId) &&
          !idSet.has(relation.targetObjectId)
        )
          return false;
        if (!stageId) return true;
        const index = sceneObjectIndex(canvas);
        return (
          metadataOf(index.get(relation.sourceObjectId)!)?.stageId === stageId ||
          metadataOf(index.get(relation.targetObjectId)!)?.stageId === stageId
        );
      });
      const limit = typeof input.limit === "number" ? input.limit : 256;
      return {
        data: { relations: relations.slice(0, limit), truncated: relations.length > limit },
        changedObjectIds: []
      };
    }
    if (command === "set_object_semantics") {
      const objectId = input.objectId as string;
      const [object] = resolveObjects(canvas, [objectId]);
      const metadata = normalizeSemanticMetadata(input.metadata);
      const relations = Array.isArray(input.relations)
        ? input.relations.map(normalizeRelation)
        : (object.semanticRelations ?? []);
      const allIds = new Set(
        sceneObjectEntries(canvas)
          .map(({ object: item }) => item.objectId)
          .filter((id): id is string => Boolean(id))
      );
      validateRelations(relations, allIds);
      setMetadata(object, metadata);
      object.semanticRelations = relations;
      object.semanticMetadata = {
        ...metadata,
        ...(relations.length ? { relationIds: relations.map((relation) => relation.id) } : {})
      };
      object.setCoords();
      canvas.requestRenderAll();
      commitSemantic("Semantic object semantics");
      return {
        data: {
          objectId,
          metadata: object.semanticMetadata,
          relationIds: relations.map((relation) => relation.id)
        },
        changedObjectIds: [objectId]
      };
    }
    if (command === "compose_labeled_group") {
      const requestedStageId = typeof input.stageId === "string" ? input.stageId : undefined;
      if (requestedStageId) {
        const existingStage = sceneObjectEntries(canvas).find(
          ({ object }) =>
            metadataOf(object)?.semanticRole === "stage" &&
            metadataOf(object)?.stageId === requestedStageId
        )?.object;
        const existingLabelGroup = isGroup(existingStage)
          ? existingStage
              .getObjects()
              .find(
                (object) => isGroup(object) && metadataOf(object)?.semanticRole === "stage-label"
              )
          : undefined;
        const existingTexts = isGroup(existingLabelGroup)
          ? existingLabelGroup
              .getObjects()
              .filter((object): object is IText => object instanceof IText)
          : [];
        const textForRole = (role: string): IText | undefined =>
          existingTexts.find((object) => metadataOf(object)?.semanticRole === role);
        const labelText = textForRole("stage-label") ?? existingTexts[0];
        if (existingStage && existingLabelGroup && labelText) {
          const contentGroup = isGroup(existingStage)
            ? existingStage
                .getObjects()
                .find(
                  (object) =>
                    isGroup(object) && metadataOf(object)?.semanticRole === "stage-content"
                )
            : undefined;
          const contentBoundsBefore = contentGroup ? boundsOf(contentGroup) : undefined;
          const labelBoundsBefore = boundsOf(existingLabelGroup);
          const requestedIds = objectIds(input);
          if (
            requestedIds.some(
              (id) => !isSceneDescendant(resolveObjects(canvas, [id])[0], existingStage)
            )
          )
            throw new SemanticAdapterError(
              "INVALID_SELECTION",
              "Existing labeled-group updates must target descendants of that stage."
            );
          if (input.placement !== undefined)
            throw new SemanticAdapterError(
              "UNSUPPORTED_UPDATE",
              "Changing placement on an existing labeled group is not supported."
            );
          const updates: [string, unknown][] = [
            ["stage-label", input.label],
            ["stage-title", input.title],
            ["stage-subtitle", input.subtitle]
          ];
          const resolvedUpdates: Array<readonly [IText, string]> = [];
          updates.forEach(([role, value]) => {
            if (typeof value !== "string") return;
            const normalizedValue = boundedText(value, role === "stage-subtitle" ? 400 : 240);
            if (role === "stage-label" && !normalizedValue)
              throw new SemanticAdapterError("INVALID_INPUT", "label must not be empty.");
            if (!normalizedValue) return;
            const text = role === "stage-label" ? labelText : textForRole(role);
            if (!text)
              throw new SemanticAdapterError(
                "UNSUPPORTED_UPDATE",
                `Existing labeled group has no ${role} text slot.`
              );
            resolvedUpdates.push([text, normalizedValue]);
          });
          resolvedUpdates.forEach(([text, value]) => {
            text.set("text", value);
            if (text === labelText) existingStage.name = value;
          });
          refreshTextMetrics(resolvedUpdates.map(([text]) => text));
          const stack = [
            textForRole("stage-title"),
            labelText,
            textForRole("stage-subtitle")
          ].filter((object): object is IText => Boolean(object));
          const stackHeight =
            stack.reduce((total, object) => total + boundsOf(object).height, 0) +
            8 * Math.max(0, stack.length - 1);
          let stackTop = -stackHeight / 2;
          stack.forEach((object) => {
            const height = boundsOf(object).height;
            object.set({ left: 0, top: stackTop + height / 2 });
            stackTop += height + 8;
          });
          if (input.stageIndex !== undefined) {
            visitSceneObjects(existingStage, (object) => {
              const metadata = metadataOf(object);
              if (metadata)
                object.semanticMetadata = { ...metadata, stageIndex: input.stageIndex as number };
              else object.semanticMetadata = { version: 1, stageIndex: input.stageIndex as number };
            });
          }
          refreshTextMetrics([existingLabelGroup]);
          refreshParentGroups(existingLabelGroup);
          if (contentBoundsBefore) {
            const labelBounds = boundsOf(existingLabelGroup);
            const contentCenter = {
              x: contentBoundsBefore.left + contentBoundsBefore.width / 2,
              y: contentBoundsBefore.top + contentBoundsBefore.height / 2
            };
            const contentRight = contentBoundsBefore.left + contentBoundsBefore.width;
            const contentBottom = contentBoundsBefore.top + contentBoundsBefore.height;
            const desiredCenter =
              labelBoundsBefore.left + labelBoundsBefore.width <= contentBoundsBefore.left
                ? {
                    x: contentBoundsBefore.left - 24 - labelBounds.width / 2,
                    y: contentCenter.y
                  }
                : labelBoundsBefore.left >= contentRight
                  ? { x: contentRight + 24 + labelBounds.width / 2, y: contentCenter.y }
                  : labelBoundsBefore.top + labelBoundsBefore.height <= contentBoundsBefore.top
                    ? {
                        x: contentCenter.x,
                        y: contentBoundsBefore.top - 24 - labelBounds.height / 2
                      }
                    : { x: contentCenter.x, y: contentBottom + 24 + labelBounds.height / 2 };
            moveAnchorTo(existingLabelGroup, "center", desiredCenter);
          }
          const requestedLocation =
            input.x === undefined && input.y === undefined
              ? undefined
              : locationFromInput(canvas, dependencies.getCanvasSettings(), input);
          if (requestedLocation) moveAnchorTo(existingStage, "center", requestedLocation);
          existingStage.setCoords();
          dependencies.refreshConnectors();
          canvas.requestRenderAll();
          commitSemantic("Semantic update labeled group");
          const updatedObjectIds = [
            existingStage.objectId!,
            existingLabelGroup.objectId!,
            ...(isGroup(existingStage)
              ? existingStage
                  .getObjects()
                  .map((object) => object.objectId)
                  .filter((id): id is string => Boolean(id))
              : []),
            ...requestedIds
          ]
            .filter((id, index, ids) => ids.indexOf(id) === index)
            .slice(0, 200);
          return {
            data: {
              objectId: existingStage.objectId,
              contentObjectId: contentGroup?.objectId,
              labelObjectId: existingLabelGroup.objectId,
              objectIds: updatedObjectIds
            },
            changedObjectIds: updatedObjectIds
          };
        }
      }
      const ids = objectIds(input);
      const contentObjects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(contentObjects);
      if (contentObjects.some((object) => object.group))
        throw new SemanticAdapterError(
          "INVALID_SELECTION",
          "Labeled-group content must be top-level objects."
        );
      const label = boundedText(input.label, 240);
      if (!label) throw new SemanticAdapterError("INVALID_INPUT", "label must not be empty.");
      const bounds = unionBounds(contentObjects);
      const requestedPlacement = (input.placement ?? "outward") as LabelPlacement;
      const settings = dependencies.getCanvasSettings();
      const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      const canvasCenter = { x: settings.width / 2, y: settings.height / 2 };
      const placement: LabelPlacement =
        requestedPlacement === "outward"
          ? Math.abs(center.x - canvasCenter.x) >= Math.abs(center.y - canvasCenter.y)
            ? center.x < canvasCenter.x
              ? "left"
              : "right"
            : center.y < canvasCenter.y
              ? "top"
              : "bottom"
          : requestedPlacement;
      const labelX =
        placement === "left"
          ? bounds.left - 24
          : placement === "right"
            ? bounds.left + bounds.width + 24
            : center.x;
      const labelY =
        placement === "top"
          ? bounds.top - 28
          : placement === "bottom"
            ? bounds.top + bounds.height + 28
            : center.y;
      const defaults = dependencies.creationDefaults();
      const makeLabel = (text: string, size: number): IText => {
        const object = new IText(text, {
          fill: defaults.text.color,
          fontFamily: defaults.text.fontFamily,
          fontSize: size,
          fontWeight: defaults.text.fontWeight,
          left: labelX,
          top: labelY,
          originX: "center",
          originY: "center"
        });
        configureTextObject(object);
        return object;
      };
      const title =
        typeof input.title === "string" && input.title
          ? makeLabel(input.title, Math.max(18, defaults.text.fontSize))
          : undefined;
      const subtitle =
        typeof input.subtitle === "string" && input.subtitle
          ? makeLabel(input.subtitle, Math.max(14, defaults.text.fontSize - 4))
          : undefined;
      const labelObject = makeLabel(label, Math.max(16, defaults.text.fontSize));
      if (title) title.set({ top: labelY - 28 });
      if (subtitle) subtitle.set({ top: labelY + 28 });
      canvas.remove(...contentObjects);
      const contentGroup = new Group(contentObjects);
      contentGroup.objectId = crypto.randomUUID();
      contentGroup.name = "Stage content";
      contentGroup.OpenSketchType = "group";
      const stageId =
        typeof input.stageId === "string" && input.stageId ? input.stageId : contentGroup.objectId;
      labelObject.semanticMetadata = {
        version: 1,
        semanticRole: "stage-label",
        stageId,
        ...(input.stageIndex === undefined ? {} : { stageIndex: input.stageIndex as number })
      };
      if (title)
        title.semanticMetadata = {
          version: 1,
          semanticRole: "stage-title",
          stageId,
          ...(input.stageIndex === undefined ? {} : { stageIndex: input.stageIndex as number })
        };
      if (subtitle)
        subtitle.semanticMetadata = {
          version: 1,
          semanticRole: "stage-subtitle",
          stageId,
          ...(input.stageIndex === undefined ? {} : { stageIndex: input.stageIndex as number })
        };
      contentGroup.semanticMetadata = {
        version: 1,
        semanticRole: "stage-content",
        stageId,
        ...(input.stageIndex === undefined ? {} : { stageIndex: input.stageIndex as number })
      };
      visitSceneObjects(contentGroup, (object) => {
        const metadata = metadataOf(object) ?? { version: 1 as const };
        object.semanticMetadata = {
          ...metadata,
          stageId,
          ...(input.stageIndex === undefined ? {} : { stageIndex: input.stageIndex as number })
        };
      });
      const labelChildren = [
        labelObject,
        ...(title ? [title] : []),
        ...(subtitle ? [subtitle] : [])
      ];
      const renderedLabelWidth = Math.max(...labelChildren.map((object) => boundsOf(object).width));
      const horizontalLabelX =
        placement === "left"
          ? bounds.left - 24 - renderedLabelWidth / 2
          : placement === "right"
            ? bounds.left + bounds.width + 24 + renderedLabelWidth / 2
            : center.x;
      labelChildren.forEach((object) => object.set("left", horizontalLabelX));
      if (
        placement === "top" ||
        placement === "bottom" ||
        placement === "left" ||
        placement === "right"
      ) {
        const stack = [title, labelObject, subtitle].filter((object): object is IText =>
          Boolean(object)
        );
        const stackGap = 8;
        const stackHeight =
          stack.reduce((total, object) => total + boundsOf(object).height, 0) +
          stackGap * Math.max(0, stack.length - 1);
        const stackTop =
          placement === "bottom"
            ? bounds.top + bounds.height + 24
            : placement === "top"
              ? bounds.top - 24 - stackHeight
              : center.y - stackHeight / 2;
        let cursor = stackTop;
        stack.forEach((object) => {
          const height = boundsOf(object).height;
          object.set({ top: cursor + height / 2 });
          cursor += height + stackGap;
        });
      }
      labelChildren.forEach((object) => {
        object.objectId ??= crypto.randomUUID();
      });
      const labelGroup = new Group(labelChildren);
      labelGroup.objectId = crypto.randomUUID();
      labelGroup.name = "Stage label";
      labelGroup.OpenSketchType = "group";
      labelGroup.semanticMetadata = {
        version: 1,
        semanticRole: "stage-label",
        stageId,
        ...(input.stageIndex === undefined ? {} : { stageIndex: input.stageIndex as number })
      };
      const stageGroup = new Group([contentGroup, labelGroup]);
      stageGroup.objectId = crypto.randomUUID();
      stageGroup.name = label;
      stageGroup.OpenSketchType = "group";
      stageGroup.semanticMetadata = {
        version: 1,
        semanticRole: "stage",
        stageId,
        ...(input.stageIndex === undefined ? {} : { stageIndex: input.stageIndex as number })
      };
      dependencies.configureCanvasAssets([stageGroup]);
      const requestedLocation =
        input.x === undefined && input.y === undefined
          ? undefined
          : locationFromInput(canvas, settings, input);
      if (requestedLocation) moveAnchorTo(stageGroup, "center", requestedLocation);
      canvas.add(stageGroup);
      stageGroup.setCoords();
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic compose labeled group");
      return {
        data: {
          objectId: stageGroup.objectId,
          contentObjectId: contentGroup.objectId,
          labelObjectId: labelGroup.objectId,
          objectIds: [stageGroup.objectId, contentGroup.objectId, labelGroup.objectId]
        },
        changedObjectIds: [stageGroup.objectId, contentGroup.objectId, labelGroup.objectId, ...ids]
      };
    }
    if (command === "compose_interaction") {
      const sourceObjectId = input.sourceObjectId as string;
      const targetObjectId = input.targetObjectId as string;
      const [source, target] = resolveObjects(canvas, [sourceObjectId, targetObjectId]);
      if (source === target)
        throw new SemanticAdapterError("INVALID_INPUT", "Interaction endpoints must differ.");
      const mediatorObjectId =
        typeof input.mediatorObjectId === "string" ? input.mediatorObjectId : undefined;
      const mediatorObject = mediatorObjectId
        ? resolveObjects(canvas, [mediatorObjectId])[0]
        : undefined;
      assertIndependentPlacementObjects([
        source,
        target,
        ...(mediatorObject ? [mediatorObject] : [])
      ]);
      const sourceBounds = inspectSemanticGeometry(source).visualBounds;
      const targetBounds = inspectSemanticGeometry(target).visualBounds;
      if (
        input.mode === "engulfment" &&
        (targetBounds.width > sourceBounds.width || targetBounds.height > sourceBounds.height)
      )
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "Engulfment target must fit within the source bounds."
        );
      const plan = planInteraction(
        sourceBounds,
        targetBounds,
        input.mode as InteractionMode,
        input.offset === undefined ? undefined : finiteNumber(input.offset, "offset")
      );
      const relation = normalizeRelation({
        id:
          typeof input.relationId === "string"
            ? input.relationId
            : boundedRelationId("interaction", sourceObjectId, targetObjectId),
        kind: plan.relationKind,
        sourceObjectId,
        targetObjectId,
        ...(mediatorObjectId ? { mediatorObjectIds: [mediatorObjectId] } : {}),
        direction: "forward",
        allowedOverlap: plan.allowedOverlap
      });
      const conflictingRelation = sceneObjectEntries(canvas)
        .flatMap(({ object }) => object.semanticRelations ?? [])
        .map((existing) => {
          try {
            return normalizeRelation(existing);
          } catch {
            return undefined;
          }
        })
        .filter((existing): existing is typeof relation => Boolean(existing))
        .find(
          (existing) =>
            existing.id === relation.id && JSON.stringify(existing) !== JSON.stringify(relation)
        );
      if (conflictingRelation)
        throw new SemanticAdapterError(
          "DUPLICATE_RELATION_ID",
          `Relation ID "${relation.id}" is already used by another relation.`
        );
      const sourceMetadata = metadataOf(source) ?? { version: 1 as const };
      const relationIds = sourceMetadata.relationIds ?? [];
      if (!relationIds.includes(relation.id) && relationIds.length >= 32)
        throw new SemanticAdapterError(
          "SEMANTIC_LIMIT",
          `Object "${sourceObjectId}" cannot reference more than 32 relations.`
        );
      moveAnchorTo(source, "center", plan.source);
      moveAnchorTo(target, "center", plan.target);
      const mediatorPosition = plan.mediator ?? {
        x: (plan.source.x + plan.target.x) / 2,
        y: (plan.source.y + plan.target.y) / 2
      };
      if (mediatorObject) moveAnchorTo(mediatorObject, "center", mediatorPosition);
      source.semanticMetadata = {
        ...sourceMetadata,
        relationIds: [...new Set([...(sourceMetadata.relationIds ?? []), relation.id])]
      };
      source.semanticRelations = [
        ...(source.semanticRelations ?? []).filter((item) => item.id !== relation.id),
        relation
      ];
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic compose interaction");
      return {
        data: {
          relation,
          source: plan.source,
          target: plan.target,
          ...(mediatorObject ? { mediator: mediatorPosition } : {}),
          warnings: plan.warnings
        },
        changedObjectIds: [
          sourceObjectId,
          targetObjectId,
          ...(mediatorObjectId ? [mediatorObjectId] : [])
        ]
      };
    }
    if (command === "create_particle_field") {
      const seed = input.seed as string;
      const rawBounds = input.bounds as Record<string, unknown>;
      const fieldBounds = {
        left: finiteNumber(rawBounds.left, "bounds.left"),
        top: finiteNumber(rawBounds.top, "bounds.top"),
        width: finiteNumber(rawBounds.width, "bounds.width"),
        height: finiteNumber(rawBounds.height, "bounds.height")
      };
      if (fieldBounds.width <= 0 || fieldBounds.height <= 0)
        throw new SemanticAdapterError("INVALID_INPUT", "Particle bounds must be positive.");
      const particleCount = finiteNumber(input.count, "count");
      const distribution = input.distribution as ParticleDistribution;
      const particleRole = typeof input.role === "string" ? input.role : "particle-field";
      const requestedSemanticType = boundedText(input.semanticType, 120);
      const particleSemanticType = requestedSemanticType ?? "particle";
      const fieldSemanticType = requestedSemanticType ?? "particle-field";
      const sourceObjectId =
        typeof input.sourceObjectId === "string" ? input.sourceObjectId : undefined;
      const targetObjectId =
        typeof input.targetObjectId === "string" ? input.targetObjectId : undefined;
      if (distribution === "source-fan" && !sourceObjectId)
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "source-fan distribution requires sourceObjectId."
        );
      if (distribution === "target-converging" && !targetObjectId)
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "target-converging distribution requires targetObjectId."
        );
      const sourceObject = sourceObjectId ? resolveObjects(canvas, [sourceObjectId])[0] : undefined;
      const targetObject = targetObjectId ? resolveObjects(canvas, [targetObjectId])[0] : undefined;
      const source = sourceObject ? inspectSemanticGeometry(sourceObject).center : undefined;
      const target = targetObject ? inspectSemanticGeometry(targetObject).center : undefined;
      const defaults = dependencies.creationDefaults();
      const particleStrokeWidth = Math.max(1, defaults.shape.strokeWidth * 0.5);
      const particleInset = 4 + particleStrokeWidth / 2;
      if (fieldBounds.width < particleInset * 2 || fieldBounds.height < particleInset * 2)
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "Particle bounds must contain the rendered particle diameter."
        );
      const plan = planParticleField(
        fieldBounds,
        particleCount,
        distribution,
        seed,
        source,
        target,
        particleInset
      );
      const expectedRelations = (fieldObjectId: string) => [
        ...(sourceObjectId
          ? [
              normalizeRelation({
                id: boundedRelationId("particle-field-emits", sourceObjectId, fieldObjectId),
                kind: "emits",
                sourceObjectId,
                targetObjectId: fieldObjectId,
                direction: "forward",
                allowedOverlap: distribution === "source-fan"
              })
            ]
          : []),
        ...(targetObjectId
          ? [
              normalizeRelation({
                id: boundedRelationId("particle-field-target", fieldObjectId, targetObjectId),
                kind: "follows_gradient",
                sourceObjectId: fieldObjectId,
                targetObjectId,
                direction: "forward",
                allowedOverlap: distribution === "target-converging"
              })
            ]
          : [])
      ];
      const createParticle = (
        fieldObjectId: string,
        position: { x: number; y: number },
        index: number
      ) => {
        const particle = new Circle({
          radius: 4,
          left: position.x,
          top: position.y,
          originX: "center",
          originY: "center",
          fill: defaults.shape.fill,
          stroke: defaults.shape.stroke,
          strokeWidth: particleStrokeWidth
        });
        particle.objectId = `${fieldObjectId}-particle-${index}`;
        particle.name = "Particle";
        particle.OpenSketchType = "particle";
        particle.semanticMetadata = {
          version: 1,
          semanticRole: particleRole === "decorative" ? "decorative" : "particle-field",
          semanticType: particleSemanticType
        };
        return particle;
      };
      const particleFieldSpec = {
        seed,
        count: Math.floor(particleCount),
        distribution,
        bounds: fieldBounds,
        ...(sourceObjectId ? { sourceObjectId } : {}),
        ...(targetObjectId ? { targetObjectId } : {}),
        semanticType: requestedSemanticType ?? null,
        role: particleRole
      };
      const existingFieldEntry = sceneObjectEntries(canvas).find(
        ({ object }) =>
          isGroup(object) &&
          metadataOf(object)?.semanticRole === "particle-field" &&
          metadataOf(object)?.semanticName === `particle-field:${seed}` &&
          JSON.stringify(object.particleFieldSpec) === JSON.stringify(particleFieldSpec)
      );
      const existingField = existingFieldEntry?.object;
      if (isGroup(existingField)) {
        const particles = existingField.getObjects();
        const matchesPlan =
          particles.length === plan.points.length &&
          particles.every((particle, index) => {
            const actual = inspectSemanticGeometry(particle).center;
            const expected = plan.points[index];
            const actualBounds = inspectSemanticGeometry(particle).visualBounds;
            const expectedDiameter = particleInset * 2;
            return (
              Math.abs(actual.x - expected.x) <= 0.5 &&
              Math.abs(actual.y - expected.y) <= 0.5 &&
              Math.abs(actualBounds.width - expectedDiameter) <= 0.5 &&
              Math.abs(actualBounds.height - expectedDiameter) <= 0.5 &&
              particle.scaleX === 1 &&
              particle.scaleY === 1 &&
              particle.angle === 0
            );
          });
        const relations = expectedRelations(existingField.objectId!);
        const matchesRelations = relations.every((expected) =>
          (existingField.semanticRelations ?? []).some((actual) => {
            try {
              return JSON.stringify(normalizeRelation(actual)) === JSON.stringify(expected);
            } catch {
              return false;
            }
          })
        );
        if (matchesPlan && matchesRelations) {
          const particleIds = particles
            .map((object) => object.objectId)
            .filter((id): id is string => Boolean(id));
          return {
            data: {
              objectId: existingField.objectId,
              particleIds,
              seed,
              distribution: plan.distribution,
              points: plan.points,
              reused: true
            },
            changedObjectIds: []
          };
        }
        if (matchesPlan) {
          const restoredRelations = [
            ...(existingField.semanticRelations ?? []).filter(
              (actual) => !relations.some((expected) => expected.id === actual.id)
            ),
            ...relations
          ];
          existingField.semanticRelations = restoredRelations;
          const metadata = metadataOf(existingField) ?? { version: 1 as const };
          existingField.semanticMetadata = {
            ...metadata,
            relationIds: restoredRelations.map((relation) => relation.id)
          };
          canvas.requestRenderAll();
          commitSemantic("Semantic restore particle field relations");
          return {
            data: {
              objectId: existingField.objectId,
              particleIds: particles
                .map((object) => object.objectId)
                .filter((id): id is string => Boolean(id)),
              seed,
              distribution: plan.distribution,
              points: plan.points,
              reused: true
            },
            changedObjectIds: [existingField.objectId!]
          };
        }
        const expectedParticleIds = new Set(
          plan.points.map((_, index) => `${existingField.objectId!}-particle-${index}`)
        );
        const existingById = new Map(
          particles
            .filter((particle): particle is typeof particle & { objectId: string } =>
              Boolean(particle.objectId)
            )
            .map((particle) => [particle.objectId, particle])
        );
        const removedParticleIds = particles
          .map((particle) => particle.objectId)
          .filter((id): id is string => {
            if (!id) return false;
            return !expectedParticleIds.has(id);
          });
        const removedIdSet = new Set(removedParticleIds);
        const changedReferenceIds = new Set<string>(removedParticleIds);
        sceneObjectEntries(canvas)
          .filter(({ object }) => connectorsForRemovedIds([object], removedIdSet).length > 0)
          .forEach((entry) => {
            if (entry.object.objectId) changedReferenceIds.add(entry.object.objectId);
            removeSceneObject(entry);
          });
        sceneObjectEntries(canvas).forEach(({ object }) => {
          const relations = object.semanticRelations ?? [];
          const retainedRelations = relations.filter(
            (relation) =>
              ![
                relation.sourceObjectId,
                relation.targetObjectId,
                ...(relation.mediatorObjectIds ?? [])
              ].some((id) => removedIdSet.has(id))
          );
          if (retainedRelations.length !== relations.length) {
            if (object.objectId) changedReferenceIds.add(object.objectId);
            object.semanticRelations = retainedRelations;
            const objectMetadata = metadataOf(object);
            if (objectMetadata)
              object.semanticMetadata = {
                ...objectMetadata,
                relationIds: retainedRelations.map((relation) => relation.id)
              };
          }
        });
        existingField.set({ scaleX: 1, scaleY: 1, angle: 0 });
        particles.forEach((particle) => existingField.remove(particle));
        const repairedParticles = plan.points.map((position, index) => {
          const objectId = `${existingField.objectId!}-particle-${index}`;
          const particle =
            existingById.get(objectId) ?? createParticle(existingField.objectId!, position, index);
          particle.set({ scaleX: 1, scaleY: 1, angle: 0 });
          existingField.insertAt(index, particle);
          moveAnchorTo(particle, "center", position);
          return particle;
        });
        const repairedRelations = expectedRelations(existingField.objectId!);
        const restoredRelations = [
          ...(existingField.semanticRelations ?? []).filter(
            (actual) => !repairedRelations.some((expected) => expected.id === actual.id)
          ),
          ...repairedRelations
        ];
        existingField.semanticRelations = restoredRelations;
        const metadata = metadataOf(existingField) ?? { version: 1 as const };
        existingField.semanticMetadata = {
          ...metadata,
          relationIds: restoredRelations.map((relation) => relation.id)
        };
        existingField.setCoords();
        dependencies.refreshConnectors();
        canvas.requestRenderAll();
        commitSemantic("Semantic repair particle field");
        return {
          data: {
            objectId: existingField.objectId,
            particleIds: repairedParticles.map((particle) => particle.objectId!),
            seed,
            distribution: plan.distribution,
            points: plan.points,
            reused: true
          },
          changedObjectIds: [
            existingField.objectId!,
            ...repairedParticles.map((particle) => particle.objectId!),
            ...changedReferenceIds
          ]
        };
      }
      const fieldObjectId = crypto.randomUUID();
      const particles = plan.points.map((position, index) => {
        return createParticle(fieldObjectId, position, index);
      });
      const field = new Group(particles);
      field.objectId = fieldObjectId;
      field.name = "Particle field";
      field.OpenSketchType = "group";
      field.semanticMetadata = {
        version: 1,
        semanticRole: "particle-field",
        semanticType: fieldSemanticType,
        semanticName: `particle-field:${seed}`
      };
      field.particleFieldSpec = particleFieldSpec;
      const fieldRelations = expectedRelations(field.objectId!);
      if (fieldRelations.length > 0) {
        field.semanticRelations = fieldRelations;
        field.semanticMetadata = {
          ...field.semanticMetadata,
          relationIds: fieldRelations.map((relation) => relation.id)
        };
      }
      const existingIds = new Set(
        sceneObjectEntries(canvas)
          .map(({ object }) => object.objectId)
          .filter((id): id is string => Boolean(id))
      );
      const duplicateParticle = particles.find(
        (particle) => particle.objectId !== undefined && existingIds.has(particle.objectId)
      );
      if (duplicateParticle)
        throw new SemanticAdapterError(
          "DUPLICATE_OBJECT_ID",
          `Particle ID "${duplicateParticle.objectId}" already exists.`
        );
      dependencies.configureCanvasAssets([field]);
      canvas.add(field);
      field.setCoords();
      canvas.requestRenderAll();
      commitSemantic("Semantic create particle field");
      return {
        data: {
          objectId: field.objectId,
          particleIds: particles.map((particle) => particle.objectId!),
          seed: plan.seed,
          distribution: plan.distribution,
          points: plan.points,
          reused: false
        },
        changedObjectIds: [field.objectId, ...particles.map((particle) => particle.objectId!)]
      };
    }
    if (command === "create_annotation") {
      const targetObjectId = input.targetObjectId as string;
      const [target] = resolveObjects(canvas, [targetObjectId]);
      const defaults = dependencies.creationDefaults();
      const annotationText = boundedText(input.text, 800);
      if (!annotationText)
        throw new SemanticAdapterError("INVALID_INPUT", "text must not be empty.");
      const explicitFontSize = typeof input.fontSize === "number" ? input.fontSize : undefined;
      const annotation = new Textbox(annotationText, {
        width: 260,
        fontFamily: defaults.text.fontFamily,
        fontSize: explicitFontSize ?? defaults.text.fontSize,
        fill: defaults.text.color,
        originX: "center",
        originY: "center"
      });
      configureTextObject(annotation);
      dependencies.prepareElementStyle(annotation);
      if (explicitFontSize !== undefined) annotation.set("fontSize", explicitFontSize);
      refreshTextMetrics([annotation]);
      const candidates = annotationCandidates(
        inspectSemanticGeometry(target).visualBounds,
        boundsOf(annotation),
        typeof input.gap === "number" ? input.gap : 24
      );
      const preferred =
        typeof input.placement === "string"
          ? ({ top: 0, right: 2, bottom: 3, left: 1 }[input.placement] ?? 0)
          : 0;
      const targetPath = sceneObjectEntries(canvas).find(({ object }) => object === target)
        ?.path ?? [target];
      const sceneObjects = sceneObjectEntries(canvas)
        .filter(
          ({ object, path }) =>
            !isGroup(object) &&
            !object.connector &&
            isEffectivelyVisible(path) &&
            !path.includes(target) &&
            !targetPath.includes(object)
        )
        .map(({ object }) => object);
      const settings = dependencies.getCanvasSettings();
      const orderedCandidates = [...candidates.slice(preferred), ...candidates.slice(0, preferred)];
      const position = orderedCandidates.find((candidate) => {
        const candidateBounds = {
          left: candidate.position.x - boundsOf(annotation).width / 2,
          top: candidate.position.y - boundsOf(annotation).height / 2,
          width: boundsOf(annotation).width,
          height: boundsOf(annotation).height
        };
        const insideCanvas =
          candidateBounds.left >= 0 &&
          candidateBounds.top >= 0 &&
          candidateBounds.left + candidateBounds.width <= settings.width &&
          candidateBounds.top + candidateBounds.height <= settings.height;
        return (
          insideCanvas &&
          !sceneObjects.some(
            (object) =>
              candidateBounds.left < boundsOf(object).left + boundsOf(object).width &&
              candidateBounds.left + candidateBounds.width > boundsOf(object).left &&
              candidateBounds.top < boundsOf(object).top + boundsOf(object).height &&
              candidateBounds.top + candidateBounds.height > boundsOf(object).top
          )
        );
      });
      if (!position)
        throw new SemanticAdapterError(
          "NO_FEASIBLE_PLACEMENT",
          "No annotation candidate avoids existing visible geometry."
        );
      annotation.objectId = crypto.randomUUID();
      const relation = normalizeRelation({
        id: boundedRelationId("label", targetObjectId, annotation.objectId),
        kind: "labels",
        sourceObjectId: targetObjectId,
        targetObjectId: annotation.objectId
      });
      const targetMetadata = metadataOf(target) ?? { version: 1 as const };
      const targetRelationIds = targetMetadata.relationIds ?? [];
      const conflictingRelation = relationsForCanvas(canvas).find(
        (existing) => existing.id === relation.id
      );
      if (conflictingRelation)
        throw new SemanticAdapterError(
          "DUPLICATE_RELATION_ID",
          `Relation ID "${relation.id}" is already used by another relation.`
        );
      if (!targetRelationIds.includes(relation.id) && targetRelationIds.length >= 32)
        throw new SemanticAdapterError(
          "SEMANTIC_LIMIT",
          `Object "${targetObjectId}" cannot reference more than 32 relations.`
        );
      const existingObjects = new Set(sceneObjectEntries(canvas).map(({ object }) => object));
      const annotationId = addObject(
        canvas,
        annotation,
        "Annotation",
        "text",
        position.position,
        false
      );
      if (explicitFontSize !== undefined) {
        annotation.set("fontSize", explicitFontSize);
        refreshTextMetrics([annotation]);
      }
      annotation.semanticMetadata = {
        version: 1,
        semanticRole: "annotation",
        semanticType: "annotation"
      };
      let leaderObjectId: string | undefined;
      try {
        if (input.leader !== false) {
          const leader = await createBoundConnector(
            {
              fromObjectId: targetObjectId,
              toObjectId: annotationId,
              arrowhead: "none",
              routeType: "straight"
            },
            false,
            true
          );
          leaderObjectId = leader.objectId;
          const [leaderObject] = resolveObjects(canvas, [leaderObjectId]);
          leaderObject.semanticMetadata = {
            version: 1,
            semanticRole: "annotation-leader",
            semanticType: "annotation-leader"
          };
        }
      } catch (error) {
        for (const entry of sceneObjectEntries(canvas).reverse()) {
          if (!existingObjects.has(entry.object)) removeSceneObject(entry);
        }
        throw error;
      }
      target.semanticRelations = [...(target.semanticRelations ?? []), relation];
      target.semanticMetadata = {
        ...targetMetadata,
        relationIds: [...new Set([...targetRelationIds, relation.id])]
      };
      canvas.requestRenderAll();
      commitSemantic("Semantic create annotation");
      return {
        data: {
          objectId: annotationId,
          ...(leaderObjectId ? { leaderObjectId } : {}),
          targetObjectId,
          position: position.position
        },
        changedObjectIds: [
          annotationId,
          targetObjectId,
          ...(leaderObjectId ? [leaderObjectId] : [])
        ]
      };
    }
    if (command === "fit_text") {
      const objectId = input.objectId as string;
      const [object] = resolveObjects(canvas, [objectId]);
      if (!(object instanceof IText) && !(object instanceof Textbox))
        throw new SemanticAdapterError(
          "INVALID_SELECTION",
          `Scene object "${objectId}" is not editable text.`
        );
      const minFontSize = typeof input.minFontSize === "number" ? input.minFontSize : 6;
      const maxFontSize = typeof input.maxFontSize === "number" ? input.maxFontSize : 96;
      if (minFontSize > maxFontSize)
        throw new SemanticAdapterError("INVALID_INPUT", "minFontSize must not exceed maxFontSize.");
      const originalFontSize = object.fontSize;
      const originalWidth = object.width;
      const maxWidth = finiteNumber(input.maxWidth, "maxWidth");
      const maxHeight = finiteNumber(input.maxHeight, "maxHeight");
      const maxLines = typeof input.maxLines === "number" ? input.maxLines : 64;
      const integerFontSizes = [];
      for (let size = Math.floor(maxFontSize); size >= Math.ceil(minFontSize); size -= 1)
        integerFontSizes.push(size);
      const fontSizes = [...new Set([maxFontSize, minFontSize, ...integerFontSizes])]
        .filter((size) => size >= minFontSize && size <= maxFontSize)
        .sort((left, right) => right - left);
      const widthCandidates =
        object instanceof Textbox
          ? [
              ...new Set([
                Math.min(
                  originalWidth,
                  maxWidth / Math.max(Math.abs(object.scaleX ?? 1), 0.000001)
                ),
                maxWidth / Math.max(Math.abs(object.scaleX ?? 1), 0.000001)
              ])
            ]
          : [undefined];
      let fitted = false;
      for (const size of fontSizes) {
        for (const width of widthCandidates) {
          object.set("fontSize", size);
          if (width !== undefined) object.set("width", width);
          refreshTextMetrics([object]);
          const lines = object.textLines.length;
          const renderedBounds = object.getBoundingRect();
          if (
            renderedBounds.width <= maxWidth + 0.01 &&
            renderedBounds.height <= maxHeight + 0.01 &&
            lines <= maxLines
          ) {
            fitted = true;
            break;
          }
        }
        if (fitted) break;
      }
      if (!fitted) {
        object.set({ fontSize: originalFontSize, width: originalWidth });
        refreshTextMetrics([object]);
        const renderedBounds = object.getBoundingRect();
        return {
          data: {
            objectId,
            fitted: false,
            fontSize: originalFontSize,
            width: renderedBounds.width,
            height: renderedBounds.height,
            lines: object.textLines.length
          },
          changedObjectIds: []
        };
      }
      const renderedBounds = object.getBoundingRect();
      if (originalFontSize === object.fontSize && originalWidth === object.width)
        return {
          data: {
            objectId,
            fitted: true,
            fontSize: object.fontSize,
            width: renderedBounds.width,
            height: renderedBounds.height,
            lines: object.textLines.length
          },
          changedObjectIds: []
        };
      object.setCoords();
      refreshParentGroups(object);
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic fit text");
      return {
        data: {
          objectId,
          fitted: true,
          fontSize: object.fontSize,
          width: renderedBounds.width,
          height: renderedBounds.height,
          lines: object.textLines.length
        },
        changedObjectIds: [objectId]
      };
    }
    if (command === "normalize_styles") {
      const hasRequestedIds = input.objectIds !== undefined;
      const requestedIds = hasRequestedIds ? objectIds(input) : [];
      const roles = Array.isArray(input.roles) ? new Set(input.roles as string[]) : undefined;
      const presetId = typeof input.presetId === "string" ? input.presetId : undefined;
      if (presetId && !stylePreset(presetId))
        throw new SemanticAdapterError("INVALID_INPUT", `Unknown style preset "${presetId}".`);
      const sceneEntries = sceneObjectEntries(canvas);
      const targets = hasRequestedIds
        ? resolveObjects(canvas, requestedIds)
        : sceneEntries
            .map(({ object }) => object)
            .filter((object) => !roles || roles.has(metadataOf(object)?.semanticRole ?? ""));
      const protectedAssetObjectIds = new Set(
        sceneObjectEntries(canvas)
          .filter(({ path }) => path.some((object) => Boolean(object.familyId)))
          .map(({ object }) => object.objectId)
          .filter((id): id is string => Boolean(id))
      );
      const skipped: string[] = [];
      const changed = new Set<string>();
      const visitedObjectIds = new Set<string>();
      const applyPreset = (
        object: FabricObject,
        fallbackPreset?: ReturnType<typeof stylePreset>
      ): void => {
        if (
          input.includeAssets !== true &&
          (Boolean(object.familyId) || protectedAssetObjectIds.has(object.objectId ?? ""))
        ) {
          if (object.objectId) skipped.push(object.objectId);
          return;
        }
        const role = presetId ?? metadataOf(object)?.semanticRole;
        const preset = (role ? stylePreset(role) : undefined) ?? fallbackPreset;
        if (!preset) {
          if (object.objectId) skipped.push(object.objectId);
          return;
        }
        const isText = object instanceof IText || object instanceof Textbox;
        const nextFill = isText ? (preset.textFill ?? SEMANTIC_TEXT_COLOR) : preset.fill;
        const nextStroke = isText ? null : preset.stroke;
        const nextStrokeWidth = isText ? 0 : preset.strokeWidth;
        const nextFontSize = isText ? preset.fontSize : undefined;
        const nextFontWeight = isText ? preset.fontWeight : undefined;
        const styleChanged =
          object.fill !== nextFill ||
          object.stroke !== nextStroke ||
          object.strokeWidth !== nextStrokeWidth ||
          (isText && (object.fontSize !== nextFontSize || object.fontWeight !== nextFontWeight));
        if (!styleChanged) return;
        object.set({
          fill: nextFill,
          stroke: nextStroke,
          strokeWidth: nextStrokeWidth,
          ...(isText ? { fontSize: nextFontSize, fontWeight: nextFontWeight } : {})
        });
        object.setCoords();
        if (object instanceof IText || object instanceof Textbox) {
          refreshTextMetrics([object]);
          refreshParentGroups(object);
        }
        if (object.objectId) changed.add(object.objectId);
      };
      const visitStyleObjects = (
        root: FabricObject,
        fallbackPreset?: ReturnType<typeof stylePreset>
      ): void => {
        const walk = (
          object: FabricObject,
          inheritedPreset?: ReturnType<typeof stylePreset>
        ): void => {
          if (object.objectId) {
            if (visitedObjectIds.has(object.objectId)) return;
            visitedObjectIds.add(object.objectId);
          }
          const protectedAsset = object.familyId && input.includeAssets !== true;
          applyPreset(object, inheritedPreset);
          const nextPreset = stylePreset(metadataOf(object)?.semanticRole ?? "") ?? inheritedPreset;
          if (isGroup(object) && !protectedAsset)
            object.getObjects().forEach((child) => walk(child, nextPreset));
        };
        walk(root, fallbackPreset);
      };
      targets.forEach((object) => {
        const entry = sceneEntries.find((candidate) => candidate.object === object);
        const inheritedPreset = presetId
          ? stylePreset(presetId)
          : [...(entry?.path ?? [object])]
              .reverse()
              .map((candidate) => stylePreset(metadataOf(candidate)?.semanticRole ?? ""))
              .find((preset): preset is NonNullable<ReturnType<typeof stylePreset>> =>
                Boolean(preset)
              );
        visitStyleObjects(object, inheritedPreset);
      });
      const allChangedObjectIds = [...changed];
      const changedObjectIds = allChangedObjectIds.slice(0, 200);
      const boundedSkipped = skipped.slice(0, 256);
      const truncated =
        changedObjectIds.length !== allChangedObjectIds.length ||
        boundedSkipped.length !== skipped.length;
      if (allChangedObjectIds.length > 0) {
        dependencies.refreshConnectors();
        canvas.requestRenderAll();
        commitSemantic("Semantic normalize styles");
      }
      return {
        data: {
          objectIds: changedObjectIds,
          changed: Math.min(allChangedObjectIds.length, 256),
          skipped: boundedSkipped,
          truncated,
          totalChanged: allChangedObjectIds.length,
          totalSkipped: skipped.length
        },
        changedObjectIds
      };
    }
    if (command === "analyze_composition") {
      const settings = dependencies.getCanvasSettings();
      const result = analyzeComposition(
        canvas,
        { width: settings.width, height: settings.height },
        sceneRevision(canvas),
        {
          profile: input.profile as
            "scientific-diagram" | "publication" | "presentation" | "cycle" | undefined,
          categories: input.categories as never,
          maxFindings: input.maxFindings as number | undefined,
          clearance: input.clearance as number | undefined,
          padding: input.padding as number | undefined
        }
      );
      return { data: result, changedObjectIds: [] };
    }
    if (command === "validate_figure") {
      const settings = dependencies.getCanvasSettings();
      const result = validateFigure(
        canvas,
        { width: settings.width, height: settings.height },
        sceneRevision(canvas),
        input.profile as "scientific-diagram" | "publication" | "presentation" | "cycle",
        {
          maxFindings: input.maxFindings as number | undefined,
          clearance: input.clearance as number | undefined,
          padding: input.padding as number | undefined
        }
      );
      return { data: result, changedObjectIds: [] };
    }
    if (command === "create_bound_connector") {
      const result = await createBoundConnector(input, true);
      return {
        data: result,
        changedObjectIds: [result.objectId, result.fromObjectId, result.toObjectId]
      };
    }
    if (command === "connect_sequence") {
      const ids = objectIds(input);
      const closed = input.closed === true;
      const pairs = ids
        .slice(0, closed ? ids.length : ids.length - 1)
        .map((id, index) => ({ fromObjectId: id, toObjectId: ids[(index + 1) % ids.length] }));
      const results = [];
      for (const pair of pairs)
        results.push(await createBoundConnector({ ...input, ...pair }, false));
      canvas.requestRenderAll();
      commitSemantic("Semantic connect sequence");
      return {
        data: { connectorIds: results.map((result) => result.objectId), bindings: results },
        changedObjectIds: [...ids, ...results.map((result) => result.objectId)]
      };
    }
    if (command === "repair_connectors") {
      const ids = objectIds({ objectIds: input.connectorIds });
      const connectors = resolveObjects(canvas, ids);
      const repaired: string[] = [];
      for (const object of connectors) {
        if (!object.connector)
          throw new SemanticAdapterError(
            "INVALID_CONNECTOR_TARGET",
            `Object "${object.objectId}" is not a bound connector.`
          );
        if (input.category === "binding" || input.category === "scope") {
          const fromObjectId = (input.fromObjectId ?? object.connector.fromObjectId) as string;
          const toObjectId = (input.toObjectId ?? object.connector.toObjectId) as string;
          const [fromObject, toObject] = resolveObjects(canvas, [fromObjectId, toObjectId]);
          const fromPort = portFor(fromObject, object.semanticConnector?.fromPortId, true);
          const toPort = portFor(toObject, object.semanticConnector?.toPortId, false);
          object.connector = {
            ...object.connector,
            fromObjectId,
            toObjectId,
            fromAnchor: anchorForPort(fromPort),
            toAnchor: anchorForPort(toPort)
          };
          object.semanticConnector = {
            ...(object.semanticConnector ?? {
              version: 1,
              fromPortId: fromPort.id,
              toPortId: toPort.id,
              routeType: "straight",
              clearance: 12
            }),
            fromPortId: fromPort.id,
            toPortId: toPort.id
          };
        }
        if (input.category === "z-order") canvas.sendObjectToBack(object);
        repaired.push(object.objectId!);
      }
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic repair connectors");
      return { data: { connectorIds: repaired, repaired }, changedObjectIds: repaired };
    }
    if (command === "plan_layout") {
      const ids = objectIds(input);
      const settings = dependencies.getCanvasSettings();
      const plan = planSemanticLayout(
        resolveObjects(canvas, ids).map((object) => ({
          object,
          geometry: inspectSemanticGeometry(object),
          metadata: metadataOf(object)
        })),
        {
          mode: input.mode as "cycle" | "flow" | "path" | "grid" | "cluster" | "free",
          objectIds: ids,
          center: input.center ? point(input.center, "center") : undefined,
          radius: input.radius === undefined ? undefined : finiteNumber(input.radius, "radius"),
          axes: input.axes as { x: number; y: number } | undefined,
          startAngle:
            input.startAngle === undefined
              ? undefined
              : finiteNumber(input.startAngle, "startAngle"),
          direction: input.direction as "clockwise" | "counterclockwise" | undefined,
          gap: input.gap === undefined ? undefined : finiteNumber(input.gap, "gap"),
          padding: input.padding === undefined ? undefined : finiteNumber(input.padding, "padding"),
          hubKeepOut: input.hubKeepOut as Bounds | undefined,
          canvas: { width: settings.width, height: settings.height }
        },
        sceneRevision(canvas)
      );
      layoutPlans.set(plan.id, plan);
      return { data: { plan }, changedObjectIds: [] };
    }
    if (command === "apply_layout_plan") {
      const planId = input.planId as string;
      const plan = layoutPlans.get(planId);
      if (!plan)
        throw new SemanticAdapterError(
          "STALE_LAYOUT_PLAN",
          `Layout plan "${planId}" is unavailable.`
        );
      if (plan.status !== "feasible")
        throw new SemanticAdapterError(
          "INFEASIBLE_LAYOUT",
          "Only feasible layout plans can be applied."
        );
      if (sceneRevision(canvas) !== plan.sourceRevision)
        throw new SemanticAdapterError(
          "STALE_LAYOUT_PLAN",
          "The scene changed after this layout was planned."
        );
      const snapshot = dependencies.serialize();
      try {
        const changed = plan.positions.map(({ objectId, x, y }) => {
          const [object] = resolveObjects(canvas, [objectId]);
          const geometry = inspectSemanticGeometry(object);
          const delta = deltaInParentPlane(object, x - geometry.center.x, y - geometry.center.y);
          object.set({ left: (object.left ?? 0) + delta.x, top: (object.top ?? 0) + delta.y });
          object.setCoords();
          refreshParentGroups(object);
          return objectId;
        });
        dependencies.refreshConnectors();
        canvas.requestRenderAll();
        commitSemantic("Semantic apply layout plan");
        return {
          data: { planId, sceneRevision: sceneRevision(canvas), objectIds: changed },
          changedObjectIds: changed
        };
      } catch (error) {
        await dependencies.restore(snapshot);
        throw error;
      }
    }
    if (command === "repair_layout") {
      const planResult = await execute("plan_layout", input);
      const plan = (planResult.data as { plan: SemanticLayoutPlan }).plan;
      if (plan.status !== "feasible")
        throw new SemanticAdapterError(
          "INFEASIBLE_LAYOUT",
          "No feasible repair layout is available."
        );
      const applied = await execute("apply_layout_plan", { planId: plan.id });
      return {
        data: { planId: plan.id, objectIds: (applied.data as { objectIds: string[] }).objectIds },
        changedObjectIds: applied.changedObjectIds
      };
    }
    if (command === "set_selection") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      if (objects.length === 0) canvas.discardActiveObject();
      else
        canvas.setActiveObject(
          objects.length === 1 ? objects[0] : new ActiveSelection(objects, { canvas })
        );
      dependencies.setSelection(objects);
      canvas.requestRenderAll();
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "insert_asset") {
      const familyId = input.familyId as string;
      const variantId = input.variantId as string;
      const family = assetManifest.families.find((candidate) => candidate.familyId === familyId);
      if (!family)
        throw new SemanticAdapterError(
          "STALE_ASSET_ID",
          `Asset family "${familyId}" does not exist.`
        );
      const variant = family.variants.find((candidate) => candidate.id === variantId);
      if (!variant) {
        throw new SemanticAdapterError(
          "INVALID_ASSET_VARIANT",
          `Asset variant "${variantId}" is not available in family "${familyId}".`
        );
      }
      const objectId = await dependencies.insertAsset(
        family,
        variant,
        locationFromInput(canvas, dependencies.getCanvasSettings(), input)
      );
      if (!objectId)
        throw new SemanticAdapterError("INSERT_FAILED", `Could not insert asset "${variantId}".`);
      return { data: { objectId, familyId, variantId }, changedObjectIds: [objectId] };
    }
    if (command === "replace_asset_variant") {
      const objectId = input.objectId as string;
      const variantId = input.variantId as string;
      const [object] = resolveObjects(canvas, [objectId]);
      if (!(object instanceof Group) || !object.familyId) {
        throw new SemanticAdapterError(
          "INVALID_ASSET_TARGET",
          `Scene object "${objectId}" is not a replaceable bundled asset.`
        );
      }
      const family = assetManifest.families.find(
        (candidate) => candidate.familyId === object.familyId
      );
      if (!family || !family.variants.some((variant) => variant.id === variantId)) {
        throw new SemanticAdapterError(
          "INVALID_ASSET_VARIANT",
          `Asset variant "${variantId}" is not available for scene object "${objectId}".`
        );
      }
      const replaced = await dependencies.replaceAssetVariant(objectId, variantId);
      return {
        data: { objectId, variantId },
        changedObjectIds: replaced ? [objectId] : []
      };
    }
    if (command === "create_text") {
      const kind = input.kind as (typeof TEXT_KINDS)[number];
      const defaults = dependencies.creationDefaults();
      const text =
        typeof input.text === "string" ? input.text : kind === "box" ? "Text box" : "Text";
      const object =
        kind === "box"
          ? new Textbox(text, {
              fill: defaults.text.color,
              fontFamily: defaults.text.fontFamily,
              fontSize:
                typeof input.fontSize === "number" ? input.fontSize : defaults.text.fontSize,
              fontWeight:
                typeof input.fontWeight === "number" ? input.fontWeight : defaults.text.fontWeight,
              width: 420
            })
          : new IText(text, {
              fill: defaults.text.color,
              fontFamily: defaults.text.fontFamily,
              fontSize:
                typeof input.fontSize === "number" ? input.fontSize : defaults.text.fontSize,
              fontWeight:
                typeof input.fontWeight === "number" ? input.fontWeight : defaults.text.fontWeight
            });
      configureTextObject(object);
      const objectId = addObject(
        canvas,
        object,
        kind === "box" ? "Text box" : "Text",
        "text",
        locationFromInput(canvas, dependencies.getCanvasSettings(), input)
      );
      return { data: { objectId }, changedObjectIds: [objectId] };
    }
    if (command === "set_text_content") {
      const objectId = input.objectId as string;
      const [object] = resolveObjects(canvas, [objectId]);
      if (!(object instanceof IText) && !(object instanceof Textbox)) {
        throw new SemanticAdapterError(
          "INVALID_SELECTION",
          `Scene object "${objectId}" is not editable text.`
        );
      }
      if (typeof input.text !== "string") {
        throw new SemanticAdapterError("INVALID_INPUT", "text is required.");
      }
      const text = input.text;
      object.set("text", text);
      configureTextObject(object);
      object.setCoords();
      refreshParentGroups(object);
      canvas.requestRenderAll();
      commitSemantic("Semantic text content");
      return { data: { objectId, text }, changedObjectIds: [objectId] };
    }
    if (command === "create_shape") {
      const kind = input.kind as (typeof SHAPE_KINDS)[number];
      const object = createShapeObject(kind as ShapeKind, dependencies.creationDefaults());
      const objectId = addObject(
        canvas,
        object,
        kind === "polygon" ? "hexagon" : kind.replace("-", " "),
        kind.includes("arrow") ? "connector" : "shape",
        locationFromInput(canvas, dependencies.getCanvasSettings(), input)
      );
      return { data: { objectId }, changedObjectIds: [objectId] };
    }
    if (command === "create_connector") {
      const kind = input.kind as (typeof CONNECTOR_KINDS)[number];
      const hasBoundIds = input.fromObjectId !== undefined || input.toObjectId !== undefined;
      const hasFreePoints = input.from !== undefined || input.to !== undefined;
      if (hasBoundIds === hasFreePoints) {
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "A connector needs either both object IDs or both free points."
        );
      }
      const defaults = dependencies.creationDefaults().line;
      const fromAnchor = (input.fromAnchor ?? "center") as ConnectorBinding["fromAnchor"];
      const toAnchor = (input.toAnchor ?? "center") as ConnectorBinding["toAnchor"];
      const pathShape =
        (input.pathShape as ConnectorBinding["pathShape"] | undefined) ??
        defaultConnectorPathShape(kind);
      let from: SemanticPointInput;
      let to: SemanticPointInput;
      let binding: ConnectorBinding;
      if (hasBoundIds) {
        if (typeof input.fromObjectId !== "string" || typeof input.toObjectId !== "string") {
          throw new SemanticAdapterError(
            "INVALID_INPUT",
            "Both connector object IDs are required."
          );
        }
        const [fromObject, toObject] = resolveObjects(canvas, [
          input.fromObjectId,
          input.toObjectId
        ]);
        if (fromObject === toObject)
          throw new SemanticAdapterError("INVALID_INPUT", "Connector endpoints must differ.");
        const fromPoint = anchorPoint(fromObject.getBoundingRect(), fromAnchor);
        const toPoint = anchorPoint(toObject.getBoundingRect(), toAnchor);
        from = { x: fromPoint.x, y: fromPoint.y };
        to = { x: toPoint.x, y: toPoint.y };
        binding = {
          fromObjectId: input.fromObjectId,
          fromAnchor,
          toObjectId: input.toObjectId,
          toAnchor,
          startArrowhead: startArrowheadFor(kind, input.startArrowhead, defaults.startArrowhead),
          endArrowhead: (input.endArrowhead ??
            (kind === "line" || kind === "curved-line"
              ? "none"
              : defaults.endArrowhead)) as ConnectorBinding["endArrowhead"],
          lineStyle: (input.lineStyle ?? defaults.lineStyle) as ConnectorBinding["lineStyle"],
          routing: pathShape === "straight" ? "direct" : "orthogonal",
          ...(pathShape ? { pathShape } : {}),
          curvature:
            typeof input.curvature === "number"
              ? input.curvature
              : kind === "curved-arrow"
                ? 0.24
                : 0
        };
        const obstacles = canvas
          .getObjects()
          .filter(
            (object) =>
              !object.connector &&
              object.visible !== false &&
              object !== fromObject &&
              object !== toObject
          )
          .map((object) => object.getBoundingRect());
        const connector = createConnectorObject(
          from,
          to,
          binding,
          {
            color: defaults.color,
            width: defaults.width * (typeof input.widthScale === "number" ? input.widthScale : 1),
            opacity: typeof input.opacity === "number" ? input.opacity : 1
          },
          obstacles
        );
        const objectId = addObject(
          canvas,
          connector,
          "Connector",
          "connector",
          undefined,
          false,
          false
        );
        connector.objectId = objectId;
        canvas.sendObjectToBack(connector);
        dependencies.refreshConnectors(objectId);
        canvas.requestRenderAll();
        commitSemantic("Semantic add Connector");
        return {
          data: { objectId },
          changedObjectIds: [objectId, input.fromObjectId, input.toObjectId]
        };
      }
      from = pointFromInput(input, "from");
      to = pointFromInput(input, "to");
      binding = {
        fromObjectId: "",
        fromAnchor: "center",
        toObjectId: "",
        toAnchor: "center",
        startArrowhead: startArrowheadFor(kind, input.startArrowhead, defaults.startArrowhead),
        endArrowhead: (input.endArrowhead ??
          (kind === "line" || kind === "curved-line"
            ? "none"
            : defaults.endArrowhead)) as ConnectorBinding["endArrowhead"],
        lineStyle: (input.lineStyle ?? defaults.lineStyle) as ConnectorBinding["lineStyle"],
        routing: "direct",
        ...(pathShape ? { pathShape } : {}),
        curvature:
          typeof input.curvature === "number"
            ? input.curvature
            : kind === "curved-arrow" || kind === "curved-line"
              ? 0.24
              : 0
      };
      const connector = createFreeConnectorObject(from, to, binding, {
        color: defaults.color,
        width: defaults.width * (typeof input.widthScale === "number" ? input.widthScale : 1),
        opacity: typeof input.opacity === "number" ? input.opacity : 1
      });
      connector.connector = undefined;
      connector.OpenSketchType = kind;
      connector.name = kind.replace("-", " ");
      connector.lockScalingX = false;
      connector.lockScalingY = false;
      const objectId = addObject(canvas, connector, connector.name, kind, undefined, true, false);
      return { data: { objectId }, changedObjectIds: [objectId] };
    }
    if (command === "create_circular_arc") {
      const center = point(input.center, "center");
      const radius = finiteNumber(input.radius, "radius");
      const startAngle = finiteNumber(input.startAngle, "startAngle");
      const endAngle = finiteNumber(input.endAngle, "endAngle");
      const clockwise = input.direction !== "counterclockwise";
      const sweep = clockwise
        ? (((endAngle - startAngle) % 360) + 360) % 360
        : (((startAngle - endAngle) % 360) + 360) % 360;
      if (radius <= 0 || sweep < 0.01) {
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "Circular arc radius and angular sweep must be positive."
        );
      }
      const defaults = dependencies.creationDefaults().line;
      const arc = createCircularArcObject(
        {
          center,
          radius,
          startAngle,
          endAngle,
          clockwise,
          startArrowhead: (input.startArrowhead ?? "none") as ConnectorBinding["startArrowhead"],
          endArrowhead: (input.endArrowhead ?? "triangle") as ConnectorBinding["endArrowhead"],
          lineStyle: (input.lineStyle ?? "solid") as ConnectorBinding["lineStyle"]
        },
        {
          color: defaults.color,
          width: defaults.width * (typeof input.widthScale === "number" ? input.widthScale : 1),
          opacity: typeof input.opacity === "number" ? input.opacity : 1
        }
      );
      const objectId = addObject(
        canvas,
        arc,
        "Circular arc",
        "curved-arrow",
        undefined,
        false,
        false
      );
      canvas.sendObjectToBack(arc);
      canvas.requestRenderAll();
      commitSemantic("Semantic add circular arc");
      return { data: { objectId }, changedObjectIds: [objectId] };
    }
    if (command === "move_objects") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      const dx = finiteNumber(input.dx, "dx");
      const dy = finiteNumber(input.dy, "dy");
      objects.forEach((object) => {
        const delta = deltaInParentPlane(object, dx, dy);
        object.set({ left: (object.left ?? 0) + delta.x, top: (object.top ?? 0) + delta.y });
        object.setCoords();
        refreshParentGroups(object);
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic move");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "snap_object") {
      const objectId = input.objectId as string;
      const targetObjectId = input.targetObjectId as string;
      const [object, target] = resolveObjects(canvas, [objectId, targetObjectId]);
      assertIndependentPlacementObjects([object, target]);
      const side = input.side as "top" | "right" | "bottom" | "left";
      if (!["top", "right", "bottom", "left"].includes(side)) {
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "side must be top, right, bottom, or left."
        );
      }
      const gap = finiteNumber(input.gap, "gap");
      const offset = input.offset === undefined ? 0 : finiteNumber(input.offset, "offset");
      if (gap < 0) throw new SemanticAdapterError("INVALID_INPUT", "gap must not be negative.");
      setAbsoluteRotation(object, input.angle);
      const targetAnchor = anchorPoint(target.getBoundingRect(), side);
      const objectAnchor =
        side === "top" ? "bottom" : side === "right" ? "left" : side === "bottom" ? "top" : "right";
      const destination = {
        x: targetAnchor.x + (side === "left" ? -gap : side === "right" ? gap : offset),
        y: targetAnchor.y + (side === "top" ? -gap : side === "bottom" ? gap : offset)
      };
      moveAnchorTo(object, objectAnchor, destination);
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic snap");
      return {
        data: { objectId, targetObjectId, position: destination },
        changedObjectIds: [objectId]
      };
    }
    if (command === "layout_objects_radially") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      const center = point(input.center, "center");
      const radius = finiteNumber(input.radius, "radius");
      const startAngle = finiteNumber(input.startAngle, "startAngle");
      const direction = input.direction === "counterclockwise" ? -1 : 1;
      if (radius <= 0) {
        throw new SemanticAdapterError("INVALID_INPUT", "radius must be positive.");
      }
      objects.forEach((object, index) => {
        const angle = ((startAngle + (direction * (360 * index)) / objects.length) * Math.PI) / 180;
        moveAnchorTo(object, "center", {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius
        });
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic radial layout");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "layout_objects_linear") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      const center = point(input.center, "center");
      const gap = finiteNumber(input.gap, "gap");
      const axis =
        input.axis === "vertical"
          ? "vertical"
          : input.axis === "horizontal"
            ? "horizontal"
            : undefined;
      const alignment = input.alignment ?? "center";
      if (!axis) {
        throw new SemanticAdapterError("INVALID_INPUT", "axis must be horizontal or vertical.");
      }
      if (!["start", "center", "end"].includes(alignment as string)) {
        throw new SemanticAdapterError("INVALID_INPUT", "alignment must be start, center, or end.");
      }
      if (gap < 0) throw new SemanticAdapterError("INVALID_INPUT", "gap must not be negative.");
      const bounds = objects.map(boundsOf);
      const lengths = bounds.map((item) => (axis === "horizontal" ? item.width : item.height));
      const crossLengths = bounds.map((item) => (axis === "horizontal" ? item.height : item.width));
      const totalLength =
        lengths.reduce((sum, value) => sum + value, 0) + gap * (objects.length - 1);
      const maxCross = Math.max(...crossLengths);
      let cursor = (axis === "horizontal" ? center.x : center.y) - totalLength / 2;
      objects.forEach((object, index) => {
        const length = lengths[index];
        const cross = crossLengths[index];
        const mainCenter = cursor + length / 2;
        const crossCenter =
          alignment === "start"
            ? (axis === "horizontal" ? center.y : center.x) - maxCross / 2 + cross / 2
            : alignment === "end"
              ? (axis === "horizontal" ? center.y : center.x) + maxCross / 2 - cross / 2
              : axis === "horizontal"
                ? center.y
                : center.x;
        moveAnchorTo(
          object,
          "center",
          axis === "horizontal"
            ? { x: mainCenter, y: crossCenter }
            : { x: crossCenter, y: mainCenter }
        );
        cursor += length + gap;
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic linear layout");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "attach_object") {
      const objectId = input.objectId as string;
      const targetObjectId = input.targetObjectId as string;
      const [object, target] = resolveObjects(canvas, [objectId, targetObjectId]);
      assertIndependentPlacementObjects([object, target]);
      const objectAnchor = semanticAnchor(input.objectAnchor, "objectAnchor");
      const targetAnchor = semanticAnchor(input.targetAnchor, "targetAnchor");
      const offset = optionalOffset(input.offset);
      setAbsoluteRotation(object, input.angle);
      const targetPoint = anchorPoint(target.getBoundingRect(), targetAnchor);
      const destination = { x: targetPoint.x + offset.x, y: targetPoint.y + offset.y };
      moveAnchorTo(object, objectAnchor, destination);
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic attach");
      return {
        data: { objectId, targetObjectId, position: destination },
        changedObjectIds: [objectId]
      };
    }
    if (command === "place_object_between") {
      const objectId = input.objectId as string;
      const fromObjectId = input.fromObjectId as string;
      const toObjectId = input.toObjectId as string;
      const [object, fromObject, toObject] = resolveObjects(canvas, [
        objectId,
        fromObjectId,
        toObjectId
      ]);
      assertIndependentPlacementObjects([object, fromObject, toObject]);
      const objectAnchor = semanticAnchor(input.objectAnchor, "objectAnchor");
      const fromAnchor = semanticAnchor(input.fromAnchor, "fromAnchor");
      const toAnchor = semanticAnchor(input.toAnchor, "toAnchor");
      const offset = optionalOffset(input.offset);
      setAbsoluteRotation(object, input.angle);
      const fromPoint = anchorPoint(fromObject.getBoundingRect(), fromAnchor);
      const toPoint = anchorPoint(toObject.getBoundingRect(), toAnchor);
      const destination = {
        x: (fromPoint.x + toPoint.x) / 2 + offset.x,
        y: (fromPoint.y + toPoint.y) / 2 + offset.y
      };
      moveAnchorTo(object, objectAnchor, destination);
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic bridge");
      return {
        data: { objectId, fromObjectId, toObjectId, position: destination },
        changedObjectIds: [objectId]
      };
    }
    if (command === "rotate_objects") {
      const ids = objectIds(input);
      const degrees = finiteNumber(input.degrees, "degrees");
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      objects.forEach((object) => {
        object.set("angle", (object.angle ?? 0) + degrees);
        object.setCoords();
        refreshParentGroups(object);
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic rotate");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "scale_objects") {
      const ids = objectIds(input);
      if (input.scaleX === undefined && input.scaleY === undefined) {
        throw new SemanticAdapterError("INVALID_INPUT", "scaleX or scaleY is required.");
      }
      const scaleX = input.scaleX === undefined ? undefined : finiteNumber(input.scaleX, "scaleX");
      const scaleY = input.scaleY === undefined ? undefined : finiteNumber(input.scaleY, "scaleY");
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      objects.forEach((object) => {
        object.set({
          ...(scaleX === undefined ? {} : { scaleX: scaleX * (object.scaleX ?? 1) }),
          ...(scaleY === undefined ? {} : { scaleY: scaleY * (object.scaleY ?? 1) })
        });
        object.setCoords();
        refreshParentGroups(object);
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic scale");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "flip_objects") {
      const ids = objectIds(input);
      const axis = input.axis === "x" ? "flipX" : input.axis === "y" ? "flipY" : undefined;
      if (!axis) throw new SemanticAdapterError("INVALID_INPUT", "axis must be x or y.");
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      objects.forEach((object) => {
        object.set(axis, !object[axis]);
        object.setCoords();
        refreshParentGroups(object);
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic flip");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "set_object_properties") {
      const ids = objectIds(input);
      const properties = input.properties;
      if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
        throw new SemanticAdapterError("INVALID_INPUT", "properties must be an object.");
      }
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      objects.forEach((object) => {
        object.set(properties as Record<string, unknown>);
        configureTextObject(object);
        const propertyRecord = properties as Record<string, unknown>;
        if (
          isGroup(object) &&
          (Boolean(object.connector) ||
            CONNECTOR_KINDS.includes(object.OpenSketchType as (typeof CONNECTOR_KINDS)[number]))
        ) {
          object.getObjects().forEach((part) => {
            if (typeof propertyRecord.stroke === "string") {
              part.set("stroke", propertyRecord.stroke);
              if (typeof part.fill === "string" && part.fill !== "")
                part.set("fill", propertyRecord.stroke);
            }
            if (typeof propertyRecord.strokeWidth === "number") {
              part.set(
                "strokeWidth",
                part.type === "path"
                  ? propertyRecord.strokeWidth
                  : Math.max(1, propertyRecord.strokeWidth * 0.4)
              );
            }
            if (
              Array.isArray(propertyRecord.strokeDashArray) ||
              propertyRecord.strokeDashArray === null
            )
              part.set("strokeDashArray", propertyRecord.strokeDashArray);
            if (propertyRecord.strokeLineCap === "butt" || propertyRecord.strokeLineCap === "round")
              part.set("strokeLineCap", propertyRecord.strokeLineCap);
          });
          object.dirty = true;
        }
        object.setCoords();
        refreshParentGroups(object);
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic properties");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "set_asset_color_preset") {
      const objectId = input.objectId as string;
      const presetId = input.presetId as string;
      resolveObjects(canvas, [objectId]);
      await dependencies.applyColorPreset(objectId, presetId);
      commitSemantic("Semantic color preset");
      return { data: { objectId, presetId }, changedObjectIds: [objectId] };
    }
    if (command === "export_figure") {
      const format = input.format as "svg" | "pdf" | "png" | "credits";
      const title = typeof input.title === "string" ? input.title : undefined;
      const description = typeof input.description === "string" ? input.description : undefined;
      if (format === "svg") dependencies.exportSvg(title, description);
      else if (format === "credits") dependencies.exportCredits(title, description);
      else if (format === "pdf") await dependencies.exportPdf(title, description);
      else {
        const settings = dependencies.getCanvasSettings();
        await dependencies.exportPng(
          input.transparent === true,
          typeof input.dpi === "number" ? input.dpi : settings.dpi,
          typeof input.background === "string" ? input.background : settings.background
        );
      }
      return { data: { format, started: true } };
    }
    if (command === "arrange_objects") {
      const ids = objectIds(input);
      const action = input.action as (typeof ARRANGE_ACTIONS)[number];
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      arrangeObjects(objects, canvas, action);
      canvas.requestRenderAll();
      commitSemantic("Semantic arrange");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "align_objects") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      if (objects.length < 2)
        throw new SemanticAdapterError("INVALID_SELECTION", "Align needs at least two objects.");
      const axis = input.axis as (typeof ALIGN_AXES)[number];
      const bounds = unionBounds(objects);
      objects.forEach((object) => {
        const current = boundsOf(object);
        let dx = 0;
        let dy = 0;
        if (axis === "left") dx = bounds.left - current.left;
        if (axis === "center")
          dx = bounds.left + bounds.width / 2 - (current.left + current.width / 2);
        if (axis === "right") dx = bounds.left + bounds.width - (current.left + current.width);
        if (axis === "top") dy = bounds.top - current.top;
        if (axis === "middle")
          dy = bounds.top + bounds.height / 2 - (current.top + current.height / 2);
        if (axis === "bottom") dy = bounds.top + bounds.height - (current.top + current.height);
        const delta = deltaInParentPlane(object, dx, dy);
        object.set({ left: (object.left ?? 0) + delta.x, top: (object.top ?? 0) + delta.y });
        object.setCoords();
        refreshParentGroups(object);
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic align");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "distribute_objects") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      if (objects.length < 3)
        throw new SemanticAdapterError(
          "INVALID_SELECTION",
          "Distribute needs at least three objects."
        );
      const axis =
        input.axis === "horizontal"
          ? "horizontal"
          : input.axis === "vertical"
            ? "vertical"
            : undefined;
      if (!axis)
        throw new SemanticAdapterError("INVALID_INPUT", "axis must be horizontal or vertical.");
      const ordered = [...objects].sort((a, b) =>
        axis === "horizontal"
          ? boundsOf(a).left - boundsOf(b).left
          : boundsOf(a).top - boundsOf(b).top
      );
      const bounds = ordered.map(boundsOf);
      const first = axis === "horizontal" ? bounds[0].left : bounds[0].top;
      const lastBounds = bounds.at(-1)!;
      const last =
        axis === "horizontal"
          ? lastBounds.left + lastBounds.width
          : lastBounds.top + lastBounds.height;
      const occupied = bounds.reduce(
        (total, item) => total + (axis === "horizontal" ? item.width : item.height),
        0
      );
      const gap = (last - first - occupied) / (objects.length - 1);
      let cursor = first + (axis === "horizontal" ? bounds[0].width : bounds[0].height) + gap;
      ordered.slice(1, -1).forEach((object, index) => {
        const current = bounds[index + 1];
        const currentPosition = axis === "horizontal" ? current.left : current.top;
        const delta = deltaInParentPlane(
          object,
          axis === "horizontal" ? cursor - currentPosition : 0,
          axis === "vertical" ? cursor - currentPosition : 0
        );
        object.set({ left: (object.left ?? 0) + delta.x, top: (object.top ?? 0) + delta.y });
        object.setCoords();
        refreshParentGroups(object);
        cursor += (axis === "horizontal" ? current.width : current.height) + gap;
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic distribute");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "rebind_connector") {
      const connectorId = input.connectorId as string;
      const [connector] = resolveObjects(canvas, [connectorId]);
      if (!connector.connector) {
        throw new SemanticAdapterError(
          "INVALID_SELECTION",
          `Scene object "${connectorId}" is not a bound connector.`
        );
      }
      if (
        input.fromObjectId === undefined &&
        input.fromAnchor === undefined &&
        input.toObjectId === undefined &&
        input.toAnchor === undefined
      ) {
        throw new SemanticAdapterError(
          "INVALID_INPUT",
          "At least one connector endpoint field is required."
        );
      }
      const fromObjectId =
        typeof input.fromObjectId === "string"
          ? input.fromObjectId
          : connector.connector.fromObjectId;
      const toObjectId =
        typeof input.toObjectId === "string" ? input.toObjectId : connector.connector.toObjectId;
      const [fromObject, toObject] = resolveObjects(canvas, [fromObjectId, toObjectId]);
      if (fromObject === toObject) {
        throw new SemanticAdapterError("INVALID_INPUT", "Connector endpoints must differ.");
      }
      const fromAnchor =
        input.fromAnchor === undefined
          ? connector.connector.fromAnchor
          : semanticAnchor(input.fromAnchor, "fromAnchor");
      const toAnchor =
        input.toAnchor === undefined
          ? connector.connector.toAnchor
          : semanticAnchor(input.toAnchor, "toAnchor");
      connector.connector = {
        ...connector.connector,
        fromObjectId,
        fromAnchor,
        toObjectId,
        toAnchor
      };
      dependencies.refreshConnectors(fromObjectId);
      canvas.requestRenderAll();
      commitSemantic("Semantic rebind connector");
      return {
        data: { connectorId, fromObjectId, toObjectId },
        changedObjectIds: [connectorId, fromObjectId, toObjectId]
      };
    }
    if (command === "duplicate_objects") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      assertNonOverlappingTargets(objects);
      const offset = input.offset === undefined ? { x: 28, y: 28 } : point(input.offset, "offset");
      const parents = objects.map((object) => layerCollectionForObject(object, canvas));
      if (!parents.every((parent) => parent === parents[0])) {
        throw new SemanticAdapterError(
          "INVALID_SELECTION",
          "Duplicate targets must share one layer collection."
        );
      }
      const clones = await Promise.all(objects.map((object) => object.clone()));
      dependencies.configureCanvasAssets(clones);
      assignFreshCloneIds(clones);
      clones.forEach((clone) => {
        clone.set({ left: (clone.left ?? 0) + offset.x, top: (clone.top ?? 0) + offset.y });
        parents[0].add(clone);
        clone.setCoords();
      });
      canvas.requestRenderAll();
      const cloneIds = clones.map((clone) => clone.objectId!).filter(Boolean);
      commitSemantic("Semantic duplicate");
      return { data: { objectIds: cloneIds }, changedObjectIds: cloneIds };
    }
    if (command === "delete_objects") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      const previousSelectionObjectIds = canvas
        .getActiveObjects()
        .map((object) => object.objectId)
        .filter((objectId): objectId is string => Boolean(objectId));
      const nestedAssetObjects = objects.filter((object) => editableAssetParent(object));
      if (nestedAssetObjects.length > 0) {
        if (nestedAssetObjects.length !== objects.length) {
          throw new SemanticAdapterError(
            "INVALID_SELECTION",
            "Asset-part deletion cannot be combined with other semantic targets."
          );
        }
        const removedIds = new Set(
          nestedAssetObjects
            .map((object) => object.objectId)
            .filter((objectId): objectId is string => Boolean(objectId))
        );
        const parents = new Set<Group>();
        nestedAssetObjects.forEach((object) => {
          const parent = object.group;
          if (!(parent instanceof Group)) return;
          parents.add(editableAssetParent(object) ?? parent);
          parent.remove(object);
          parent.triggerLayout();
          parent.dirty = true;
          parent.setCoords();
        });
        parents.forEach((parent) => {
          if (parent.getObjects().length !== 0 || !parent.objectId) return;
          removedIds.add(parent.objectId);
          const entry = sceneObjectEntries(canvas).find(({ object }) => object === parent);
          if (entry) removeSceneObject(entry);
        });
        sceneObjectEntries(canvas)
          .filter(({ object }) => connectorsForRemovedIds([object], removedIds).length > 0)
          .forEach(removeSceneObject);
        restoreSelection(
          canvas,
          previousSelectionObjectIds.filter((objectId) => !removedIds.has(objectId)),
          dependencies.setSelection
        );
        dependencies.refreshConnectors();
        canvas.requestRenderAll();
        commitSemantic("Semantic delete");
        return { data: { objectIds: [...removedIds] }, changedObjectIds: [...removedIds] };
      }
      const roots = objects.filter(
        (object) =>
          !objects.some((candidate) => candidate !== object && isSceneDescendant(object, candidate))
      );
      const removedIds = new Set<string>();
      roots.forEach((root) =>
        visitSceneObjects(root, (object) => object.objectId && removedIds.add(object.objectId))
      );
      sceneObjectEntries(canvas)
        .filter(({ object }) => connectorsForRemovedIds([object], removedIds).length > 0)
        .forEach(removeSceneObject);
      const entries = sceneObjectEntries(canvas);
      roots.forEach((root) => {
        const entry = entries.find((candidate) => candidate.object === root);
        if (entry) removeSceneObject(entry);
      });
      restoreSelection(
        canvas,
        previousSelectionObjectIds.filter((objectId) => !removedIds.has(objectId)),
        dependencies.setSelection
      );
      canvas.requestRenderAll();
      commitSemantic("Semantic delete");
      return { data: { objectIds: [...removedIds] }, changedObjectIds: [...removedIds] };
    }
    if (command === "group_objects") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      if (objects.length < 2)
        throw new SemanticAdapterError("INVALID_SELECTION", "Group needs at least two objects.");
      const collection = layerCollectionForObject(objects[0], canvas);
      if (!objects.every((object) => layerCollectionForObject(object, canvas) === collection)) {
        throw new SemanticAdapterError(
          "INVALID_SELECTION",
          "Group targets must share one layer collection."
        );
      }
      const ordered = [...objects].sort(
        (a, b) => collection.getObjects().indexOf(a) - collection.getObjects().indexOf(b)
      );
      const insertionIndex = collection.getObjects().indexOf(ordered[0]);
      collection.remove(...ordered);
      const group = new Group(ordered);
      const recognition = findRecognizedGroup(ordered);
      if (recognition) restoreRecognizedGroup(group, ordered, recognition);
      group.objectId ??= crypto.randomUUID();
      group.name ??= "Group";
      group.OpenSketchType = "group";
      dependencies.configureCanvasAssets([group]);
      collection.insertAt(Math.max(0, insertionIndex), group);
      if (collection instanceof Group) {
        collection.triggerLayout();
        collection.dirty = true;
        collection.setCoords();
      }
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic group");
      return {
        data: { objectId: group.objectId, objectIds: [group.objectId] },
        changedObjectIds: [group.objectId]
      };
    }
    if (command === "ungroup_objects") {
      const ids = objectIds(input);
      const [group] = resolveObjects(canvas, ids);
      const previousSelectionObjectIds = canvas
        .getActiveObjects()
        .map((object) => object.objectId)
        .filter((objectId): objectId is string => Boolean(objectId));
      if (!isManualGroup(group))
        throw new SemanticAdapterError("INVALID_SELECTION", "The target is not a manual group.");
      const parent = layerCollectionForObject(group, canvas);
      const index = parent.getObjects().indexOf(group);
      const removedId = group.objectId;
      const removedIds = new Set(removedId ? [removedId] : []);
      sceneObjectEntries(canvas)
        .filter(({ object }) => connectorsForRemovedIds([object], removedIds).length > 0)
        .forEach(removeSceneObject);
      const children = group.removeAll();
      rememberRecognizedGroup(children, recognizedGroupRecord(group, children));
      if (index >= 0) {
        parent.remove(group);
        parent.insertAt(index, ...children);
        if (parent instanceof Group) {
          parent.triggerLayout();
          parent.setCoords();
          parent.dirty = true;
        }
      }
      dependencies.configureCanvasAssets(children);
      const childObjectIds = children.map((child) => child.objectId!).filter(Boolean);
      restoreSelection(
        canvas,
        previousSelectionObjectIds.flatMap((objectId) =>
          objectId === removedId ? childObjectIds : [objectId]
        ),
        dependencies.setSelection
      );
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic ungroup");
      return {
        data: { objectIds: childObjectIds },
        changedObjectIds: [removedId!, ...childObjectIds]
      };
    }
    if (command === "undo") {
      return { data: { applied: await dependencies.undo() } };
    }
    if (command === "redo") {
      return { data: { applied: await dependencies.redo() } };
    }
    throw new SemanticAdapterError(
      "UNKNOWN_COMMAND",
      `Semantic mutation "${command}" is not implemented.`
    );
  };

  const inspectObject = (objectId: string): SemanticObjectDescriptor | undefined => {
    const canvas = dependencies.getCanvas();
    if (!canvas || !objectId) return undefined;
    assertSemanticSceneIdentity(canvas);
    const entry = sceneObjectEntries(canvas).find(({ object }) => object.objectId === objectId);
    if (!entry) return undefined;
    const parentObjectId = entry.parent instanceof Group ? entry.parent.objectId : undefined;
    const children = isGroup(entry.object)
      ? entry.object
          .getObjects()
          .map((child) => child.objectId!)
          .filter(Boolean)
      : undefined;
    return describeObject(entry.object, parentObjectId, entry.path, children);
  };

  const inspectScene = ({
    maxObjects,
    maxDepth
  }: {
    maxObjects: number;
    maxDepth: number;
  }): SemanticSceneSnapshot => {
    const canvas = dependencies.getCanvas();
    const ready = Boolean(canvas && dependencies.isCanvasReady());
    const settings = dependencies.getCanvasSettings();
    if (!canvas || !ready) {
      return {
        runtimeVersion: "opensketch.semantic.v1",
        projectId: dependencies.getProjectId(),
        canvasReady: false,
        canvas: {
          width: settings.width,
          height: settings.height,
          unit: settings.unit,
          dpi: settings.dpi,
          background: settings.background,
          transparent: settings.transparent
        },
        selectionObjectIds: [],
        objects: [],
        truncated: false,
        warnings: ["The canvas is not ready."]
      };
    }
    assertSemanticSceneIdentity(canvas);
    const entries = sceneObjectEntries(canvas);
    const eligible = entries.filter(({ path }) => path.length - 1 <= maxDepth);
    const objects = eligible.slice(0, maxObjects).map(({ object, parent, path }) =>
      describeObject(
        object,
        parent instanceof Group ? parent.objectId : undefined,
        path,
        isGroup(object)
          ? object
              .getObjects()
              .map((child) => child.objectId!)
              .filter(Boolean)
          : undefined
      )
    );
    const truncated = eligible.length > maxObjects || entries.length !== eligible.length;
    const warnings: string[] = [];
    if (eligible.length > maxObjects)
      warnings.push(`Scene output capped at ${maxObjects} objects.`);
    if (entries.length !== eligible.length)
      warnings.push(`Scene output capped at depth ${maxDepth}.`);
    const selectedObjectIds = canvas
      .getActiveObjects()
      .map((object) => object.objectId)
      .filter((objectId): objectId is string => Boolean(objectId));
    const selectionObjectIds = selectedObjectIds.slice(0, 200);
    const selectionTruncated = selectedObjectIds.length > selectionObjectIds.length;
    if (selectionTruncated) warnings.push("Selection output capped at 200 objects.");
    return {
      runtimeVersion: "opensketch.semantic.v1",
      projectId: dependencies.getProjectId(),
      canvasReady: true,
      canvas: {
        width: settings.width,
        height: settings.height,
        unit: settings.unit,
        dpi: settings.dpi,
        background: settings.background,
        transparent: settings.transparent
      },
      selectionObjectIds,
      objects,
      truncated: truncated || selectionTruncated,
      warnings,
      sceneRevision: sceneRevision(canvas)
    };
  };

  return {
    getProjectId: dependencies.getProjectId,
    isCanvasReady: dependencies.isCanvasReady,
    getCanvasSettings: () => {
      const settings = dependencies.getCanvasSettings();
      return {
        width: settings.width,
        height: settings.height,
        unit: settings.unit,
        dpi: settings.dpi,
        background: settings.background,
        transparent: settings.transparent
      };
    },
    getSelectionObjectIds: () =>
      dependencies
        .getCanvas()
        ?.getActiveObjects()
        .map((object) => object.objectId!)
        .filter(Boolean) ?? [],
    inspectScene,
    inspectObject,
    searchAssets,
    inspectAsset,
    inspectProvenance,
    execute,
    runTransaction: async <T>(operation: () => Promise<T>): Promise<T> => {
      const canvas = canvasOrThrow();
      const snapshot = dependencies.serialize();
      const selectionObjectIds = canvas
        .getActiveObjects()
        .map((object) => object.objectId)
        .filter((objectId): objectId is string => Boolean(objectId));
      transactionDirtyStack.push(false);
      let succeeded = false;
      try {
        const result = await operation();
        succeeded = true;
        return result;
      } catch (error) {
        try {
          await dependencies.restore(snapshot);
          const restoredCanvas = dependencies.getCanvas();
          if (restoredCanvas) {
            restoreSelection(restoredCanvas, selectionObjectIds, dependencies.setSelection);
          }
        } catch (rollbackError) {
          const originalMessage = error instanceof Error ? error.message : String(error);
          const rollbackMessage =
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          throw new SemanticAdapterError(
            "ROLLBACK_FAILED",
            `Semantic batch failed (${originalMessage}) and rollback failed: ${rollbackMessage}`
          );
        }
        throw error;
      } finally {
        const dirty = transactionDirtyStack.pop() ?? false;
        if (succeeded && transactionDirtyStack.length > 0 && dirty) {
          transactionDirtyStack[transactionDirtyStack.length - 1] = true;
        } else if (succeeded && dirty) {
          dependencies.commit("Semantic batch");
        }
      }
    }
  };
}
