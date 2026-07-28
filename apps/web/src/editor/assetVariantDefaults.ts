const STORAGE_KEY = "OpenSketch:asset-variant-defaults";

export const ASSET_VARIANT_DEFAULTS_CHANGED_EVENT = "OpenSketch:asset-variant-defaults-changed";

export type AssetVariantDefaults = Record<string, string>;

export function loadAssetVariantDefaults(): AssetVariantDefaults {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
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

export function saveAssetVariantDefault(familyId: string, variantId: string): void {
  const next = {
    ...loadAssetVariantDefaults(),
    [familyId]: variantId
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(ASSET_VARIANT_DEFAULTS_CHANGED_EVENT));
}
