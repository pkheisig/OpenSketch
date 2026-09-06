import { Canvas, FabricObject, Group, Point, util } from "fabric";
import {
  layoutFrame,
  LayoutResolutionError,
  type LayoutFrame,
  type LayoutResolution,
  type LayoutBounds,
  type LayoutChildGeometry
} from "@workspace/editor-core";
import { sceneObjectIndex } from "./sceneTree";

const MIN_GEOMETRY = 0.000001;

export interface LayoutFrameApplicationResult {
  resolution: LayoutResolution;
  changedObjectIds: string[];
}

function hasMeaningfulRotation(object: FabricObject): boolean {
  const transform = object.calcTransformMatrix();
  return Math.abs(transform[1]) > MIN_GEOMETRY || Math.abs(transform[2]) > MIN_GEOMETRY;
}

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

function applyBounds(object: FabricObject, target: LayoutBounds, objectId: string): void {
  if (target.width <= MIN_GEOMETRY || target.height <= MIN_GEOMETRY) {
    throw new LayoutResolutionError(
      `Layout frame child "${objectId}" resolved to a zero-sized bound.`
    );
  }
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
    if (hasMeaningfulRotation(object)) {
      throw new Error(
        `Layout frame "${frame.id}" cannot resize rotated child "${child.objectId}"; reset its rotation first.`
      );
    }
    return { objectId: child.objectId, bounds: boundsOf(object) };
  });
  return layoutFrame(frame, children);
}

export function applyLayoutFrameToCanvas(
  canvas: Canvas,
  frame: LayoutFrame
): LayoutFrameApplicationResult {
  const resolution = layoutFrameOnCanvas(canvas, frame);
  const invalidCellDiagnostics = resolution.diagnostics.filter(
    (diagnostic) => diagnostic.code === "INVALID_CELL"
  );
  if (invalidCellDiagnostics.length > 0) {
    throw new LayoutResolutionError(
      `Layout frame "${frame.id}" contains invalid cell placement.`,
      invalidCellDiagnostics
    );
  }
  const invalidBounds = resolution.children.filter(
    ({ bounds }) =>
      !Number.isFinite(bounds.left) ||
      !Number.isFinite(bounds.top) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width <= MIN_GEOMETRY ||
      bounds.height <= MIN_GEOMETRY
  );
  if (invalidBounds.length > 0) {
    const first = invalidBounds[0]!;
    throw new LayoutResolutionError(
      `Layout frame "${frame.id}" resolved child "${first.objectId}" to an invalid bound.`,
      resolution.diagnostics
    );
  }
  const index = sceneObjectIndex(canvas);
  resolution.children.forEach((child) => {
    const object = index.get(child.objectId);
    if (!object)
      throw new Error(`Layout frame "${frame.id}" references missing object "${child.objectId}".`);
    applyBounds(object, child.bounds, child.objectId);
  });
  canvas.requestRenderAll();
  return {
    resolution,
    changedObjectIds: resolution.children.map((child) => child.objectId)
  };
}
