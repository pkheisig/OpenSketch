import type { AssetManifest } from "@workspace/editor-core";

export const OFFLINE_ASSET_PACK_CHANGED_EVENT = "opensketch:offline-asset-pack-changed";
export const OFFLINE_ASSET_PACK_METADATA_CACHE = "opensketch-offline-asset-pack";
export const OFFLINE_ASSET_SOURCE_CACHE = "opensketch-asset-sources";
export const OFFLINE_ASSET_PREVIEW_CACHE = "opensketch-asset-previews";

const OFFLINE_ASSET_PACK_MARKER = "/opensketch-offline-asset-pack-ready";
const PREPARE_CONCURRENCY = 6;

type OfflineAssetCacheName = typeof OFFLINE_ASSET_SOURCE_CACHE | typeof OFFLINE_ASSET_PREVIEW_CACHE;

export interface OfflineAssetPackEntry {
  url: string;
  cacheName: OfflineAssetCacheName;
  kind: "source" | "preview";
}

export interface OfflineAssetPack {
  version: string;
  entries: OfflineAssetPackEntry[];
  sourceCount: number;
  previewCount: number;
}

export type OfflineAssetPackState = "unavailable" | "not-ready" | "preparing" | "ready" | "error";

export interface OfflineAssetPackStatus {
  state: OfflineAssetPackState;
  version: string;
  total: number;
  completed: number;
  sourceCount: number;
  previewCount: number;
  message?: string;
}

export class OfflineAssetPackError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OfflineAssetPackError";
  }
}

interface PackMarker {
  version: string;
  total: number;
  sourceCount: number;
  previewCount: number;
  completedAt: string;
}

const activePreparations = new Map<string, Promise<OfflineAssetPackStatus>>();
const activeStatuses = new Map<string, OfflineAssetPackStatus>();

function cacheStorage(): CacheStorage | null {
  if (typeof globalThis === "undefined" || !("caches" in globalThis)) return null;
  return (globalThis as typeof globalThis & { caches?: CacheStorage }).caches ?? null;
}

function baseUrl(): string {
  if (typeof window !== "undefined") return window.location.href;
  return `http://localhost${import.meta.env.BASE_URL || "/OpenSketch/"}`;
}

function cacheableUrl(path: string): string | null {
  if (/^(?:data:|blob:)/i.test(path)) return null;
  try {
    const url = new URL(path, baseUrl());
    return url.origin === new URL(baseUrl()).origin ? url.href : null;
  } catch {
    return null;
  }
}

function packStatus(
  pack: OfflineAssetPack,
  state: OfflineAssetPackState,
  completed = 0,
  message?: string
): OfflineAssetPackStatus {
  return {
    state,
    version: pack.version,
    total: pack.entries.length,
    completed,
    sourceCount: pack.sourceCount,
    previewCount: pack.previewCount,
    ...(message ? { message } : {})
  };
}

function publishStatus(status: OfflineAssetPackStatus): void {
  activeStatuses.set(status.version, status);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OFFLINE_ASSET_PACK_CHANGED_EVENT, { detail: status }));
  }
}

function storageError(
  reason: unknown,
  completed: number,
  pack: OfflineAssetPack
): OfflineAssetPackError {
  const errorName = reason instanceof Error ? reason.name : "";
  if (errorName === "QuotaExceededError" || /quota|storage is full/i.test(String(reason))) {
    return new OfflineAssetPackError(
      "Could not prepare the offline asset library because browser storage is full. Clear site data or free browser storage, then retry.",
      { cause: reason }
    );
  }
  return new OfflineAssetPackError(
    `Could not prepare the offline asset library after ${completed} of ${pack.entries.length} files. Reconnect and retry so every bundled asset can be verified.`,
    { cause: reason }
  );
}

function cacheKey(cacheName: OfflineAssetCacheName, url: string): string {
  return `${cacheName}\0${url}`;
}

export function buildOfflineAssetPack(manifest: AssetManifest, version: string): OfflineAssetPack {
  const entries = new Map<string, OfflineAssetPackEntry>();
  for (const family of manifest.families) {
    for (const variant of family.variants) {
      const sourceUrl = cacheableUrl(variant.assetPath);
      if (sourceUrl) {
        entries.set(cacheKey(OFFLINE_ASSET_SOURCE_CACHE, sourceUrl), {
          url: sourceUrl,
          cacheName: OFFLINE_ASSET_SOURCE_CACHE,
          kind: "source"
        });
      }
      const previewUrl = cacheableUrl(variant.thumbnailPath);
      if (previewUrl) {
        entries.set(cacheKey(OFFLINE_ASSET_PREVIEW_CACHE, previewUrl), {
          url: previewUrl,
          cacheName: OFFLINE_ASSET_PREVIEW_CACHE,
          kind: "preview"
        });
      }
    }
  }
  const sortedEntries = [...entries.values()].sort(
    (left, right) =>
      left.cacheName.localeCompare(right.cacheName) || left.url.localeCompare(right.url)
  );
  return {
    version,
    entries: sortedEntries,
    sourceCount: sortedEntries.filter((entry) => entry.kind === "source").length,
    previewCount: sortedEntries.filter((entry) => entry.kind === "preview").length
  };
}

async function parseMarker(response: Response | undefined): Promise<PackMarker | null> {
  if (!response) return null;
  try {
    const marker = (await response.json()) as Partial<PackMarker>;
    if (
      typeof marker.version !== "string" ||
      typeof marker.total !== "number" ||
      typeof marker.sourceCount !== "number" ||
      typeof marker.previewCount !== "number" ||
      typeof marker.completedAt !== "string"
    ) {
      return null;
    }
    return marker as PackMarker;
  } catch {
    return null;
  }
}

async function cacheContainsPack(pack: OfflineAssetPack): Promise<boolean> {
  const storage = cacheStorage();
  if (!storage) return false;
  const [sources, previews] = await Promise.all([
    storage.open(OFFLINE_ASSET_SOURCE_CACHE),
    storage.open(OFFLINE_ASSET_PREVIEW_CACHE)
  ]);
  const [sourceKeys, previewKeys] = await Promise.all([sources.keys(), previews.keys()]);
  const cachedSources = new Set(sourceKeys.map((request) => request.url));
  const cachedPreviews = new Set(previewKeys.map((request) => request.url));
  return pack.entries.every((entry) =>
    (entry.kind === "source" ? cachedSources : cachedPreviews).has(entry.url)
  );
}

export async function getOfflineAssetPackStatus(
  pack: OfflineAssetPack
): Promise<OfflineAssetPackStatus> {
  const active = activeStatuses.get(pack.version);
  if (active?.state === "preparing") return active;
  const storage = cacheStorage();
  if (!storage)
    return packStatus(
      pack,
      "unavailable",
      0,
      "This browser does not support offline asset storage."
    );

  try {
    const metadata = await storage.open(OFFLINE_ASSET_PACK_METADATA_CACHE);
    const marker = await parseMarker(await metadata.match(OFFLINE_ASSET_PACK_MARKER));
    if (
      marker &&
      marker.version === pack.version &&
      marker.total === pack.entries.length &&
      marker.sourceCount === pack.sourceCount &&
      marker.previewCount === pack.previewCount &&
      (await cacheContainsPack(pack))
    ) {
      const status = packStatus(pack, "ready", pack.entries.length);
      publishStatus(status);
      return status;
    }
    const status = packStatus(pack, "not-ready");
    publishStatus(status);
    return status;
  } catch {
    const status = packStatus(
      pack,
      "error",
      0,
      "Could not inspect offline asset storage. Check browser storage permissions and retry."
    );
    activeStatuses.set(pack.version, status);
    return status;
  }
}

async function preparePack(pack: OfflineAssetPack): Promise<OfflineAssetPackStatus> {
  const storage = cacheStorage();
  if (!storage) {
    const error = new OfflineAssetPackError(
      "This browser does not support offline asset storage. Use a current browser or install the app as a PWA."
    );
    const status = packStatus(pack, "unavailable", 0, error.message);
    publishStatus(status);
    throw error;
  }

  publishStatus(packStatus(pack, "preparing"));
  let completed = 0;
  try {
    await Promise.all([
      storage.delete(OFFLINE_ASSET_PACK_METADATA_CACHE),
      storage.delete(OFFLINE_ASSET_SOURCE_CACHE),
      storage.delete(OFFLINE_ASSET_PREVIEW_CACHE)
    ]);
    const [metadata, sources, previews] = await Promise.all([
      storage.open(OFFLINE_ASSET_PACK_METADATA_CACHE),
      storage.open(OFFLINE_ASSET_SOURCE_CACHE),
      storage.open(OFFLINE_ASSET_PREVIEW_CACHE)
    ]);
    let failure: unknown = null;
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (!failure) {
        const index = nextIndex++;
        const entry = pack.entries[index];
        if (!entry) return;
        try {
          const response = await fetch(entry.url, { cache: "reload", credentials: "same-origin" });
          if (!response.ok) throw new Error(`HTTP ${response.status} for ${entry.url}`);
          const cache = entry.kind === "source" ? sources : previews;
          await cache.put(entry.url, response.clone());
          completed += 1;
          publishStatus(packStatus(pack, "preparing", completed));
        } catch (reason) {
          failure = reason;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(PREPARE_CONCURRENCY, Math.max(1, pack.entries.length)) }, () =>
        worker()
      )
    );
    if (failure) throw storageError(failure, completed, pack);

    if (!(await cacheContainsPack(pack))) {
      throw new OfflineAssetPackError(
        "Could not verify the offline asset library. The browser did not retain every bundled asset; retry after freeing browser storage."
      );
    }

    const marker: PackMarker = {
      version: pack.version,
      total: pack.entries.length,
      sourceCount: pack.sourceCount,
      previewCount: pack.previewCount,
      completedAt: new Date().toISOString()
    };
    await metadata.put(
      OFFLINE_ASSET_PACK_MARKER,
      new Response(JSON.stringify(marker), { headers: { "content-type": "application/json" } })
    );
  } catch (reason) {
    const error =
      reason instanceof OfflineAssetPackError ? reason : storageError(reason, completed, pack);
    publishStatus(packStatus(pack, "error", completed, error.message));
    throw error;
  }
  const status = packStatus(pack, "ready", completed);
  publishStatus(status);
  return status;
}

export function prepareOfflineAssetPack(pack: OfflineAssetPack): Promise<OfflineAssetPackStatus> {
  const existing = activePreparations.get(pack.version);
  if (existing) return existing;
  const pending = preparePack(pack).finally(() => {
    activePreparations.delete(pack.version);
  });
  activePreparations.set(pack.version, pending);
  return pending;
}
