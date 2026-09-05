import { configureScientificControls } from "./scientific/controls";
import {
  ActiveSelection,
  controlsUtils,
  FabricObject,
  Group,
  IText,
  type Control,
  type TCornerPoint,
  type TransformActionHandler
} from "fabric";
import { CURSOR_ROTATE, uiTransformCursor } from "@/editor/cursors";
import { isManualGroup } from "@/editor/grouping";
import { configureVectorControls } from "@/editor/vectorControls";

export const SINGLE_OBJECT_SELECTION_COLOR = "#3b82f6";
export const GROUP_SELECTION_COLOR = "#f28c28";
export const SELECTION_STROKE_WIDTH_PX = 1;
export const SELECTION_CORNER_MAX_PX = 9;
export const SELECTION_CORNER_MIN_PX = 4;
export const SELECTION_CORNER_TOUCH_PX = 24;
export const SELECTION_CONTROL_HIT_MAX_PX = 24;
export const SELECTION_CONTROL_HIT_MIN_PX = 14;
export const ROTATION_SNAP_ANGLE = 90;
export const ROTATION_SNAP_THRESHOLD = 5;

const selectionShadowInstalled = new WeakSet<FabricObject>();
const expandedHitboxInstalled = new WeakSet<Control>();
const selectionHitSize = new WeakMap<object, number>();
const selectionPerPixelTargetFind = new WeakMap<FabricObject, boolean>();

const TEXT_FONT_SIZE_CONTROLS = {
  tl: true,
  tr: true,
  br: true,
  bl: true,
  mt: false,
  mr: false,
  mb: false,
  ml: false
} as const;

type TextScaleTransform = Parameters<TransformActionHandler>[1] & {
  textBaseFontSize?: number;
  textBaseWidth?: number;
  textBaseHeight?: number;
};

const TEXT_FONT_SIZE_MIN = 6;
const TEXT_FONT_SIZE_MAX = 400;

type TextScaleBaseline = {
  object: IText;
  fontSize: number;
  scaleX: number;
  scaleY: number;
};

export type ActiveSelectionTextScaleSession = {
  selectionScaleX: number;
  selectionScaleY: number;
  textBaselines: TextScaleBaseline[];
};

function stableScale(value: number | undefined): number {
  return Number.isFinite(value) && Math.abs(value ?? 0) > 0.0001 ? value! : 1;
}

function nestedTextObjects(object: FabricObject): IText[] {
  if (object instanceof IText) return [object];
  if (object instanceof Group) return object.getObjects().flatMap(nestedTextObjects);
  return [];
}

/** Capture the text objects before an ActiveSelection resize begins. */
export function beginActiveSelectionTextScale(
  selection: FabricObject
): ActiveSelectionTextScaleSession | null {
  if (!(selection instanceof ActiveSelection)) return null;
  const textBaselines = selection
    .getObjects()
    .flatMap(nestedTextObjects)
    .map((object) => ({
      object,
      fontSize: object.fontSize,
      scaleX: stableScale(object.scaleX),
      scaleY: stableScale(object.scaleY)
    }));
  if (textBaselines.length === 0) return null;
  return {
    selectionScaleX: stableScale(selection.scaleX),
    selectionScaleY: stableScale(selection.scaleY),
    textBaselines
  };
}

/**
 * Convert an ActiveSelection's scale into text font sizes while compensating
 * the child scale so the text keeps the same visual size during the drag and
 * has a neutral scale when Fabric later exits the selection.
 */
export function applyActiveSelectionTextScale(
  selection: FabricObject,
  session: ActiveSelectionTextScaleSession
): boolean {
  if (!(selection instanceof ActiveSelection)) return false;
  const scaleX = Math.abs(stableScale(selection.scaleX) / session.selectionScaleX);
  const scaleY = Math.abs(stableScale(selection.scaleY) / session.selectionScaleY);
  const requestedFontScale = Math.sqrt(scaleX * scaleY);
  if (!Number.isFinite(requestedFontScale) || requestedFontScale <= 0) return false;

  let changed = false;
  session.textBaselines.forEach(({ object, fontSize, scaleX: baseScaleX, scaleY: baseScaleY }) => {
    const nextFontSize = Math.min(
      TEXT_FONT_SIZE_MAX,
      Math.max(TEXT_FONT_SIZE_MIN, fontSize * requestedFontScale)
    );
    const appliedFontScale = nextFontSize / Math.max(fontSize, TEXT_FONT_SIZE_MIN);
    const nextScaleX = baseScaleX / appliedFontScale;
    const nextScaleY = baseScaleY / appliedFontScale;
    if (
      Math.abs(object.fontSize - nextFontSize) < 0.0001 &&
      Math.abs(object.scaleX - nextScaleX) < 0.0001 &&
      Math.abs(object.scaleY - nextScaleY) < 0.0001
    ) {
      return;
    }
    object.set({ fontSize: nextFontSize, scaleX: nextScaleX, scaleY: nextScaleY });
    object.initDimensions();
    object.dirty = true;
    object.setCoords();
    let parent = object.group;
    while (parent) {
      parent.dirty = true;
      parent = parent.group;
    }
    changed = true;
  });
  return changed;
}

const textFontSizeAction: TransformActionHandler = (_eventData, rawTransform, x, y) => {
  const transform = rawTransform as TextScaleTransform;
  const target = transform.target;
  if (!(target instanceof IText) || target.lockScalingX || target.lockScalingY) return false;

  if (
    transform.textBaseFontSize === undefined ||
    transform.textBaseWidth === undefined ||
    transform.textBaseHeight === undefined
  ) {
    const originalScaleX = Math.abs(transform.original.scaleX) || 1;
    const originalScaleY = Math.abs(transform.original.scaleY) || 1;
    transform.textBaseFontSize = target.fontSize * Math.sqrt(originalScaleX * originalScaleY);
    transform.textBaseWidth = Math.max(1, Math.abs(transform.width) * originalScaleX);
    transform.textBaseHeight = Math.max(1, Math.abs(transform.height) * originalScaleY);
  }

  const localPoint = controlsUtils.getLocalPoint(
    transform,
    transform.originX,
    transform.originY,
    x,
    y
  );
  const baseDiagonal = transform.textBaseWidth + transform.textBaseHeight;
  const pointerDiagonal = Math.abs(localPoint.x) + Math.abs(localPoint.y);
  const scale = Math.max(0.01, pointerDiagonal / Math.max(1, baseDiagonal));
  const fontSize = Math.min(
    TEXT_FONT_SIZE_MAX,
    Math.max(TEXT_FONT_SIZE_MIN, transform.textBaseFontSize * scale)
  );
  const changed = target.fontSize !== fontSize || target.scaleX !== 1 || target.scaleY !== 1;
  target.set({ fontSize, scaleX: 1, scaleY: 1 });
  return changed;
};

const textFontSizeActionHandler = controlsUtils.wrapWithFireEvent(
  "scaling",
  controlsUtils.wrapWithFixedAnchor(textFontSizeAction)
);

/** Resize text by changing its font size instead of stretching its glyphs. */
export function configureTextObject(object: FabricObject): void {
  if (!(object instanceof IText)) return;
  ["tl", "tr", "br", "bl"].forEach((corner) => {
    const control = object.controls[corner];
    if (!control) return;
    control.actionName = "text-font-size";
    control.actionHandler = textFontSizeActionHandler;
  });
  object.setControlsVisibility(TEXT_FONT_SIZE_CONTROLS);
}

export function enableSelectionBoundsTarget(object: FabricObject): void {
  if (!selectionPerPixelTargetFind.has(object)) {
    selectionPerPixelTargetFind.set(object, object.perPixelTargetFind);
  }
  object.perPixelTargetFind = false;
}

export function restoreObjectTargeting(object: FabricObject): void {
  if (!selectionPerPixelTargetFind.has(object)) return;
  object.perPixelTargetFind = selectionPerPixelTargetFind.get(object) ?? false;
  selectionPerPixelTargetFind.delete(object);
}

export function selectionStrokeWidthAtZoom(zoom: number): number {
  void zoom;
  return SELECTION_STROKE_WIDTH_PX;
}

export function selectionCornerSizeForObject(object: FabricObject, zoom = 1): number {
  const safeZoom = Number.isFinite(zoom) ? Math.max(zoom, 0.1) : 1;
  const shortestScreenEdge =
    Math.min(Math.abs(object.getScaledWidth()), Math.abs(object.getScaledHeight())) * safeZoom;
  if (!Number.isFinite(shortestScreenEdge)) return SELECTION_CORNER_MAX_PX;
  return Math.min(
    SELECTION_CORNER_MAX_PX,
    Math.max(SELECTION_CORNER_MIN_PX, Math.round(shortestScreenEdge * 0.16))
  );
}

export function selectionControlHitSizeForObject(object: FabricObject, zoom = 1): number {
  const safeZoom = Number.isFinite(zoom) ? Math.max(zoom, 0.1) : 1;
  const shortestScreenEdge =
    Math.min(Math.abs(object.getScaledWidth()), Math.abs(object.getScaledHeight())) * safeZoom;
  if (!Number.isFinite(shortestScreenEdge)) return SELECTION_CONTROL_HIT_MAX_PX;
  return Math.min(
    SELECTION_CONTROL_HIT_MAX_PX,
    Math.max(SELECTION_CONTROL_HIT_MIN_PX, Math.round(shortestScreenEdge * 0.45))
  );
}

function pointInPolygon(
  point: { x: number; y: number },
  vertices: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const current = vertices[index];
    const prior = vertices[previous];
    if (
      current.y > point.y !== prior.y > point.y &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function expandedControlCorners(
  { tl, tr, br, bl }: TCornerPoint,
  targetSize: number
): Array<{ x: number; y: number }> {
  const corners = [tl, tr, br, bl];
  const center = corners.reduce(
    (point, corner) => ({ x: point.x + corner.x / 4, y: point.y + corner.y / 4 }),
    { x: 0, y: 0 }
  );
  const width = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const height = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const scale = Math.max(1, targetSize / Math.max(1, Math.min(width, height)));
  return corners.map((corner) => ({
    x: center.x + (corner.x - center.x) * scale,
    y: center.y + (corner.y - center.y) * scale
  }));
}

function installControlInteraction(control: Control): void {
  if (expandedHitboxInstalled.has(control)) return;
  const originalShouldActivate = control.shouldActivate.bind(control);
  const originalCursorHandler = control.cursorStyleHandler.bind(control);
  control.shouldActivate = (controlKey, fabricObject, pointer, corners) => {
    if (originalShouldActivate(controlKey, fabricObject, pointer, corners)) return true;
    if (
      fabricObject.canvas?.getActiveObject() !== fabricObject ||
      !fabricObject.isControlVisible(controlKey)
    ) {
      return false;
    }
    return pointInPolygon(
      pointer,
      expandedControlCorners(
        corners,
        selectionHitSize.get(fabricObject) ?? SELECTION_CONTROL_HIT_MIN_PX
      )
    );
  };
  control.cursorStyleHandler = (event, currentControl, fabricObject, coord) => {
    const nativeCursor = originalCursorHandler(event, currentControl, fabricObject, coord);
    if (nativeCursor === "not-allowed") return nativeCursor;
    return currentControl.actionName === "rotate"
      ? CURSOR_ROTATE
      : uiTransformCursor(nativeCursor);
  };
  expandedHitboxInstalled.add(control);
}

function installSelectionBorderShadow(object: FabricObject): void {
  if (selectionShadowInstalled.has(object)) return;
  const drawBorders = object.drawBorders;
  object.drawBorders = function (context, options, styleOverride) {
    context.save();
    context.shadowColor = "rgba(25, 42, 43, 0.2)";
    context.shadowBlur = 1.5;
    context.shadowOffsetY = 0.5;
    drawBorders.call(this, context, options, styleOverride);
    context.restore();
  };
  selectionShadowInstalled.add(object);
}

export function configureSelectionControls(object: FabricObject, zoom = 1): void {
  configureTextObject(object);
  configureVectorControls(object);
  configureScientificControls(object);
  const color = isManualGroup(object) ? GROUP_SELECTION_COLOR : SINGLE_OBJECT_SELECTION_COLOR;
  installSelectionBorderShadow(object);
  selectionHitSize.set(object, selectionControlHitSizeForObject(object, zoom));
  Object.values(object.controls).forEach(installControlInteraction);
  object.set({
    borderColor: color,
    cornerColor: "#ffffff",
    cornerStrokeColor: color,
    cornerSize: selectionCornerSizeForObject(object, zoom),
    touchCornerSize: SELECTION_CORNER_TOUCH_PX,
    transparentCorners: false,
    borderScaleFactor: selectionStrokeWidthAtZoom(zoom),
    snapAngle: ROTATION_SNAP_ANGLE,
    snapThreshold: ROTATION_SNAP_THRESHOLD
  });
}

export function nextDeepSelection(
  activeObject: FabricObject | undefined,
  hitObjects: FabricObject[]
): FabricObject | undefined {
  if (hitObjects.length === 0) return undefined;
  if (!activeObject) return hitObjects[0];

  const activeIndex = hitObjects.indexOf(activeObject);
  if (activeIndex < 0) return hitObjects[0];
  if (hitObjects.length === 1) return activeObject;
  return hitObjects[(activeIndex + 1) % hitObjects.length];
}
