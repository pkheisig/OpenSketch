import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("asset preview cache warming", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "caches");
    Reflect.deleteProperty(window, "requestIdleCallback");
  });

  it("warms bundled previews once without requesting source SVGs", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const match = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn().mockResolvedValue({ match, put });
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: { open }
    });
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: (callback: IdleRequestCallback) => {
        callback({ didTimeout: false, timeRemaining: () => 50 });
        return 1;
      }
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      expect(String(input)).toMatch(/-thumbnails\/.*\.webp$/);
      return new Response("preview", { status: 200 });
    });
    const { assetPreviewWarmupStatus, scheduleAssetPreviewWarmup } =
      await import("../apps/web/src/assets/previewWarmup");

    scheduleAssetPreviewWarmup(
      [
        "/OpenSketch/assets/bioicons-thumbnails/a.webp",
        "/OpenSketch/assets/nih-bioart-thumbnails/b.webp",
        "data:image/webp;base64,ignored"
      ],
      "catalog-test"
    );

    await vi.waitFor(() => expect(assetPreviewWarmupStatus().complete).toBe(2));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith("opensketch-asset-previews");
    expect(put).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("OpenSketch:asset-preview-cache:catalog-test")).toBe("complete");
  });

  it("leaves request capacity available when visible previews are prioritized", async () => {
    const requests: string[] = [];
    const resolvers: Array<() => void> = [];
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: (callback: IdleRequestCallback) => {
        callback({ didTimeout: false, timeRemaining: () => 50 });
        return 1;
      }
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      requests.push(String(input));
      await new Promise<void>((resolve) => resolvers.push(resolve));
      return new Response("preview", { status: 200 });
    });
    const { assetPreviewWarmupStatus, prioritizeAssetPreviews, scheduleAssetPreviewWarmup } =
      await import("../apps/web/src/assets/previewWarmup");

    scheduleAssetPreviewWarmup(
      [
        "/OpenSketch/assets/bioicons-thumbnails/a.webp",
        "/OpenSketch/assets/bioicons-thumbnails/b.webp",
        "/OpenSketch/assets/bioicons-thumbnails/c.webp"
      ],
      "priority-test"
    );
    await vi.waitFor(() => expect(requests).toHaveLength(2));

    prioritizeAssetPreviews(["/OpenSketch/assets/bioicons-thumbnails/visible.webp"]);
    await vi.waitFor(() =>
      expect(requests.some((url) => url.endsWith("/bioicons-thumbnails/visible.webp"))).toBe(true)
    );

    resolvers.slice(0, 2).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(requests).toHaveLength(4));
    resolvers.slice(2).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(assetPreviewWarmupStatus().complete).toBe(4));
  });
});
