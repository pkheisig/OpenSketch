import type { AssetManifest } from "@workspace/editor-core";
import manifest from "../generated/nih-bioart-manifest.json";

export function resolveBundledAssetPath(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

export const assetManifest: AssetManifest = {
  ...(manifest as AssetManifest),
  families: (manifest as AssetManifest).families.map((family) => ({
    ...family,
    variants: family.variants.map((variant) => ({
      ...variant,
      assetPath: resolveBundledAssetPath(variant.assetPath),
      thumbnailPath: resolveBundledAssetPath(variant.thumbnailPath)
    }))
  }))
};
export const ASSET_CATEGORIES = [
  "All",
  "Anatomy",
  "Animals",
  "Arthropods",
  "Bacteria",
  "Cells and organelles",
  "Cellular processes",
  "Equipment",
  "Molecules",
  "People",
  "Plants",
  "Proteins",
  "Shapes and arrows",
  "Viruses",
  "Other"
];
