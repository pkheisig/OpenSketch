import { ActiveSelection, Canvas, FabricObject, Group, IText, Point, Textbox, util } from "fabric";
import {
  filterAssetFamilies,
  type AssetFamily,
  type AssetVariant,
  type CanvasSettings,
  type ConnectorBinding
} from "@workspace/editor-core";
import {
  CONNECTOR_KINDS,
  SHAPE_KINDS,
  TEXT_KINDS,
  ALIGN_AXES,
  ARRANGE_ACTIONS
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
  createConnectorObject,
  createFreeConnectorObject
} from "@/editor/connectors";
import { configureTextObject } from "@/editor/selection";
import { assignFreshCloneIds } from "@/editor/cloneIdentity";
import { anchorPoint } from "@/editor/geometry";
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
  let transactionDepth = 0;
  let transactionDirty = false;

  const commitSemantic = (label: string): void => {
    if (transactionDepth > 0) {
      transactionDirty = true;
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

  const execute = async (
    command: string,
    input: Record<string, unknown>
  ): Promise<SemanticAdapterResult> => {
    const canvas = canvasOrThrow();
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
      warnings
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
      transactionDepth += 1;
      let succeeded = false;
      try {
        const result = await operation();
        succeeded = true;
        return result;
      } catch (error) {
        transactionDirty = false;
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
        transactionDepth -= 1;
        if (succeeded && transactionDepth === 0 && transactionDirty) {
          transactionDirty = false;
          dependencies.commit("Semantic batch");
        }
      }
    }
  };
}
