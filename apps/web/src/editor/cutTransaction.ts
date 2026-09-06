import { Canvas, Group, type FabricObject } from "fabric";
import { sceneObjectEntries, type SceneObjectEntry } from "./sceneTree";

export type CutTransactionSceneParent = Canvas | Group;

export interface CutTransactionTarget {
  object: FabricObject;
  objectId: string;
  parent: CutTransactionSceneParent;
  index: number;
  path: FabricObject[];
  pathIds: string[];
  pathStates: string[];
}

export interface CutTransaction {
  owner: number;
  canvas: Canvas;
  documentId: string;
  generation: number;
  targets: CutTransactionTarget[];
}

function sceneObjectState(object: FabricObject, includeChildren: boolean): string | undefined {
  try {
    const serialized = object.toObject() as Record<string, unknown>;
    const state =
      !includeChildren && object instanceof Group
        ? (() => {
            const ownState = { ...serialized };
            delete ownState.objects;
            return ownState;
          })()
        : serialized;
    const serializedState = JSON.stringify(state);
    return typeof serializedState === "string" ? serializedState : undefined;
  } catch {
    return undefined;
  }
}

function targetSnapshot(
  entry: SceneObjectEntry,
  object: FabricObject
): CutTransactionTarget | undefined {
  if (entry.object !== object || !object.objectId) return undefined;
  const pathIds = entry.path.map((pathObject) => pathObject.objectId);
  if (pathIds.some((objectId): objectId is undefined => !objectId)) return undefined;
  const pathStates = entry.path.map((pathObject) =>
    sceneObjectState(pathObject, pathObject === object)
  );
  if (pathStates.some((state): state is undefined => !state)) return undefined;
  return {
    object,
    objectId: object.objectId,
    parent: entry.parent,
    index: entry.index,
    path: [...entry.path],
    pathIds: pathIds as string[],
    pathStates: pathStates as string[]
  };
}

/** Capture the exact persisted scene targets an asynchronous clipboard operation owns. */
export function captureCutTransaction({
  owner,
  canvas,
  documentId,
  generation,
  targets
}: {
  owner: number;
  canvas: Canvas;
  documentId: string;
  generation: number;
  targets: readonly FabricObject[];
}): CutTransaction | undefined {
  const entries = sceneObjectEntries(canvas);
  const snapshots = targets.map((object) => {
    const entry = entries.find((candidate) => candidate.object === object);
    return entry ? targetSnapshot(entry, object) : undefined;
  });
  if (snapshots.some((snapshot): snapshot is undefined => !snapshot)) return undefined;
  const uniqueIds = new Set(snapshots.map((snapshot) => snapshot!.objectId));
  if (uniqueIds.size !== snapshots.length) return undefined;
  return {
    owner,
    canvas,
    documentId,
    generation,
    targets: snapshots as CutTransactionTarget[]
  };
}

function sameReferences(left: readonly FabricObject[], right: readonly FabricObject[]): boolean {
  return left.length === right.length && left.every((object, index) => object === right[index]);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function targetIsUnchanged(
  entries: readonly SceneObjectEntry[],
  target: CutTransactionTarget,
  stateCache: Map<FabricObject, { includeChildren: boolean; state: string | undefined }>
): boolean {
  const entry = entries.find((candidate) => candidate.object === target.object);
  if (!entry || entry.object.objectId !== target.objectId) return false;
  if (entry.parent !== target.parent) return false;
  if (!sameReferences(entry.path, target.path)) return false;
  if (
    !sameStrings(
      entry.path.map((object) => object.objectId ?? ""),
      target.pathIds
    )
  )
    return false;
  const currentStates = entry.path.map((object) => {
    const includeChildren = object === target.object;
    const cached = stateCache.get(object);
    if (!cached || cached.includeChildren !== includeChildren) {
      stateCache.set(object, {
        includeChildren,
        state: sceneObjectState(object, includeChildren)
      });
    }
    return stateCache.get(object)?.state;
  });
  return (
    currentStates.every((state): state is string => Boolean(state)) &&
    sameStrings(currentStates as string[], target.pathStates)
  );
}

function capturedSiblingOrderIsUnchanged(
  entries: readonly SceneObjectEntry[],
  targets: readonly CutTransactionTarget[]
): boolean {
  const entriesByObject = new Map(entries.map((entry) => [entry.object, entry]));
  for (let leftIndex = 0; leftIndex < targets.length; leftIndex += 1) {
    const left = targets[leftIndex];
    const leftEntry = entriesByObject.get(left.object);
    if (!leftEntry) return false;
    for (let rightIndex = leftIndex + 1; rightIndex < targets.length; rightIndex += 1) {
      const right = targets[rightIndex];
      if (left.parent !== right.parent) continue;
      const rightEntry = entriesByObject.get(right.object);
      if (!rightEntry) return false;
      if (left.index < right.index !== leftEntry.index < rightEntry.index) return false;
    }
  }
  return true;
}

/** Validate the original document and every captured target immediately before a cut delete. */
export function isCutTransactionValid(
  transaction: CutTransaction,
  current: { canvas: Canvas | null; documentId: string; generation: number }
): boolean {
  if (
    transaction.canvas !== current.canvas ||
    transaction.documentId !== current.documentId ||
    transaction.generation !== current.generation ||
    !current.canvas
  ) {
    return false;
  }
  const entries = sceneObjectEntries(current.canvas);
  const stateCache = new Map<
    FabricObject,
    { includeChildren: boolean; state: string | undefined }
  >();
  return (
    transaction.targets.every((target) => targetIsUnchanged(entries, target, stateCache)) &&
    capturedSiblingOrderIsUnchanged(entries, transaction.targets)
  );
}
