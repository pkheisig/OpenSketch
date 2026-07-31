import type { AssetManifest } from "@workspace/editor-core";
import manifest from "../generated/nih-bioart-manifest.json";
import openAssetsManifest from "../generated/open-assets-manifest.json";
import { TOP_VIEW_LABWARE_FAMILIES } from "./labware";

export function resolveBundledAssetPath(path: string, baseUrl = import.meta.env.BASE_URL): string {
  if (/^(?:data:|blob:|https?:)/i.test(path)) return path;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

export const assetManifest: AssetManifest = {
  ...(manifest as AssetManifest),
  source: `${(manifest as AssetManifest).source}, SciDraw, and Arcadia Science`,
  families: [
    ...TOP_VIEW_LABWARE_FAMILIES,
    ...(openAssetsManifest as AssetManifest).families,
    ...(manifest as AssetManifest).families
  ].map((family) => ({
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
  "Cells",
  "Proteins",
  "Molecules",
  "Nucleic acids & genetics",
  "Cellular processes",
  "Tissues & histology",
  "Equipment",
  "Techniques & assays",
  "Bacteria",
  "Viruses",
  "Parasites",
  "Fungi & protists",
  "Anatomy",
  "People",
  "Animals",
  "Arthropods",
  "Plants",
  "Food",
  "Symbols & diagrams",
  "Other"
];
