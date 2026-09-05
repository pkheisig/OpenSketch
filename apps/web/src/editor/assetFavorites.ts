import { loadStringList, saveStringList } from "@/editor/stringListStorage";
import type { StringListStorage } from "@/editor/stringListStorage";

export const ASSET_FAVORITES_STORAGE_KEY = "OpenSketch:favorites";
export const ASSET_FAVORITES_CHANGED_EVENT = "opensketch:asset-favorites-changed";

export function loadAssetFavorites(storage?: StringListStorage): Set<string> {
  return new Set(loadStringList(ASSET_FAVORITES_STORAGE_KEY, storage));
}

export function saveAssetFavorites(values: Iterable<string>, storage?: StringListStorage): void {
  saveStringList(ASSET_FAVORITES_STORAGE_KEY, [...new Set(values)], storage);
  window.dispatchEvent(new Event(ASSET_FAVORITES_CHANGED_EVENT));
}

export function toggleAssetFavorite(familyId: string, storage?: StringListStorage): boolean {
  const next = loadAssetFavorites(storage);
  const isFavorite = !next.has(familyId);
  if (isFavorite) next.add(familyId);
  else next.delete(familyId);
  saveAssetFavorites(next, storage);
  return isFavorite;
}
