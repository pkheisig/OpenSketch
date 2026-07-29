import { describe, expect, it } from "vitest";
import { TOP_VIEW_LABWARE_FAMILIES } from "../apps/web/src/assets/labware";
import { resolveBundledAssetPath } from "../apps/web/src/assets/manifest";

function decodeSvg(dataUrl: string): string {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
}

function wellGeometry(source: string) {
  return Array.from(
    source.matchAll(
      /<circle id="well-[^"]+" cx="([^"]+)" cy="([^"]+)" r="([^"]+)"[^>]+stroke-width="([^"]+)"/g
    ),
    (match) => ({
      cx: Number(match[1]),
      cy: Number(match[2]),
      radius: Number(match[3]),
      strokeWidth: Number(match[4])
    })
  );
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

  it.each([
    "6 Well Plate Top View",
    "12 Well Plate Top View",
    "24 Well Plate Top View",
    "48 Well Plate Top View",
    "96 Well Plate Top View",
    "384 Well Plate Top View"
  ])("keeps the outer wells of %s evenly inside the plate border", (title) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title);
    const wells = wellGeometry(decodeSvg(family!.variants[0].assetPath));
    const left = Math.min(...wells.map((well) => well.cx - well.radius - well.strokeWidth / 2));
    const right = Math.max(...wells.map((well) => well.cx + well.radius + well.strokeWidth / 2));
    const top = Math.min(...wells.map((well) => well.cy - well.radius - well.strokeWidth / 2));
    const bottom = Math.max(...wells.map((well) => well.cy + well.radius + well.strokeWidth / 2));
    const nearestPlateGap = Math.min(left - 8, 352 - right, top - 8, 232 - bottom);

    expect(nearestPlateGap).toBeGreaterThanOrEqual(8);
    expect(nearestPlateGap).toBeLessThanOrEqual(16);
  });

  it("does not prefix generated data URLs with the GitHub Pages base path", () => {
    const dataUrl = TOP_VIEW_LABWARE_FAMILIES[0].variants[0].assetPath;
    expect(resolveBundledAssetPath(dataUrl, "/OpenSketch/")).toBe(dataUrl);
  });
});
