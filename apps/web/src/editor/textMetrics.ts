import { FabricObject, Group, Text, cache } from "fabric";

export function refreshTextMetrics(objects: FabricObject[]): void {
  cache.clearFontCache();
  const visit = (object: FabricObject) => {
    if (object instanceof Text) {
      object.initDimensions();
      object.dirty = true;
      object.setCoords();
    }
    if (object instanceof Group) {
      object.getObjects().forEach(visit);
      object.triggerLayout();
    }
  };
  objects.forEach(visit);
}
