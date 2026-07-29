import { describe, expect, it } from "vitest";
import { TOP_VIEW_LABWARE_FAMILIES } from "../apps/web/src/assets/labware";
import { resolveBundledAssetPath } from "../apps/web/src/assets/manifest";

function decodeSvg(dataUrl: string): string {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
}

describe("top-view labware assets", () => {
  it("provides the standard editable plate layouts and a culture dish", () => {
    expect(TOP_VIEW_LABWARE_FAMILIES.map((family) => family.title)).toEqual([
      "6 Well Plate Top View",
      "12 Well Plate Top View",
      "24 Well Plate Top View",
      "48 Well Plate Top View",
      "96 Well Plate Top View",
      "384 Well Plate Top View",
      "Petri Dish Top View"
    ]);
  });

  it.each([
    ["6 Well Plate Top View", 6],
    ["12 Well Plate Top View", 12],
    ["24 Well Plate Top View", 24],
    ["48 Well Plate Top View", 48],
    ["96 Well Plate Top View", 96],
    ["384 Well Plate Top View", 384]
  ])("keeps every well in %s as a separate SVG part", (title, expectedWells) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title);
    expect(family).toBeDefined();
    const source = decodeSvg(family!.variants[0].assetPath);
    expect(source.match(/id="well-/g)).toHaveLength(expectedWells);
  });

  it("does not prefix generated data URLs with the GitHub Pages base path", () => {
    const dataUrl = TOP_VIEW_LABWARE_FAMILIES[0].variants[0].assetPath;
    expect(resolveBundledAssetPath(dataUrl, "/OpenSketch/")).toBe(dataUrl);
  });
});
