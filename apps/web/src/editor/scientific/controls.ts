import {
  Control,
  Group,
  Point,
  controlsUtils,
  util,
  type FabricObject,
  type TransformActionHandler
} from "fabric";
import { isScientificBrush, updateBrushObject } from "./objects";

/** Fabric supplies control actions in the target's parent plane (including nested groups). */
export function moveBrushAnchor(object: FabricObject, index: number, parentPoint: Point): boolean {
  if (!isScientificBrush(object) || !object.scientificBrush.points[index]) return false;
  const local = util.transformPoint(parentPoint, util.invertTransform(object.calcOwnMatrix()));
  const old = object.scientificBrush.points[index];
  if (Math.hypot(old.x - local.x, old.y - local.y) < 0.01) return false;
  const points = object.scientificBrush.points.map((p, i) =>
    i === index ? { x: local.x, y: local.y } : { ...p }
  );
  try {
    updateBrushObject(object, { ...object.scientificBrush, points });
    return true;
  } catch {
    // A zero-length or over-budget drag is rejected atomically; retain the last valid frame.
    return false;
  }
}
export function configureScientificControls(object: FabricObject) {
  if (!isScientificBrush(object)) return;
  const controls: Record<string, Control> = {
    mtr: object.controls.mtr ?? new Group().controls.mtr
  };
  object.scientificBrush.points.forEach((_, index) => {
    const action: TransformActionHandler = (_event, transform, x, y) =>
      moveBrushAnchor(transform.target, index, new Point(x, y));
    controls[`brushPoint${index}`] = new Control({
      actionName: "modifyPoly",
      cursorStyle: "crosshair",
      positionHandler: (_dimension, _matrix, target) => {
        if (!(target instanceof Group) || !isScientificBrush(target)) return new Point();
        const p = target.scientificBrush.points[index];
        return util.transformPoint(
          new Point(p),
          util.multiplyTransformMatrices(
            target.getViewportTransform(),
            target.calcTransformMatrix()
          )
        );
      },
      actionHandler: controlsUtils.wrapWithFireEvent("modifyPoly", action),
      render: controlsUtils.renderCircleControl,
      sizeX: 11,
      sizeY: 11,
      touchSizeX: 24,
      touchSizeY: 24
    });
  });
  object.controls = controls;
  object.set({ lockScalingX: true, lockScalingY: true });
  for (const key of Object.keys(controls)) object.setControlVisible(key, true);
  object.setCoords();
}
