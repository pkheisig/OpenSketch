import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetManifest, AssetVariant } from "@workspace/editor-core";

type MockCache = {
  entries: Map<string, Response>;
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
};

function mockCache(): MockCache {
  const entries = new Map<string, Response>();
  const requestUrl = (request: RequestInfo | URL) =>
    typeof request === "string"
      ? new URL(request, window.location.href).href
      : request instanceof URL
        ? request.href
        : request.url;
  const cache: MockCache = {
    entries,
    match: vi.fn(async (request: RequestInfo | URL) => entries.get(requestUrl(request))),
    put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
      entries.set(requestUrl(request), response);
    }),
    keys: vi.fn(async () => [...entries.keys()].map((url) => new Request(url)))
  };
  return cache;
}

function testManifest(variants: AssetVariant[]): AssetManifest {
  return {
    version: 1,
    generatedAt: "2026-08-28T00:00:00.000Z",
    source: "test",
    families: [
      {
        familyId: "family",
        title: "Test family",
        description: "Test",
        category: "Test",
        keywords: [],
        author: "Test",
        credit: "Test",
        license: "CC0-1.0",
        defaultVariantId: variants[0]?.id ?? "variant",
        variants
      }
    ]
  };
}

describe("offline asset pack", () => {
  let cachesByName: Map<string, MockCache>;
  let cacheStorage: {
    open: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetModules();
    cachesByName = new Map();
    cacheStorage = {
      open: vi.fn(async (name: string) => {
        let cache = cachesByName.get(name);
        if (!cache) {
          cache = mockCache();
          cachesByName.set(name, cache);
        }
        return cache;
      }),
      delete: vi.fn(async (name: string) => cachesByName.delete(name))
    };
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: cacheStorage
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "caches");
  });

  it("builds a complete source and preview pack while skipping non-cacheable entries", async () => {
    const { buildOfflineAssetPack } = await import("../apps/web/src/assets/offlineAssetPack");
    const pack = buildOfflineAssetPack(
      testManifest([
        {
          id: "one",
          assetPath: "/OpenSketch/assets/one.svg",
          thumbnailPath: "/OpenSketch/assets/one.webp"
        },
        {
          id: "data",
          assetPath: "data:image/svg+xml,test",
          thumbnailPath: "https://cdn.example.test/one.webp"
        }
      ]),
      "pack-1"
    );

    expect(pack.sourceCount).toBe(1);
    expect(pack.previewCount).toBe(1);
    expect(pack.entries.map((entry) => entry.url)).toEqual([
      new URL("/OpenSketch/assets/one.webp", window.location.href).href,
      new URL("/OpenSketch/assets/one.svg", window.location.href).href
    ]);
  });

  it("only reports ready after every source and preview is cached", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      return new Response(`bundled ${String(input)}`, { status: 200 });
    });
    const { buildOfflineAssetPack, getOfflineAssetPackStatus, prepareOfflineAssetPack } =
      await import("../apps/web/src/assets/offlineAssetPack");
    const pack = buildOfflineAssetPack(
      testManifest([
        {
          id: "one",
          assetPath: "/OpenSketch/assets/one.svg",
          thumbnailPath: "/OpenSketch/assets/one.webp"
        },
        {
          id: "two",
          assetPath: "/OpenSketch/assets/two.svg",
          thumbnailPath: "/OpenSketch/assets/two.webp"
        }
      ]),
      "pack-ready"
    );

    await expect(prepareOfflineAssetPack(pack)).resolves.toMatchObject({ state: "ready" });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(await getOfflineAssetPackStatus(pack)).toMatchObject({
      state: "ready",
      completed: 4,
      total: 4
    });
    const metadata = cachesByName.get("opensketch-offline-asset-pack");
    expect(metadata?.entries.size).toBe(1);
  });

  it("leaves the pack unready and reports quota failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bundled", { status: 200 }));
    const sourceCache = mockCache();
    sourceCache.put.mockRejectedValue(new DOMException("Storage is full", "QuotaExceededError"));
    cacheStorage.open.mockImplementation(async (name: string) => {
      if (name === "opensketch-asset-sources") return sourceCache;
      let cache = cachesByName.get(name);
      if (!cache) {
        cache = mockCache();
        cachesByName.set(name, cache);
      }
      return cache;
    });
    const { buildOfflineAssetPack, getOfflineAssetPackStatus, prepareOfflineAssetPack } =
      await import("../apps/web/src/assets/offlineAssetPack");
    const pack = buildOfflineAssetPack(
      testManifest([
        {
          id: "one",
          assetPath: "/OpenSketch/assets/one.svg",
          thumbnailPath: "/OpenSketch/assets/one.webp"
        }
      ]),
      "pack-quota"
    );

    await expect(prepareOfflineAssetPack(pack)).rejects.toThrow(/storage is full/i);
    expect(await getOfflineAssetPackStatus(pack)).toMatchObject({ state: "not-ready" });
    expect(cachesByName.get("opensketch-offline-asset-pack")?.entries.size ?? 0).toBe(0);
  });
});
