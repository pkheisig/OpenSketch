import { ActiveSelection, Canvas, FabricObject, Group, IText, Textbox } from "fabric";
import type { CanvasSettings, ConnectorBinding } from "@workspace/editor-core";
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
import { createConnectorObject, createFreeConnectorObject } from "@/editor/connectors";
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
  undo: () => void;
  redo: () => void;
}

type SemanticPointInput = { x: number; y: number };

function isGroup(object: FabricObject): object is Group {
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

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
  const fill = safeString(record.fill);
  const stroke = safeString(record.stroke);
  if (fill) style.fill = fill;
  if (stroke) style.stroke = stroke;
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
    descriptor.freeConnector = {
      from: { ...object.freeConnectorGeometry.from },
      to: { ...object.freeConnectorGeometry.to }
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
  for (let parent = object.group; parent instanceof Group; parent = parent.group) {
    parent.dirty = true;
    parent.setCoords();
  }
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
        input.x === undefined || input.y === undefined
          ? undefined
          : { x: finiteNumber(input.x, "x"), y: finiteNumber(input.y, "y") }
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
        input.x === undefined || input.y === undefined
          ? undefined
          : { x: finiteNumber(input.x, "x"), y: finiteNumber(input.y, "y") }
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
          startArrowhead: (input.startArrowhead ??
            (kind === "line"
              ? "none"
              : defaults.startArrowhead)) as ConnectorBinding["startArrowhead"],
          endArrowhead: (input.endArrowhead ??
            (kind === "line" ? "none" : defaults.endArrowhead)) as ConnectorBinding["endArrowhead"],
          lineStyle: (input.lineStyle ?? defaults.lineStyle) as ConnectorBinding["lineStyle"],
          routing: input.pathShape === "straight" ? "direct" : "orthogonal",
          ...(input.pathShape
            ? { pathShape: input.pathShape as ConnectorBinding["pathShape"] }
            : {}),
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
        startArrowhead: (input.startArrowhead ??
          (kind === "line" || kind === "curved-line"
            ? "none"
            : defaults.startArrowhead)) as ConnectorBinding["startArrowhead"],
        endArrowhead: (input.endArrowhead ??
          (kind === "line" || kind === "curved-line"
            ? "none"
            : defaults.endArrowhead)) as ConnectorBinding["endArrowhead"],
        lineStyle: (input.lineStyle ?? defaults.lineStyle) as ConnectorBinding["lineStyle"],
        routing: "direct",
        ...(input.pathShape ? { pathShape: input.pathShape as ConnectorBinding["pathShape"] } : {}),
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
      const dx = finiteNumber(input.dx, "dx");
      const dy = finiteNumber(input.dy, "dy");
      objects.forEach((object) => {
        object.set({ left: (object.left ?? 0) + dx, top: (object.top ?? 0) + dy });
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
      resolveObjects(canvas, ids).forEach((object) => {
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
      resolveObjects(canvas, ids).forEach((object) => {
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
      resolveObjects(canvas, ids).forEach((object) => object.set(axis, !object[axis]));
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
      objects.forEach((object) => {
        object.set(properties as Record<string, unknown>);
        configureTextObject(object);
        const propertyRecord = properties as Record<string, unknown>;
        if (isGroup(object) && object.OpenSketchType === "connector" && propertyRecord.stroke) {
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
    if (command === "arrange_objects") {
      const ids = objectIds(input);
      const action = input.action as (typeof ARRANGE_ACTIONS)[number];
      arrangeObjects(resolveObjects(canvas, ids), canvas, action);
      canvas.requestRenderAll();
      commitSemantic("Semantic arrange");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "align_objects") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
      if (objects.length < 2)
        throw new SemanticAdapterError("INVALID_SELECTION", "Align needs at least two objects.");
      const axis = input.axis as (typeof ALIGN_AXES)[number];
      const bounds = unionBounds(objects);
      objects.forEach((object) => {
        const current = boundsOf(object);
        if (axis === "left") object.left = (object.left ?? 0) + bounds.left - current.left;
        if (axis === "center")
          object.left =
            (object.left ?? 0) +
            bounds.left +
            bounds.width / 2 -
            (current.left + current.width / 2);
        if (axis === "right")
          object.left =
            (object.left ?? 0) + bounds.left + bounds.width - (current.left + current.width);
        if (axis === "top") object.top = (object.top ?? 0) + bounds.top - current.top;
        if (axis === "middle")
          object.top =
            (object.top ?? 0) + bounds.top + bounds.height / 2 - (current.top + current.height / 2);
        if (axis === "bottom")
          object.top =
            (object.top ?? 0) + bounds.top + bounds.height - (current.top + current.height);
        object.setCoords();
      });
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic align");
      return { data: { objectIds: ids }, changedObjectIds: ids };
    }
    if (command === "distribute_objects") {
      const ids = objectIds(input);
      const objects = resolveObjects(canvas, ids);
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
        object.set(
          axis === "horizontal" ? "left" : "top",
          (axis === "horizontal" ? (object.left ?? 0) : (object.top ?? 0)) +
            cursor -
            currentPosition
        );
        object.setCoords();
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
      const roots = objects.filter(
        (object) =>
          !objects.some((candidate) => candidate !== object && isSceneDescendant(object, candidate))
      );
      const removedIds = new Set<string>();
      roots.forEach((root) =>
        visitSceneObjects(root, (object) => object.objectId && removedIds.add(object.objectId))
      );
      sceneObjectEntries(canvas)
        .filter(
          ({ object }) =>
            object.connector &&
            (removedIds.has(object.connector.fromObjectId) ||
              removedIds.has(object.connector.toObjectId))
        )
        .forEach(removeSceneObject);
      const entries = sceneObjectEntries(canvas);
      roots.forEach((root) => {
        const entry = entries.find((candidate) => candidate.object === root);
        if (entry) removeSceneObject(entry);
      });
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
      if (!isManualGroup(group))
        throw new SemanticAdapterError("INVALID_SELECTION", "The target is not a manual group.");
      const parent = layerCollectionForObject(group, canvas);
      const index = parent.getObjects().indexOf(group);
      const removedId = group.objectId;
      const children = group.removeAll();
      rememberRecognizedGroup(children, {
        objectId: removedId!,
        memberObjectIds: children.map((child) => child.objectId!).filter(Boolean),
        properties: {}
      });
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
      dependencies.refreshConnectors();
      canvas.requestRenderAll();
      commitSemantic("Semantic ungroup");
      return {
        data: { objectIds: children.map((child) => child.objectId!).filter(Boolean) },
        changedObjectIds: [removedId!, ...children.map((child) => child.objectId!).filter(Boolean)]
      };
    }
    if (command === "undo") {
      dependencies.undo();
      return { data: { applied: true } };
    }
    if (command === "redo") {
      dependencies.redo();
      return { data: { applied: true } };
    }
    throw new SemanticAdapterError(
      "UNKNOWN_COMMAND",
      `Semantic mutation "${command}" is not implemented.`
    );
  };

  const inspectObject = (objectId: string): SemanticObjectDescriptor | undefined => {
    const canvas = dependencies.getCanvas();
    if (!canvas || !objectId) return undefined;
    assertUniqueSceneObjectIds(canvas);
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
    assertUniqueSceneObjectIds(canvas);
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
      selectionObjectIds:
        dependencies
          .getCanvas()
          ?.getActiveObjects()
          .map((object) => object.objectId!)
          .filter(Boolean) ?? [],
      objects,
      truncated,
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
    execute,
    runTransaction: async <T>(operation: () => Promise<T>): Promise<T> => {
      canvasOrThrow();
      const snapshot = dependencies.serialize();
      transactionDepth += 1;
      let succeeded = false;
      try {
        const result = await operation();
        succeeded = true;
        return result;
      } finally {
        transactionDepth -= 1;
        if (!succeeded) {
          transactionDirty = false;
          await dependencies.restore(snapshot);
        } else if (transactionDepth === 0 && transactionDirty) {
          transactionDirty = false;
          dependencies.commit("Semantic batch");
        }
      }
    }
  };
}
