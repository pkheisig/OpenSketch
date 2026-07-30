import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import sharp from "sharp";
import Piscina from "piscina";
import type { AssetFamily } from "../../packages/editor-core/src/types";
import { buildManifest } from "./build-manifest";
import { generateThumbnail } from "./generate-thumbnails";
import {
  mapLimit,
  rateLimitedFetch,
  readJson,
  sha256,
  writeJsonAtomic,
  writeTextAtomic
} from "./io";
import { directSvgUrl, parseNihBioartPage, type NihBioartRecord } from "./nih-source";
import { ERROR_PATH, LOCK_PATH, SVG_DIR, TAXONOMY_PATH, THUMB_DIR } from "./paths";
import { assertSafeSvg } from "./sanitize-svg";
import { taxonomyIndex, type AssetTaxonomy } from "./taxonomy";
import type { ImportFailure, ImportSkip, SourceLock, SourceLockEntry } from "./types";

const SANITIZER_VERSION = 3;
const USER_AGENT =
  "OpenSketchAssetImporter/1.0 (https://github.com/pkheisig/OpenSketch; scientific figure editor)";
const MISSING_TAIL_LENGTH = 75;
const CATALOG_CONCURRENCY = 12;
const sanitizerPool = new Piscina({
  filename: fileURLToPath(new URL("./sanitize-worker.mjs", import.meta.url)),
  minThreads: 2,
  maxThreads: 5
});

class AssetSkip extends Error {}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function concise(value: string, max = 280): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function keywordsFor(record: NihBioartRecord, category: string): string[] {
  const words = `${record.title} ${record.description} ${record.keywords.join(" ")}`
    .toLowerCase()
    .replace(/[^a-z0-9+ -]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
  return [...new Set([record.title, category, ...record.keywords, ...words])].slice(0, 32);
}

function categoryFromNih(record: NihBioartRecord): string {
  const categories = record.category.toLowerCase();
  const searchable =
    `${record.title} ${record.description} ${record.keywords.join(" ")}`.toLowerCase();
  if (categories.includes("virus") || /\bvirus|virion|phage\b/.test(searchable)) return "Viruses";
  if (categories.includes("parasite")) return "Parasites";
  if (categories.includes("arthropod")) return "Arthropods";
  if (/\bbacteri(?:a|um|al)\b/.test(searchable)) return "Bacteria";
  if (categories.includes("cell scene") || categories.includes("cells and organelles")) {
    return "Cells";
  }
  if (categories.includes("protein")) return "Proteins";
  if (categories.includes("molecule")) return "Molecules";
  if (categories.includes("equipment")) return "Equipment";
  if (categories.includes("technique") || categories.includes("cellular process")) {
    return "Cellular processes";
  }
  if (categories.includes("anatomy")) return "Anatomy";
  if (categories.includes("people")) return "People";
  if (categories.includes("animal")) return "Animals";
  if (categories.includes("plant")) return "Plants";
  if (categories.includes("shape") || categories.includes("data visualization")) {
    return "Symbols & diagrams";
  }
  return "Other";
}

function assignNewTaxonomy(records: NihBioartRecord[], taxonomy: AssetTaxonomy): boolean {
  const existing = taxonomyIndex(taxonomy);
  let changed = false;
  for (const record of records) {
    if (existing.has(record.entryId)) continue;
    const category = categoryFromNih(record);
    taxonomy.assignments[category].push(record.entryId);
    existing.set(record.entryId, category);
    changed = true;
  }
  if (changed) {
    for (const category of taxonomy.categories) {
      taxonomy.assignments[category] = [...new Set(taxonomy.assignments[category])].sort(
        (a, b) => a - b
      );
    }
  }
  return changed;
}

async function fetchRecord(
  entryId: number,
  pageCache: Map<number, Promise<NihBioartRecord | undefined>>,
  refresh = false
): Promise<NihBioartRecord | undefined> {
  const cached = pageCache.get(entryId);
  if (cached && !refresh) return cached;
  const request = (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`https://bioart.niaid.nih.gov/bioart/${entryId}`, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
          signal: AbortSignal.timeout(20_000)
        });
        if (response.ok) {
          const record = parseNihBioartPage(entryId, await response.text());
          if (record) return record;
        }
      } catch {
        // Retry transient connection and rendering failures below.
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    return undefined;
  })();
  pageCache.set(entryId, request);
  return request;
}

async function discoverCatalog(oldLock: SourceLock): Promise<NihBioartRecord[]> {
  const pageCache = new Map<number, Promise<NihBioartRecord | undefined>>();
  const seed = Math.max(1, ...Object.values(oldLock.files).map((entry) => entry.bioartEntryId));
  let cursor = seed + 1;
  let lastFound = seed;
  while (cursor - lastFound <= MISSING_TAIL_LENGTH) {
    const batch = Array.from({ length: 25 }, (_, index) => cursor + index);
    const records = await mapLimit(batch, CATALOG_CONCURRENCY, (entryId) =>
      fetchRecord(entryId, pageCache)
    );
    records.forEach((record) => {
      if (record) lastFound = Math.max(lastFound, record.entryId);
    });
    cursor += batch.length;
  }

  const entryIds = Array.from({ length: lastFound }, (_, index) => index + 1);
  const records = await mapLimit(entryIds, CATALOG_CONCURRENCY, async (entryId, index) => {
    const record = await fetchRecord(entryId, pageCache);
    if ((index + 1) % 100 === 0 || index === entryIds.length - 1) {
      console.log(`Checked ${index + 1}/${entryIds.length} NIH BioArt records…`);
    }
    return record;
  });
  const knownEntryIds = [
    ...new Set(Object.values(oldLock.files).map((entry) => entry.bioartEntryId))
  ];
  const foundIds = new Set(
    records
      .filter((record): record is NihBioartRecord => Boolean(record))
      .map((record) => record.entryId)
  );
  const missingKnownIds = knownEntryIds.filter((entryId) => !foundIds.has(entryId));
  if (missingKnownIds.length) {
    console.log(`Retrying ${missingKnownIds.length} known NIH records individually…`);
    const recovered = await mapLimit(missingKnownIds, 3, (entryId) =>
      fetchRecord(entryId, pageCache, true)
    );
    recovered.forEach((record) => {
      if (record) records[record.entryId - 1] = record;
    });
  }
  return records.filter((record): record is NihBioartRecord => Boolean(record));
}

function sourceFileIdFromOldEntry(entry: SourceLockEntry): number | undefined {
  if (entry.sourceFileId) return entry.sourceFileId;
  const explicit = entry.title.match(/NIH BioArt\s+\d{1,4}\s*-\s*(\d{5,})/i)?.[1];
  const raw = entry.title.match(/NIH BioArt\s+(\d{5,})\s*\)/i)?.[1];
  return Number(explicit ?? raw) || undefined;
}

function stableAssetId(
  entryId: number,
  fileId: number,
  oldByFileId: Map<number, SourceLockEntry>,
  oldByEntryId: Map<number, SourceLockEntry[]>,
  variantCount: number
): string {
  const exact = oldByFileId.get(fileId);
  if (exact?.bioartEntryId === entryId) return exact.assetId;
  const family = oldByEntryId.get(entryId) ?? [];
  if (variantCount === 1 && family.length === 1) return family[0].assetId;
  return `nih-bioart-${entryId}-${fileId}`;
}

async function processVariant(
  record: NihBioartRecord,
  fileId: number,
  assetId: string,
  category: string,
  previous?: SourceLockEntry
): Promise<SourceLockEntry> {
  const sourceUrl = directSvgUrl(record.entryId, fileId);
  const download = await rateLimitedFetch(
    sourceUrl,
    { headers: { "User-Agent": USER_AGENT, Accept: "image/svg+xml" } },
    35,
    8,
    30_000
  );
  const raw = await download.text();
  if (!/<(?:[a-z_][\w.-]*:)?svg[\s>]/i.test(raw)) {
    throw new AssetSkip("NIH declares an SVG representation, but its file endpoint is empty.");
  }
  const sourceSha256 = sha256(raw);
  const assetPath = `/assets/nih-bioart/${assetId}.svg`;
  const thumbnailPath = `/assets/nih-bioart-thumbnails/${assetId}.webp`;
  const localSvg = join(SVG_DIR, basename(assetPath));
  const localThumbnail = join(THUMB_DIR, basename(thumbnailPath));

  let sanitized: string;
  if (
    previous?.sourceSha256 === sourceSha256 &&
    previous.sanitizerVersion === SANITIZER_VERSION &&
    (await fileExists(localSvg))
  ) {
    sanitized = await readFile(localSvg, "utf8");
    assertSafeSvg(sanitized);
  } else {
    sanitized = await sanitizerPool.run({ source: raw, assetId });
    await writeTextAtomic(localSvg, sanitized);
  }
  if (!(await fileExists(localThumbnail)) || previous?.sourceSha256 !== sourceSha256) {
    await generateThumbnail(localSvg, localThumbnail);
  }
  const dimensions = await sharp(Buffer.from(sanitized)).metadata();
  const sourcePage = record.sourcePage;
  const family = {
    title: concise(record.title),
    description: concise(record.description),
    category,
    keywords: keywordsFor(record, category),
    author: concise(record.author || "NIAID Visual & Medical Arts"),
    credit: "Courtesy of NIAID",
    license: "Public Domain" as const,
    nihSourcePage: sourcePage,
    sourcePage
  } satisfies Omit<AssetFamily, "variants" | "defaultVariantId" | "familyId" | "bioartEntryId">;

  return {
    title: `NIH BioArt ${record.entryId} SVG ${fileId}`,
    sourceKind: "nih",
    sourcePage,
    sourceUrl,
    sourceFileId: fileId,
    sourceSha256,
    localSha256: sha256(sanitized),
    sanitizerVersion: SANITIZER_VERSION,
    assetId,
    bioartEntryId: record.entryId,
    assetPath,
    thumbnailPath,
    width: dimensions.width ?? 0,
    height: dimensions.height ?? 0,
    author: family.author,
    license: "Public Domain",
    nihSourcePage: sourcePage,
    family
  };
}

async function removeOrphans(previous: SourceLock, current: SourceLock): Promise<void> {
  const currentIds = new Set(Object.values(current.files).map((entry) => entry.assetId));
  for (const entry of Object.values(previous.files)) {
    if (!currentIds.has(entry.assetId)) {
      await rm(join(SVG_DIR, basename(entry.assetPath)), { force: true });
      await rm(join(THUMB_DIR, basename(entry.thumbnailPath)), { force: true });
    }
  }
  for (const [directory, extension] of [
    [SVG_DIR, ".svg"],
    [THUMB_DIR, ".webp"]
  ] as const) {
    for (const file of await readdir(directory)) {
      if (
        file.startsWith("nih-bioart-") &&
        file.endsWith(extension) &&
        !currentIds.has(file.slice(0, -extension.length))
      ) {
        await rm(join(directory, file), { force: true });
      }
    }
  }
}

async function main(): Promise<void> {
  const [oldLock, taxonomy] = await Promise.all([
    readJson<SourceLock>(LOCK_PATH),
    readJson<AssetTaxonomy>(TAXONOMY_PATH)
  ]);
  const catalog = await discoverCatalog(oldLock);
  const skipped: ImportSkip[] = [];
  const failures: ImportFailure[] = [];
  const publicDomain = catalog.filter((record) => {
    if (record.license !== "Public Domain") {
      skipped.push({
        title: `NIH BioArt ${record.entryId}: ${record.title}`,
        reason: `NIH license is ${record.license || "not specified"}, not Public Domain.`
      });
      return false;
    }
    if (!record.svgFileIds.length) {
      skipped.push({
        title: `NIH BioArt ${record.entryId}: ${record.title}`,
        reason: "NIH provides no SVG representation."
      });
      return false;
    }
    return true;
  });
  if (assignNewTaxonomy(publicDomain, taxonomy)) {
    await writeJsonAtomic(TAXONOMY_PATH, taxonomy);
  }
  const categoryByEntry = taxonomyIndex(taxonomy);
  const oldEntries = Object.values(oldLock.files);
  const oldByFileId = new Map(
    oldEntries
      .map((entry) => [sourceFileIdFromOldEntry(entry), entry] as const)
      .filter((pair): pair is [number, SourceLockEntry] => Boolean(pair[0]))
  );
  const oldByEntryId = new Map<number, SourceLockEntry[]>();
  for (const entry of oldEntries) {
    const family = oldByEntryId.get(entry.bioartEntryId) ?? [];
    family.push(entry);
    oldByEntryId.set(entry.bioartEntryId, family);
  }
  const oldByAssetId = new Map(oldEntries.map((entry) => [entry.assetId, entry]));
  const plans = publicDomain.flatMap((record) =>
    record.svgFileIds.map((fileId) => {
      const assetId = stableAssetId(
        record.entryId,
        fileId,
        oldByFileId,
        oldByEntryId,
        record.svgFileIds.length
      );
      return { record, fileId, assetId };
    })
  );

  const imported = await mapLimit(plans, 5, async ({ record, fileId, assetId }, index) => {
    try {
      const entry = await processVariant(
        record,
        fileId,
        assetId,
        categoryByEntry.get(record.entryId)!,
        oldByAssetId.get(assetId)
      );
      console.log(`[${index + 1}/${plans.length}] ${record.title} (${fileId})`);
      return entry;
    } catch (error) {
      if (error instanceof AssetSkip) {
        skipped.push({
          title: `NIH BioArt ${record.entryId} SVG ${fileId}`,
          reason: error.message
        });
        console.log(`[${index + 1}/${plans.length}] SKIPPED ${record.title}: ${error.message}`);
        return undefined;
      }
      failures.push({
        title: `NIH BioArt ${record.entryId} SVG ${fileId}`,
        stage: "direct NIH import",
        error: String(error)
      });
      console.error(`[${index + 1}/${plans.length}] FAILED ${record.title}: ${String(error)}`);
      return undefined;
    }
  });
  const importedEntries = imported.filter((entry): entry is SourceLockEntry => Boolean(entry));
  const importedIds = new Set(importedEntries.map((entry) => entry.assetId));
  const retainedCommonsEntries = oldEntries.filter((entry) => !importedIds.has(entry.assetId));
  const files = Object.fromEntries(
    [...importedEntries, ...retainedCommonsEntries]
      .map((entry) => [entry.title, entry] as const)
      .sort(([a], [b]) => a.localeCompare(b))
  );
  const changed = JSON.stringify(oldLock.files) !== JSON.stringify(files);
  const nextLock: SourceLock = {
    version: 1,
    sanitizerVersion: SANITIZER_VERSION,
    updatedAt: changed ? new Date().toISOString() : oldLock.updatedAt,
    files
  };
  await removeOrphans(oldLock, nextLock);
  await writeJsonAtomic(LOCK_PATH, nextLock);
  await writeJsonAtomic(ERROR_PATH, {
    generatedAt: new Date().toISOString(),
    source: "NIAID NIH BioArt",
    catalogRecords: catalog.length,
    publicDomainFamilies: publicDomain.length,
    importedVariants: Object.keys(files).length,
    skipped,
    failures
  });
  await buildManifest();
  await sanitizerPool.destroy();
  if (failures.length) {
    throw new Error(`${failures.length} direct NIH imports failed. See data/import-errors.json.`);
  }
}

main().catch((error) => {
  void sanitizerPool.destroy();
  console.error(error);
  process.exitCode = 1;
});
