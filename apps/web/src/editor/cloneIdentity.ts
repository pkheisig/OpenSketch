import { Group, type FabricObject } from "fabric";
import type { ConnectorBinding } from "@workspace/editor-core";
import type { RecognizedGroup } from "@/editor/groupRecognition";

function remapConnectorBinding(
  binding: ConnectorBinding,
  ids: Map<string, string>
): ConnectorBinding {
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
  const collectRecognizedGroupIds = (groups: RecognizedGroup[]) => {
    groups.forEach((group) => {
      if (!recognitionIds.has(group.objectId)) {
        recognitionIds.set(group.objectId, crypto.randomUUID());
      }
      if (Array.isArray(group.properties.recognizedGroups)) {
        collectRecognizedGroupIds(group.properties.recognizedGroups);
      }
    });
  };
  const collect = (current: FabricObject) => {
    if (current.objectId) ids.set(current.objectId, crypto.randomUUID());
    if (current.recognizedGroups) collectRecognizedGroupIds(current.recognizedGroups);
    if (current instanceof Group) current.getObjects().forEach(collect);
  };
  const apply = (current: FabricObject) => {
    current.objectId = current.objectId
      ? (ids.get(current.objectId) ?? crypto.randomUUID())
      : crypto.randomUUID();
    if (current.connector) {
      current.connector = remapConnectorBinding(current.connector, ids);
    }
    if (current.freeConnectorBinding) {
      current.freeConnectorBinding = remapConnectorBinding(current.freeConnectorBinding, ids);
    }
    if (current.recognizedGroups) {
      remapRecognizedGroupIds(current.recognizedGroups, ids, recognitionIds);
    }
    if (current.defaultElementStyle) {
      remapStyleSnapshotIds(current.defaultElementStyle, ids);
    }
    if (current instanceof Group) current.getObjects().forEach(apply);
  };
  roots.forEach(collect);
  roots.forEach(apply);
}
