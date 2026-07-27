import { ActiveSelection, FabricObject, Group } from "fabric";

export const SINGLE_OBJECT_SELECTION_COLOR = "rgb(178,204,255)";
export const GROUP_SELECTION_COLOR = "#9b6cf0";
export const SELECTION_STROKE_WIDTH_PX = 2;
export const ROTATION_SNAP_ANGLE = 90;
export const ROTATION_SNAP_THRESHOLD = 5;

export function selectionStrokeWidthAtZoom(zoom: number): number {
  void zoom;
  return SELECTION_STROKE_WIDTH_PX;
}

export function configureSelectionControls(object: FabricObject, zoom = 1): void {
  const color =
    object instanceof Group && !(object instanceof ActiveSelection)
      ? GROUP_SELECTION_COLOR
      : SINGLE_OBJECT_SELECTION_COLOR;
  object.set({
    borderColor: color,
    cornerColor: color,
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
