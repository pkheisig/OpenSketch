import {
  ASSET_CATEGORY_ORDER,
  assertUniqueAssetCatalog,
  assetStyleOf,
  enrichAssetKeywords,
  type AssetManifest
} from "@workspace/editor-core";
import { SCIENTIFIC_STRUCTURE_FAMILIES, FIXED_MEMBRANE_FAMILIES } from "./scientificStructures";
import { SIMPLIFIED_SCIENTIFIC_VARIANTS } from "./simplifiedScientificAssets";
import generatedArtwork from "../generated/opensketch-generated-manifest.json";

export function resolveBundledAssetPath(
  path: string,
  baseUrl = import.meta.env?.BASE_URL ?? "/"
): string {
  if (/^(?:data:|blob:|https?:)/i.test(path)) return path;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

const resolveFamily = (family: AssetManifest["families"][number]) => ({
  ...family,
  keywords: enrichAssetKeywords(family),
  variants: family.variants.map((variant) => ({
    ...variant,
    style: assetStyleOf(variant),
    assetPath: resolveBundledAssetPath(variant.assetPath),
    thumbnailPath: resolveBundledAssetPath(variant.thumbnailPath)
  }))
});

function addSimplifiedVariants(
  family: AssetManifest["families"][number]
): AssetManifest["families"][number] {
  const simplified = SIMPLIFIED_SCIENTIFIC_VARIANTS[family.familyId];
  return simplified ? { ...family, variants: [...family.variants, simplified] } : family;
}

/** The UI and new insertions expose only our current collection. */
export const assetManifest: AssetManifest = {
  version: 1,
  generatedAt: generatedArtwork.generatedAt,
  source: "OpenSketch generated and OpenSketch structures",
  families: [
    ...SCIENTIFIC_STRUCTURE_FAMILIES,
    ...FIXED_MEMBRANE_FAMILIES,
    ...(generatedArtwork as AssetManifest).families
  ]
    .map(addSimplifiedVariants)
    .map(resolveFamily)
};

assertUniqueAssetCatalog(assetManifest.families);

/** The bundled catalog contains only the current OpenSketch collection. */
export const bundledAssetManifest = assetManifest;
export const ASSET_OFFLINE_PACK_VERSION = [
  "opensketch-curated-v1",
  SCIENTIFIC_STRUCTURE_FAMILIES.length,
  generatedArtwork.sourceCommit,
  Object.values(SIMPLIFIED_SCIENTIFIC_VARIANTS)
    .map((variant) => `${variant.id}:${variant.localSha256 ?? ""}`)
    .join(",")
].join(":");
export const ASSET_PREVIEW_CACHE_VERSION = ASSET_OFFLINE_PACK_VERSION;
export const ASSET_CATEGORIES = ["All", ...ASSET_CATEGORY_ORDER];
