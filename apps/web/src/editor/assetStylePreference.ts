import { isAssetStyle, type AssetStyle } from "@workspace/editor-core";
import type { StringListStorage } from "@/editor/stringListStorage";

export const ASSET_STYLE_STORAGE_KEY = "OpenSketch:asset-style";
export const ASSET_STYLE_CHANGED_EVENT = "OpenSketch:asset-style-changed";

export function loadAssetStyle(storage: StringListStorage = localStorage): AssetStyle {
  try {
    const value = JSON.parse(storage.getItem(ASSET_STYLE_STORAGE_KEY) ?? "null");
    return isAssetStyle(value) ? value : "detailed";
  } catch {
    return "detailed";
  }
}

export function saveAssetStyle(style: AssetStyle, storage: StringListStorage = localStorage): void {
  storage.setItem(ASSET_STYLE_STORAGE_KEY, JSON.stringify(style));
  window.dispatchEvent(new CustomEvent(ASSET_STYLE_CHANGED_EVENT));
}
