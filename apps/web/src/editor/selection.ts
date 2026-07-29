import { ActiveSelection, FabricObject, Group, type Control, type TCornerPoint } from "fabric";
import { CURSOR_ROTATE, uiTransformCursor } from "@/editor/cursors";

export const SINGLE_OBJECT_SELECTION_COLOR = "rgb(178,204,255)";
export const GROUP_SELECTION_COLOR = "#9b6cf0";
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
  const color =
    object instanceof Group && !(object instanceof ActiveSelection)
      ? GROUP_SELECTION_COLOR
      : SINGLE_OBJECT_SELECTION_COLOR;
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
