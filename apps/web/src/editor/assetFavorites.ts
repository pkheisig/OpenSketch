import { loadStringList, saveStringList } from "@/editor/stringListStorage";

export const ASSET_FAVORITES_STORAGE_KEY = "OpenSketch:favorites";
export const ASSET_FAVORITES_CHANGED_EVENT = "opensketch:asset-favorites-changed";

export function loadAssetFavorites(): Set<string> {
  return new Set(loadStringList(ASSET_FAVORITES_STORAGE_KEY));
}

export function saveAssetFavorites(values: Iterable<string>): void {
  saveStringList(ASSET_FAVORITES_STORAGE_KEY, [...new Set(values)]);
  window.dispatchEvent(new Event(ASSET_FAVORITES_CHANGED_EVENT));
}

export function toggleAssetFavorite(familyId: string): boolean {
  const next = loadAssetFavorites();
  const isFavorite = !next.has(familyId);
  if (isFavorite) next.add(familyId);
  else next.delete(familyId);
  saveAssetFavorites(next);
  return isFavorite;
}
