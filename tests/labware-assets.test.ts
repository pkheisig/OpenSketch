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
    ["6 Well Plate Top View", 2, 3],
    ["12 Well Plate Top View", 3, 4],
    ["24 Well Plate Top View", 4, 6],
    ["48 Well Plate Top View", 6, 8],
    ["96 Well Plate Top View", 8, 12],
    ["384 Well Plate Top View", 16, 24]
  ])("labels every row and column of %s", (title, rows, columns) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title);
    const source = decodeSvg(family!.variants[0].assetPath);

    expect(source.match(/id="row-label-/g)).toHaveLength(rows);
    expect(source.match(/id="column-label-/g)).toHaveLength(columns);
    expect(source).toContain(`>${String.fromCharCode(64 + rows)}</text>`);
    expect(source).toContain(`>${columns}</text>`);
  });

  it.each([
    ["6 Well Plate Top View", 16, 35],
    ["12 Well Plate Top View", 14, 23],
    ["24 Well Plate Top View", 11, 16]
  ])(
    "keeps labels and wells prominent in the low-density %s layout",
    (title, minimumLabelSize, minimumRadius) => {
      const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title);
      const source = decodeSvg(family!.variants[0].assetPath);
      const labelSize = Number(
        source.match(/id="column-labels"[^>]+font-size="([^"]+)"/)?.[1] ?? 0
      );
      const wells = wellGeometry(source);

      expect(labelSize).toBeGreaterThanOrEqual(minimumLabelSize);
      expect(Math.min(...wells.map((well) => well.radius))).toBeGreaterThanOrEqual(minimumRadius);
    }
  );

  it.each([
    "6 Well Plate Top View",
    "12 Well Plate Top View",
    "24 Well Plate Top View",
    "48 Well Plate Top View",
    "96 Well Plate Top View",
    "384 Well Plate Top View"
  ])("centers the well field of %s within its labeled grid", (title) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title);
    const wells = wellGeometry(decodeSvg(family!.variants[0].assetPath));
    const left = Math.min(...wells.map((well) => well.cx - well.radius));
    const right = Math.max(...wells.map((well) => well.cx + well.radius));
    const top = Math.min(...wells.map((well) => well.cy - well.radius));
    const bottom = Math.max(...wells.map((well) => well.cy + well.radius));

    expect(left - 48).toBeCloseTo(336 - right, 1);
    expect(top - 48).toBeCloseTo(216 - bottom, 1);
    expect(left).toBeGreaterThan(48);
    expect(top).toBeGreaterThan(48);
  });

  it.each([
    "6 Well Plate Top View",
    "12 Well Plate Top View",
    "24 Well Plate Top View",
    "48 Well Plate Top View",
    "96 Well Plate Top View",
    "384 Well Plate Top View"
  ])("includes raised face and depth layers in %s", (title) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title);
    const source = decodeSvg(family!.variants[0].assetPath);

    expect(source).toContain('id="plate-depth"');
    expect(source).toContain('id="plate-side"');
    expect(source).toContain('id="plate-highlight"');
  });

  it("does not prefix generated data URLs with the GitHub Pages base path", () => {
    const dataUrl = TOP_VIEW_LABWARE_FAMILIES[0].variants[0].assetPath;
    expect(resolveBundledAssetPath(dataUrl, "/OpenSketch/")).toBe(dataUrl);
  });
});
