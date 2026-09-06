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

function sceneObjectState(object: FabricObject): string | undefined {
  try {
    const state = JSON.stringify(object.toObject());
    return typeof state === "string" ? state : undefined;
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
  const pathStates = entry.path.map(sceneObjectState);
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
  target: CutTransactionTarget
): boolean {
  const entry = entries.find((candidate) => candidate.object === target.object);
  if (!entry || entry.object.objectId !== target.objectId) return false;
  if (entry.parent !== target.parent || entry.index !== target.index) return false;
  if (!sameReferences(entry.path, target.path)) return false;
  if (
    !sameStrings(
      entry.path.map((object) => object.objectId ?? ""),
      target.pathIds
    )
  )
    return false;
  const currentStates = entry.path.map(sceneObjectState);
  return (
    currentStates.every((state): state is string => Boolean(state)) &&
    sameStrings(currentStates as string[], target.pathStates)
  );
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
  return transaction.targets.every((target) => targetIsUnchanged(entries, target));
}
