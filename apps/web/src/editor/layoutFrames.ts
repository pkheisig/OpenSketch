import { Canvas, FabricObject, Group, Point, util } from "fabric";
import {
  layoutFrame,
  type LayoutFrame,
  type LayoutResolution,
  type LayoutBounds,
  type LayoutChildGeometry
} from "@workspace/editor-core";
import { sceneObjectIndex } from "./sceneTree";

const MIN_GEOMETRY = 0.000001;

function isGroup(object: FabricObject | undefined): object is Group {
  return object instanceof Group;
}

function boundsOf(object: FabricObject): LayoutBounds {
  const bounds = object.getBoundingRect();
  return {
    left: bounds.left,
    top: bounds.top,
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height)
  };
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

function deltaInParentPlane(object: FabricObject, dx: number, dy: number): Point {
  const parent = object.group;
  if (!isGroup(parent)) return new Point(dx, dy);
  return util.sendVectorToPlane(new Point(dx, dy), undefined, parent.calcTransformMatrix());
}

function applyBounds(object: FabricObject, target: LayoutBounds): void {
  const before = boundsOf(object);
  const scaleX = before.width > MIN_GEOMETRY ? target.width / before.width : 1;
  const scaleY = before.height > MIN_GEOMETRY ? target.height / before.height : 1;
  if (Number.isFinite(scaleX) && scaleX > 0 && before.width > MIN_GEOMETRY) {
    object.scaleX = (object.scaleX ?? 1) * scaleX;
  }
  if (Number.isFinite(scaleY) && scaleY > 0 && before.height > MIN_GEOMETRY) {
    object.scaleY = (object.scaleY ?? 1) * scaleY;
  }
  object.setCoords();
  const after = boundsOf(object);
  const delta = deltaInParentPlane(
    object,
    target.left + target.width / 2 - (after.left + after.width / 2),
    target.top + target.height / 2 - (after.top + after.height / 2)
  );
  object.set({ left: (object.left ?? 0) + delta.x, top: (object.top ?? 0) + delta.y });
  object.setCoords();
  refreshParentGroups(object);
}

export function layoutFrameOnCanvas(canvas: Canvas, frame: LayoutFrame): LayoutResolution {
  const index = sceneObjectIndex(canvas);
  const children: LayoutChildGeometry[] = frame.children.map((child) => {
    const object = index.get(child.objectId);
    if (!object)
      throw new Error(`Layout frame "${frame.id}" references missing object "${child.objectId}".`);
    return { objectId: child.objectId, bounds: boundsOf(object) };
  });
  return layoutFrame(frame, children);
}

export function applyLayoutFrameToCanvas(
  canvas: Canvas,
  frame: LayoutFrame
): { resolution: LayoutResolution; changedObjectIds: string[] } {
  const resolution = layoutFrameOnCanvas(canvas, frame);
  const index = sceneObjectIndex(canvas);
  resolution.children.forEach((child) => {
    const object = index.get(child.objectId);
    if (!object)
      throw new Error(`Layout frame "${frame.id}" references missing object "${child.objectId}".`);
    applyBounds(object, child.bounds);
  });
  canvas.requestRenderAll();
  return {
    resolution,
    changedObjectIds: resolution.children.map((child) => child.objectId)
  };
}
