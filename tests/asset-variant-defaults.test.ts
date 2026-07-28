import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_VARIANT_DEFAULTS_CHANGED_EVENT,
  loadAssetVariantDefaults,
  saveAssetVariantDefault
} from "../apps/web/src/editor/assetVariantDefaults";

describe("asset variant defaults", () => {
  beforeEach(() => localStorage.clear());

  it("persists independent defaults for each asset family", () => {
    saveAssetVariantDefault("immune-cell", "immune-cell-variant-2");
    saveAssetVariantDefault("t-cell", "t-cell-variant-4");

    expect(loadAssetVariantDefaults()).toEqual({
      "immune-cell": "immune-cell-variant-2",
      "t-cell": "t-cell-variant-4"
    });
  });

  it("notifies mounted asset panels when a default changes", () => {
    const listener = vi.fn();
    window.addEventListener(ASSET_VARIANT_DEFAULTS_CHANGED_EVENT, listener);

    saveAssetVariantDefault("immune-cell", "immune-cell-variant-3");

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(ASSET_VARIANT_DEFAULTS_CHANGED_EVENT, listener);
  });
});
