import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_STYLE_CHANGED_EVENT,
  loadAssetStyle,
  saveAssetStyle
} from "../apps/web/src/editor/assetStylePreference";

describe("asset style preference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to Detailed and persists only the two supported styles", () => {
    expect(loadAssetStyle()).toBe("detailed");

    saveAssetStyle("simplified");

    expect(loadAssetStyle()).toBe("simplified");
    localStorage.setItem("OpenSketch:asset-style", JSON.stringify("realistic"));
    expect(loadAssetStyle()).toBe("detailed");
  });

  it("notifies mounted asset panels when the style changes", () => {
    const listener = vi.fn();
    window.addEventListener(ASSET_STYLE_CHANGED_EVENT, listener);

    saveAssetStyle("simplified");

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(ASSET_STYLE_CHANGED_EVENT, listener);
  });
});
