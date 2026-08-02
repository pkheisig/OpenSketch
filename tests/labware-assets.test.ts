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

function wellRimGeometry(source: string) {
  return Array.from(
    source.matchAll(
      /<circle data-well-rim="[^"]+" cx="([^"]+)" cy="([^"]+)" r="([^"]+)"[^>]+stroke-width="([^"]+)"/g
    ),
    (match) => ({
      cx: Number(match[1]),
      cy: Number(match[2]),
      visualRadius: Number(match[3]) + Number(match[4]) / 2
    })
  );
}

function wellFills(source: string): string[] {
  return Array.from(
    source.matchAll(/<circle id="well-[^"]+"[^>]+fill="([^"]+)"/g),
    (match) => match[1]
  );
}

function withoutWellFills(source: string): string {
  return source.replace(/(<circle id="well-[^"]+"[^>]+fill=")[^"]+("[^>]*>)/g, "$1__WELL_FILL__$2");
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
  ])("provides 30 color and selection variants for %s", (title) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title);

    expect(family).toBeDefined();
    expect(family!.variants).toHaveLength(30);
    expect(new Set(family!.variants.map((variant) => variant.id))).toHaveLength(30);
    expect(new Set(family!.variants.map((variant) => variant.label))).toHaveLength(30);
    expect(family!.variants[0].id).toBe(family!.defaultVariantId);
  });

  it.each([
    "6 Well Plate Top View",
    "12 Well Plate Top View",
    "24 Well Plate Top View",
    "48 Well Plate Top View",
    "96 Well Plate Top View",
    "384 Well Plate Top View"
  ])("changes only well fills between the variants of %s", (title) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title)!;
    const normalizedSources = family.variants.map((variant) =>
      withoutWellFills(decodeSvg(variant.assetPath))
    );

    expect(new Set(normalizedSources)).toHaveLength(1);
  });

  it.each([
    "6 Well Plate Top View",
    "12 Well Plate Top View",
    "24 Well Plate Top View",
    "48 Well Plate Top View",
    "96 Well Plate Top View",
    "384 Well Plate Top View"
  ])("uses pink exclusively for partially selected wells in %s", (title) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title)!;
    const variants = family.variants.map((variant) => ({
      label: variant.label ?? "",
      fills: new Set(wellFills(decodeSvg(variant.assetPath)))
    }));

    expect(variants.some(({ fills }) => fills.size === 1 && fills.has("#f5a3bd"))).toBe(true);
    expect(variants.some(({ fills }) => fills.size === 1 && fills.has("#f4d35e"))).toBe(true);
    expect(
      variants.some(({ fills }) => fills.size === 2 && fills.has("#f5a3bd") && fills.has("#f4f7f6"))
    ).toBe(true);
    variants
      .filter(({ fills }) => fills.size > 1)
      .forEach(({ label, fills }) => {
        expect(label).toMatch(/^Pink · /);
        expect([...fills].sort()).toEqual(["#f4f7f6", "#f5a3bd"]);
      });
    expect(variants.some(({ label }) => /rainbow|multicolor/i.test(label))).toBe(false);
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
    const source = decodeSvg(family!.variants[0].assetPath);
    const wells = wellGeometry(source);
    const grid = {
      left: Number(source.match(/data-grid-left="([^"]+)"/)?.[1]),
      top: Number(source.match(/data-grid-top="([^"]+)"/)?.[1]),
      width: Number(source.match(/data-grid-width="([^"]+)"/)?.[1]),
      height: Number(source.match(/data-grid-height="([^"]+)"/)?.[1])
    };
    const left = Math.min(...wells.map((well) => well.cx - well.radius));
    const right = Math.max(...wells.map((well) => well.cx + well.radius));
    const top = Math.min(...wells.map((well) => well.cy - well.radius));
    const bottom = Math.max(...wells.map((well) => well.cy + well.radius));

    expect(left - grid.left).toBeCloseTo(grid.left + grid.width - right, 1);
    expect(top - grid.top).toBeCloseTo(grid.top + grid.height - bottom, 1);
    expect(left).toBeGreaterThan(grid.left);
    expect(top).toBeGreaterThan(grid.top);
  });

  it.each([
    "6 Well Plate Top View",
    "12 Well Plate Top View",
    "24 Well Plate Top View",
    "48 Well Plate Top View",
    "96 Well Plate Top View",
    "384 Well Plate Top View"
  ])("keeps every well rim inside the raised face of %s", (title) => {
    const family = TOP_VIEW_LABWARE_FAMILIES.find((candidate) => candidate.title === title);
    const source = decodeSvg(family!.variants[0].assetPath);
    const wells = wellRimGeometry(source);
    const faceRight = Number(source.match(/data-plate-face-right="([^"]+)"/)?.[1]);
    const faceBottom = Number(source.match(/data-plate-face-bottom="([^"]+)"/)?.[1]);

    expect(wells).toHaveLength(
      title.startsWith("384") ? 384 : Number(title.slice(0, title.indexOf(" ")))
    );
    expect(Math.max(...wells.map((well) => well.cx + well.visualRadius))).toBeLessThan(faceRight);
    expect(Math.max(...wells.map((well) => well.cy + well.visualRadius))).toBeLessThan(faceBottom);
  });

  it("progressively reduces the label gutters as well density increases", () => {
    const layouts = TOP_VIEW_LABWARE_FAMILIES.slice(0, 6).map((family) => {
      const source = decodeSvg(family.variants[0].assetPath);
      return {
        left: Number(source.match(/data-grid-left="([^"]+)"/)?.[1]),
        top: Number(source.match(/data-grid-top="([^"]+)"/)?.[1])
      };
    });

    expect(layouts.map(({ left }) => left)).toEqual([48, 44, 40, 36, 32, 28]);
    expect(layouts.map(({ top }) => top)).toEqual([48, 44, 40, 36, 32, 28]);
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
