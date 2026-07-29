import { ActiveSelection, Group, type FabricObject } from "fabric";

const ATOMIC_SVG_TYPES = new Set(["nih-asset", "import", "upload"]);

export function isManualGroup(object: FabricObject | undefined): object is Group {
  return (
    object instanceof Group &&
    !(object instanceof ActiveSelection) &&
    object.OpenSketchType === "group"
  );
}

export function isAtomicSvgAsset(object: FabricObject | undefined): object is Group {
  return object instanceof Group && ATOMIC_SVG_TYPES.has(object.OpenSketchType ?? "");
}
