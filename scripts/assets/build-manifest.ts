import type {
  AssetFamily,
  AssetManifest,
  AssetVariant
} from "../../packages/editor-core/src/types";
import { readJson, writeJsonAtomic } from "./io";
import { LOCK_PATH, MANIFEST_PATH, OVERRIDES_PATH } from "./paths";
import type { SourceLock } from "./types";

interface Overrides {
  files?: Record<string, Record<string, unknown>>;
  families?: Record<string, Partial<AssetFamily>>;
}

export async function buildManifest(): Promise<AssetManifest> {
  const lock = await readJson<SourceLock>(LOCK_PATH);
  const overrides = await readJson<Overrides>(OVERRIDES_PATH);
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
    grouped.set(entry.bioartEntryId, {
      familyId,
      bioartEntryId: entry.bioartEntryId,
      ...entry.family,
      defaultVariantId: entry.assetId,
      variants: [variant],
      ...(overrides.families?.[familyId] ?? {})
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
    source: "Wikimedia Commons",
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
