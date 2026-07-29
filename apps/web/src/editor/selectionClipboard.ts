import { type FabricObject, util } from "fabric";

export type SelectionClipboardFormat = "png" | "svg";
export const SELECTION_CLIPBOARD_MARKER_PREFIX = "OpenSketch selection:";

async function detachedSceneClone(object: FabricObject): Promise<FabricObject> {
  const clone = await object.clone();
  util.applyTransformToObject(clone, object.calcTransformMatrix());
  clone.group = undefined;
  clone.setCoords();
  return clone;
}

function pngMultiplier(object: FabricObject): number {
  const bounds = object.getBoundingRect();
  const largestEdge = Math.max(bounds.width, bounds.height, 1);
  return Math.max(2, Math.min(4, 2048 / largestEdge));
}

export async function selectionPngBlob(object: FabricObject): Promise<Blob> {
  const clone = await detachedSceneClone(object);
  const blob = await clone.toBlob({
    format: "png",
    multiplier: pngMultiplier(clone),
    enableRetinaScaling: false
  });
  if (!blob) throw new Error("Could not render the selected object as PNG.");
  return blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
}

export async function selectionSvgSource(object: FabricObject): Promise<string> {
  const clone = await detachedSceneClone(object);
  const bounds = clone.getBoundingRect();
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bounds.left} ${bounds.top} ${width} ${height}">`,
    clone.toSVG(),
    "</svg>"
  ].join("");
}

export function writeSelectionToSystemClipboard(
  object: FabricObject,
  format: SelectionClipboardFormat,
  marker: string
): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return Promise.reject(new Error("The system clipboard is unavailable in this browser."));
  }

  const png = selectionPngBlob(object);
  if (format === "png") {
    return navigator.clipboard.write([
      new ClipboardItem({
        "image/png": png,
        "text/plain": Promise.resolve(new Blob([marker], { type: "text/plain" }))
      })
    ]);
  }

  const svg = selectionSvgSource(object).then((source) =>
    source.replace("<svg ", `<svg data-opensketch-selection="${marker}" `)
  );
  const data: Record<string, Promise<Blob>> = {
    "image/png": png,
    "text/html": svg.then((source) => new Blob([source], { type: "text/html" })),
    "text/plain": svg.then((source) => new Blob([source], { type: "text/plain" }))
  };
  if (typeof ClipboardItem.supports !== "function" || ClipboardItem.supports("image/svg+xml")) {
    data["image/svg+xml"] = svg.then((source) => new Blob([source], { type: "image/svg+xml" }));
  }
  return navigator.clipboard.write([new ClipboardItem(data)]);
}
