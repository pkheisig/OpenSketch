import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SVG_DIR = path.join(ROOT, "apps/web/public/assets/nih-bioart");
export const THUMB_DIR = path.join(ROOT, "apps/web/public/assets/nih-bioart-thumbnails");
export const MANIFEST_PATH = path.join(ROOT, "apps/web/src/generated/nih-bioart-manifest.json");
export const LOCK_PATH = path.join(ROOT, "data/source-lock.json");
export const ERROR_PATH = path.join(ROOT, "data/import-errors.json");
export const OVERRIDES_PATH = path.join(ROOT, "data/asset-overrides.json");
export const TAXONOMY_PATH = path.join(ROOT, "data/taxonomy.json");
