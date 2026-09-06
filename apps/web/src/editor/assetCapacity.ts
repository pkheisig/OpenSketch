import { Group, type FabricObject } from "fabric";
import { PORTABLE_PROJECT_LIMITS } from "@workspace/editor-core";

function objectCount(
  objects: NonNullable<FabricObject["clipPath"]>[],
  replacing?: FabricObject
): number {
  return objects.reduce(
    (count, object) =>
      count +
      (object === replacing
        ? 0
        : 1 +
          (object instanceof Group ? objectCount(object.getObjects(), replacing) : 0) +
          (object.clipPath ? objectCount([object.clipPath], replacing) : 0)),
    0
  );
}
/** Reject an asset before insertion if its serialized scene would not reopen. */
export function assertAssetCapacity(
  existing: FabricObject[],
  incoming: FabricObject,
  replacing?: FabricObject
): void {
  if (
    objectCount(existing, replacing) + objectCount([incoming]) >
    PORTABLE_PROJECT_LIMITS.maxSceneObjects
  ) {
    throw new Error(
      "This asset would exceed the figure's editable-object limit. Remove some objects or use a simpler structure before inserting it."
    );
  }
}
