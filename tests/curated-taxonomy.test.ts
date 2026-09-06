import { describe, expect, it } from "vitest";
import metadata from "../docs/scientific-asset-planning/curated-metadata.json";
import { ASSET_CATEGORY_DEFINITIONS, filterAssetFamilies } from "../packages/editor-core/src";
import { assetManifest } from "../apps/web/src/assets/manifest";

describe("curated object categories and search tags", () => {
  it("defines and assigns all 768 planned concepts without fallback categories", () => {
    expect(metadata.categoryDefinitions).toEqual(ASSET_CATEGORY_DEFINITIONS);
    expect(Object.keys(metadata.assets)).toHaveLength(768);
    for (const asset of Object.values(metadata.assets)) {
      expect(Object.keys(ASSET_CATEGORY_DEFINITIONS)).toContain(asset.category);
      expect(asset.topics.length).toBeGreaterThan(0);
      expect(asset.keywords.length).toBeGreaterThan(1);
      expect(asset.keywords.every((word) => word.trim().length > 0)).toBe(true);
      expect(new Set(asset.keywords).size).toBe(asset.keywords.length);
    }
  });
  it("classifies by the object rather than ambiguous words in its name", () => {
    const expected = {
      "nuclear-receptor": "Proteins & complexes",
      "small-globular-cytokine": "Proteins & complexes",
      "microfluidic-culture-chip": "Culture & microfluidics",
      "immersion-oil-bottle": "Labware & consumables",
      "chick-embryo": "Development & embryos",
      granuloma: "Tissues & models",
      "water-bath": "Instruments"
    };
    for (const [id, category] of Object.entries(expected)) {
      expect(metadata.assets[id as keyof typeof metadata.assets].category).toBe(category);
    }
    expect(metadata.assets["nuclear-receptor"].keywords).not.toContain("membrane protein");
    expect(metadata.assets["streptavidin-tetramer"].topics).not.toContain("immunology");
  });
  it("finds exact abbreviations without inventing subtype equivalence", () => {
    expect(
      filterAssetFamilies(assetManifest.families, "RBC").some((a) => a.title === "erythrocyte")
    ).toBe(true);
    expect(
      filterAssetFamilies(assetManifest.families, "GPCR").some(
        (a) => a.title === "seven-transmembrane GPCR"
      )
    ).toBe(true);
    expect(
      filterAssetFamilies(assetManifest.families, "regulatory T cell").some(
        (a) => a.title === "T lymphocyte"
      )
    ).toBe(false);
  });
});
