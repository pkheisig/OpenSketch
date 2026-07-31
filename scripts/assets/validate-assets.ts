import { basename, join } from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import sharp from "sharp";
import type { AssetManifest } from "../../packages/editor-core/src/types";
import { readJson, sha256 } from "./io";
import { LOCK_PATH, MANIFEST_PATH, SVG_DIR, TAXONOMY_PATH, THUMB_DIR } from "./paths";
import { ROOT } from "./paths";
import { assertSafeSvg } from "./sanitize-svg";
import { taxonomyIndex, type AssetTaxonomy } from "./taxonomy";
import type { SourceLock } from "./types";

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const [manifest, lock, taxonomy] = await Promise.all([
    readJson<AssetManifest>(MANIFEST_PATH),
    readJson<SourceLock>(LOCK_PATH),
    readJson<AssetTaxonomy>(TAXONOMY_PATH)
  ]);
  const errors: string[] = [];
  const ids = new Set<string>();
  const familyIds = new Set<number>();
  const lockById = new Map(Object.values(lock.files).map((entry) => [entry.assetId, entry]));
  let categoryByEntry = new Map<number, string>();
  try {
    categoryByEntry = taxonomyIndex(taxonomy);
  } catch (error) {
    errors.push(`Taxonomy is invalid: ${String(error)}`);
  }
  if (lock.sanitizerVersion !== 3) {
    errors.push(`source-lock.json uses sanitizer pipeline ${lock.sanitizerVersion}; expected 3.`);
  }
  if (manifest.families.length === 0 || Object.keys(lock.files).length === 0) {
    errors.push("The NIH BioArt collection is empty; run pnpm assets:sync.");
  }

  for (const family of manifest.families) {
    familyIds.add(family.bioartEntryId);
    const reviewedCategory = categoryByEntry.get(family.bioartEntryId);
    if (!reviewedCategory) {
      errors.push(`${family.familyId}: no reviewed taxonomy assignment.`);
    } else if (family.category !== reviewedCategory) {
      errors.push(
        `${family.familyId}: manifest category ${family.category} differs from reviewed category ${reviewedCategory}.`
      );
    }
    if (!(family.sourcePage || family.commonsPage) || !family.nihSourcePage) {
      errors.push(`${family.familyId}: source URLs are missing.`);
    }
    if (family.license !== "Public Domain") {
      errors.push(`${family.familyId}: license is not explicitly Public Domain.`);
    }
    if (!family.variants.some((variant) => variant.id === family.defaultVariantId)) {
      errors.push(`${family.familyId}: default variant does not exist.`);
    }
    for (const variant of family.variants) {
      if (ids.has(variant.id)) errors.push(`${variant.id}: duplicate asset ID.`);
      ids.add(variant.id);
      const svgPath = join(SVG_DIR, basename(variant.assetPath));
      const thumbnailPath = join(THUMB_DIR, basename(variant.thumbnailPath));
      if (!(await exists(svgPath))) errors.push(`${variant.id}: SVG is missing.`);
      if (!(await exists(thumbnailPath))) errors.push(`${variant.id}: thumbnail is missing.`);
      if (await exists(thumbnailPath)) {
        try {
          const thumbnail = await sharp(thumbnailPath).metadata();
          if (thumbnail.format !== "webp") {
            errors.push(`${variant.id}: thumbnail is not WebP.`);
          }
          if (
            !thumbnail.width ||
            !thumbnail.height ||
            thumbnail.width > 256 ||
            thumbnail.height > 256
          ) {
            errors.push(`${variant.id}: thumbnail exceeds 256 x 256 pixels.`);
          }
          if (!thumbnail.hasAlpha) {
            errors.push(`${variant.id}: thumbnail has no alpha channel.`);
          }
        } catch (error) {
          errors.push(`${variant.id}: thumbnail cannot be decoded: ${String(error)}`);
        }
      }
      if (await exists(svgPath)) {
        try {
          const source = await readFile(svgPath, "utf8");
          assertSafeSvg(source);
          const lockEntry = lockById.get(variant.id);
          if (!lockEntry) errors.push(`${variant.id}: source-lock entry is missing.`);
          else if (lockEntry.sanitizerVersion !== lock.sanitizerVersion) {
            errors.push(`${variant.id}: sanitizer pipeline version differs from source lock.`);
          } else if (sha256(source) !== lockEntry.localSha256) {
            errors.push(`${variant.id}: local SHA-256 differs from source-lock.json.`);
          }
        } catch (error) {
          errors.push(`${variant.id}: ${String(error)}`);
        }
      }
    }
  }
  for (const [entryId, category] of categoryByEntry) {
    if (!familyIds.has(entryId)) {
      errors.push(
        `Taxonomy entry NIH BioArt ${entryId} (${category}) is absent from the manifest.`
      );
    }
  }
  for (const assetId of lockById.keys()) {
    if (!ids.has(assetId)) errors.push(`${assetId}: source-lock entry is absent from manifest.`);
  }
  for (const [directory, extension] of [
    [SVG_DIR, ".svg"],
    [THUMB_DIR, ".webp"]
  ] as const) {
    for (const file of await readdir(directory)) {
      if (
        file.startsWith("nih-bioart-") &&
        file.endsWith(extension) &&
        !ids.has(file.slice(0, -extension.length))
      ) {
        errors.push(`${file}: unreferenced generated asset.`);
      }
    }
  }

  const openManifestPath = join(ROOT, "apps/web/src/generated/open-assets-manifest.json");
  const openManifest = await readJson<AssetManifest>(openManifestPath);
  const publicDirectory = join(ROOT, "apps/web/public");
  const allowedOpenLicenses = new Set([
    "CC0-1.0",
    "CC-BY-3.0",
    "CC-BY-4.0",
    "CC-BY-SA-3.0",
    "CC-BY-SA-4.0",
    "MIT",
    "BSD-3-Clause"
  ]);
  if (openManifest.families.length === 0) {
    errors.push("The open scientific-art collection is empty; run pnpm assets:sync:open.");
  }
  for (const family of openManifest.families) {
    if (!allowedOpenLicenses.has(family.license)) {
      errors.push(`${family.familyId}: unsupported open-asset license ${family.license}.`);
    }
    if (!family.sourcePage || !family.sourceName || !family.licenseUrl || !family.credit) {
      errors.push(`${family.familyId}: attribution or source metadata is incomplete.`);
    }
    if (!family.variants.some((variant) => variant.id === family.defaultVariantId)) {
      errors.push(`${family.familyId}: default variant does not exist.`);
    }
    for (const variant of family.variants) {
      if (ids.has(variant.id)) errors.push(`${variant.id}: duplicate asset ID.`);
      ids.add(variant.id);
      const svgPath = join(publicDirectory, variant.assetPath);
      const thumbnailPath = join(publicDirectory, variant.thumbnailPath);
      if (!(await exists(svgPath))) errors.push(`${variant.id}: SVG is missing.`);
      if (!(await exists(thumbnailPath))) errors.push(`${variant.id}: thumbnail is missing.`);
      if (await exists(svgPath)) {
        try {
          const source = await readFile(svgPath, "utf8");
          assertSafeSvg(source);
          if (variant.localSha256 && sha256(source) !== variant.localSha256) {
            errors.push(`${variant.id}: local SHA-256 differs from the open-assets manifest.`);
          }
        } catch (error) {
          errors.push(`${variant.id}: ${String(error)}`);
        }
      }
      if (await exists(thumbnailPath)) {
        try {
          const thumbnail = await sharp(thumbnailPath).metadata();
          if (
            thumbnail.format !== "webp" ||
            !thumbnail.width ||
            !thumbnail.height ||
            thumbnail.width > 256 ||
            thumbnail.height > 256 ||
            !thumbnail.hasAlpha
          ) {
            errors.push(`${variant.id}: thumbnail is not a valid transparent WebP.`);
          }
        } catch (error) {
          errors.push(`${variant.id}: thumbnail cannot be decoded: ${String(error)}`);
        }
      }
    }
  }

  if (errors.length) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    throw new Error(`Asset validation failed with ${errors.length} issue(s).`);
  }
  console.log(
    `Validated ${manifest.families.length + openManifest.families.length} families and ${ids.size} SVG variants.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
