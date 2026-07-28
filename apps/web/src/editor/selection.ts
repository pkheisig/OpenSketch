import { ActiveSelection, FabricObject, Group } from "fabric";

export const SINGLE_OBJECT_SELECTION_COLOR = "rgb(178,204,255)";
export const GROUP_SELECTION_COLOR = "#9b6cf0";
export const SELECTION_STROKE_WIDTH_PX = 1;
export const SELECTION_CORNER_MAX_PX = 9;
export const SELECTION_CORNER_MIN_PX = 4;
export const SELECTION_CORNER_TOUCH_PX = 24;
export const ROTATION_SNAP_ANGLE = 90;
export const ROTATION_SNAP_THRESHOLD = 5;

const selectionShadowInstalled = new WeakSet<FabricObject>();

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
