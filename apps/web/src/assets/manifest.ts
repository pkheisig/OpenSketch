import { ASSET_CATEGORY_ORDER, type AssetManifest } from "@workspace/editor-core";
import { SCIENTIFIC_STRUCTURE_FAMILIES } from "./scientificStructures";
import generatedArtwork from "../generated/opensketch-generated-manifest.json";
import manifest from "../generated/nih-bioart-manifest.json";
import openAssetsManifest from "../generated/open-assets-manifest.json";
import { TOP_VIEW_LABWARE_FAMILIES } from "./labware";

export function resolveBundledAssetPath(path: string, baseUrl = import.meta.env.BASE_URL): string {
  if (/^(?:data:|blob:|https?:)/i.test(path)) return path;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

const resolveFamily = (family: AssetManifest["families"][number]) => ({
  ...family,
  variants: family.variants.map((variant) => ({
    ...variant,
    assetPath: resolveBundledAssetPath(variant.assetPath),
    thumbnailPath: resolveBundledAssetPath(variant.thumbnailPath)
  }))
});

/** The UI and new insertions expose only our current collection. */
export const assetManifest: AssetManifest = {
  version: 1,
  generatedAt: generatedArtwork.generatedAt,
  source: "OpenSketch generated and OpenSketch structures",
  families: [...SCIENTIFIC_STRUCTURE_FAMILIES, ...(generatedArtwork as AssetManifest).families].map(
    resolveFamily
  )
};

/** Retained solely for resolving assets already referenced by older figures. */
export const bundledAssetManifest: AssetManifest = {
  ...assetManifest,
  families: [
    ...assetManifest.families,
    ...[
      ...TOP_VIEW_LABWARE_FAMILIES,
      ...(openAssetsManifest as AssetManifest).families,
      ...(manifest as AssetManifest).families
    ].map(resolveFamily)
  ]
};

export const ASSET_OFFLINE_PACK_VERSION = [
  "opensketch-only-v2",
  SCIENTIFIC_STRUCTURE_FAMILIES.length,
  generatedArtwork.sourceCommit,
  (manifest as AssetManifest).generatedAt,
  (openAssetsManifest as AssetManifest).generatedAt,
  TOP_VIEW_LABWARE_FAMILIES.reduce((total, family) => total + family.variants.length, 0)
].join(":");
export const ASSET_PREVIEW_CACHE_VERSION = ASSET_OFFLINE_PACK_VERSION;
export const ASSET_CATEGORIES = ["All", ...ASSET_CATEGORY_ORDER];
