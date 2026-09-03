import { ActiveSelection, Canvas, Group, type FabricObject, util } from "fabric";

export type SceneCollection = Canvas | Group;

export interface SceneObjectEntry {
  object: FabricObject;
  parent: SceneCollection;
  index: number;
  path: FabricObject[];
}

function isGroup(value: FabricObject): value is Group {
  return value instanceof Group && !(value instanceof ActiveSelection);
}

/** Visit every persisted object below the supplied roots, including group children. */
export function visitSceneObjects(
  objects: FabricObject | readonly FabricObject[],
  visit: (object: FabricObject, path: FabricObject[]) => void
): void {
  const roots = Array.isArray(objects) ? objects : [objects];
  const walk = (object: FabricObject, path: FabricObject[]): void => {
    visit(object, path);
    if (isGroup(object)) {
      object.getObjects().forEach((child) => walk(child, [...path, child]));
    }
  };
  roots.forEach((object) => walk(object, [object]));
}

/** Return a stable, recursive view of the actual canvas layer hierarchy. */
export function sceneObjectEntries(canvas: Canvas): SceneObjectEntry[] {
  const entries: SceneObjectEntry[] = [];
  const walk = (objects: FabricObject[], parent: SceneCollection, parentPath: FabricObject[]) => {
    objects.forEach((object, index) => {
      const path = [...parentPath, object];
      entries.push({ object, parent, index, path });
      if (isGroup(object)) walk(object.getObjects(), object, path);
    });
  };
  walk(canvas.getObjects(), canvas, []);
  return entries;
}

export function sceneObjectIndex(canvas: Canvas): Map<string, FabricObject> {
  const byId = new Map<string, FabricObject>();
  for (const { object } of sceneObjectEntries(canvas)) {
    if (object.objectId) byId.set(object.objectId, object);
  }
  return byId;
}

/** Fail at the persistence boundary if identity has become ambiguous or missing. */
export function assertUniqueSceneObjectIds(canvas: Canvas): void {
  const byId = new Map<string, FabricObject>();
  for (const { object, path } of sceneObjectEntries(canvas)) {
    const objectId = object.objectId;
    if (!objectId) {
      throw new Error(`Scene object at depth ${path.length} has no objectId.`);
    }
    const previous = byId.get(objectId);
    if (previous) {
      throw new Error(`Scene object ID "${objectId}" is duplicated.`);
    }
    byId.set(objectId, object);
  }
}

export function isSceneDescendant(object: FabricObject, ancestor: FabricObject): boolean {
  if (object === ancestor) return true;
  const visited = new Set<FabricObject>();
  for (let current = object.group; current; current = current.group) {
    if (current === ancestor) return true;
    if (visited.has(current)) return false;
    visited.add(current);
  }
  return false;
}

/** Keep a replacement's world-space appearance when inserting it into a group. */
export function sendSceneObjectToParentPlane(object: FabricObject, parent: SceneCollection): void {
  if (parent instanceof Group) {
    util.sendObjectToPlane(object, undefined, parent.calcTransformMatrix());
  }
}

export function replaceSceneObject(entry: SceneObjectEntry, replacement: FabricObject): void {
  entry.parent.remove(entry.object);
  entry.parent.insertAt(Math.max(0, entry.index), replacement);
  if (entry.parent instanceof Group) {
    entry.parent.triggerLayout();
    entry.parent.dirty = true;
    entry.parent.setCoords();
  }
  replacement.setCoords();
}

export function removeSceneObject(entry: SceneObjectEntry): void {
  entry.parent.remove(entry.object);
  if (entry.parent instanceof Group) {
    entry.parent.triggerLayout();
    entry.parent.dirty = true;
    entry.parent.setCoords();
  }
}
