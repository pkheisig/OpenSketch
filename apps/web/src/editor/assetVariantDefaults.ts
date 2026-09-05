import type { StringListStorage } from "@/editor/stringListStorage";

const STORAGE_KEY = "OpenSketch:asset-variant-defaults";

export const ASSET_VARIANT_DEFAULTS_CHANGED_EVENT = "OpenSketch:asset-variant-defaults-changed";

export type AssetVariantDefaults = Record<string, string>;

export function loadAssetVariantDefaults(
  storage: StringListStorage = localStorage
): AssetVariantDefaults {
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

export function saveAssetVariantDefault(
  familyId: string,
  variantId: string,
  storage: StringListStorage = localStorage
): void {
  const next = {
    ...loadAssetVariantDefaults(storage),
    [familyId]: variantId
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(ASSET_VARIANT_DEFAULTS_CHANGED_EVENT));
}
