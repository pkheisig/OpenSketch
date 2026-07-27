import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import Piscina from "piscina";
import type { AssetFamily } from "../../packages/editor-core/src/types";
import { buildManifest } from "./build-manifest";
import { generateThumbnail } from "./generate-thumbnails";
import {
  fetchWithRetry,
  mapLimit,
  rateLimitedFetch,
  readJson,
  sha256,
  writeJsonAtomic,
  writeTextAtomic
} from "./io";
import { ERROR_PATH, LOCK_PATH, OVERRIDES_PATH, SVG_DIR, TAXONOMY_PATH, THUMB_DIR } from "./paths";
import { assertSafeSvg } from "./sanitize-svg";
import { categoryForEntry, taxonomyIndex, type AssetTaxonomy } from "./taxonomy";
import type { CommonsPage, ImportFailure, ImportSkip, SourceLock, SourceLockEntry } from "./types";

const API = "https://commons.wikimedia.org/w/api.php";
const SANITIZER_VERSION = 3;
const USER_AGENT =
  "OpenSketchAssetImporter/0.1 (https://github.com/pkheisig/OpenSketch; scientific figure editor)";
const sanitizerPool = new Piscina({
  filename: fileURLToPath(new URL("./sanitize-worker.mjs", import.meta.url)),
  minThreads: 2,
  maxThreads: 5
});

class AssetSkip extends Error {}

interface FileOverride {
  bioartEntryId?: number;
  evidence?: string;
  category?: string;
  title?: string;
  description?: string;
  keywords?: string[];
}

interface Overrides {
  files?: Record<string, FileOverride>;
}

function metadata(page: CommonsPage, key: string): string {
  return page.imageinfo?.[0]?.extmetadata?.[key]?.value?.replace(/<[^>]+>/g, " ").trim() ?? "";
}

function isPublicDomain(page: CommonsPage): boolean {
  const values = ["LicenseShortName", "UsageTerms", "LicenseUrl", "Copyrighted"].map((key) =>
    metadata(page, key).toLowerCase()
  );
  return (
    values.some((value) => /public[\s_-]*domain|creativecommons\.org\/publicdomain/.test(value)) &&
    !values.some((value) => /\bcc[\s_-]*by\b|\bcc[\s_-]*by[\s_-]*sa\b/.test(value))
  );
}

function determineEntryId(
  page: CommonsPage,
  override?: FileOverride,
  resolvedVariantIds: Map<number, number> = new Map(),
  lockedEntryId?: number
): number {
  const evidence = new Set<number>();
  const sourceFields = [metadata(page, "Source"), metadata(page, "Credit")];
  for (const value of sourceFields) {
    const patterns = [/bioart(?:\/|%2f)(?:bioart\/)?(\d+)\b/gi, /\bID[-_ ]?(\d{1,4})\b/gi];
    for (const pattern of patterns) {
      for (const match of value.matchAll(pattern)) evidence.add(Number(match[1]));
    }
  }
  const explicitTitle = page.title.match(/NIH BioArt\s+(\d{1,4})\s*-\s*(\d{5,})/i);
  const simpleTitle = page.title.match(/NIH BioArt\s+(\d{1,4})\s*\)/i);
  const rawVariantTitle = page.title.match(/NIH BioArt\s+(\d{5,})\s*\)/i);
  if (explicitTitle) evidence.add(Number(explicitTitle[1]));
  else if (simpleTitle) evidence.add(Number(simpleTitle[1]));
  else if (rawVariantTitle) {
    const resolved = resolvedVariantIds.get(Number(rawVariantTitle[1]));
    if (resolved) evidence.add(resolved);
  }
  if (override?.bioartEntryId) {
    if (!override.evidence) {
      throw new Error("A manual NIH BioArt ID override must include an evidence URL.");
    }
    evidence.add(override.bioartEntryId);
  }
  if (lockedEntryId) evidence.add(lockedEntryId);
  if (evidence.size !== 1) {
    throw new Error(
      evidence.size === 0
        ? "No unambiguous NIH BioArt entry ID was found."
        : `Conflicting NIH BioArt IDs: ${[...evidence].join(", ")}.`
    );
  }
  return [...evidence][0];
}

function baseTitle(page: CommonsPage): string {
  return page.title
    .replace(/^File:/i, "")
    .replace(/\s*\(NIH BioArt[\s\S]*$/i, "")
    .trim()
    .toLowerCase();
}

async function resolveRawVariantIds(pages: CommonsPage[]): Promise<Map<number, number>> {
  const explicitByTitle = new Map<string, Array<{ entryId: number; variantId: number }>>();
  for (const page of pages) {
    const match = page.title.match(/NIH BioArt\s+(\d{1,4})\s*-\s*(\d{5,})/i);
    if (!match) continue;
    const key = baseTitle(page);
    const values = explicitByTitle.get(key) ?? [];
    values.push({ entryId: Number(match[1]), variantId: Number(match[2]) });
    explicitByTitle.set(key, values);
  }

  const pageCache = new Map<number, Promise<string>>();
  const loadNihPage = (entryId: number) => {
    const existing = pageCache.get(entryId);
    if (existing) return existing;
    const request = rateLimitedFetch(
      `https://bioart.niaid.nih.gov/bioart/${entryId}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } },
      100,
      2,
      8000
    ).then(async (response) => (await response.text()).replaceAll('\\"', '"'));
    pageCache.set(entryId, request);
    return request;
  };

  const resolved = new Map<number, number>();
  const rawPages = pages.filter((page) => /NIH BioArt\s+\d{5,}\s*\)/i.test(page.title));
  const plans: Array<{ variantId: number; candidates: number[] }> = [];
  for (const page of rawPages) {
    const variantId = Number(page.title.match(/NIH BioArt\s+(\d{5,})\s*\)/i)![1]);
    const explicit = explicitByTitle.get(baseTitle(page)) ?? [];
    if (!explicit.length) {
      plans.push({ variantId, candidates: [] });
      continue;
    }
    const nearest = [...explicit].sort(
      (a, b) => Math.abs(a.variantId - variantId) - Math.abs(b.variantId - variantId)
    )[0];
    const candidates = new Set<number>(explicit.map((value) => value.entryId));
    for (let offset = -3; offset <= 3; offset += 1) {
      if (nearest.entryId + offset > 0) candidates.add(nearest.entryId + offset);
    }
    plans.push({ variantId, candidates: [...candidates].sort((a, b) => a - b) });
  }
  const candidateIds = [...new Set(plans.flatMap((plan) => plan.candidates))];
  await mapLimit(candidateIds, 5, async (candidate, index) => {
    try {
      await loadNihPage(candidate);
    } catch {
      // Missing neighboring entries are expected while gathering evidence.
    }
    if ((index + 1) % 10 === 0 || index === candidateIds.length - 1) {
      console.log(`Checked ${index + 1}/${candidateIds.length} NIH identity evidence pages…`);
    }
  });
  for (const { variantId, candidates } of plans) {
    const matches: number[] = [];
    for (const candidate of candidates) {
      try {
        const html = await loadNihPage(candidate);
        if (new RegExp(`"SVG"\\s*:\\s*${variantId}\\b`).test(html)) matches.push(candidate);
      } catch {
        // A missing candidate page is not identity evidence.
      }
    }
    if (matches.length === 1) resolved.set(variantId, matches[0]);
  }
  if (rawPages.length) {
    console.log(
      `Resolved ${resolved.size}/${rawPages.length} filename-only variant IDs against NIH source pages…`
    );
  }
  return resolved;
}

function stripFileExtension(value: string): string {
  return value.replace(/^File:/i, "").replace(/\.[^.]+$/, "");
}

function concise(value: string, max = 280): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function keywordsFor(title: string, description: string, category: string, extra: string[] = []) {
  const words = `${title} ${description}`
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
  return [...new Set([title, category, ...extra, ...words])].slice(0, 24);
}

async function queryCommons(): Promise<CommonsPage[]> {
  const pages: CommonsPage[] = [];
  let continuation: Record<string, string> = {};
  do {
    const params = new URLSearchParams({
      action: "query",
      generator: "categorymembers",
      gcmtitle: "Category:Biology SVG illustrations by NIH BioArt",
      gcmtype: "file",
      gcmlimit: "max",
      prop: "imageinfo",
      iiprop: "url|mime|size|sha1|extmetadata",
      format: "json",
      formatversion: "2",
      ...continuation
    });
    const response = await fetchWithRetry(`${API}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" }
    });
    const payload = (await response.json()) as {
      query?: { pages?: CommonsPage[] };
      continue?: Record<string, string>;
    };
    pages.push(...(payload.query?.pages ?? []));
    continuation = payload.continue ?? {};
    console.log(`Fetched metadata for ${pages.length} Commons files…`);
  } while (Object.keys(continuation).length);
  return pages.sort((a, b) => a.title.localeCompare(b.title));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function processPage(
  page: CommonsPage,
  oldLock: SourceLock,
  taxonomy: AssetTaxonomy,
  categoryByEntry: Map<number, string>,
  overrides: Overrides,
  resolvedVariantIds: Map<number, number>
): Promise<SourceLockEntry> {
  const image = page.imageinfo?.[0];
  if (!image) throw new Error("Commons returned no image information.");
  if (image.mime !== "image/svg+xml") {
    throw new AssetSkip(`Unsupported MIME type ${image.mime}.`);
  }
  if (!isPublicDomain(page)) {
    throw new AssetSkip("Asset is not explicitly identified as public domain.");
  }
  const fileOverride = overrides.files?.[page.title];
  const old = oldLock.files[page.title];
  const lockedEntryId = old?.commonsSha1 === image.sha1 ? old.bioartEntryId : undefined;
  const entryId = determineEntryId(page, fileOverride, resolvedVariantIds, lockedEntryId);
  const suffix = image.sha1.slice(0, 12);
  const assetId = `nih-bioart-${entryId}-${suffix}`;
  const assetPath = `/assets/nih-bioart/${assetId}.svg`;
  const thumbnailPath = `/assets/nih-bioart-thumbnails/${assetId}.webp`;
  const localSvg = join(SVG_DIR, basename(assetPath));
  const localThumbnail = join(THUMB_DIR, basename(thumbnailPath));
  const rawTitle = concise(
    (fileOverride?.title ?? metadata(page, "ObjectName") ?? stripFileExtension(page.title)).replace(
      /\s*\(NIH BioArt[\s\S]*$/i,
      ""
    )
  );
  const description = concise(fileOverride?.description ?? metadata(page, "ImageDescription"));
  const category = categoryForEntry(taxonomy, entryId, categoryByEntry);
  const author = concise(
    metadata(page, "Artist") || metadata(page, "Author") || "NIAID NIH BioArt"
  );
  const nihSourcePage = `https://bioart.niaid.nih.gov/bioart/${entryId}`;
  const commonsPage =
    image.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`;
  const family = {
    title: rawTitle,
    description,
    category,
    keywords: keywordsFor(rawTitle, description, category, fileOverride?.keywords),
    author,
    credit: "Courtesy of NIAID",
    license: "Public Domain" as const,
    nihSourcePage,
    commonsPage
  } satisfies Omit<AssetFamily, "variants" | "defaultVariantId" | "familyId" | "bioartEntryId">;

  if (
    old?.commonsSha1 === image.sha1 &&
    old.sanitizerVersion === SANITIZER_VERSION &&
    old.assetId === assetId &&
    (await fileExists(localSvg)) &&
    (await fileExists(localThumbnail))
  ) {
    return {
      ...old,
      title: page.title,
      commonsPage,
      sourceUrl: image.url,
      commonsSha1: image.sha1,
      sanitizerVersion: SANITIZER_VERSION,
      assetId,
      bioartEntryId: entryId,
      assetPath,
      thumbnailPath,
      width: image.width,
      height: image.height,
      author,
      license: "Public Domain",
      nihSourcePage,
      family
    };
  }

  let sanitized: string;
  if ((await fileExists(localSvg)) && (await fileExists(localThumbnail))) {
    sanitized = await readFile(localSvg, "utf8");
    assertSafeSvg(sanitized);
  } else {
    const download = await rateLimitedFetch(
      image.url,
      {
        headers: { "User-Agent": USER_AGENT, Accept: "image/svg+xml" }
      },
      1000,
      8,
      30_000
    );
    sanitized = await sanitizerPool.run({ source: await download.text(), assetId });
    await writeTextAtomic(localSvg, sanitized);
    await generateThumbnail(localSvg, localThumbnail);
  }

  return {
    title: page.title,
    commonsPage,
    sourceUrl: image.url,
    commonsSha1: image.sha1,
    localSha256: sha256(sanitized),
    sanitizerVersion: SANITIZER_VERSION,
    assetId,
    bioartEntryId: entryId,
    assetPath,
    thumbnailPath,
    width: image.width,
    height: image.height,
    author,
    license: "Public Domain",
    nihSourcePage,
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
  const [oldLock, taxonomy, overrides] = await Promise.all([
    readJson<SourceLock>(LOCK_PATH),
    readJson<AssetTaxonomy>(TAXONOMY_PATH),
    readJson<Overrides>(OVERRIDES_PATH)
  ]);
  const pages = await queryCommons();
  const resolvedVariantIds = await resolveRawVariantIds(pages);
  const categoryByEntry = taxonomyIndex(taxonomy);
  const failures: ImportFailure[] = [];
  const skipped: ImportSkip[] = [];
  const entries = await mapLimit(pages, 5, async (page, index) => {
    try {
      const entry = await processPage(
        page,
        oldLock,
        taxonomy,
        categoryByEntry,
        overrides,
        resolvedVariantIds
      );
      console.log(`[${index + 1}/${pages.length}] ${page.title}`);
      return entry;
    } catch (error) {
      if (error instanceof AssetSkip) {
        skipped.push({ title: page.title, reason: error.message });
        console.log(`[${index + 1}/${pages.length}] SKIPPED ${page.title}: ${error.message}`);
        return undefined;
      }
      failures.push({ title: page.title, stage: "import", error: String(error) });
      console.error(`[${index + 1}/${pages.length}] FAILED ${page.title}: ${String(error)}`);
      return oldLock.files[page.title];
    }
  });

  const files = Object.fromEntries(
    entries
      .filter((entry): entry is SourceLockEntry => Boolean(entry))
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
    skipped,
    failures
  });
  await buildManifest();
  await sanitizerPool.destroy();
  if (failures.length) {
    throw new Error(`${failures.length} asset imports failed. See data/import-errors.json.`);
  }
}

main().catch((error) => {
  void sanitizerPool.destroy();
  console.error(error);
  process.exitCode = 1;
});
