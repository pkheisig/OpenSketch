import type { FabricObject } from "fabric";
import type { ConnectorBinding } from "@workspace/editor-core";
import type { RecognizedGroup } from "@/editor/groupRecognition";
import { visitSceneObjects } from "@/editor/sceneTree";

function remapConnectorBinding(
  binding: ConnectorBinding,
  ids: Map<string, string>
): ConnectorBinding {
  // A clone owns only the IDs collected below. References to objects outside
  // the cloned roots are intentionally preserved as external bindings.
  return {
    ...binding,
    fromObjectId: ids.get(binding.fromObjectId) ?? binding.fromObjectId,
    toObjectId: ids.get(binding.toObjectId) ?? binding.toObjectId
  };
}

function remapStyleSnapshotIds(value: unknown, ids: Map<string, string>): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.connector && typeof snapshot.connector === "object") {
    snapshot.connector = remapConnectorBinding(snapshot.connector as ConnectorBinding, ids);
  }
  if (Array.isArray(snapshot.children)) {
    snapshot.children.forEach((child) => remapStyleSnapshotIds(child, ids));
  }
}

function remapRecognizedGroupIds(
  groups: RecognizedGroup[],
  objectIds: Map<string, string>,
  recognitionIds: Map<string, string>
): void {
  groups.forEach((group) => {
    group.objectId = recognitionIds.get(group.objectId) ?? group.objectId;
    group.memberObjectIds = group.memberObjectIds.map(
      (objectId) => objectIds.get(objectId) ?? objectId
    );
    const properties = group.properties;
    if (properties.connector && typeof properties.connector === "object") {
      properties.connector = remapConnectorBinding(
        properties.connector as ConnectorBinding,
        objectIds
      );
    }
    if (properties.freeConnectorBinding && typeof properties.freeConnectorBinding === "object") {
      properties.freeConnectorBinding = remapConnectorBinding(
        properties.freeConnectorBinding as ConnectorBinding,
        objectIds
      );
    }
    if (Array.isArray(properties.recognizedGroups)) {
      remapRecognizedGroupIds(properties.recognizedGroups, objectIds, recognitionIds);
    }
    if (properties.defaultElementStyle) {
      remapStyleSnapshotIds(properties.defaultElementStyle, objectIds);
    }
  });
}

export function assignFreshCloneIds(objects: FabricObject | FabricObject[]): void {
  const roots = Array.isArray(objects) ? objects : [objects];
  const ids = new Map<string, string>();
  const recognitionIds = new Map<string, string>();
  const usedIds = new Set<string>();
  const freshId = (): string => {
    let candidate = crypto.randomUUID();
    while (usedIds.has(candidate)) candidate = crypto.randomUUID();
    usedIds.add(candidate);
    return candidate;
  };
  const collectRecognizedGroupIds = (groups: RecognizedGroup[]) => {
    groups.forEach((group) => {
      if (!recognitionIds.has(group.objectId)) {
        recognitionIds.set(group.objectId, freshId());
      }
      if (Array.isArray(group.properties.recognizedGroups)) {
        collectRecognizedGroupIds(group.properties.recognizedGroups);
      }
    });
  };
  const sourceIds = new Set<string>();
  const recognizedGroups: RecognizedGroup[][] = [];
  const collect = (current: FabricObject) => {
    if (current.objectId) {
      if (sourceIds.has(current.objectId)) {
        throw new Error(
          `Cannot clone a scene subtree with duplicate object ID "${current.objectId}".`
        );
      }
      sourceIds.add(current.objectId);
    }
    if (current.recognizedGroups) recognizedGroups.push(current.recognizedGroups);
  };
  visitSceneObjects(roots, collect);
  sourceIds.forEach((id) => usedIds.add(id));
  recognizedGroups.forEach(collectRecognizedGroupIds);
  sourceIds.forEach((id) => ids.set(id, freshId()));
  const apply = (current: FabricObject) => {
    current.objectId = current.objectId ? (ids.get(current.objectId) ?? freshId()) : freshId();
    if (current.connector) {
      current.connector = remapConnectorBinding(current.connector, ids);
    }
    if (current.freeConnectorBinding) {
      current.freeConnectorBinding = remapConnectorBinding(current.freeConnectorBinding, ids);
    }
    if (current.recognizedGroups) {
      current.recognizedGroups = structuredClone(current.recognizedGroups);
      remapRecognizedGroupIds(current.recognizedGroups, ids, recognitionIds);
    }
    if (current.defaultElementStyle) {
      current.defaultElementStyle = structuredClone(current.defaultElementStyle);
      remapStyleSnapshotIds(current.defaultElementStyle, ids);
    }
    if (current.semanticMetadata) {
      current.semanticMetadata = structuredClone(current.semanticMetadata);
      current.semanticMetadata.allowedOverlapObjectIds =
        current.semanticMetadata.allowedOverlapObjectIds?.map(
          (objectId) => ids.get(objectId) ?? objectId
        );
      current.semanticMetadata.relationIds = current.semanticMetadata.relationIds?.map(
        (relationId) => `${relationId}:clone:${current.objectId}`
      );
    }
    if (current.semanticRelations) {
      current.semanticRelations = structuredClone(current.semanticRelations).map((relation) => ({
        ...relation,
        id: `${relation.id}:clone:${current.objectId}`,
        sourceObjectId: ids.get(relation.sourceObjectId) ?? relation.sourceObjectId,
        targetObjectId: ids.get(relation.targetObjectId) ?? relation.targetObjectId,
        mediatorObjectIds: relation.mediatorObjectIds?.map(
          (objectId) => ids.get(objectId) ?? objectId
        )
      }));
    }
  };
  visitSceneObjects(roots, apply);
}
