import { Group, type FabricObject } from "fabric";
import { PORTABLE_PROJECT_LIMITS } from "@workspace/editor-core";

function objectCount(objects: NonNullable<FabricObject["clipPath"]>[]): number {
  return objects.reduce(
    (count, object) =>
      count +
      1 +
      (object instanceof Group ? objectCount(object.getObjects()) : 0) +
      (object.clipPath ? objectCount([object.clipPath]) : 0),
    0
  );
}
/** Reject an asset before insertion if its serialized scene would not reopen. */
export function assertAssetCapacity(existing: FabricObject[], incoming: FabricObject): void {
  if (objectCount(existing) + objectCount([incoming]) > PORTABLE_PROJECT_LIMITS.maxSceneObjects) {
    throw new Error(
      "This asset would exceed the figure's editable-object limit. Remove some objects or use a simpler structure before inserting it."
    );
  }
}
