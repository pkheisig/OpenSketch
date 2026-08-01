const PREVIEW_CACHE_NAME = "opensketch-asset-previews";
const PREVIEW_CACHE_MARKER_PREFIX = "OpenSketch:asset-preview-cache:";
const PREVIEW_WARMUP_CONCURRENCY = 12;

type WarmupPriority = "priority" | "idle";
type WarmupState = WarmupPriority | "active" | "complete";

const states = new Map<string, WarmupState>();
const priorityQueue: string[] = [];
const idleQueue: string[] = [];
let activeRequests = 0;
let cachePromise: Promise<Cache | null> | null = null;
let scheduled = false;
let completionMarker = "";
let fullCatalogQueued = false;
let warmupFailed = false;

function cacheableUrl(path: string): string | null {
  if (/^(?:data:|blob:)/i.test(path)) return null;
  try {
    const url = new URL(path, window.location.href);
    return url.origin === window.location.origin ? url.href : null;
  } catch {
    return null;
  }
}

function previewCache(): Promise<Cache | null> {
  if (cachePromise) return cachePromise;
  cachePromise =
    "caches" in window
      ? window.caches.open(PREVIEW_CACHE_NAME).catch(() => null)
      : Promise.resolve(null);
  return cachePromise;
}

function nextUrl(): string | undefined {
  while (priorityQueue.length > 0) {
    const url = priorityQueue.shift()!;
    if (states.get(url) === "priority") return url;
  }
  while (idleQueue.length > 0) {
    const url = idleQueue.shift()!;
    if (states.get(url) === "idle") return url;
  }
  return undefined;
}

async function warmUrl(url: string): Promise<void> {
  const cache = await previewCache();
  if (cache && (await cache.match(url))) return;
  const response = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
  if (cache && response.ok) await cache.put(url, response.clone());
}

function drainQueue(): void {
  while (activeRequests < PREVIEW_WARMUP_CONCURRENCY) {
    const url = nextUrl();
    if (!url) {
      if (activeRequests === 0 && completionMarker && fullCatalogQueued && !warmupFailed) {
        localStorage.setItem(completionMarker, "complete");
      }
      return;
    }
    activeRequests += 1;
    states.set(url, "active");
    void warmUrl(url)
      .then(() => states.set(url, "complete"))
      .catch(() => {
        warmupFailed = true;
        states.delete(url);
      })
      .finally(() => {
        activeRequests -= 1;
        drainQueue();
      });
  }
}

export function prioritizeAssetPreviews(paths: string[]): void {
  for (const path of paths) {
    const url = cacheableUrl(path);
    if (!url) continue;
    const state = states.get(url);
    if (state === "active" || state === "complete" || state === "priority") continue;
    states.set(url, "priority");
    priorityQueue.push(url);
  }
  drainQueue();
}

export function scheduleAssetPreviewWarmup(paths: string[], version: string): void {
  if (scheduled) return;
  scheduled = true;
  completionMarker = `${PREVIEW_CACHE_MARKER_PREFIX}${version}`;
  if (localStorage.getItem(completionMarker) === "complete") return;
  const start = () => {
    for (const path of paths) {
      const url = cacheableUrl(path);
      if (!url || states.has(url)) continue;
      states.set(url, "idle");
      idleQueue.push(url);
    }
    fullCatalogQueued = true;
    drainQueue();
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(start, { timeout: 1_500 });
  } else {
    globalThis.setTimeout(start, 500);
  }
}

export function assetPreviewWarmupStatus(): {
  active: number;
  complete: number;
  queued: number;
} {
  let complete = 0;
  let queued = 0;
  for (const state of states.values()) {
    if (state === "complete") complete += 1;
    if (state === "priority" || state === "idle") queued += 1;
  }
  return { active: activeRequests, complete, queued };
}
