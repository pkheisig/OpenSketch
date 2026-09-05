import {
  Control,
  Group,
  Point,
  controlsUtils,
  util,
  type FabricObject,
  type TransformActionHandler
} from "fabric";
import { circularBrushGeometry } from "./geometry";
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
export function moveArcEnd(object: FabricObject, parentPoint: Point): boolean {
  if (!isScientificBrush(object) || object.scientificBrush.arcSweep === undefined) return false;
  const spec = object.scientificBrush,
    circle = circularBrushGeometry(spec);
  const local = util.transformPoint(parentPoint, util.invertTransform(object.calcOwnMatrix()));
  const angle = Math.atan2(local.y - spec.points[0].y, local.x - spec.points[0].x);
  let sweep = (((angle - circle.start) * 180) / Math.PI + 720) % 360;
  if (sweep < 3 || sweep > 357) sweep = 360;
  sweep = Math.max(1, Math.round(sweep));
  if (sweep === spec.arcSweep) return false;
  try {
    updateBrushObject(object, { ...spec, arcSweep: sweep, closed: sweep === 360 });
    return true;
  } catch {
    return false;
  }
}
export function configureScientificControls(object: FabricObject) {
  if (!isScientificBrush(object)) return;
  const controls: Record<string, Control> = {
    mtr: object.controls.mtr ?? new Group().controls.mtr
  };
  object.scientificBrush.points.forEach((_, index) => {
    if (object.scientificBrush.arcSweep !== undefined && index === 0) return;
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
  if (object.scientificBrush.arcSweep !== undefined) {
    controls.arcEnd = new Control({
      actionName: "modifyPoly",
      cursorStyle: "crosshair",
      positionHandler: (_dimension, _matrix, target) => {
        if (!(target instanceof Group) || !isScientificBrush(target)) return new Point();
        const circle = circularBrushGeometry(target.scientificBrush);
        const p = circle.position(1);
        if (target.scientificBrush.closed) {
          p.x += Math.cos(circle.start) * target.scientificBrush.unitSize * 2;
          p.y += Math.sin(circle.start) * target.scientificBrush.unitSize * 2;
        }
        return util.transformPoint(
          new Point(p),
          util.multiplyTransformMatrices(
            target.getViewportTransform(),
            target.calcTransformMatrix()
          )
        );
      },
      actionHandler: controlsUtils.wrapWithFireEvent("modifyPoly", (_event, transform, x, y) =>
        moveArcEnd(transform.target, new Point(x, y))
      ),
      render: controlsUtils.renderCircleControl,
      sizeX: 11,
      sizeY: 11,
      touchSizeX: 24,
      touchSizeY: 24
    });
  }
  object.controls = controls;
  object.set({ lockScalingX: true, lockScalingY: true });
  for (const key of Object.keys(controls)) object.setControlVisible(key, true);
  object.setCoords();
}
