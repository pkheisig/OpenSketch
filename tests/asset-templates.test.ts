import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_TEMPLATES_CHANGED_EVENT,
  deleteAssetTemplate,
  loadAssetTemplates,
  saveAssetTemplate,
  type AssetTemplate
} from "../apps/web/src/editor/assetTemplates";

const template = (id: string): AssetTemplate => ({
  id,
  name: `Template ${id}`,
  object: { type: "Group", objects: [] },
  thumbnail: "data:image/png;base64,preview",
  createdAt: "2026-08-08T00:00:00.000Z"
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("asset template storage", () => {
  it("recovers from malformed records", () => {
    localStorage.setItem(
      "OpenSketch:templates",
      JSON.stringify([template("one"), { id: "missing-object" }, "not a template"])
    );

    expect(loadAssetTemplates()).toEqual([template("one")]);
  });

  it("keeps new templates first and removes them by id", () => {
    saveAssetTemplate(template("one"));
    saveAssetTemplate(template("two"));

    expect(loadAssetTemplates().map((item) => item.id)).toEqual(["two", "one"]);
    deleteAssetTemplate("two");
    expect(loadAssetTemplates().map((item) => item.id)).toEqual(["one"]);
  });

  it("notifies the open asset panel after changes", () => {
    const listener = vi.fn();
    window.addEventListener(ASSET_TEMPLATES_CHANGED_EVENT, listener);

    saveAssetTemplate(template("one"));
    deleteAssetTemplate("one");

    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(ASSET_TEMPLATES_CHANGED_EVENT, listener);
  });
});
