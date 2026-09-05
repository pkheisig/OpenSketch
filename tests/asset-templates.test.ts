import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_TEMPLATES_CHANGED_EVENT,
  ASSET_TEMPLATES_STORAGE_KEY,
  deleteAssetTemplate,
  loadAssetTemplates,
  saveAssetTemplate,
  type AssetTemplate
} from "../apps/web/src/editor/assetTemplates";
import { db } from "../apps/web/src/persistence/database";

const template = (id: string): AssetTemplate => ({
  id,
  name: `Template ${id}`,
  object: { type: "Group", objects: [] },
  thumbnail: "data:image/png;base64,preview",
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  schemaVersion: 1
});

beforeEach(async () => {
  localStorage.clear();
  await db.transaction("rw", db.templates, db.templateMigrations, async () => {
    await db.templates.clear();
    await db.templateMigrations.clear();
  });
});
afterEach(() => vi.restoreAllMocks());

describe("asset template storage", () => {
  it("migrates valid legacy records and ignores malformed records", async () => {
    const legacyTemplate = { ...template("one") };
    delete (legacyTemplate as Partial<AssetTemplate>).updatedAt;
    delete (legacyTemplate as Partial<AssetTemplate>).schemaVersion;
    localStorage.setItem(
      ASSET_TEMPLATES_STORAGE_KEY,
      JSON.stringify([legacyTemplate, { id: "missing-object" }, "not a template"])
    );

    const loaded = await loadAssetTemplates();
    expect(loaded).toEqual([template("one")]);
    expect(localStorage.getItem(ASSET_TEMPLATES_STORAGE_KEY)).toBeNull();
    expect(await db.templates.get("one")).toEqual(template("one"));
  });

  it("keeps new templates first and removes them by id", async () => {
    await saveAssetTemplate(template("one"));
    await saveAssetTemplate(template("two"));

    expect((await loadAssetTemplates()).map((item) => item.id)).toEqual(["two", "one"]);
    await deleteAssetTemplate("two");
    expect((await loadAssetTemplates()).map((item) => item.id)).toEqual(["one"]);
  });

  it("stores large raster-rich payloads outside localStorage", async () => {
    const largeTemplate = {
      ...template("large"),
      object: { type: "Group", objects: [], embeddedRaster: "x".repeat(2 * 1024 * 1024) }
    };
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const saved = await saveAssetTemplate(largeTemplate);

    expect(setItem).not.toHaveBeenCalled();
    expect((await loadAssetTemplates())[0]).toEqual(saved);
  });

  it("notifies the open asset panel only after durable changes", async () => {
    const listener = vi.fn();
    window.addEventListener(ASSET_TEMPLATES_CHANGED_EVENT, listener);

    await saveAssetTemplate(template("one"));
    await deleteAssetTemplate("one");

    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(ASSET_TEMPLATES_CHANGED_EVENT, listener);
  });

  it("surfaces quota failures without reporting a successful save", async () => {
    const listener = vi.fn();
    window.addEventListener(ASSET_TEMPLATES_CHANGED_EVENT, listener);
    vi.spyOn(db.templates, "put").mockRejectedValue(
      new DOMException("Storage is full", "QuotaExceededError")
    );

    await expect(saveAssetTemplate(template("full"))).rejects.toThrow(/storage is full/i);
    expect(listener).not.toHaveBeenCalled();
    expect(await db.templates.get("full")).toBeUndefined();
    window.removeEventListener(ASSET_TEMPLATES_CHANGED_EVENT, listener);
  });

  it("keeps a durable template when deletion fails", async () => {
    const saved = await saveAssetTemplate(template("one"));
    vi.spyOn(db.templates, "delete").mockRejectedValue(
      new DOMException("Storage is unavailable", "UnknownError")
    );

    await expect(deleteAssetTemplate("one")).rejects.toThrow(/storage is unavailable/i);
    expect(await loadAssetTemplates()).toEqual([saved]);
  });
});
