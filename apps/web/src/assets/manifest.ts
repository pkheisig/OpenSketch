import type { AssetManifest } from "@opensketch/editor-core";
import manifest from "../generated/nih-bioart-manifest.json";

export const assetManifest = manifest as AssetManifest;
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
