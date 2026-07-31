import type {
  AssetFamily,
  AssetManifest,
  AssetVariant
} from "../../packages/editor-core/src/types";
import { readJson, writeJsonAtomic } from "./io";
import { LOCK_PATH, MANIFEST_PATH, OVERRIDES_PATH, TAXONOMY_PATH } from "./paths";
import { categoryForEntry, taxonomyIndex, type AssetTaxonomy } from "./taxonomy";
import type { SourceLock } from "./types";

interface Overrides {
  files?: Record<string, Record<string, unknown>>;
  families?: Record<string, Partial<AssetFamily>>;
}

export async function buildManifest(): Promise<AssetManifest> {
  const [lock, overrides, taxonomy] = await Promise.all([
    readJson<SourceLock>(LOCK_PATH),
    readJson<Overrides>(OVERRIDES_PATH),
    readJson<AssetTaxonomy>(TAXONOMY_PATH)
  ]);
  const categoryByEntry = taxonomyIndex(taxonomy);
  const categoryKeywords = new Set([
    ...taxonomy.categories,
    "Cells and organelles",
    "Shapes and arrows"
  ]);
  let previous: AssetManifest | undefined;
  try {
    previous = await readJson<AssetManifest>(MANIFEST_PATH);
  } catch {
    previous = undefined;
  }

  const grouped = new Map<number, AssetFamily>();
  for (const entry of Object.values(lock.files).sort((a, b) =>
    a.assetId.localeCompare(b.assetId)
  )) {
    const variant: AssetVariant = {
      id: entry.assetId,
      assetPath: entry.assetPath,
      thumbnailPath: entry.thumbnailPath,
      commonsSha1: entry.commonsSha1,
      sourceFileId: entry.sourceFileId,
      localSha256: entry.localSha256,
      width: entry.width,
      height: entry.height
    };
    const existing = grouped.get(entry.bioartEntryId);
    if (existing) {
      existing.variants.push(variant);
      continue;
    }
    const familyId = `nih-bioart-${entry.bioartEntryId}`;
    const category = categoryForEntry(taxonomy, entry.bioartEntryId, categoryByEntry);
    grouped.set(entry.bioartEntryId, {
      familyId,
      bioartEntryId: entry.bioartEntryId,
      ...entry.family,
      defaultVariantId: entry.assetId,
      variants: [variant],
      ...(overrides.families?.[familyId] ?? {}),
      category,
      keywords: [
        ...entry.family.keywords.filter((keyword) => !categoryKeywords.has(keyword)),
        category
      ]
    });
  }

  const families = [...grouped.values()]
    .map((family) => ({
      ...family,
      variants: family.variants.sort((a, b) => a.id.localeCompare(b.id)),
      defaultVariantId:
        family.defaultVariantId || family.variants.map((variant) => variant.id).sort()[0]
    }))
    .sort((a, b) => a.bioartEntryId - b.bioartEntryId);

  const previousComparable = previous ? JSON.stringify(previous.families) : "";
  const currentComparable = JSON.stringify(families);
  const manifest: AssetManifest = {
    version: 1,
    generatedAt:
      previousComparable === currentComparable && previous
        ? previous.generatedAt
        : new Date().toISOString(),
    source: Object.values(lock.files).every((entry) => entry.sourceKind === "nih")
      ? "NIAID NIH BioArt"
      : Object.values(lock.files).some((entry) => entry.sourceKind === "nih")
        ? "NIAID NIH BioArt and Wikimedia Commons"
        : "Wikimedia Commons",
    families
  };
  await writeJsonAtomic(MANIFEST_PATH, manifest);
  console.log(
    `Manifest contains ${families.length} families and ${Object.keys(lock.files).length} variants.`
  );
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildManifest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
