import { ActiveSelection, Group, type Canvas, type FabricObject } from "fabric";

const ATOMIC_SVG_TYPES = new Set(["nih-asset", "import", "upload"]);

export function isManualGroup(object: FabricObject | undefined): object is Group {
  return (
    object instanceof Group &&
    !(object instanceof ActiveSelection) &&
    object.OpenSketchType === "group"
  );
}

/**
 * Returns the real parent group for an object. Fabric temporarily exposes an
 * ActiveSelection through `group` while several objects are selected, but that
 * wrapper is not part of the persisted layer hierarchy.
 */
export function directNestedParent(object: FabricObject | undefined): Group | null {
  const parent = object?.parent;
  if (parent instanceof Group && !(parent instanceof ActiveSelection)) return parent;

  const group = object?.group;
  return group instanceof Group && !(group instanceof ActiveSelection) ? group : null;
}

/**
 * Resolves the collection whose stack actually owns an object. A manual group
 * is one layer in its parent collection; its children are ordered only inside
 * that group. ActiveSelection is deliberately ignored because it is a
 * temporary editing wrapper and must never become a layer hierarchy level.
 */
export function layerCollectionForObject(object: FabricObject | undefined, canvas: Canvas) {
  return directNestedParent(object) ?? canvas;
}

export type ArrangeAction = "front" | "forward" | "backward" | "back";

export function arrangeObjects(
  objects: FabricObject[],
  canvas: Canvas,
  action: ArrangeAction
): void {
  for (const object of objects) {
    const collection = layerCollectionForObject(object, canvas);
    if (action === "front") collection.bringObjectToFront(object);
    if (action === "forward") collection.bringObjectForward(object);
    if (action === "backward") collection.sendObjectBackwards(object);
    if (action === "back") collection.sendObjectToBack(object);
    if (collection instanceof Group) {
      collection.dirty = true;
      collection.triggerLayout();
    }
  }
}

export function isAtomicSvgAsset(object: FabricObject | undefined): object is Group {
  return object instanceof Group && ATOMIC_SVG_TYPES.has(object.OpenSketchType ?? "");
}
